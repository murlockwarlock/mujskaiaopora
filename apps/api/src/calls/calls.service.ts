import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { AccessToken } from 'livekit-server-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateCallRoomDto } from './dto/calls.dto';

@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly realtimeGateway: RealtimeGateway
  ) {}

  async createRoom(userId: string, dto: CreateCallRoomDto) {
    if (dto.conversationId) await this.assertConversationAccess(userId, dto.conversationId);
    const room = await this.prisma.callRoom.create({
      data: {
        livekitRoomName: `call_${randomUUID()}`,
        title: dto.title.trim(),
        conversationId: dto.conversationId,
        createdById: userId,
        maxParticipants: Math.min(dto.maxParticipants ?? Number(this.config.getOrThrow<string>('MAX_CALL_PARTICIPANTS')), Number(this.config.getOrThrow<string>('MAX_CALL_PARTICIPANTS'))),
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null
      }
    });
    if (dto.conversationId) {
      const members = await this.prisma.conversationMember.findMany({ where: { conversationId: dto.conversationId }, select: { userId: true } });
      const invitees = members.filter((member) => member.userId !== userId);
      await this.prisma.callInvitation.createMany({ data: invitees.map((invitee) => ({ callRoomId: room.id, userId: invitee.userId })) });
      invitees.forEach((invitee) => this.realtimeGateway.emitUser(invitee.userId, 'call:incoming', { roomId: room.id, title: room.title, callerId: userId }));
    }
    return room;
  }

  async joinRoom(userId: string, roomId: string) {
    const room = await this.prisma.callRoom.findUnique({ where: { id: roomId } });
    if (!room || room.status === 'ENDED' || room.status === 'CANCELLED') throw new NotFoundException('Комната недоступна');
    if (room.conversationId) await this.assertConversationAccess(userId, room.conversationId);

    const participant = await this.prisma.callParticipant.findUnique({ where: { callRoomId_userId: { callRoomId: room.id, userId } } });
    if (!participant || participant.leftAt) {
      const activeParticipants = await this.prisma.callParticipant.count({ where: { callRoomId: room.id, leftAt: null } });
      if (activeParticipants >= room.maxParticipants) throw new ForbiddenException('В комнате нет свободных мест');
      await this.prisma.callParticipant.upsert({
        where: { callRoomId_userId: { callRoomId: room.id, userId } },
        create: { callRoomId: room.id, userId },
        update: { joinedAt: new Date(), leftAt: null }
      });
    }
    if (room.status === 'SCHEDULED') await this.prisma.callRoom.update({ where: { id: room.id }, data: { status: 'LIVE' } });
    await this.prisma.callInvitation.updateMany({ where: { callRoomId: room.id, userId, status: 'PENDING' }, data: { status: 'ACCEPTED', respondedAt: new Date() } });

    const token = new AccessToken(
      this.config.getOrThrow<string>('LIVEKIT_API_KEY'),
      this.config.getOrThrow<string>('LIVEKIT_API_SECRET'),
      { identity: `user_${userId}`, ttl: '10m' }
    );
    token.addGrant({ roomJoin: true, room: room.livekitRoomName, canPublish: true, canSubscribe: true });
    return { token: await token.toJwt(), url: this.config.getOrThrow<string>('LIVEKIT_URL'), roomName: room.livekitRoomName };
  }

  async leaveRoom(userId: string, roomId: string) {
    await this.prisma.callParticipant.update({
      where: { callRoomId_userId: { callRoomId: roomId, userId } },
      data: { leftAt: new Date() }
    });
    return { ok: true };
  }

  async declineRoom(userId: string, roomId: string) {
    await this.prisma.callInvitation.update({
      where: { callRoomId_userId: { callRoomId: roomId, userId } },
      data: { status: 'DECLINED', respondedAt: new Date() }
    });
    const room = await this.prisma.callRoom.findUniqueOrThrow({ where: { id: roomId }, select: { createdById: true } });
    this.realtimeGateway.emitUser(room.createdById, 'call:declined', { roomId, userId });
    return { ok: true };
  }

  private async assertConversationAccess(userId: string, conversationId: string): Promise<void> {
    const membership = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } }
    });
    if (!membership) throw new ForbiddenException('Нет доступа к комнате');
  }
}
