import { motion, useReducedMotion } from 'motion/react';
import { RefreshCw } from 'lucide-react';
import { dismissUpdate, useVersion } from '@/lib/version';
import { cn } from '@/lib/utils';

/**
 * "A new version of the site is ready", with Refresh and Later. Shown once lib/version.ts has
 * seen a newer build. `pill` matches the public site's offline notice; `bar` sits above admin pages.
 */
export function UpdateNotice({ variant = 'pill', className }: { variant?: 'pill' | 'bar'; className?: string }) {
  const { available, dismissed } = useVersion();
  const reduce = useReducedMotion();
  if (!available || dismissed) return null;

  const pill = variant === 'pill';
  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={reduce ? false : { opacity: 0, y: pill ? 8 : -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn(
        'no-print flex items-center gap-3',
        pill
          ? 'max-w-xl rounded-full border border-gold/40 bg-navy/95 py-1.5 pl-4 pr-1.5 text-xs text-champagne shadow-lift'
          : 'border-b border-gold/30 bg-gold/10 px-3 py-1 text-[13px] text-navy lg:px-6',
        className,
      )}
    >
      <RefreshCw aria-hidden className={cn('size-4 shrink-0', pill ? 'text-gold' : 'text-gold-rich')} />
      <p className={cn('leading-snug', !pill && 'flex-1')}>A new version of the site is ready.</p>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={cn(
            'inline-flex h-10 items-center rounded-full px-3 font-medium transition-colors md:h-8',
            pill ? 'bg-gold text-navy hover:bg-champagne' : 'rounded-lg bg-navy text-white hover:bg-navy/90',
          )}
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={dismissUpdate}
          className={cn(
            'inline-flex h-10 items-center rounded-full px-3 transition-colors md:h-8',
            pill ? 'text-ivory hover:bg-gold/15' : 'rounded-lg text-navy hover:bg-navy/5',
          )}
        >
          Later
        </button>
      </div>
    </motion.div>
  );
}
