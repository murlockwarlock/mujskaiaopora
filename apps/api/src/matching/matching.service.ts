import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

type Candidate = {
  id: string;
  displayName: string;
  profile: {
    city: string | null;
    bio: string;
    languages: string[];
    interests: string[];
    avatarKey: string | null;
  } | null;
};

@Injectable()
export class MatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async recommendations(userId: string, take = 20) {
    const [profile, blocks, candidates] = await Promise.all([
      this.prisma.profile.findUniqueOrThrow({ where: { userId } }),
      this.prisma.block.findMany({
        where: { OR: [{ creatorId: userId }, { targetId: userId }] },
        select: { creatorId: true, targetId: true }
      }),
      this.prisma.user.findMany({
        where: { id: { not: userId }, status: 'ACTIVE', profile: { is: { isVisible: true } } },
        select: {
          id: true,
          displayName: true,
          profile: { select: { city: true, bio: true, languages: true, interests: true, avatarKey: true } }
        },
        take: 100
      })
    ]);
    const blockedUserIds = new Set(blocks.map((block) => (block.creatorId === userId ? block.targetId : block.creatorId)));

    return candidates
      .filter((candidate) => !blockedUserIds.has(candidate.id))
      .map((candidate) => ({
        ...candidate,
        profile: candidate.profile ? { ...candidate.profile, avatarUrl: this.storage.getPublicUrl(candidate.profile.avatarKey), avatarKey: undefined } : null,
        score: this.score(profile, candidate)
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, take);
  }

  private score(profile: { languages: string[]; interests: string[] }, candidate: Candidate): number {
    if (!candidate.profile) return 0;
    const commonLanguages = candidate.profile.languages.filter((language) => profile.languages.includes(language)).length;
    const commonInterests = candidate.profile.interests.filter((interest) => profile.interests.includes(interest)).length;
    return commonLanguages * 10 + commonInterests * 4;
  }
}
