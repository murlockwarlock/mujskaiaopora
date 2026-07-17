import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateReportDto, ResolveReportDto } from './dto/report.dto';
import { UpdateUserStatusDto } from './dto/user-status.dto';
import { ModerationService } from './moderation.service';

@ApiTags('moderation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReportDto) {
    return this.moderationService.createReport(user.sub, dto);
  }

  @Get()
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  @UseGuards(RolesGuard)
  listOpen() {
    return this.moderationService.listOpenReports();
  }

  @Get('users')
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  @UseGuards(RolesGuard)
  listUsers() {
    return this.moderationService.listUsers();
  }

  @Get('statistics')
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  @UseGuards(RolesGuard)
  statistics() {
    return this.moderationService.statistics();
  }

  @Post(':reportId/resolve')
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  @UseGuards(RolesGuard)
  resolve(@CurrentUser() user: AuthenticatedUser, @Param('reportId') reportId: string, @Body() dto: ResolveReportDto) {
    return this.moderationService.resolveReport(user.sub, reportId, dto);
  }

  @Post('users/:userId/suspend')
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  @UseGuards(RolesGuard)
  suspend(@CurrentUser() user: AuthenticatedUser, @Param('userId') userId: string, @Body() dto: UpdateUserStatusDto) {
    return this.moderationService.suspendUser(user.sub, userId, dto);
  }

  @Post('users/:userId/restore')
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  @UseGuards(RolesGuard)
  restore(@CurrentUser() user: AuthenticatedUser, @Param('userId') userId: string, @Body() dto: UpdateUserStatusDto) {
    return this.moderationService.restoreUser(user.sub, userId, dto);
  }
}
