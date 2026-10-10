import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { useLiteMotion, useOnScreen, useReduceMotion } from './env';
import { cn } from '@/lib/utils';

/** Deterministic 0..1 values, so the layout is the same on every render. */
function seeded(i: number, salt: number): number {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * A few gold motes that rise and twinkle across their (relative) parent. Decorative: aria-hidden
 * and never in the way of a click. Nothing is rendered with reduced motion.
 *
 * The motes are CSS keyframes on transform and opacity (`.mote` in styles/index.css), so the
 * compositor runs them. They pause while off screen, and phones and tablets get about a quarter.
 */
export function Sparkles({ count = 18, className }: { count?: number; className?: string }) {
  const reduce = useReduceMotion();
  const lite = useLiteMotion();
  const ref = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(ref);
  const shown = lite ? Math.max(1, Math.round(count / 4)) : count;
  const motes = useMemo(
    () =>
      Array.from({ length: shown }, (_, i) => {
        const size = 2 + Math.round(seeded(i, 3) * 3);
        const star = i % 5 === 0;
        return {
          star,
          style: {
            left: `${seeded(i, 1) * 100}%`,
            top: `${20 + seeded(i, 2) * 80}%`,
            // A dot is drawn with its glow inside the box, so the box is larger than the dot.
            width: star ? undefined : size * 5,
            height: star ? undefined : size * 5,
            fontSize: star ? 8 + size * 2 : undefined,
            '--mote-rise': `${Math.round(40 + seeded(i, 4) * 90)}px`,
            '--mote-drift': `${Math.round((seeded(i, 5) - 0.5) * 40)}px`,
            '--mote-turn': star ? '180deg' : '0deg',
            '--mote-delay': `${(seeded(i, 6) * 6).toFixed(2)}s`,
            '--mote-duration': `${(6 + seeded(i, 7) * 6).toFixed(2)}s`,
          } as CSSProperties,
        };
      }),
    [shown],
  );
  if (reduce) return null;
  return (
    <div ref={ref} aria-hidden data-paused={onScreen ? undefined : ''} className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {motes.map((m, i) => (
        <span key={i} className={cn('mote', m.star ? 'mote-star' : 'mote-dot')} style={m.style}>
          {m.star ? '✦' : null}
        </span>
      ))}
    </div>
  );
}

const CONFETTI_COLOURS = ['#d6b36a', '#f1e3c0', '#b88a35', '#12665a', '#faf7f0', '#0b3d35'];

/**
 * A one-off burst of gold, emerald and ivory confetti from a point on the screen (client
 * pixels; the middle of the upper third by default). Drawn in a fixed, click-through layer
 * portalled to <body>, so it never widens the page. Unmounts itself when done; nothing with
 * reduced motion.
 */
export function ConfettiBurst({ origin, count = 70, onDone }: { origin?: { x: number; y: number }; count?: number; onDone?: () => void }) {
  const reduce = useReduceMotion();
  const [done, setDone] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = seeded(i, 11) * Math.PI * 2;
        const power = 140 + seeded(i, 12) * 320;
        return {
          dx: Math.cos(angle) * power,
          dy: Math.sin(angle) * power - 160,
          fall: 260 + seeded(i, 13) * 260,
          spin: (seeded(i, 14) - 0.5) * 900,
          w: 5 + seeded(i, 15) * 6,
          h: 8 + seeded(i, 16) * 8,
          round: i % 4 === 0,
          colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
          delay: seeded(i, 17) * 0.15,
        };
      }),
    [count],
  );

  useEffect(() => {
    if (reduce) return;
    const timer = window.setTimeout(() => {
      setDone(true);
      doneRef.current?.();
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [reduce]);

  if (reduce || done || typeof document === 'undefined') return null;
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 3;

  return createPortal(
    <div aria-hidden data-testid="confetti" className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className={cn('absolute block', p.round ? 'rounded-full' : 'rounded-[1px]')}
          style={{ left: x, top: y, width: p.w, height: p.round ? p.w : p.h, backgroundColor: p.colour }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
          animate={{
            x: [0, p.dx, p.dx * 1.15],
            y: [0, p.dy, p.dy + p.fall],
            rotate: p.spin,
            opacity: [1, 1, 0],
            scale: [0.6, 1, 0.9],
          }}
          transition={{ duration: 2.2, delay: p.delay, ease: [0.16, 0.84, 0.44, 1], times: [0, 0.35, 1] }}
        />
      ))}
    </div>,
    document.body,
  );
}
