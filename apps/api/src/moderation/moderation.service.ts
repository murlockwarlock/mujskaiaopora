import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateReportDto, ResolveReportDto } from './dto/report.dto';
import { UpdateUserStatusDto } from './dto/user-status.dto';

@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async createReport(userId: string, dto: CreateReportDto) {
    if (dto.messageId) {
      const message = await this.prisma.message.findUnique({ where: { id: dto.messageId }, select: { senderId: true } });
      if (!message || message.senderId !== dto.targetUserId) throw new NotFoundException('Сообщение не найдено');
    }
    return this.prisma.report.create({
      data: { reporterId: userId, targetUserId: dto.targetUserId, messageId: dto.messageId, reason: dto.reason.trim(), details: dto.details?.trim() }
    });
  }

  async listOpenReports() {
    return this.prisma.report.findMany({
      where: { status: { in: [ReportStatus.OPEN, ReportStatus.IN_REVIEW] } },
      include: {
        reporter: { select: { id: true, displayName: true } },
        targetUser: { select: { id: true, displayName: true } },
        message: { select: { id: true, body: true, createdAt: true } }
      },
      orderBy: { createdAt: 'asc' }
    });
  }

  async listUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        status: true,
        createdAt: true,
        profile: { select: { city: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async resolveReport(actorId: string, reportId: string, dto: ResolveReportDto) {
    const report = await this.prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.RESOLVED, resolution: dto.resolution.trim() }
    });
    await this.auditService.record({ actorUserId: actorId, action: 'moderation.report_resolved', resource: 'report', resourceId: report.id, outcome: 'success', metadata: { resolution: dto.resolution.trim() } });
    return report;
  }

  async suspendUser(actorId: string, userId: string, dto: UpdateUserStatusDto) {
    if (actorId === userId) throw new BadRequestException('Нельзя заблокировать собственную учётную запись');
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!target) throw new NotFoundException('Пользователь не найден');
    if (target.role === 'ADMIN') throw new BadRequestException('Нельзя заблокировать администратора');
    const user = await this.prisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' }, select: { id: true, displayName: true } });
    await this.auditService.record({ actorUserId: actorId, action: 'moderation.user_suspended', resource: 'user', resourceId: user.id, outcome: 'success', metadata: { reason: dto.reason.trim() } });
    return user;
  }

  async restoreUser(actorId: string, userId: string, dto: UpdateUserStatusDto) {
    const user = await this.prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' }, select: { id: true, displayName: true } });
    await this.auditService.record({ actorUserId: actorId, action: 'moderation.user_restored', resource: 'user', resourceId: user.id, outcome: 'success', metadata: { reason: dto.reason.trim() } });
    return user;
  }
}
