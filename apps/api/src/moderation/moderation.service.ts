import { Injectable, NotFoundException } from '@nestjs/common';
import { ReportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto, ResolveReportDto } from './dto/report.dto';

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

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

  async resolveReport(reportId: string, dto: ResolveReportDto) {
    return this.prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.RESOLVED, resolution: dto.resolution.trim() }
    });
  }
}
