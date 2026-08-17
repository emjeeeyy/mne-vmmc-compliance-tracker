import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  message: string;
  error: string;
  path: string;
  timestamp: string;
}

/**
 * Consistent error shape for every response, and a deliberate boundary on what
 * an unexpected (non-HttpException) failure ever reveals to the client: no raw
 * DB error text, stack trace, or SQL — just a generic message. The Logger call
 * gets the full detail server-side, but only the request path/method, never
 * request bodies (which can carry PHI like exam results or contact info).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string;
    if (isHttpException) {
      const responseBody = exception.getResponse();
      message =
        typeof responseBody === 'string'
          ? responseBody
          : ((responseBody as { message?: string | string[] }).message as string | string[] | undefined)
              ?.toString() ?? exception.message;
    } else {
      message = 'Internal server error.';
    }

    const body: ErrorBody = {
      statusCode,
      message,
      error: isHttpException ? exception.name : 'InternalServerError',
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (statusCode >= 500) {
      const detail = exception instanceof Error ? exception.stack ?? exception.message : String(exception);
      this.logger.error(`${request.method} ${request.url} -> ${statusCode}: ${detail}`);
    }

    response.status(statusCode).json(body);
  }
}
