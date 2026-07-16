import { BadRequestException } from '@nestjs/common';
import { MatchingService } from './matching.service';

describe('MatchingService', () => {
  const currentProfile = { languages: ['ru'], interests: ['спорт', 'работа'] };
  const candidate = (id: string, languages: string[], interests: string[]) => ({
    id,
    displayName: id,
    profile: { city: null, bio: '', languages, interests, avatarKey: null }
  });

  it('excludes blocked and dismissed candidates', async () => {
    const prisma = {
      profile: { findUniqueOrThrow: jest.fn().mockResolvedValue(currentProfile) },
      block: { findMany: jest.fn().mockResolvedValue([{ creatorId: 'current', targetId: 'blocked' }]) },
      recommendationDismissal: { findMany: jest.fn().mockResolvedValue([{ candidateId: 'dismissed' }]) },
      user: { findMany: jest.fn().mockResolvedValue([candidate('visible', ['ru'], ['спорт']), candidate('blocked', ['ru'], ['спорт']), candidate('dismissed', ['ru'], ['спорт'])]) }
    };
    const storage = { getPublicUrl: jest.fn().mockReturnValue(null) };
    const service = new MatchingService(prisma as never, storage as never);

    await expect(service.recommendations('current')).resolves.toEqual([
      expect.objectContaining({ id: 'visible', score: 14 })
    ]);
  });

  it('rejects an attempt to block own profile', async () => {
    const service = new MatchingService({} as never, {} as never);
    await expect(service.block('user', 'user')).rejects.toBeInstanceOf(BadRequestException);
  });
});
