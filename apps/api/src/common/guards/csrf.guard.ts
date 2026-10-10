import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { CSRF_COOKIE, CSRF_HEADER, REFRESH_COOKIE } from '../cookies';
import { AppException } from '../errors';
import { safeEqual } from '../utils/crypto';
import type { RequestWithUser } from '../request-context';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const REFRESH_PATHS = new Set(['/api/auth/refresh', '/api/auth/logout']);

/**
 * Double-submit CSRF protection for cookie sessions. A state-changing request that is
 * authenticated by cookie (or uses the refresh cookie) must echo the readable bp_csrf
 * cookie in the X-CSRF-Token header. Bearer-token clients are not affected. Runs after AuthGuard.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (SAFE_METHODS.has(request.method)) return true;

    const cookies = (request.cookies ?? {}) as Record<string, string>;
    const usesCookieSession =
      request.user?.via === 'cookie' || (Boolean(cookies[REFRESH_COOKIE]) && REFRESH_PATHS.has(request.path));
    if (!usesCookieSession) return true;

    const cookie = cookies[CSRF_COOKIE];
    const header = request.headers[CSRF_HEADER];
    if (typeof header === 'string' && cookie && safeEqual(header, cookie)) return true;
    throw new AppException(403, 'CSRF_TOKEN_INVALID', 'Your session security token is missing or out of date. Reload the page and try again.');
  }
}
