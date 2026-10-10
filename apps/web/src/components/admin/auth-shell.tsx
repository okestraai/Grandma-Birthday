import type { ReactNode } from 'react';
import { SEO } from '@/components/seo/SEO';

/** Centered card used by login, forgot-password and reset-password. */
export function AuthShell({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f6f5f1] px-4 py-10 font-sans">
      <SEO title={`${title} · Admin`} noindex />
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-navy font-display text-3xl leading-none" aria-hidden>
            <span className="text-gold-gradient">70</span>
          </span>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Celebration Admin</p>
        </div>
        <div className="rounded-xl border border-navy/10 bg-white p-6 shadow-soft">
          <h1 className="font-display text-[22px] leading-tight text-navy">{title}</h1>
          {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
          <div className="mt-5">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-[13px] text-muted">{footer}</div>}
      </div>
    </main>
  );
}

export function FormAlert({ tone = 'error', children }: { tone?: 'error' | 'warning' | 'success'; children: ReactNode }) {
  const cls = {
    error: 'border-error/25 bg-error/[0.06] text-error',
    warning: 'border-warning/30 bg-warning/10 text-[#8a5c12]',
    success: 'border-success/25 bg-success/10 text-success',
  }[tone];
  return (
    <div role={tone === 'success' ? 'status' : 'alert'} className={`mb-4 rounded-lg border px-3 py-2.5 text-[13px] leading-snug ${cls}`}>
      {children}
    </div>
  );
}
