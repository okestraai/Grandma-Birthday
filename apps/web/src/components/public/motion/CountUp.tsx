import { useLayoutEffect, useRef } from 'react';
import { animate } from 'motion/react';
import { EASE } from '../reveal';
import { canObserve, useReduceMotion, useSeen } from './env';

/**
 * Counts from `from` up to `value` the first time it scrolls into view. The number is written
 * straight to the DOM (no re-render per frame). Screen readers and search engines get the final
 * value from a visually hidden copy; with reduced motion, or without IntersectionObserver,
 * the final value is shown at once.
 */
export function CountUp({
  value,
  from = 0,
  duration = 1.8,
  grouping = true,
  className,
}: {
  value: number;
  from?: number;
  duration?: number;
  /** Thousands separators; turn off for years. */
  grouping?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReduceMotion();
  const inView = useSeen(ref, { margin: '0px 0px -10% 0px' });
  const format = (n: number) => Math.round(n).toLocaleString(undefined, { useGrouping: grouping });
  const animated = !reduce && canObserve();

  // Before paint: show the starting number so the count does not flash the final value first.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!animated) {
      el.textContent = format(value);
      return;
    }
    if (!inView) {
      el.textContent = format(from);
      return;
    }
    const controls = animate(from, value, {
      duration,
      ease: EASE,
      onUpdate: (n) => {
        el.textContent = format(n);
      },
    });
    return () => controls.stop();
    // `format` is derived from `grouping`, which is in the list.
  }, [animated, inView, value, from, duration, grouping]);

  return (
    <span className={className}>
      <span className="sr-only">{format(value)}</span>
      {/* Filled in by the effect above, so React never owns (and resets) this text. */}
      <span ref={ref} aria-hidden className="tabular-nums" />
    </span>
  );
}
