import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { ChangePasswordRequest, Permission } from '@birthday/types';
import { api, isApiError } from '@/lib/api';
import { reportFormError, useAdminMutation } from '@/lib/admin-api';
import { useAuth } from '@/lib/auth';
import { initials } from '@/lib/utils';
import { AButton, AField, DetailList, PageHeader, Panel, describedBy } from '@/components/admin/ui';
import { PasswordInput } from '@/components/admin/password-input';
import { Badge } from '@/components/ui/badge';
import { MIN_PASSWORD, ROLE_LABEL } from '@/components/admin/users/roles';

const PERMISSION_LABEL: Record<Permission, string> = {
  'dashboard:read': 'View dashboard',
  'content:manage': 'Edit content',
  'media:manage': 'Manage media',
  'testimonials:manage': 'Moderate testimonials',
  'guests:manage': 'Manage guests',
  'event:manage': 'Edit event',
  'settings:manage': 'Change settings',
  'storage:read': 'View storage',
  'checkin:use': 'Check guests in',
  'checkin:reverse': 'Reverse check-ins',
  'audit:read': 'Read audit log',
  'users:manage': 'Manage users',
};

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.').max(128, 'Use 128 characters or fewer.'),
    newPassword: z.string().min(MIN_PASSWORD, `Use at least ${MIN_PASSWORD} characters.`).max(128, 'Use 128 characters or fewer.'),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'The passwords do not match.' })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ['newPassword'], message: 'Choose a password different from your current one.' });
type FormValues = z.infer<typeof schema>;
const empty: FormValues = { currentPassword: '', newPassword: '', confirm: '' };

function ChangePasswordForm({ email }: { email: string }) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: empty });

  const change = useAdminMutation<void, ChangePasswordRequest>({
    mutationFn: (body) => api.post<void>('/auth/password/change', body),
    toastError: false,
    onSuccess: () => {
      toast.success('Password changed', { description: 'You may need to sign in again on other devices.' });
      reset(empty);
    },
    onError: (error) => {
      if (isApiError(error, 'INVALID_CREDENTIALS')) {
        setError('currentPassword', { type: 'server', message: 'Current password is incorrect.' }, { shouldFocus: true });
      } else if (isApiError(error, 'WEAK_PASSWORD')) {
        setError('newPassword', { type: 'server', message: error.message }, { shouldFocus: true });
      } else {
        reportFormError(error, setError);
      }
    },
  });

  const newHint = `At least ${MIN_PASSWORD} characters. A short sentence is easy to remember and hard to guess.`;

  return (
    <form
      noValidate
      onSubmit={handleSubmit((v) => change.mutate({ currentPassword: v.currentPassword, newPassword: v.newPassword }))}
      className="max-w-md space-y-4"
    >
      {/* Helps password managers pair the new password with this account. */}
      <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
      <AField label="Current password" htmlFor="currentPassword" error={errors.currentPassword?.message} required>
        <PasswordInput
          id="currentPassword"
          autoComplete="current-password"
          placeholder="Your current password"
          aria-invalid={!!errors.currentPassword}
          aria-describedby={describedBy('currentPassword', errors.currentPassword)}
          {...register('currentPassword')}
        />
      </AField>
      <AField label="New password" htmlFor="newPassword" error={errors.newPassword?.message} hint={newHint} required>
        <PasswordInput
          id="newPassword"
          autoComplete="new-password"
          placeholder="At least 12 characters"
          aria-invalid={!!errors.newPassword}
          aria-describedby={describedBy('newPassword', errors.newPassword, newHint)}
          {...register('newPassword')}
        />
      </AField>
      <AField label="Confirm new password" htmlFor="confirm" error={errors.confirm?.message} required>
        <PasswordInput
          id="confirm"
          autoComplete="new-password"
          placeholder="Type the new password again"
          aria-invalid={!!errors.confirm}
          aria-describedby={describedBy('confirm', errors.confirm)}
          {...register('confirm')}
        />
      </AField>
      <p className="text-xs text-muted">Changing your password may sign you out on your other devices.</p>
      <AButton type="submit" variant="emerald" loading={change.isPending}>
        Change password
      </AButton>
    </form>
  );
}

export default function AccountPage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <>
      <PageHeader title="Your account" description="Your profile and password." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Panel id="account-profile" title="Profile" description="Ask a super admin to change your name, email or role.">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-semibold text-gold" aria-hidden>
              {initials(user.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-navy">{user.name}</p>
              <p className="truncate text-[13px] text-muted">{user.email}</p>
            </div>
          </div>
          <DetailList
            items={[
              { label: 'Name', value: user.name },
              { label: 'Email', value: user.email },
              { label: 'Role', value: <Badge tone="navy">{ROLE_LABEL[user.role]}</Badge> },
              {
                label: 'Permissions',
                value: (
                  <ul className="flex flex-wrap gap-1" aria-label="Your permissions">
                    {user.permissions.map((p) => (
                      <li key={p}>
                        <Badge tone="neutral" title={p} className="px-2 text-[11px]">
                          {PERMISSION_LABEL[p] ?? p}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ),
              },
            ]}
          />
        </Panel>

        <Panel id="account-password" title="Change password">
          <ChangePasswordForm email={user.email} />
        </Panel>
      </div>
    </>
  );
}
