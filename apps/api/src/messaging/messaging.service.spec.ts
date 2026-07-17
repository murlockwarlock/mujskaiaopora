import { MessagingService } from './messaging.service';

describe('MessagingService', () => {
  const summary = {
    id: 'conversation',
    title: null,
    members: [
      { user: { id: 'current', displayName: 'Иван' } },
      { user: { id: 'other', displayName: 'Алексей' } }
    ],
    messages: []
  };

  function createService() {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      block: { findFirst: jest.fn().mockResolvedValue(null) },
      conversation: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(summary),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ type: 'GROUP', members: [{ userId: 'current', role: 'OWNER' }] }),
        update: jest.fn()
      },
      conversationMember: { createMany: jest.fn() }
    };
    const config = { getOrThrow: jest.fn().mockReturnValue('10') };
    return { prisma, service: new MessagingService(prisma as never, {} as never, config as never) };
  }

  function expectSummaryInclude(create: jest.Mock) {
    const input = create.mock.calls[0][0];
    expect(input.include).toMatchObject({
      members: { include: { user: { select: { id: true, displayName: true } } } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { sender: { select: { displayName: true } } } }
    });
  }

  it('returns a complete summary after creating a direct conversation', async () => {
    const { prisma, service } = createService();

    await expect(service.createDirectConversation('current', 'other')).resolves.toEqual(summary);
    expectSummaryInclude(prisma.conversation.create);
  });

  it('returns a complete summary after creating a group conversation', async () => {
    const { prisma, service } = createService();

    await expect(service.createGroupConversation('current', { title: 'Разговор', userIds: ['other'] })).resolves.toEqual(summary);
    expectSummaryInclude(prisma.conversation.create);
  });

  it('adds only new members when the requester owns the group', async () => {
    const { prisma, service } = createService();
    prisma.conversation.findUniqueOrThrow
      .mockResolvedValueOnce({ type: 'GROUP', members: [{ userId: 'current', role: 'OWNER' }] })
      .mockResolvedValueOnce(summary);

    await expect(service.addGroupMembers('current', 'conversation', { userIds: ['other'] })).resolves.toEqual(summary);
    expect(prisma.conversationMember.createMany).toHaveBeenCalledWith({ data: [{ conversationId: 'conversation', userId: 'other', role: 'MEMBER' }] });
  });
});
