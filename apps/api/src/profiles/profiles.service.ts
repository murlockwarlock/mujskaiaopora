import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ConfirmAvatarUploadDto, CreateAvatarUploadDto } from './dto/avatar.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

const profileInclude = { user: { select: { id: true, displayName: true } } } satisfies Prisma.ProfileInclude;

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService
  ) {}

  async getProfile(userId: string) {
    const profile = await this.prisma.profile.findUniqueOrThrow({
      where: { userId },
      include: profileInclude
    });
    return this.present(profile);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.timeZone && !this.isTimeZone(dto.timeZone)) throw new BadRequestException('Некорректный часовой пояс');
    const current = await this.prisma.profile.findUnique({ where: { userId } });
    const languages = dto.languages ?? current?.languages ?? [];
    const interests = dto.interests ?? current?.interests ?? [];
    const completedAt = languages.length && interests.length ? current?.completedAt ?? new Date() : null;
    const profile = await this.prisma.profile.upsert({
      where: { userId },
      create: {
        userId,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        city: dto.city?.trim(),
        timeZone: dto.timeZone ?? 'UTC',
        bio: dto.bio?.trim(),
        languages,
        interests,
        isVisible: dto.isVisible ?? true,
        messageSoundEnabled: dto.messageSoundEnabled ?? true,
        callSoundEnabled: dto.callSoundEnabled ?? true,
        browserNotificationsEnabled: dto.browserNotificationsEnabled ?? false,
        completedAt
      },
      update: {
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        city: dto.city?.trim(),
        timeZone: dto.timeZone,
        bio: dto.bio?.trim(),
        languages: dto.languages,
        interests: dto.interests,
        isVisible: dto.isVisible,
        messageSoundEnabled: dto.messageSoundEnabled,
        callSoundEnabled: dto.callSoundEnabled,
        browserNotificationsEnabled: dto.browserNotificationsEnabled,
        completedAt
      },
      include: profileInclude
    });
    return this.present(profile);
  }

  async createAvatarUpload(userId: string, dto: CreateAvatarUploadDto) {
    if (dto.byteSize > Number(this.config.getOrThrow<string>('AVATAR_MAX_BYTES'))) throw new BadRequestException('Размер аватара превышает лимит');
    const objectKey = `avatars/${userId}/${randomUUID()}`;
    const upload = await this.prisma.avatarUpload.create({
      data: {
        userId,
        objectKey,
        contentType: dto.contentType,
        byteSize: dto.byteSize,
        expiresAt: new Date(Date.now() + Number(this.config.getOrThrow<string>('AVATAR_UPLOAD_TTL_SECONDS')) * 1000)
      }
    });
    const uploadUrl = await this.storage.createAvatarUploadUrl(objectKey, dto.contentType);
    return { uploadId: upload.id, uploadUrl, expiresAt: upload.expiresAt };
  }

  async confirmAvatarUpload(userId: string, dto: ConfirmAvatarUploadDto) {
    const upload = await this.prisma.avatarUpload.findUnique({ where: { id: dto.uploadId } });
    if (!upload || upload.userId !== userId || upload.confirmedAt || upload.expiresAt <= new Date()) {
      throw new BadRequestException('Загрузка недоступна');
    }
    const valid = await this.storage.verifyObject(upload.objectKey, upload.contentType, upload.byteSize).catch(() => false);
    if (!valid) throw new BadRequestException('Файл не прошёл проверку');

    const [, profile] = await this.prisma.$transaction([
      this.prisma.avatarUpload.update({ where: { id: upload.id }, data: { confirmedAt: new Date() } }),
      this.prisma.profile.update({ where: { userId }, data: { avatarKey: upload.objectKey }, include: profileInclude })
    ]);
    return this.present(profile);
  }

  private present<T extends { avatarKey: string | null }>(profile: T): Omit<T, 'avatarKey'> & { avatarUrl: string | null } {
    const { avatarKey, ...result } = profile;
    return { ...result, avatarUrl: this.storage.getPublicUrl(avatarKey) };
  }

  private isTimeZone(timeZone: string): boolean {
    try {
      Intl.DateTimeFormat('ru', { timeZone });
      return true;
    } catch {
      return false;
    }
  }
}
