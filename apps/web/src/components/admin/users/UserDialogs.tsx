import { useEffect, useState, type Ref } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AdminUser, CreateUserRequest, UpdateUserRequest, UserRole, UserStatus } from '@birthday/types';
import { api, isApiError } from '@/lib/api';
import { adminKeys, reportFormError, useAdminMutation } from '@/lib/admin-api';
import { cn } from '@/lib/utils';
import { AButton, AField, AInput, ASelect, describedBy } from '@/components/admin/ui';
import { AdminDialog } from '@/components/admin/overlays';
import { PasswordInput } from '@/components/admin/password-input';
import { MIN_PASSWORD, ROLES, generatePassword } from './roles';

const roleSchema = z.enum(['SUPER_ADMIN', 'ADMIN', 'CHECK_IN_STAFF']);
const passwordSchema = z
  .string()
  .min(MIN_PASSWORD, `Use at least ${MIN_PASSWORD} characters.`)
  .max(128, 'Use 128 characters or fewer.');

/** Role picker as a radio group, so each role's description is visible before choosing. */
function RoleRadios({
  name,
  value,
  onChange,
  disabled,
  error,
  inputRef,
}: {
  name: string;
  value: UserRole;
  onChange: (role: UserRole) => void;
  disabled?: boolean;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <fieldset aria-describedby={error ? `${name}-error` : undefined} disabled={disabled}>
      <legend className="mb-1 text-[13px] font-medium text-navy">Role</legend>
      <div className="space-y-2">
        {ROLES.map((role, index) => {
          const id = `${name}-${role.value}`;
          const checked = value === role.value;
          return (
            <label
              key={role.value}
              htmlFor={id}
              className={cn(
                'flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                checked ? 'border-gold-rich bg-champagne/25' : 'border-navy/15 hover:border-navy/30',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                id={id}
                ref={index === 0 ? inputRef : undefined}
                type="radio"
                name={name}
                value={role.value}
                checked={checked}
                onChange={() => onChange(role.value)}
                className="mt-0.5 size-4 accent-[#071a2b]"
                aria-describedby={`${id}-d`}
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-navy">{role.label}</span>
                <span id={`${id}-d`} className="block text-xs text-muted">
                  {role.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={`${name}-error`} role="alert" className="mt-1 text-xs text-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const createSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').min(2, 'Use at least 2 characters.').max(100, 'Use 100 characters or fewer.'),
  email: z.email('Enter a valid email address.').max(254, 'Use 254 characters or fewer.'),
  role: roleSchema,
  password: passwordSchema,
});
type CreateValues = z.infer<typeof createSchema>;
const createDefaults: CreateValues = { name: '', email: '', role: 'ADMIN', password: '' };

export function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [generated, setGenerated] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors },
  } = useForm<CreateValues>({ resolver: zodResolver(createSchema), defaultValues: createDefaults });

  useEffect(() => {
    if (open) {
      reset(createDefaults);
      setGenerated(null);
    }
  }, [open, reset]);

  const create = useAdminMutation<AdminUser, CreateUserRequest>({
    mutationFn: (body) => api.post<AdminUser>('/admin/users', body),
    invalidate: [adminKeys.users],
    success: (user) => `${user.name} can now sign in`,
    toastError: false,
    onSuccess: () => onOpenChange(false),
    onError: (error) => {
      if (isApiError(error, 'CONFLICT')) {
        setError('email', { type: 'server', message: 'A user with this email already exists.' });
      } else if (isApiError(error, 'WEAK_PASSWORD')) {
        setError('password', { type: 'server', message: error.message });
      } else {
        reportFormError(error, setError);
      }
    },
  });

  const onGenerate = () => {
    const password = generatePassword();
    setValue('password', password, { shouldDirty: true, shouldValidate: true });
    setGenerated(password);
  };

  const copyGenerated = async () => {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated);
      toast.success('Password copied');
    } catch {
      toast.error('Could not copy. Select the password and copy it manually.');
    }
  };

  const passwordHint = `At least ${MIN_PASSWORD} characters. Share it privately; they can change it after signing in.`;

  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add user"
      description="Create an account for someone who helps run the celebration."
      footer={
        <>
          <AButton variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </AButton>
          <AButton type="submit" form="create-user-form" variant="emerald" loading={create.isPending}>
            Create user
          </AButton>
        </>
      }
    >
      <form id="create-user-form" noValidate onSubmit={handleSubmit((values) => create.mutate({ ...values, email: values.email.trim().toLowerCase() }))} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <AField label="Name" htmlFor="new-user-name" error={errors.name?.message} required>
            <AInput
              id="new-user-name"
              autoComplete="off"
              placeholder="e.g. Adaeze Okafor"
              aria-invalid={!!errors.name}
              aria-describedby={describedBy('new-user-name', errors.name)}
              {...register('name')}
            />
          </AField>
          <AField label="Email" htmlFor="new-user-email" error={errors.email?.message} required>
            <AInput
              id="new-user-email"
              type="email"
              autoComplete="off"
              placeholder="name@example.com"
              aria-invalid={!!errors.email}
              aria-describedby={describedBy('new-user-email', errors.email)}
              {...register('email')}
            />
          </AField>
        </div>

        <Controller
          control={control}
          name="role"
          render={({ field }) => <RoleRadios name="new-user-role" value={field.value} onChange={field.onChange} error={errors.role?.message} inputRef={field.ref} />}
        />

        <div>
          <AField label="Initial password" htmlFor="new-user-password" error={errors.password?.message} hint={passwordHint} required>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <PasswordInput
                  id="new-user-password"
                  autoComplete="new-password"
                  placeholder="At least 12 characters"
                  aria-invalid={!!errors.password}
                  aria-describedby={describedBy('new-user-password', errors.password, passwordHint)}
                  {...register('password', { onChange: () => setGenerated(null) })}
                />
              </div>
              <AButton onClick={onGenerate}>
                <Wand2 aria-hidden /> Generate
              </AButton>
            </div>
          </AField>
          {generated && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-champagne/30 px-3 py-2" aria-live="polite">
              <span className="text-xs text-muted">Generated:</span>
              <code className="select-all break-all font-mono text-[13px] text-navy">{generated}</code>
              <AButton size="xs" variant="ghost" onClick={() => void copyGenerated()} className="ml-auto">
                <Copy aria-hidden /> Copy
              </AButton>
            </div>
          )}
        </div>
      </form>
    </AdminDialog>
  );
}

// ---------------------------------------------------------------------------
// Edit (name, role, status)
// ---------------------------------------------------------------------------

const editSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').min(2, 'Use at least 2 characters.').max(100, 'Use 100 characters or fewer.'),
  role: roleSchema,
  status: z.enum(['ACTIVE', 'DISABLED']),
});
type EditValues = z.infer<typeof editSchema>;

export function EditUserDialog({ user, isSelf, onOpenChange }: { user: AdminUser | null; isSelf: boolean; onOpenChange: (open: boolean) => void }) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<EditValues>({ resolver: zodResolver(editSchema), defaultValues: { name: '', role: 'ADMIN', status: 'ACTIVE' } });

  useEffect(() => {
    if (user) reset({ name: user.name, role: user.role, status: user.status });
  }, [user, reset]);

  const update = useAdminMutation<AdminUser, UpdateUserRequest>({
    mutationFn: (body) => api.put<AdminUser>(`/admin/users/${user!.id}`, body),
    invalidate: [adminKeys.users],
    success: 'User updated',
    toastError: false,
    onSuccess: () => onOpenChange(false),
    onError: (error) => reportFormError(error, setError),
  });

  const onSubmit = handleSubmit((values) => {
    if (!user) return;
    const body: UpdateUserRequest = {};
    if (values.name !== user.name) body.name = values.name;
    // Your own role and status cannot be changed here (the API refuses it too).
    if (!isSelf && values.role !== user.role) body.role = values.role;
    if (!isSelf && values.status !== user.status) body.status = values.status as UserStatus;
    if (Object.keys(body).length === 0) {
      onOpenChange(false);
      return;
    }
    update.mutate(body);
  });

  const statusHint = isSelf ? 'You cannot disable your own account.' : 'Disabled users cannot sign in. Their history is kept.';

  return (
    <AdminDialog
      open={!!user}
      onOpenChange={onOpenChange}
      title={`Edit ${user?.name ?? 'user'}`}
      description={user?.email}
      footer={
        <>
          <AButton variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </AButton>
          <AButton type="submit" form="edit-user-form" variant="emerald" loading={update.isPending} disabled={!isDirty}>
            Save changes
          </AButton>
        </>
      }
    >
      <form id="edit-user-form" noValidate onSubmit={onSubmit} className="space-y-4">
        <AField label="Name" htmlFor="edit-user-name" error={errors.name?.message} required>
          <AInput id="edit-user-name" placeholder="e.g. Adaeze Okafor" aria-invalid={!!errors.name} aria-describedby={describedBy('edit-user-name', errors.name)} {...register('name')} />
        </AField>

        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <RoleRadios name="edit-user-role" value={field.value} onChange={field.onChange} disabled={isSelf} error={errors.role?.message} inputRef={field.ref} />
          )}
        />
        {isSelf && <p className="-mt-2 text-xs text-muted">You cannot change your own role. Ask another super admin.</p>}

        <AField label="Status" htmlFor="edit-user-status" error={errors.status?.message} hint={statusHint}>
          <ASelect
            id="edit-user-status"
            disabled={isSelf}
            aria-invalid={!!errors.status}
            aria-describedby={describedBy('edit-user-status', errors.status, statusHint)}
            {...register('status')}
          >
            <option value="ACTIVE">Active</option>
            <option value="DISABLED">Disabled</option>
          </ASelect>
        </AField>
      </form>
    </AdminDialog>
  );
}

// ---------------------------------------------------------------------------
// Set a new password
// ---------------------------------------------------------------------------

const passwordFormSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The passwords do not match.' });
type PasswordValues = z.infer<typeof passwordFormSchema>;

export function SetPasswordDialog({ user, onOpenChange }: { user: AdminUser | null; onOpenChange: (open: boolean) => void }) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordFormSchema), defaultValues: { password: '', confirm: '' } });

  useEffect(() => {
    if (user) reset({ password: '', confirm: '' });
  }, [user, reset]);

  const update = useAdminMutation<AdminUser, UpdateUserRequest>({
    mutationFn: (body) => api.put<AdminUser>(`/admin/users/${user!.id}`, body),
    invalidate: [adminKeys.users],
    success: `Password changed for ${user?.name ?? 'the user'}. They have been signed out everywhere.`,
    toastError: false,
    onSuccess: () => onOpenChange(false),
    onError: (error) => {
      if (isApiError(error, 'WEAK_PASSWORD')) setError('password', { type: 'server', message: error.message });
      else reportFormError(error, setError);
    },
  });

  const hint = `At least ${MIN_PASSWORD} characters.`;

  return (
    <AdminDialog
      open={!!user}
      onOpenChange={onOpenChange}
      size="sm"
      title="Set a new password"
      description={user ? `For ${user.name} (${user.email}). This signs them out on every device.` : undefined}
      footer={
        <>
          <AButton variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </AButton>
          <AButton type="submit" form="set-password-form" variant="emerald" loading={update.isPending}>
            Set password
          </AButton>
        </>
      }
    >
      <form id="set-password-form" noValidate onSubmit={handleSubmit((v) => update.mutate({ password: v.password }))} className="space-y-4">
        <AField label="New password" htmlFor="set-password" error={errors.password?.message} hint={hint} required>
          <PasswordInput
            id="set-password"
            autoComplete="new-password"
            placeholder="At least 12 characters"
            aria-invalid={!!errors.password}
            aria-describedby={describedBy('set-password', errors.password, hint)}
            {...register('password')}
          />
        </AField>
        <AField label="Confirm password" htmlFor="set-password-confirm" error={errors.confirm?.message} required>
          <PasswordInput
            id="set-password-confirm"
            autoComplete="new-password"
            placeholder="Type the password again"
            aria-invalid={!!errors.confirm}
            aria-describedby={describedBy('set-password-confirm', errors.confirm)}
            {...register('confirm')}
          />
        </AField>
      </form>
    </AdminDialog>
  );
}
