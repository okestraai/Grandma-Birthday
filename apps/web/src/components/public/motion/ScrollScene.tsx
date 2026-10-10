import { useRef, type ReactNode } from 'react';
import { motion, useScroll, useSpring, useTransform } from 'motion/react';
import { useLiteMotion, useReduceMotion, useWideScreen } from './env';

const SPRING = { stiffness: 110, damping: 26, mass: 0.4 } as const;

const mix = (from: number, to: number, p: number) => from + (to - from) * p;

/**
 * Opens a whole section as it scrolls up the screen: it starts as a smaller, rounded card
 * set in from the edges and grows to full width and square corners by the time its top
 * reaches the upper third. Driven by scroll, so it plays back when scrolling up.
 *
 * The rounded card is a clip-path, and a clip-path repaints the whole section on every frame.
 * So it is only used on wide screens with a mouse, and it is set to `none` once the section
 * has fully opened, which leaves settled sections as plain boxes that cost nothing to scroll.
 * (Scaling a rounded mask instead would need the content counter-scaled, which is more work
 * for the same frames.) Phones, tablets and narrow windows get only the lift and scale, which
 * are transforms. With reduced motion it is a plain wrapper.
 */
export function ScrollScene({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReduceMotion();
  const lite = useLiteMotion();
  const wide = useWideScreen();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'start 0.3'] });
  const progress = useSpring(scrollYProgress, SPRING);
  const scale = useTransform(progress, [0, 1], [0.92, 1]);
  const y = useTransform(progress, [0, 1], [90, 0]);
  const clipPath = useTransform(progress, (value) => {
    const p = Math.min(1, Math.max(0, value));
    if (p >= 0.999) return 'none';
    const side = mix(7, 0, p).toFixed(2);
    return `inset(${mix(5, 0, p).toFixed(2)}% ${side}% 0% ${side}% round ${mix(56, 0, p).toFixed(1)}px)`;
  });

  // The ref stays attached so useScroll always has its target.
  if (reduce) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }
  const card = wide && !lite;
  return (
    <motion.div ref={ref} className={className} style={card ? { clipPath, scale, y, transformOrigin: '50% 0%' } : { scale, y, transformOrigin: '50% 0%' }}>
      {children}
    </motion.div>
  );
}
