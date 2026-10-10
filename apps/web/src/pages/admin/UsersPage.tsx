import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DropdownMenu } from 'radix-ui';
import { KeyRound, LockOpen, MoreHorizontal, Pencil, Trash2, UserPlus } from 'lucide-react';
import type { AdminUser, UpdateUserRequest, UserRole } from '@birthday/types';
import { api } from '@/lib/api';
import { adminKeys, useAdminMutation } from '@/lib/admin-api';
import { usersQuery } from '@/lib/admin-queries';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatRelative } from '@/lib/utils';
import { AButton, IconButton, PageHeader } from '@/components/admin/ui';
import { DataTable, type Column } from '@/components/admin/data-table';
import { Confirm } from '@/components/admin/overlays';
import { DateCell } from '@/components/admin/misc';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { ROLE_LABEL } from '@/components/admin/users/roles';
import { CreateUserDialog, EditUserDialog, SetPasswordDialog } from '@/components/admin/users/UserDialogs';
import { ActionGuide } from '@/components/admin/action-guide';
import { USER_ACTIONS } from '@/components/admin/action-guide-content';

const roleTone: Record<UserRole, 'navy' | 'gold' | 'neutral'> = { SUPER_ADMIN: 'navy', ADMIN: 'gold', CHECK_IN_STAFF: 'neutral' };

function isLocked(user: AdminUser, now = Date.now()): boolean {
  return !!user.lockedUntil && new Date(user.lockedUntil).getTime() > now;
}

function StatusCell({ user }: { user: AdminUser }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <StatusBadge status={user.status} />
      {isLocked(user) && (
        <Badge tone="warning" title={`Too many failed sign-ins. Locked until ${formatDateTime(user.lockedUntil!)}`}>
          Locked until {new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(user.lockedUntil!))}
        </Badge>
      )}
    </span>
  );
}

function LastLogin({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-muted">Never</span>;
  return (
    <time dateTime={iso} title={formatDateTime(iso)} className="whitespace-nowrap">
      {formatRelative(iso)}
    </time>
  );
}

const menuItem =
  'flex h-10 cursor-pointer select-none items-center gap-2 rounded-md px-2.5 text-[13px] text-navy outline-none data-[highlighted]:bg-navy/[0.06] md:h-8 [&_svg]:size-4';

export default function UsersPage() {
  const { user: me } = useAuth();
  const query = useQuery(usersQuery);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [passwordFor, setPasswordFor] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);

  const unlock = useAdminMutation<AdminUser, AdminUser>({
    mutationFn: (user) => api.put<AdminUser>(`/admin/users/${user.id}`, { unlock: true } satisfies UpdateUserRequest),
    invalidate: [adminKeys.users],
    success: (_, user) => `${user.name} can sign in again`,
  });

  const remove = useAdminMutation<void, AdminUser>({
    mutationFn: (user) => api.delete(`/admin/users/${user.id}`),
    invalidate: [adminKeys.users],
    success: (_, user) => `${user.name} was removed`,
    onSuccess: () => setDeleting(null),
  });

  const isSelf = (user: AdminUser) => user.id === me?.id;

  const actions = (user: AdminUser) => (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton label={`Actions for ${user.name}`} tooltip={false}>
          <MoreHorizontal aria-hidden />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-48 rounded-lg border border-navy/10 bg-white p-1 shadow-lift">
          <DropdownMenu.Item className={menuItem} onSelect={() => setEditing(user)}>
            <Pencil aria-hidden /> Edit
          </DropdownMenu.Item>
          <DropdownMenu.Item className={menuItem} onSelect={() => setPasswordFor(user)}>
            <KeyRound aria-hidden /> Set new password
          </DropdownMenu.Item>
          {isLocked(user) && (
            <DropdownMenu.Item className={menuItem} disabled={unlock.isPending} onSelect={() => unlock.mutate(user)}>
              <LockOpen aria-hidden /> Unlock
            </DropdownMenu.Item>
          )}
          {!isSelf(user) && (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-navy/10" />
              <DropdownMenu.Item className={`${menuItem} text-error data-[highlighted]:bg-error/10`} onSelect={() => setDeleting(user)}>
                <Trash2 aria-hidden /> Delete
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );

  const nameCell = (user: AdminUser) => (
    <span className="flex items-center gap-1.5">
      <span className="font-medium text-navy">{user.name}</span>
      {isSelf(user) && <Badge tone="info">You</Badge>}
    </span>
  );

  const columns: Column<AdminUser>[] = [
    { id: 'name', header: 'Name', cell: nameCell },
    { id: 'email', header: 'Email', cell: (u) => <span className="break-all">{u.email}</span> },
    { id: 'role', header: 'Role', cell: (u) => <Badge tone={roleTone[u.role]}>{ROLE_LABEL[u.role]}</Badge> },
    { id: 'status', header: 'Status', cell: (u) => <StatusCell user={u} /> },
    { id: 'lastLogin', header: 'Last sign-in', cell: (u) => <LastLogin iso={u.lastLoginAt} />, hideBelow: 'lg' },
    { id: 'created', header: 'Created', cell: (u) => <DateCell iso={u.createdAt} />, hideBelow: 'xl' },
    { id: 'actions', header: <span className="sr-only">Actions</span>, cell: actions, className: 'w-12 text-right' },
  ];

  const sorted = query.data
    ?.slice()
    .sort((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : a.name.localeCompare(b.name)));

  return (
    <>
      <PageHeader
        title="Users"
        description="People who can sign in to this dashboard, and what they can do."
        actions={
          <AButton variant="emerald" onClick={() => setCreating(true)}>
            <UserPlus aria-hidden /> Add user
          </AButton>
        }
      />
      <ActionGuide page="users" rows={USER_ACTIONS} />

      <DataTable
        caption="Dashboard users"
        columns={columns}
        rows={sorted}
        getRowId={(u) => u.id}
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="No users yet"
        emptyAction={
          <AButton variant="emerald" onClick={() => setCreating(true)}>
            <UserPlus aria-hidden /> Add user
          </AButton>
        }
        rowClassName={(u) => (u.status === 'DISABLED' ? 'opacity-70' : undefined)}
        mobileCard={(u) => (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1 text-[13px]">
              {nameCell(u)}
              <p className="break-all text-muted">{u.email}</p>
              <div className="flex flex-wrap gap-1">
                <Badge tone={roleTone[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                <StatusCell user={u} />
              </div>
              <p className="text-xs text-muted">
                Last sign-in: <LastLogin iso={u.lastLoginAt} />
              </p>
            </div>
            {actions(u)}
          </div>
        )}
      />

      <CreateUserDialog open={creating} onOpenChange={setCreating} />
      <EditUserDialog user={editing} isSelf={!!editing && isSelf(editing)} onOpenChange={(open) => !open && setEditing(null)} />
      <SetPasswordDialog user={passwordFor} onOpenChange={(open) => !open && setPasswordFor(null)} />
      <Confirm
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'user'}?`}
        description={
          <>
            <p>
              {deleting?.email} will be signed out and will no longer be able to sign in. Their past actions stay in the audit log.
            </p>
            <p className="mt-2 text-muted">To block access temporarily instead, edit the user and set their status to Disabled.</p>
          </>
        }
        confirmLabel="Delete user"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </>
  );
}
