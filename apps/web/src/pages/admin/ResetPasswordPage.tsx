import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import type { ResetPasswordRequest } from '@birthday/types';
import { api, errorMessage, isApiError } from '@/lib/api';
import { applyServerErrors } from '@/lib/admin-api';
import { AuthShell, FormAlert } from '@/components/admin/auth-shell';
import { PasswordInput } from '@/components/admin/password-input';
import { AButton, AField, describedBy } from '@/components/admin/ui';

export const MIN_PASSWORD = 12;

const schema = z
  .object({
    password: z.string().min(MIN_PASSWORD, `Use at least ${MIN_PASSWORD} characters`).max(128, 'Use 128 characters or fewer'),
    confirm: z.string().min(1, 'Type the password again'),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The passwords do not match' });
type Values = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [tokenInvalid, setTokenInvalid] = useState(!token);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } });

  const back = (
    <Link to="/admin/login" className="inline-flex items-center gap-1 font-medium text-emerald hover:underline">
      <ArrowLeft className="size-3.5" aria-hidden /> Back to sign in
    </Link>
  );

  const onSubmit = async (values: Values) => {
    setFormError(null);
    try {
      await api.post<void>('/auth/password/reset', { token, password: values.password } satisfies ResetPasswordRequest, { skipRefresh: true });
      setDone(true);
    } catch (error) {
      if (isApiError(error, 'PASSWORD_RESET_TOKEN_INVALID')) setTokenInvalid(true);
      else if (isApiError(error, 'WEAK_PASSWORD')) setError('password', { type: 'server', message: error.message });
      else if (!applyServerErrors(error, setError, ['password'])) setFormError(errorMessage(error));
    }
  };

  if (done) {
    return (
      <AuthShell title="Password changed" footer={back}>
        <div role="status" className="flex gap-3 text-[13px] leading-relaxed text-charcoal">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <p>Your password has been changed and other sessions have been signed out. You can now sign in with the new password.</p>
        </div>
        <AButton asChild variant="primary" size="lg" className="mt-5 w-full">
          <Link to="/admin/login">Sign in</Link>
        </AButton>
      </AuthShell>
    );
  }

  if (tokenInvalid) {
    return (
      <AuthShell title="Link expired" footer={back}>
        <FormAlert>This password reset link is invalid or has expired. Reset links can only be used once.</FormAlert>
        <AButton asChild variant="primary" className="w-full">
          <Link to="/admin/forgot-password">Request a new link</Link>
        </AButton>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" description={`Use at least ${MIN_PASSWORD} characters. A short phrase is easier to remember.`} footer={back}>
      {formError && <FormAlert>{formError}</FormAlert>}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <AField label="New password" htmlFor="password" error={errors.password?.message} hint={`At least ${MIN_PASSWORD} characters`}>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            autoFocus
            placeholder={`At least ${MIN_PASSWORD} characters`}
            aria-invalid={!!errors.password}
            aria-describedby={describedBy('password', errors.password, true)}
            {...register('password')}
          />
        </AField>
        <AField label="Confirm new password" htmlFor="confirm" error={errors.confirm?.message}>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            placeholder="Type the new password again"
            aria-invalid={!!errors.confirm}
            aria-describedby={describedBy('confirm', errors.confirm)}
            {...register('confirm')}
          />
        </AField>
        <AButton type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
          Change password
        </AButton>
      </form>
    </AuthShell>
  );
}
