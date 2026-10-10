import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', {
  variants: {
    tone: {
      neutral: 'bg-cream text-navy ring-navy/10',
      gold: 'bg-champagne/60 text-[#7a5a1f] ring-gold/40',
      success: 'bg-success/10 text-success ring-success/25',
      warning: 'bg-warning/10 text-[#8a5c12] ring-warning/30',
      danger: 'bg-error/10 text-error ring-error/25',
      info: 'bg-emerald/10 text-emerald ring-emerald/25',
      navy: 'bg-navy text-ivory ring-navy',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

const statusTone = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', ACTIVE: 'success', REVOKED: 'danger', DISABLED: 'neutral', ATTENDING: 'success', DECLINED: 'neutral' } as const;

export function StatusBadge({ status }: { status: keyof typeof statusTone }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  return <Badge tone={statusTone[status]}>{label}</Badge>;
}
