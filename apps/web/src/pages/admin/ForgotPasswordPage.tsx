import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, MailCheck } from 'lucide-react';
import type { ForgotPasswordRequest } from '@birthday/types';
import { api, errorMessage, isApiError } from '@/lib/api';
import { AuthShell, FormAlert } from '@/components/admin/auth-shell';
import { AButton, AField, AInput, describedBy } from '@/components/admin/ui';

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email address').max(254, 'Use 254 characters or fewer').email('Enter a valid email address'),
});
type Values = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = async (values: Values) => {
    setFormError(null);
    try {
      await api.post<void>('/auth/password/forgot', { email: values.email.trim() } satisfies ForgotPasswordRequest, { skipRefresh: true });
      setSentTo(values.email.trim());
    } catch (error) {
      setFormError(isApiError(error, 'RATE_LIMITED') ? 'Too many requests. Please wait a minute and try again.' : errorMessage(error));
    }
  };

  const back = (
    <Link to="/admin/login" className="inline-flex items-center gap-1 font-medium text-emerald hover:underline">
      <ArrowLeft className="size-3.5" aria-hidden /> Back to sign in
    </Link>
  );

  if (sentTo) {
    return (
      <AuthShell title="Check your email" footer={back}>
        <div role="status" className="flex gap-3 text-[13px] leading-relaxed text-charcoal">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-emerald" aria-hidden />
          <p>
            If an account exists for <strong className="break-all">{sentTo}</strong>, we&apos;ve sent a link to reset the password. The link
            expires soon, so use it within the hour. Check your spam folder if it does not arrive.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Forgot password" description="Enter your email and we'll send you a link to choose a new password." footer={back}>
      {formError && <FormAlert>{formError}</FormAlert>}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <AField label="Email" htmlFor="email" error={errors.email?.message}>
          <AInput
            id="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoFocus
            placeholder="you@example.com"
            aria-invalid={!!errors.email}
            aria-describedby={describedBy('email', errors.email)}
            {...register('email')}
          />
        </AField>
        <AButton type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
          Send reset link
        </AButton>
      </form>
    </AuthShell>
  );
}
