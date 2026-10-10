import { useId } from 'react';
import type { AdminTestimonial } from '@birthday/types';
import { cn } from '@/lib/utils';
import { ASwitch, Tip } from '../ui';
import { NOT_APPROVED_HINT } from './rules';

/**
 * "Show on public website" switch. Only an APPROVED testimonial can be made public
 * (the server answers 409 TESTIMONIAL_NOT_APPROVED otherwise), so the switch is disabled
 * for PENDING and REJECTED items and a tooltip explains why.
 */
export function PublicSwitch({
  testimonial,
  onChange,
  busy,
  showLabel = false,
  className,
}: {
  testimonial: Pick<AdminTestimonial, 'status' | 'isPublic' | 'authorName'>;
  onChange: (isPublic: boolean) => void;
  busy?: boolean;
  /** Show the label next to the switch (detail view). In tables the column header carries it. */
  showLabel?: boolean;
  className?: string;
}) {
  const id = useId();
  const approved = testimonial.status === 'APPROVED';
  const hintId = `${id}-hint`;

  const control = (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <ASwitch
        id={id}
        checked={approved && testimonial.isPublic}
        disabled={!approved || busy}
        onCheckedChange={onChange}
        aria-label={showLabel ? undefined : 'Show on public website'}
        aria-describedby={approved ? undefined : hintId}
      />
      {showLabel && (
        <label htmlFor={id} className={cn('text-[13px] font-medium', approved ? 'text-navy' : 'text-muted')}>
          Show on public website
        </label>
      )}
      {!approved && (
        <span id={hintId} className="sr-only">
          {NOT_APPROVED_HINT}
        </span>
      )}
    </span>
  );

  if (approved) return control;
  // A disabled button gets no pointer events, so the tooltip hangs off a focusable wrapper.
  return (
    <Tip content={NOT_APPROVED_HINT}>
      <span tabIndex={0} className="inline-flex rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-rich" onClick={(e) => e.stopPropagation()}>
        {control}
      </span>
    </Tip>
  );
}
