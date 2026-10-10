import type { ReactNode } from 'react';
import { motion, type Variants } from 'motion/react';
import { onView } from './motion/env';

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Fades and moves its children into place once, when they scroll into view. `y` lifts, `x`
 * slides in from a side (negative is from the left), `scale` grows from that size.
 * MotionConfig handles reduced motion; without IntersectionObserver it starts in place.
 */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  x = 0,
  scale = 1,
  rotate = 0,
  className,
  as = 'div',
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  x?: number;
  scale?: number;
  /** Degrees to turn in from. */
  rotate?: number;
  className?: string;
  as?: 'div' | 'li' | 'section' | 'article' | 'figure';
}) {
  const Component = motion[as];
  return (
    <Component
      className={className}
      {...onView({ opacity: 0, x, y, scale, rotate }, { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 })}
      transition={{ duration: 0.9, ease: EASE, delay }}
    >
      {children}
    </Component>
  );
}

export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};

export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: EASE } },
};

/** A child that pops in with a spring: for badges, portraits and small cards. */
export const popChild: Variants = {
  hidden: { opacity: 0, scale: 0.6, y: 16 },
  show: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 20 } },
};

export { EASE };
