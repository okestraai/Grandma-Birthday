import type { Permission, UserRole } from '@birthday/types';

const ADMIN_PERMISSIONS: Permission[] = [
  'dashboard:read',
  'content:manage',
  'media:manage',
  'testimonials:manage',
  'guests:manage',
  'event:manage',
  'settings:manage',
  'storage:read',
  'checkin:use',
  'checkin:reverse',
  'audit:read',
];

/** Role → permissions. The only place roles are interpreted. */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  SUPER_ADMIN: [...ADMIN_PERMISSIONS, 'users:manage'],
  ADMIN: ADMIN_PERMISSIONS,
  CHECK_IN_STAFF: ['checkin:use'],
};

export function permissionsFor(role: UserRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
