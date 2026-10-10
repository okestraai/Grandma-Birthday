import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@birthday/types';
import type { AuthenticatedUser, RequestWithUser } from '../request-context';

export const IS_PUBLIC = 'isPublic';
export const PERMISSIONS = 'permissions';

/** No login needed. The auth guard still attaches the user if a valid session is present. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** The user's role must grant every listed permission. */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS, permissions);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
  return ctx.switchToHttp().getRequest<RequestWithUser>().user;
});
