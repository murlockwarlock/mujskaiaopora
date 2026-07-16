import { ProfilesService } from './profiles.service';

describe('ProfilesService', () => {
  it('returns the profile user after an update', async () => {
    const updatedProfile = { avatarKey: null, user: { id: 'user', displayName: 'Иван' } };
    const prisma = {
      profile: {
        findUnique: jest.fn().mockResolvedValue({ languages: [], interests: [], completedAt: null }),
        upsert: jest.fn().mockResolvedValue(updatedProfile)
      }
    };
    const storage = { getPublicUrl: jest.fn().mockReturnValue(null) };
    const service = new ProfilesService(prisma as never, storage as never, {} as never);

    await expect(service.updateProfile('user', { timeZone: 'UTC' })).resolves.toEqual({ user: updatedProfile.user, avatarUrl: null });
    expect(prisma.profile.upsert.mock.calls[0][0].include).toEqual({ user: { select: { id: true, displayName: true } } });
  });
});
