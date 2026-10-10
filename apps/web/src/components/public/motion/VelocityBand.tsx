import { useRef } from 'react';
import { motion, useScroll, useSpring, useTransform, useVelocity } from 'motion/react';
import { cn } from '@/lib/utils';
import { useLiteMotion, useReduceMotion } from './env';

/**
 * Two rows of giant words that slide in opposite directions as the page scrolls, and lean
 * with the speed of the scroll. Decorative (aria-hidden); still with reduced motion.
 * Phones and tablets get half as many words and no lean (a skew repaints the text).
 */
export function VelocityBand({ words, tone = 'light', className }: { words: string[]; tone?: 'light' | 'dark'; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReduceMotion();
  const lite = useLiteMotion();
  const { scrollY, scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const velocity = useVelocity(scrollY);
  const skew = useSpring(useTransform(velocity, [-2500, 0, 2500], [12, 0, -12], { clamp: true }), { stiffness: 300, damping: 40 });
  const forward = useSpring(useTransform(scrollYProgress, [0, 1], ['5%', '-45%']), { stiffness: 90, damping: 24 });
  const backward = useSpring(useTransform(scrollYProgress, [0, 1], ['-45%', '5%']), { stiffness: 90, damping: 24 });

  // Repeated so a row is always wider than the screen, whichever way it has moved. Twice is
  // enough on a phone: the font is at least 3.5rem, so four words run well past 1000px.
  const line = Array.from({ length: lite ? 2 : 4 }, () => words).flat();
  const row = (outline: boolean) =>
    line.map((word, i) => (
      <span key={i} className="flex shrink-0 items-center gap-[0.35em] pr-[0.35em]">
        <span className={outline ? 'text-transparent [-webkit-text-stroke:1.5px_var(--brand-gold)]' : 'text-gold-gradient'}>{word}</span>
        <span className="text-[0.4em] text-gold">✦</span>
      </span>
    ));

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        'relative overflow-hidden py-10 font-display text-[clamp(3.5rem,12vw,10rem)] italic leading-[1.05] sm:py-14',
        tone === 'dark' ? 'bg-navy' : 'bg-ivory',
        className,
      )}
    >
      <motion.div className="flex w-max whitespace-nowrap" style={reduce ? undefined : lite ? { x: forward } : { x: forward, skewX: skew }}>
        {row(false)}
      </motion.div>
      <motion.div className="flex w-max whitespace-nowrap opacity-80" style={reduce ? undefined : lite ? { x: backward } : { x: backward, skewX: skew }}>
        {row(true)}
      </motion.div>
    </div>
  );
}
