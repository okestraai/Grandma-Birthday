import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { EASE } from '../reveal';
import { useReduceMotion } from './env';

/**
 * Wraps one page in the public layout; give it `key={pathname}`. The new page replaces the
 * old one at once (so it is in the DOM straight away for scrolling, focus and screen readers)
 * and fades and lifts in while the curtain sweeps past. `animate={false}` on the first page
 * load. It ends with no transform, so fixed and sticky children behave normally.
 */
export function RouteTransition({ children, animate = true }: { children: ReactNode; animate?: boolean }) {
  const reduce = useReduceMotion();
  return (
    <motion.div
      initial={!animate ? false : reduce ? { opacity: 0 } : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.2 : 0.35, ease: EASE, delay: reduce ? 0 : 0.14 }}
    >
      {children}
    </motion.div>
  );
}

/**
 * A navy panel with a gold edge that sweeps up across the screen once, under the header,
 * covering the swap between pages. Mount it with a new key on each navigation (not on the
 * first page load). Nothing with reduced motion.
 */
export function RouteCurtain({ mark = 70 }: { mark?: number | string }) {
  const reduce = useReduceMotion();
  if (reduce) return null;
  return (
    <motion.div
      aria-hidden
      data-testid="route-curtain"
      className="no-print pointer-events-none fixed inset-0 z-[35] bg-navy"
      initial={{ y: '100%' }}
      animate={{ y: ['100%', '0%', '0%', '-100%'] }}
      transition={{ duration: 0.45, times: [0, 0.34, 0.5, 1], ease: EASE }}
    >
      <div className="absolute inset-0 bg-luxury opacity-90" />
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gold shadow-[0_0_24px_4px_rgba(214,179,106,0.55)]" />
      <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gold shadow-[0_0_24px_4px_rgba(214,179,106,0.55)]" />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-display text-6xl lining-nums text-gold-gradient opacity-70">{mark}</span>
    </motion.div>
  );
}
