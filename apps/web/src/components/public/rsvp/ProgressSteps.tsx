import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { EASE } from '../reveal';
import { RSVP_STEPS, type RsvpStep } from './schema';

/** A check mark that draws itself when a step is completed. */
function DrawnCheck() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none">
      <motion.path
        d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, ease: EASE, delay: 0.15 }}
      />
    </svg>
  );
}

/**
 * Four labelled steps; the current one carries aria-current="step". The gold ring slides to the
 * current step, the connecting lines fill as steps are completed, and completed steps draw a check.
 */
export function ProgressSteps({ step }: { step: RsvpStep }) {
  return (
    <nav aria-label="RSVP progress">
      <p className="text-center text-[11px] font-medium uppercase tracking-[0.28em] text-gold-rich">
        Step {step + 1} of {RSVP_STEPS.length}
      </p>
      <ol className="mt-4 grid grid-cols-4 gap-2">
        {RSVP_STEPS.map((label, index) => {
          const done = index < step;
          const current = index === step;
          return (
            <li key={label} aria-current={current ? 'step' : undefined} className="flex flex-col items-center gap-2 text-center">
              <span className="relative flex w-full items-center justify-center">
                {/* Left half-line (into this step) and right half-line (out of it): a grey track with a gold fill. */}
                {index > 0 && (
                  <span aria-hidden className="absolute left-0 right-1/2 top-1/2 h-px -translate-y-1/2 bg-navy/10">
                    <motion.span
                      className="absolute inset-0 origin-left bg-gold/70"
                      initial={false}
                      animate={{ scaleX: done || current ? 1 : 0 }}
                      transition={{ duration: 0.45, ease: EASE, delay: current ? 0.2 : 0 }}
                    />
                  </span>
                )}
                {index < RSVP_STEPS.length - 1 && (
                  <span aria-hidden className="absolute left-1/2 right-0 top-1/2 h-px -translate-y-1/2 bg-navy/10">
                    <motion.span
                      className="absolute inset-0 origin-left bg-gold/70"
                      initial={false}
                      animate={{ scaleX: done ? 1 : 0 }}
                      transition={{ duration: 0.45, ease: EASE }}
                    />
                  </span>
                )}
                <span
                  aria-hidden
                  className={cn(
                    'relative flex size-7 items-center justify-center rounded-full border text-xs font-medium transition-colors duration-500 ease-luxe',
                    done && 'border-gold bg-gold text-navy',
                    current && 'border-gold-rich bg-ivory text-navy',
                    !done && !current && 'border-navy/15 bg-ivory text-muted',
                  )}
                >
                  {current && (
                    <motion.span
                      layoutId="rsvp-step-ring"
                      className="absolute -inset-1.5 rounded-full border-2 border-gold/40 bg-gold/10"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className="relative">{done ? <DrawnCheck /> : index + 1}</span>
                </span>
              </span>
              <span className={cn('text-[11px] leading-tight sm:text-xs', current ? 'font-medium text-navy' : 'text-muted')}>
                {label}
                {done && <span className="sr-only"> (completed)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
