import { CallsService } from './calls.service';

describe('CallsService', () => {
  it('creates a conversation room and returns its connection in one operation', async () => {
    const service = new CallsService({} as never, { getOrThrow: jest.fn().mockReturnValue('10') } as never, {} as never, {} as never);
    jest.spyOn(service, 'createRoom').mockResolvedValue({ id: 'room' } as never);
    jest.spyOn(service, 'joinRoom').mockResolvedValue({ token: 'token', url: 'ws://localhost:7880', roomName: 'call_room', inviteCode: 'invite', canInvite: true });

    await expect(service.startConversationCall('user', 'conversation', 'VIDEO')).resolves.toEqual({ roomId: 'room', token: 'token', url: 'ws://localhost:7880', roomName: 'call_room', inviteCode: 'invite', canInvite: true });
    expect(service.createRoom).toHaveBeenCalledWith('user', expect.objectContaining({ conversationId: 'conversation' }));
    expect(service.joinRoom).toHaveBeenCalledWith('user', 'room');
  });

  it('sends an incoming event with the caller identity after inviting a conversation member', async () => {
    const prisma = {
      callRoom: { create: jest.fn().mockResolvedValue({ id: 'room', title: 'Видеозвонок' }) },
      conversationMember: { findUnique: jest.fn().mockResolvedValue({ userId: 'caller' }), findMany: jest.fn().mockResolvedValue([{ userId: 'guest' }]) },
      callInvitation: { createMany: jest.fn() },
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'caller', displayName: 'Иван', profile: { avatarKey: 'avatars/ivan.jpg' } }) }
    };
    const realtime = { emitUser: jest.fn() };
    const storage = { getPublicUrl: jest.fn().mockReturnValue('https://cdn.example/ivan.jpg') };
    const service = new CallsService(prisma as never, { getOrThrow: jest.fn().mockReturnValue('10') } as never, realtime as never, storage as never);

    await service.createRoom('caller', { title: 'Видеозвонок', conversationId: 'conversation', maxParticipants: 10 });

    expect(realtime.emitUser).toHaveBeenCalledWith('guest', 'call:incoming', {
      roomId: 'room',
      title: 'Видеозвонок',
      callerId: 'caller',
      caller: { id: 'caller', displayName: 'Иван', avatarUrl: 'https://cdn.example/ivan.jpg' }
    });
  });

  it('returns a persisted pending invitation when a realtime event was missed', async () => {
    const prisma = {
      callInvitation: {
        findMany: jest.fn().mockResolvedValue([{
          callRoomId: 'room',
          callRoom: { title: 'Видеозвонок', createdById: 'caller', createdBy: { id: 'caller', displayName: 'Иван', profile: { avatarKey: null } } }
        }])
      }
    };
    const service = new CallsService(prisma as never, {} as never, {} as never, { getPublicUrl: jest.fn().mockReturnValue(null) } as never);

    await expect(service.listPendingInvitations('guest')).resolves.toEqual([{
      roomId: 'room',
      title: 'Видеозвонок',
      callerId: 'caller',
      caller: { id: 'caller', displayName: 'Иван', avatarUrl: null }
    }]);
  });

  it('does not count declined invitations against the room limit', async () => {
    const prisma = {
      callRoom: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'room', createdById: 'owner', status: 'LIVE', maxParticipants: 10 }) },
      callInvitation: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'declined' }]),
        count: jest.fn().mockResolvedValue(0),
        createMany: jest.fn()
      },
      callParticipant: { count: jest.fn().mockResolvedValue(1) },
      user: {
        findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'owner', displayName: 'Иван', profile: { avatarKey: null } })
      }
    };
    const service = new CallsService(prisma as never, {} as never, { emitUser: jest.fn() } as never, { getPublicUrl: jest.fn().mockReturnValue(null) } as never);

    await expect(service.inviteUsers('owner', 'room', ['guest'])).resolves.toEqual({ invited: 1 });
    expect(prisma.callInvitation.count).toHaveBeenCalledWith({ where: { callRoomId: 'room', status: 'PENDING' } });
  });

  it('allows a repeated leave request without failing the call screen', async () => {
    const prisma = { callParticipant: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    const service = new CallsService(prisma as never, {} as never, {} as never, {} as never);

    await expect(service.leaveRoom('user', 'room')).resolves.toEqual({ ok: true });
    expect(prisma.callParticipant.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { callRoomId: 'room', userId: 'user' } }));
  });
});
