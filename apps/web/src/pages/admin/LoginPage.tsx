import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogIn } from 'lucide-react';
import { errorMessage, isApiError } from '@/lib/api';
import { applyServerErrors } from '@/lib/admin-api';
import { homeFor, useAuth } from '@/lib/auth';
import { AuthShell, FormAlert } from '@/components/admin/auth-shell';
import { PasswordInput } from '@/components/admin/password-input';
import { AButton, AField, AInput, describedBy } from '@/components/admin/ui';
import { PageLoader } from '@/components/ui/spinner';

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email address').max(254, 'Use 254 characters or fewer').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password').max(128, 'Use 128 characters or fewer'),
});
type LoginValues = z.infer<typeof schema>;

/** Only same-app admin paths are accepted as a post-login destination (no open redirects). */
export function safeNext(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith('/admin') || next.startsWith('//') || next.startsWith('/admin/login')) return null;
  return next;
}

export function loginErrorMessage(error: unknown): string {
  if (isApiError(error, 'INVALID_CREDENTIALS')) return 'That email and password do not match. Please try again.';
  if (isApiError(error, 'ACCOUNT_LOCKED'))
    return error.message || 'This account is temporarily locked after too many failed attempts. Try again later or ask an administrator to unlock it.';
  if (isApiError(error, 'ACCOUNT_DISABLED')) return 'This account has been disabled. Please contact an administrator.';
  if (isApiError(error, 'RATE_LIMITED')) return 'Too many sign-in attempts. Please wait a minute and try again.';
  return errorMessage(error);
}

export default function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  if (isLoading) return <PageLoader label="Checking your session" />;
  if (user && !isSubmitting) return <Navigate to={next ?? homeFor(user.role)} replace />;

  const onSubmit = async (values: LoginValues) => {
    setFormError(null);
    try {
      const signedIn = await login({ email: values.email.trim(), password: values.password });
      navigate(next ?? homeFor(signedIn.role), { replace: true });
    } catch (error) {
      if (applyServerErrors(error, setError, ['email', 'password'])) return;
      setFormError(loginErrorMessage(error));
    }
  };

  return (
    <AuthShell title="Sign in" description="Manage the celebration website, guests and check-in.">
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
        <AField label="Password" htmlFor="password" error={errors.password?.message}>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="Your password"
            aria-invalid={!!errors.password}
            aria-describedby={describedBy('password', errors.password)}
            {...register('password')}
          />
        </AField>
        <div className="flex justify-end">
          <Link to="/admin/forgot-password" className="text-[13px] font-medium text-emerald hover:underline">
            Forgot password?
          </Link>
        </div>
        <AButton type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
          {!isSubmitting && <LogIn aria-hidden />} Sign in
        </AButton>
      </form>
    </AuthShell>
  );
}
