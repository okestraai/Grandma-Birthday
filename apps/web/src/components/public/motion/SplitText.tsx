import { Fragment } from 'react';
import { motion, type Variants } from 'motion/react';
import { EASE } from '../reveal';
import { canObserve, useReduceMotion } from './env';

const parent = (stagger: number, delay: number): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

const piece: Variants = {
  hidden: { opacity: 0, y: '0.55em', rotateX: -65 },
  show: { opacity: 1, y: 0, rotateX: 0, transition: { duration: 0.9, ease: EASE } },
};

// The big version: each piece rises out of a mask from well below, turning and growing.
// No animated blur: a filter repaints every piece on every frame, and the hero name is the LCP.
const dramaticPiece: Variants = {
  hidden: { opacity: 0, y: '115%', rotateX: -95, scale: 0.7 },
  show: { opacity: 1, y: 0, rotateX: 0, scale: 1, transition: { duration: 1.2, ease: EASE } },
};

/**
 * Reveals a line word by word (or letter by letter) with a small lift and turn.
 * Place it inside the real heading: screen readers get the text once, from a visually
 * hidden copy, and the animated pieces are aria-hidden. With reduced motion it is plain text.
 */
export function SplitText({
  text,
  by = 'word',
  trigger = 'mount',
  delay = 0,
  stagger,
  variant = 'soft',
  className,
}: {
  text: string;
  by?: 'word' | 'letter';
  /** "mount" plays straight away (heroes); "view" waits until the line scrolls into view. */
  trigger?: 'mount' | 'view';
  delay?: number;
  stagger?: number;
  /** "dramatic" raises each piece out of a mask with a deeper turn. */
  variant?: 'soft' | 'dramatic';
  className?: string;
}) {
  const reduce = useReduceMotion();
  if (reduce) return <span className={className}>{text}</span>;

  const words = text.split(/\s+/).filter(Boolean);
  const dramatic = variant === 'dramatic';
  const step = stagger ?? (by === 'letter' ? (dramatic ? 0.04 : 0.025) : dramatic ? 0.11 : 0.07);
  const variants = dramatic ? dramaticPiece : piece;
  // The mask hides the piece until it rises; the padding keeps descenders from being cut.
  const wordClass = dramatic ? 'inline-block overflow-hidden whitespace-nowrap pb-[0.12em] -mb-[0.12em] align-bottom' : 'inline-block whitespace-nowrap';
  const play =
    trigger === 'mount' || !canObserve()
      ? { animate: 'show' }
      : { whileInView: 'show', viewport: { once: true, margin: '0px 0px -10% 0px' } };

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <motion.span aria-hidden style={{ perspective: 600 }} variants={parent(step, delay)} initial="hidden" {...play}>
        {words.map((word, i) => (
          <Fragment key={i}>
            {/* Letters stay together in a word; lines break only between words. */}
            <span className={wordClass}>
              {by === 'letter' ? (
                Array.from(word).map((ch, j) => (
                  <motion.span key={j} variants={variants} className="inline-block origin-bottom">
                    {ch}
                  </motion.span>
                ))
              ) : (
                <motion.span variants={variants} className="inline-block origin-bottom">
                  {word}
                </motion.span>
              )}
            </span>
            {i < words.length - 1 && ' '}
          </Fragment>
        ))}
      </motion.span>
    </span>
  );
}
