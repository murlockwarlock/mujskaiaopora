import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuthenticatedUser } from '../auth/auth.types';
import { AuditService } from './audit.service';
import { SKIP_AUDIT_KEY } from './skip-audit.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService,
    private readonly reflector: Reflector
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    if (this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, [context.getHandler(), context.getClass()])) return next.handle();
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const user = request.user as AuthenticatedUser | undefined;
    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        void this.auditService.record({
          actorUserId: user?.sub,
          action: 'http.request',
          resource: request.routeOptions?.url ?? request.url.split('?')[0],
          outcome: 'success',
          metadata: { method: request.method, statusCode: response.statusCode, durationMs: Date.now() - startedAt, requestId: request.id },
          ipAddress: request.ip,
          userAgent: request.headers['user-agent']
        });
      })
    );
  }
}
