import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiErrorBody, ApiErrorCode } from '@birthday/types';
import { Prisma } from '../../generated/prisma/client';
import { AppException } from '../errors';

const CODE_BY_STATUS: Record<number, ApiErrorCode> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_FILE_TYPE',
  429: 'RATE_LIMITED',
};

const FRIENDLY: Partial<Record<ApiErrorCode, string>> = {
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  PAYLOAD_TOO_LARGE: 'That request is too large.',
  NOT_FOUND: 'Not found.',
};

/**
 * Turns every error into the ApiErrorBody shape. Unexpected errors are logged with
 * the request id and returned as a generic 500: no stack traces or internals leak.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();
    const body = this.toBody(exception, request);

    if (body.statusCode >= 500) {
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(`${request.method} ${request.path} failed [${body.requestId}]: ${err.name}: ${err.message}`, err.stack);
    }
    if (response.headersSent) return;
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, request: Request & { id?: string }): ApiErrorBody {
    const requestId = request.id;

    if (exception instanceof AppException) {
      return {
        success: false,
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
        requestId,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
      const res = exception.getResponse();
      const raw = typeof res === 'string' ? res : ((res as { message?: unknown }).message ?? exception.message);
      const message = FRIENDLY[code] ?? (Array.isArray(raw) ? raw.join('; ') : String(raw));
      return { success: false, statusCode: status, code, message, requestId };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return { success: false, statusCode: 409, code: 'CONFLICT', message: 'That value is already in use.', requestId };
      }
      if (exception.code === 'P2025') {
        return { success: false, statusCode: 404, code: 'NOT_FOUND', message: 'Not found.', requestId };
      }
      if (exception.code === 'P2003') {
        return { success: false, statusCode: 409, code: 'CONFLICT', message: 'A related record is missing or still in use.', requestId };
      }
    }

    // Body-parser errors (bad JSON, too large) carry an HTTP status and are safe to describe.
    const maybe = exception as { status?: number; type?: string; expose?: boolean };
    if (typeof maybe?.status === 'number' && maybe.status >= 400 && maybe.status < 500 && maybe.expose) {
      const status = maybe.status;
      const code = CODE_BY_STATUS[status] ?? 'BAD_REQUEST';
      const message = maybe.type === 'entity.parse.failed' ? 'The request body is not valid JSON.' : (FRIENDLY[code] ?? 'Bad request.');
      return { success: false, statusCode: status, code, message, requestId };
    }

    return {
      success: false,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side. Please try again.',
      requestId,
    };
  }
}
