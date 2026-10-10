import { applyDecorators, CallHandler, ExecutionContext, Injectable, NestInterceptor, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { tap, type Observable } from 'rxjs';

export const PUBLIC_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=600';

/** Sets the header only on success, so error responses are never cached. */
@Injectable()
class PublicCacheHeadersInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(tap(() => res.setHeader('Cache-Control', PUBLIC_CACHE_CONTROL)));
  }
}

/** Browsers and CDNs may reuse the response for a minute, then serve it stale while refreshing. */
export const PublicCacheHeaders = () => applyDecorators(UseInterceptors(PublicCacheHeadersInterceptor));
