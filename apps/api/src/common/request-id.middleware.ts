import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { RequestWithUser } from './request-context';

/** Gives every request an id (echoed as X-Request-Id and included in error bodies and logs). */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithUser, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-request-id'];
    req.id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  }
}
