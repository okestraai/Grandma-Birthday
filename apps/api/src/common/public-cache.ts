import { CallHandler, ExecutionContext, Global, Injectable, Module, NestInterceptor } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import type { Request } from 'express';
import { tap, type Observable } from 'rxjs';

const TTL_MS = 60_000;
const MAX_ENTRIES = 200;

/**
 * Short-lived, in-process cache for public read models such as GET /site and GET /seo.
 * Every write request clears it (see PublicCacheInterceptor), so the TTL only bounds staleness
 * from writes made outside this process, such as the seed script.
 */
@Injectable()
export class PublicCache {
  private readonly entries = new Map<string, { value: unknown; expires: number }>();
  // Bumped on clear, so a load that started before a write is not stored after it.
  private generation = 0;

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set(key: string, value: unknown): void {
    this.entries.delete(key);
    // Drop the oldest entry when full (Map keeps insertion order).
    if (this.entries.size >= MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, { value, expires: Date.now() + TTL_MS });
  }

  clear(): void {
    this.generation++;
    this.entries.clear();
  }

  /** Returns the cached value, or loads and stores it. */
  async remember<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.get<T>(key);
    if (hit !== undefined) return hit;
    const generation = this.generation;
    const value = await load();
    if (generation === this.generation) this.set(key, value);
    return value;
  }
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Clears the public cache after any write request, before the response is sent. */
@Injectable()
export class PublicCacheInterceptor implements NestInterceptor {
  constructor(private readonly cache: PublicCache) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    if (READ_METHODS.has(req.method)) return next.handle();
    // Cleared on failure too: a failed request may still have written something.
    const clear = () => this.cache.clear();
    return next.handle().pipe(tap({ complete: clear, error: clear }));
  }
}

@Global()
@Module({
  providers: [PublicCache, { provide: APP_INTERCEPTOR, useClass: PublicCacheInterceptor }],
  exports: [PublicCache],
})
export class PublicCacheModule {}
