import type { PointerEvent, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { motion, useSpring } from 'motion/react';
import { SOFT_SPRING, usePointerEffects, useReduceMotion } from './env';

const MotionLink = motion.create(Link);

/**
 * Props that make a motion element lean toward the pointer and spring back, and press in
 * on tap. `strength` is the share of the pointer's distance from the centre it follows.
 */
export function useMagnetic(strength = 0.3) {
  const enabled = usePointerEffects();
  const reduce = useReduceMotion();
  const x = useSpring(0, SOFT_SPRING);
  const y = useSpring(0, SOFT_SPRING);
  return {
    style: { x, y },
    whileTap: reduce ? undefined : { scale: 0.95 },
    onPointerMove: enabled
      ? (event: PointerEvent<HTMLElement>) => {
          if (event.pointerType !== 'mouse') return;
          const rect = event.currentTarget.getBoundingClientRect();
          x.set((event.clientX - (rect.left + rect.width / 2)) * strength);
          y.set((event.clientY - (rect.top + rect.height / 2)) * strength);
        }
      : undefined,
    onPointerLeave: enabled
      ? () => {
          x.set(0);
          y.set(0);
        }
      : undefined,
  };
}

// Link props minus the few that motion redefines (drag and animation events, style).
type PlainLinkProps = Omit<LinkProps, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'style' | 'children'>;

/** A router link with the magnetic pull. Everything else behaves like a normal Link. */
export function MagneticLink({ strength, className, children, ...props }: PlainLinkProps & { strength?: number; className?: string; children: ReactNode }) {
  const magnetic = useMagnetic(strength);
  return (
    <MotionLink {...props} {...magnetic} className={className}>
      {children}
    </MotionLink>
  );
}

/** Wraps any control (a button, an anchor) in an inline block with the magnetic pull. */
export function Magnetic({ children, strength, className }: { children: ReactNode; strength?: number; className?: string }) {
  const magnetic = useMagnetic(strength);
  return (
    <motion.span {...magnetic} className={className ?? 'inline-flex'}>
      {children}
    </motion.span>
  );
}
