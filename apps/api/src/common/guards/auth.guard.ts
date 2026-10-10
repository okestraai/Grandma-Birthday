import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC, PERMISSIONS } from '../decorators/auth.decorators';
import { Errors } from '../errors';
import { hasPermission } from '../permissions';
import type { RequestWithUser } from '../request-context';
import type { Permission } from '@birthday/types';
import { ACCESS_COOKIE } from '../cookies';

interface AccessPayload {
  sub: string;
  typ: 'access';
  iat: number;
}

/**
 * Global guard, in this order: authentication → user status → role permissions.
 * Every route is private unless marked @Public(). Resource-level checks live in services.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets) ?? false;
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    await this.attachUser(request);

    if (isPublic) return true;
    if (!request.user) throw Errors.unauthenticated();

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS, targets) ?? [];
    for (const permission of required) {
      if (!hasPermission(request.user.role, permission)) throw Errors.forbidden();
    }
    return true;
  }

  private async attachUser(request: RequestWithUser): Promise<void> {
    const header = request.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const cookie = (request.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
    const token = bearer ?? cookie;
    if (!token) return;

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token, { secret: this.config.auth.jwtSecret, algorithms: ['HS256'] });
    } catch {
      return;
    }
    if (payload.typ !== 'access') return;

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true, status: true, passwordChangedAt: true },
    });
    if (!user || user.status !== 'ACTIVE') return;
    // A password change invalidates access tokens issued before it.
    if (user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt.getTime() - 1000) return;

    request.user = { id: user.id, email: user.email, name: user.name, role: user.role, via: bearer ? 'bearer' : 'cookie' };
  }
}
