import { useRef } from 'react';
import { motion, useScroll, useSpring, useTransform } from 'motion/react';
import { useReduceMotion } from './env';
import { cn } from '@/lib/utils';

/** A thin gold bar under the fixed header that fills as the page is read. */
export function ScrollProgress({ className }: { className?: string }) {
  const reduce = useReduceMotion();
  const { scrollYProgress } = useScroll();
  const sprung = useSpring(scrollYProgress, { stiffness: 160, damping: 30, restDelta: 0.001 });
  // Hidden at the very top so it does not sit on the hero as a stray line.
  const opacity = useTransform(scrollYProgress, [0, 0.01], [0, 1]);
  return (
    <motion.div
      aria-hidden
      data-testid="scroll-progress"
      className={cn('no-print pointer-events-none fixed inset-x-0 top-[72px] z-40 h-[2px] origin-left bg-gold shadow-[0_0_10px_rgba(214,179,106,0.7)]', className)}
      style={{ scaleX: reduce ? scrollYProgress : sprung, opacity }}
    />
  );
}

/**
 * A vertical gold line that draws down as its parent scrolls through the screen, with a
 * glowing bead at the tip. Position it with `className` (absolute, top/bottom, left).
 * With reduced motion the line is drawn in full.
 */
export function ScrollLine({ className, tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReduceMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 55%'] });
  const progress = useSpring(scrollYProgress, { stiffness: 110, damping: 26, restDelta: 0.001 });
  // The bead sits at the bottom of a full-height box that starts one box-height above.
  const beadY = useTransform(progress, (v) => `${(v - 1) * 100}%`);

  return (
    <span ref={ref} aria-hidden className={cn('pointer-events-none relative block w-px', className)}>
      <span className={cn('absolute inset-0', tone === 'dark' ? 'bg-ivory/10' : 'bg-gold/20')} />
      <motion.span
        className="absolute inset-0 origin-top bg-gradient-to-b from-gold-rich via-gold to-champagne"
        style={{ scaleY: reduce ? 1 : progress }}
      />
      {!reduce && (
        <motion.span className="absolute inset-0" style={{ y: beadY }}>
          <span className="absolute bottom-0 left-1/2 size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-champagne shadow-[0_0_14px_4px_rgba(214,179,106,0.65)]" />
        </motion.span>
      )}
    </span>
  );
}
