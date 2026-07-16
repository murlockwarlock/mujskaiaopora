import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto, RegisterDto, RequestPasswordResetDto, ResetPasswordDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthenticatedUser, AuthSession } from './auth.types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(@Body() dto: RegisterDto, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    return this.respondWithSession(await this.authService.register(dto, this.metadata(request)), response);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() dto: LoginDto, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    return this.respondWithSession(await this.authService.login(dto, this.metadata(request)), response);
  }

  @Post('password-reset/request')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    await this.authService.requestPasswordReset(dto.email);
    return { ok: true };
  }

  @Post('password-reset/confirm')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { ok: true };
  }

  @Post('refresh')
  async refresh(@Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    const refreshToken = request.cookies.refresh_token;
    if (!refreshToken) return response.status(401).send({ message: 'Сессия недействительна' });
    const session = await this.authService.refreshSession(refreshToken, this.metadata(request));
    return this.respondWithSession(session, response);
  }

  @Post('logout')
  async logout(@Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    const refreshToken = request.cookies.refresh_token;
    if (refreshToken) await this.authService.revokeSession(refreshToken);
    response.clearCookie('refresh_token', { path: '/v1/auth' });
    return { ok: true };
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.sub);
  }

  private respondWithSession(session: AuthSession, response: FastifyReply) {
    response.setCookie('refresh_token', session.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/v1/auth',
      maxAge: Number(this.config.getOrThrow<string>('REFRESH_SESSION_TTL_SECONDS'))
    });
    return { accessToken: session.accessToken, user: session.user };
  }

  private metadata(request: FastifyRequest): { userAgent?: string; ipAddress?: string } {
    const userAgent = request.headers['user-agent'];
    return { userAgent, ipAddress: request.ip };
  }
}
