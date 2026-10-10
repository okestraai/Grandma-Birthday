import { useRef, type PointerEvent, type ReactNode } from 'react';
import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from 'motion/react';
import { cn } from '@/lib/utils';
import { SOFT_SPRING, usePointerEffects } from './env';

/**
 * Tilts its children toward the pointer in 3D, with a soft gold glare that follows the
 * cursor. Mouse only: on touch screens and with reduced motion it is a plain wrapper.
 * It never takes focus or changes what is inside, so links and buttons work as before.
 * Give it the same corner radius as the card so the glare fits.
 */
export function TiltCard({
  children,
  className,
  max = 8,
  lift = 1.02,
  glare = true,
}: {
  children: ReactNode;
  className?: string;
  /** Largest tilt in degrees. */
  max?: number;
  /** Scale while hovered. */
  lift?: number;
  glare?: boolean;
}) {
  const enabled = usePointerEffects();
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const hover = useMotionValue(0);
  const rotateX = useSpring(useTransform(py, [0, 1], [max, -max]), SOFT_SPRING);
  const rotateY = useSpring(useTransform(px, [0, 1], [-max, max]), SOFT_SPRING);
  const scale = useSpring(useTransform(hover, [0, 1], [1, lift]), SOFT_SPRING);
  const glareOpacity = useSpring(hover, { stiffness: 120, damping: 20 });
  const gx = useTransform(px, (v) => v * 100);
  const gy = useTransform(py, (v) => v * 100);
  const background = useMotionTemplate`radial-gradient(circle at ${gx}% ${gy}%, rgba(241,227,192,0.45), rgba(214,179,106,0.12) 35%, transparent 65%)`;

  if (!enabled) return <div className={className}>{children}</div>;

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    px.set((event.clientX - rect.left) / rect.width);
    py.set((event.clientY - rect.top) / rect.height);
    hover.set(1);
  };
  const onLeave = () => {
    px.set(0.5);
    py.set(0.5);
    hover.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={cn('relative', className)}
      style={{ rotateX, rotateY, scale, transformPerspective: 900, transformStyle: 'preserve-3d' }}
    >
      {children}
      {glare && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] mix-blend-overlay"
          style={{ background, opacity: glareOpacity }}
        />
      )}
    </motion.div>
  );
}
