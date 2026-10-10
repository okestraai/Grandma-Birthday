import { motion } from 'motion/react';
import { useReduceMotion } from './env';
import { cn } from '@/lib/utils';
import { EASE } from '../reveal';

/** A gold ring that draws itself, then a check mark inside it. Decorative. */
export function DrawCheck({ className, delay = 0.15 }: { className?: string; delay?: number }) {
  const reduce = useReduceMotion();
  const draw = (start: number, duration: number) =>
    reduce
      ? { initial: false as const }
      : {
          initial: { pathLength: 0, opacity: 0 },
          animate: { pathLength: 1, opacity: 1 },
          transition: { pathLength: { delay: start, duration, ease: EASE }, opacity: { delay: start, duration: 0.01 } },
        };
  return (
    <motion.svg
      aria-hidden
      viewBox="0 0 52 52"
      className={cn('size-14 text-gold-rich', className)}
      initial={reduce ? false : { scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 16, delay }}
    >
      <circle cx="26" cy="26" r="25" fill="rgba(214,179,106,0.10)" />
      <motion.circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="1.5" {...draw(delay + 0.1, 0.7)} />
      <motion.path
        d="M15 27.5 L22.5 35 L37.5 19"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...draw(delay + 0.65, 0.45)}
      />
    </motion.svg>
  );
}
