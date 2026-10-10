import type { Request } from 'express';
import type { UserRole } from '@birthday/types';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** How the request authenticated; cookie sessions must pass the CSRF check. */
  via: 'cookie' | 'bearer';
}

export interface RequestWithUser extends Request {
  id?: string;
  user?: AuthenticatedUser;
}

/** IP, user agent and actor for audit records. */
export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  actor: AuthenticatedUser | null;
}

export function requestMeta(req: RequestWithUser): RequestMeta {
  return {
    ip: req.ip ?? null,
    userAgent: (req.headers['user-agent'] ?? '').slice(0, 300) || null,
    actor: req.user ?? null,
  };
}
