import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorCode } from '@birthday/types';

/** Every expected failure is an AppException with a stable machine-readable code. */
export class AppException extends HttpException {
  constructor(
    status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super({ code, message, details }, status);
  }
}

export const Errors = {
  badRequest: (message: string, details?: Record<string, string[]>) =>
    new AppException(HttpStatus.BAD_REQUEST, 'BAD_REQUEST', message, details),
  validation: (details: Record<string, string[]>, message = 'Some fields need attention.') =>
    new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', message, details),
  unauthenticated: (message = 'Please sign in to continue.') =>
    new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', message),
  forbidden: (message = 'You do not have permission to do that.') =>
    new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN', message),
  notFound: (what = 'Resource') => new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found.`),
  conflict: (message: string) => new AppException(HttpStatus.CONFLICT, 'CONFLICT', message),
  of: (status: number, code: ApiErrorCode, message: string) => new AppException(status, code, message),
};
