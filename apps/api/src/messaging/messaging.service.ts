import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConversationType, MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateGroupConversationDto, CreateMessageDto } from './dto/conversation.dto';

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly config: ConfigService
  ) {}

  async listConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: { include: { user: { select: { id: true, displayName: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { sender: { select: { displayName: true } } } }
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  async createDirectConversation(userId: string, otherUserId: string) {
    if (userId === otherUserId) throw new ForbiddenException('Нельзя создать диалог с собой');
    await this.ensureAvailableUser(otherUserId);
    const blocked = await this.prisma.block.findFirst({
      where: {
        OR: [
          { creatorId: userId, targetId: otherUserId },
          { creatorId: otherUserId, targetId: userId }
        ]
      }
    });
    if (blocked) throw new ForbiddenException('Диалог недоступен');

    const existing = await this.prisma.conversation.findMany({
      where: { type: ConversationType.DIRECT, members: { some: { userId } } },
      include: { members: true }
    });
    const conversation = existing.find(
      (item) => item.members.length === 2 && item.members.every((member) => member.userId === userId || member.userId === otherUserId)
    );
    if (conversation) return conversation;

    return this.prisma.conversation.create({
      data: {
        type: ConversationType.DIRECT,
        createdById: userId,
        members: {
          create: [
            { userId, role: MembershipRole.OWNER },
            { userId: otherUserId, role: MembershipRole.MEMBER }
          ]
        }
      },
      include: { members: true }
    });
  }

  async createGroupConversation(userId: string, dto: CreateGroupConversationDto) {
    const memberIds = [...new Set([userId, ...dto.userIds])];
    if (memberIds.length > Number(this.config.getOrThrow<string>('MAX_GROUP_PARTICIPANTS'))) throw new ForbiddenException('В группе нет свободных мест');
    await Promise.all(memberIds.filter((id) => id !== userId).map((id) => this.ensureAvailableUser(id)));

    return this.prisma.conversation.create({
      data: {
        type: ConversationType.GROUP,
        title: dto.title.trim(),
        createdById: userId,
        members: { create: memberIds.map((memberId) => ({ userId: memberId, role: memberId === userId ? MembershipRole.OWNER : MembershipRole.MEMBER })) }
      },
      include: { members: true }
    });
  }

  async listMessages(userId: string, conversationId: string, cursor?: string) {
    await this.assertMembership(userId, conversationId);
    const messages = await this.prisma.message.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { sender: { select: { id: true, displayName: true } } }
    });
    const hasMore = messages.length > 50;
    const items = messages.slice(0, 50).reverse();
    return { items, nextCursor: hasMore ? items[0]?.id : null };
  }

  async createMessage(userId: string, conversationId: string, dto: CreateMessageDto) {
    await this.assertMembership(userId, conversationId);
    const existing = await this.prisma.message.findUnique({
      where: { senderId_clientMessageId: { senderId: userId, clientMessageId: dto.clientMessageId } },
      include: { sender: { select: { id: true, displayName: true } } }
    });
    if (existing) return existing;

    const message = await this.prisma.message.create({
      data: { conversationId, senderId: userId, clientMessageId: dto.clientMessageId, body: dto.body.trim() },
      include: { sender: { select: { id: true, displayName: true } } }
    });
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    this.realtimeGateway.emitMessage(conversationId, message);
    const members = await this.prisma.conversationMember.findMany({ where: { conversationId }, select: { userId: true } });
    members.filter((member) => member.userId !== userId).forEach((member) => {
      this.realtimeGateway.emitUser(member.userId, 'message:notification', { conversationId, senderName: message.sender.displayName, createdAt: message.createdAt });
    });
    return message;
  }

  async assertMembership(userId: string, conversationId: string) {
    const membership = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } }
    });
    if (!membership) throw new ForbiddenException('Нет доступа к диалогу');
    return membership;
  }

  private async ensureAvailableUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (!user || user.status !== 'ACTIVE') throw new NotFoundException('Пользователь недоступен');
  }
}
