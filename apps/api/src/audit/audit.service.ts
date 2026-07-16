import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuditInput = {
  actorUserId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  outcome: 'success' | 'failure' | 'denied';
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          actorUserId: input.actorUserId,
          action: input.action,
          resource: input.resource,
          resourceId: input.resourceId,
          outcome: input.outcome,
          metadata: input.metadata,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent
        }
      });
    } catch (error) {
      this.logger.error('Не удалось сохранить событие аудита', error instanceof Error ? error.stack : undefined);
    }
  }
}
