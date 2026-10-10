import { useEffect, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import { motion, useAnimationFrame, useMotionValue, type PanInfo } from 'motion/react';
import { useReduceMotion, useSeen } from './env';
import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * An endless strip that drifts sideways. Hover, keyboard focus or the pause button stop it;
 * it can be dragged (or swiped) with a little momentum. The list is rendered twice so the
 * loop is seamless; the copy is aria-hidden and inert, so each item is announced and
 * focusable once. With reduced motion it is a plain, sideways-scrollable row.
 */
export function Marquee({
  children,
  label,
  speed = 40,
  className,
  tone = 'light',
}: {
  /** The items, each an <li>. */
  children: ReactNode;
  label: string;
  /** Pixels per second. */
  speed?: number;
  className?: string;
  tone?: 'light' | 'dark';
}) {
  const reduce = useReduceMotion();
  const viewport = useRef<HTMLDivElement>(null);
  const firstCopy = useRef<HTMLUListElement>(null);
  // Only drift while on (or near) the screen.
  const inView = useSeen(viewport, { once: false, margin: '200px 0px' });
  const x = useMotionValue(0);
  const velocity = useRef(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const width = useRef(0);

  useEffect(() => {
    const list = firstCopy.current;
    if (!list) return;
    const measure = () => {
      width.current = list.getBoundingClientRect().width;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  const wrap = (value: number) => {
    const w = width.current;
    if (w <= 0) return value;
    return ((((value % w) + w) % w) - w) % w;
  };

  useAnimationFrame((_, delta) => {
    if (reduce || !inView) return;
    const dt = Math.min(delta, 64) / 1000;
    let next = x.get();
    if (Math.abs(velocity.current) > 1) {
      // Momentum after a drag, easing out.
      next += velocity.current * dt;
      velocity.current *= Math.pow(0.04, dt);
    } else if (!paused && !held) {
      next -= speed * dt;
    }
    x.set(wrap(next));
  });

  // A drag should not also open the link it started on.
  const dragged = useRef(false);

  const onPan = (_: unknown, info: PanInfo) => {
    velocity.current = 0;
    x.set(wrap(x.get() + info.delta.x));
  };
  const onPanEnd = (_: unknown, info: PanInfo) => {
    velocity.current = Math.max(-2500, Math.min(2500, info.velocity.x));
  };

  // Keep a focused item on screen: nudge the strip so it sits inside the viewport.
  const onFocus = (event: FocusEvent<HTMLElement>) => {
    setHeld(true);
    const box = viewport.current?.getBoundingClientRect();
    const item = (event.target as HTMLElement).getBoundingClientRect();
    if (!box) return;
    if (item.left < box.left + 16) x.set(wrap(x.get() + (box.left + 16 - item.left)));
    else if (item.right > box.right - 16) x.set(wrap(x.get() - (item.right - box.right + 16)));
  };

  const dark = tone === 'dark';

  if (reduce) {
    return (
      <div className={cn('overflow-x-auto pb-3 [scrollbar-width:thin]', className)} tabIndex={0} role="region" aria-label={label}>
        <ul className="flex w-max gap-4 px-4">{children}</ul>
      </div>
    );
  }

  return (
    <div className={cn('relative', className)} role="region" aria-label={label} aria-roledescription="marquee">
      <motion.div
        ref={viewport}
        className="cursor-grab touch-pan-y overflow-hidden active:cursor-grabbing [mask-image:linear-gradient(to_right,transparent,#000_6%,#000_94%,transparent)]"
        onHoverStart={() => setHeld(true)}
        onHoverEnd={() => setHeld(false)}
        onPanStart={() => {
          dragged.current = true;
          setHeld(true);
        }}
        onPointerDown={() => {
          dragged.current = false;
        }}
        onClickCapture={(event) => {
          if (!dragged.current) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        onPan={onPan}
        onPanEnd={(e, info) => {
          onPanEnd(e, info);
          setHeld(false);
        }}
        onFocusCapture={onFocus}
        onBlurCapture={() => setHeld(false)}
      >
        <motion.div className="flex w-max select-none [&_img]:pointer-events-none" style={{ x }}>
          <ul ref={firstCopy} className="flex shrink-0 gap-4 pr-4">
            {children}
          </ul>
          <ul aria-hidden inert className="flex shrink-0 gap-4 pr-4">
            {children}
          </ul>
        </motion.div>
      </motion.div>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        className={cn(
          'absolute -top-12 right-4 flex size-9 items-center justify-center rounded-full border transition-colors [&_svg]:size-3.5',
          dark ? 'border-gold/40 text-ivory hover:bg-white/10' : 'border-gold/50 text-navy hover:bg-gold/10',
        )}
      >
        {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
        <span className="sr-only">Pause the moving strip</span>
      </button>
    </div>
  );
}
