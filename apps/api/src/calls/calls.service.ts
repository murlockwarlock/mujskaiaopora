import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { AccessToken } from 'livekit-server-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { StorageService } from '../storage/storage.service';
import { CreateCallMessageDto, CreateCallRoomDto } from './dto/calls.dto';

@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly storage: StorageService
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

  async startConversationCall(userId: string, conversationId: string, mode: 'AUDIO' | 'VIDEO') {
    const room = await this.createRoom(userId, {
      title: mode === 'AUDIO' ? 'Аудиозвонок' : 'Видеозвонок',
      conversationId,
      maxParticipants: Number(this.config.getOrThrow<string>('MAX_CALL_PARTICIPANTS'))
    });
    const connection = await this.joinRoom(userId, room.id);
    return { roomId: room.id, ...connection };
  }

  async createRoomWithConnection(userId: string, dto: CreateCallRoomDto) {
    const room = await this.createRoom(userId, dto);
    const connection = await this.joinRoom(userId, room.id);
    return { ...room, ...connection, canInvite: true };
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

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { displayName: true, profile: { select: { avatarKey: true } } }
    });
    const token = new AccessToken(
      this.config.getOrThrow<string>('LIVEKIT_API_KEY'),
      this.config.getOrThrow<string>('LIVEKIT_API_SECRET'),
      { identity: `user_${userId}`, name: user.displayName, metadata: JSON.stringify({ avatarUrl: this.storage.getPublicUrl(user.profile?.avatarKey ?? null) }), ttl: '10m' }
    );
    token.addGrant({ roomJoin: true, room: room.livekitRoomName, canPublish: true, canSubscribe: true });
    return { token: await token.toJwt(), url: this.config.getOrThrow<string>('LIVEKIT_URL'), roomName: room.livekitRoomName, inviteCode: room.inviteCode, canInvite: room.createdById === userId };
  }

  async inviteUsers(userId: string, roomId: string, userIds: string[]) {
    const room = await this.prisma.callRoom.findUniqueOrThrow({ where: { id: roomId } });
    if (room.createdById !== userId) throw new ForbiddenException('Приглашать пользователей может только создатель встречи');
    if (room.status === 'ENDED' || room.status === 'CANCELLED') throw new NotFoundException('Комната недоступна');
    const currentInvitations = await this.prisma.callInvitation.findMany({ where: { callRoomId: roomId }, select: { userId: true } });
    const invitedIds = new Set(currentInvitations.map((invitation) => invitation.userId));
    const candidates = [...new Set(userIds)].filter((id) => id !== userId && !invitedIds.has(id));
    if (!candidates.length) return { invited: 0 };
    const activeParticipants = await this.prisma.callParticipant.count({ where: { callRoomId: roomId, leftAt: null } });
    if (activeParticipants + currentInvitations.length + candidates.length > room.maxParticipants) throw new ForbiddenException('В комнате нет свободных мест');
    await Promise.all(candidates.map((id) => this.ensureAvailableUser(id)));
    await this.prisma.callInvitation.createMany({ data: candidates.map((invitee) => ({ callRoomId: roomId, userId: invitee })) });
    candidates.forEach((invitee) => this.realtimeGateway.emitUser(invitee, 'call:incoming', { roomId, title: room.title, callerId: userId }));
    return { invited: candidates.length };
  }

  async joinByInvite(userId: string, inviteCode: string) {
    const room = await this.prisma.callRoom.findUnique({ where: { inviteCode } });
    if (!room || room.status === 'ENDED' || room.status === 'CANCELLED') throw new NotFoundException('Ссылка на встречу недоступна');
    const connection = await this.joinRoom(userId, room.id);
    return { roomId: room.id, ...connection };
  }

  async listMessages(userId: string, roomId: string) {
    await this.assertCallParticipant(userId, roomId);
    return this.prisma.callMessage.findMany({
      where: { callRoomId: roomId },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: { sender: { select: { id: true, displayName: true } } }
    });
  }

  async createMessage(userId: string, roomId: string, dto: CreateCallMessageDto) {
    await this.assertCallParticipant(userId, roomId);
    const existing = await this.prisma.callMessage.findUnique({
      where: { senderId_clientMessageId: { senderId: userId, clientMessageId: dto.clientMessageId } },
      include: { sender: { select: { id: true, displayName: true } } }
    });
    if (existing) return existing;
    const message = await this.prisma.callMessage.create({
      data: { callRoomId: roomId, senderId: userId, clientMessageId: dto.clientMessageId, body: dto.body.trim() },
      include: { sender: { select: { id: true, displayName: true } } }
    });
    this.realtimeGateway.emitCallMessage(roomId, message);
    return message;
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

  private async assertCallParticipant(userId: string, roomId: string): Promise<void> {
    const participant = await this.prisma.callParticipant.findUnique({ where: { callRoomId_userId: { callRoomId: roomId, userId } } });
    if (!participant || participant.leftAt) throw new ForbiddenException('Нет доступа к чату встречи');
  }

  private async ensureAvailableUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (!user || user.status !== 'ACTIVE') throw new NotFoundException('Пользователь недоступен');
  }
}
