import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { motion, useMotionValue, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react';
import { usePointerEffects, useReduceMotion } from './env';

const SCROLL_SPRING = { stiffness: 120, damping: 28, mass: 0.35 } as const;

/**
 * Moves its children against the scroll while they cross the screen: `offset` px down on the
 * way in, the same up on the way out. Optional `scaleFrom` and `fade` add a zoom and an
 * edge fade. With reduced motion it is a plain wrapper.
 */
export function Parallax({
  children,
  offset = 40,
  scaleFrom,
  fade = false,
  className,
  style,
}: {
  children?: ReactNode;
  offset?: number;
  scaleFrom?: number;
  fade?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReduceMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useSpring(useTransform(scrollYProgress, [0, 1], [offset, -offset]), SCROLL_SPRING);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [scaleFrom ?? 1, 1, scaleFrom ?? 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.15, 0.85, 1], fade ? [0, 1, 1, 0] : [1, 1, 1, 1]);

  return (
    <motion.div ref={ref} className={className} style={reduce ? style : { ...style, y, scale, opacity }}>
      {children}
    </motion.div>
  );
}

/**
 * The pointer's position over the window, from -1 to 1 on each axis, sprung. Stays at 0 on
 * touch screens and with reduced motion, so layers driven by it stay put.
 */
export function usePointerPosition(): { x: MotionValue<number>; y: MotionValue<number> } {
  const enabled = usePointerEffects();
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, { stiffness: 50, damping: 18 });
  const y = useSpring(rawY, { stiffness: 50, damping: 18 });
  useEffect(() => {
    rawX.set(0);
    rawY.set(0);
    if (!enabled) return;
    const move = (event: PointerEvent) => {
      rawX.set((event.clientX / window.innerWidth) * 2 - 1);
      rawY.set((event.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [enabled, rawX, rawY]);
  return { x, y };
}

/** A layer that drifts with the pointer by up to `depth` px (negative depth moves against it). */
export function MouseLayer({
  pointer,
  depth,
  children,
  className,
}: {
  pointer: { x: MotionValue<number>; y: MotionValue<number> };
  depth: number;
  children?: ReactNode;
  className?: string;
}) {
  const x = useTransform(pointer.x, (v) => v * depth);
  const y = useTransform(pointer.y, (v) => v * depth);
  return (
    <motion.div className={className} style={{ x, y }}>
      {children}
    </motion.div>
  );
}
