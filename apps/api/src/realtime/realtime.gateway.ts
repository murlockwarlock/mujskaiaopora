import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';

type AuthenticatedSocket = Socket & { data: { user?: AuthenticatedUser } };

@Injectable()
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async handleConnection(socket: AuthenticatedSocket): Promise<void> {
    const token = this.extractToken(socket);
    try {
      socket.data.user = await this.jwt.verifyAsync<AuthenticatedUser>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET')
      });
      socket.join(`user:${socket.data.user.sub}`);
    } catch {
      socket.disconnect(true);
    }
  }

  @SubscribeMessage('conversation:join')
  async joinConversation(socket: AuthenticatedSocket, payload: { conversationId: string }): Promise<{ ok: boolean }> {
    const userId = socket.data.user?.sub;
    if (!userId) throw new UnauthorizedException();
    const membership = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: payload.conversationId, userId } }
    });
    if (!membership) throw new UnauthorizedException();
    socket.join(`conversation:${payload.conversationId}`);
    return { ok: true };
  }

  emitMessage(conversationId: string, message: unknown): void {
    this.server.to(`conversation:${conversationId}`).emit('message:created', message);
  }

  emitUser(userId: string, event: string, payload: unknown): void {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  private extractToken(socket: Socket): string {
    const token = socket.handshake.auth.token ?? socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (typeof token !== 'string' || !token) throw new UnauthorizedException();
    return token;
  }
}
