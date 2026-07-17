import { ModerationService } from './moderation.service';

describe('ModerationService', () => {
  it('returns basic moderation statistics', async () => {
    const prisma = {
      user: { count: jest.fn().mockResolvedValueOnce(18).mockResolvedValueOnce(15).mockResolvedValueOnce(2).mockResolvedValueOnce(0) },
      report: { count: jest.fn().mockResolvedValueOnce(3) },
      message: { count: jest.fn().mockResolvedValueOnce(42) }
    };
    const service = new ModerationService(prisma as never, {} as never);

    await expect(service.statistics()).resolves.toEqual({ users: 18, activeUsers: 15, suspendedUsers: 2, openReports: 3, messagesToday: 42, newUsersToday: 0 });
  });
});
