import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto, ResetPasswordDto } from './dto/auth.dto';
import { AuthSession } from './auth.types';
import { MailerService } from './mailer.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService
  ) {}

  async register(dto: RegisterDto, metadata: { userAgent?: string; ipAddress?: string } = {}) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Этот e-mail уже зарегистрирован');

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const user = await this.prisma.user.create({
      data: { email, passwordHash, displayName: dto.displayName.trim(), profile: { create: {} } }
    });

    return this.createSession(user, metadata);
  }

  async login(dto: LoginDto, metadata: { userAgent?: string; ipAddress?: string } = {}) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
    if (!user || user.status !== 'ACTIVE' || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Неверный e-mail или пароль');
    }

    return this.createSession(user, metadata);
  }

  async me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, role: true, status: true, profile: true }
    });
  }

  async requestPasswordReset(emailInput: string): Promise<void> {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, email: true, status: true } });
    if (!user || user.status !== 'ACTIVE') return;
    const token = randomBytes(48).toString('base64url');
    const tokenHash = this.hashToken(token);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + this.resetTokenTtlMilliseconds) }
      })
    ]);
    await this.mailer.sendPasswordReset(user.email, token);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = this.hashToken(dto.token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) throw new UnauthorizedException('Ссылка недействительна или устарела');
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const result = await this.prisma.passwordResetToken.updateMany({
      where: { id: resetToken.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() }
    });
    if (!result.count) throw new UnauthorizedException('Ссылка недействительна или устарела');
    await this.prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } });
  }

  async refreshSession(refreshToken: string, metadata: { userAgent?: string; ipAddress?: string }): Promise<AuthSession> {
    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash: this.hashToken(refreshToken) },
      include: { user: true }
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Сессия недействительна');
    }
    await this.prisma.userSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    return this.createSession(session.user, metadata);
  }

  async revokeSession(refreshToken: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { refreshTokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  private async createSession(
    user: { id: string; email: string; displayName: string; role: string },
    metadata: { userAgent?: string; ipAddress?: string } = {}
  ): Promise<AuthSession> {
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role });
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshSessionTtlMilliseconds),
        userAgent: metadata.userAgent?.slice(0, 500),
        ipAddress: metadata.ipAddress?.slice(0, 64)
      }
    });
    return { accessToken, refreshToken, user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role } };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private get resetTokenTtlMilliseconds(): number {
    return Number(this.config.getOrThrow<string>('PASSWORD_RESET_TTL_SECONDS')) * 1000;
  }

  private get refreshSessionTtlMilliseconds(): number {
    return Number(this.config.getOrThrow<string>('REFRESH_SESSION_TTL_SECONDS')) * 1000;
  }
}
