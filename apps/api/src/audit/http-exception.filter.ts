import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthenticatedUser } from '../auth/auth.types';
import { AuditService } from './audit.service';

@Catch()
export class HttpExceptionAuditFilter implements ExceptionFilter {
  constructor(private readonly auditService: AuditService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    const response = context.getResponse<FastifyReply>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const errorResponse = exception instanceof HttpException ? exception.getResponse() : { message: 'Внутренняя ошибка сервера' };
    void this.auditService.record({
      actorUserId: request.user?.sub,
      action: 'http.request',
      resource: request.routeOptions?.url ?? request.url.split('?')[0],
      outcome: status === HttpStatus.FORBIDDEN || status === HttpStatus.UNAUTHORIZED ? 'denied' : 'failure',
      metadata: { method: request.method, statusCode: status, requestId: request.id },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']
    });
    void response.status(status).send(errorResponse);
  }
}
