import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { cn } from '@/lib/utils';
import { EASE } from './reveal';
import { LiquidSeventy } from './effects/LiquidSeventy';
import { useLiteMotion, useOnScreen } from './motion/env';

/**
 * The signature "70": gold gradient numerals with a soft glow, a slow float,
 * a few drifting gold motes and a gentle scroll-linked lift. With reduced motion
 * it renders still, and the infinite animations are not started at all. The float and the
 * motes are CSS keyframes that pause off screen; phones and tablets get fewer motes.
 *
 * With `liquid`, a liquid-gold shader version of the numerals is laid over the text when the
 * browser can run it (see effects/LiquidSeventy); the CSS numerals are the fallback.
 * Screen readers get the number once, from visually hidden text.
 */
export function SeventyMark({ value = 70, className, liquid = false }: { value?: number | string; className?: string; liquid?: boolean }) {
  const reduce = useReducedMotion();
  const textRef = useRef<HTMLSpanElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const [artShown, setArtShown] = useState(false);
  const liquidOn = liquid && String(value) === '70';
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 600], [0, reduce ? 0 : -60]);
  const opacity = useTransform(scrollY, [0, 500], [1, reduce ? 1 : 0.35]);

  const rootRef = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(rootRef);
  const lite = useLiteMotion();
  const motes = useMemo(
    () =>
      Array.from({ length: lite ? 4 : 14 }, (_, i) => {
        const size = 2 + ((i * 7) % 3);
        return {
          left: `${(i * 37) % 100}%`,
          top: `${(i * 53) % 100}%`,
          // The glow is drawn inside the box, so the box is larger than the dot.
          width: size * 5,
          height: size * 5,
          '--mote-delay': `${(i % 7) * 0.9}s`,
          '--mote-duration': `${7 + (i % 5)}s`,
        } as CSSProperties;
      }),
    [lite],
  );

  return (
    <motion.div ref={rootRef} style={{ y, opacity }} data-paused={onScreen ? undefined : ''} className={cn('relative select-none', className)}>
      <span className="sr-only">{value}</span>
      {/* soft glow behind the numerals */}
      <div aria-hidden className="absolute inset-[18%] rounded-full bg-gold/25 blur-3xl" />
      {!reduce && motes.map((style, i) => <span key={i} aria-hidden className="mote mote-dot mote-float" style={style} />)}
      <span className={cn('block', !reduce && 'loop-float')}>
        <motion.span
          ref={textRef}
          aria-hidden
          data-testid="seventy-numerals"
          className="relative block font-display font-semibold lining-nums leading-[0.82] tracking-[-0.04em] text-gold-gradient drop-shadow-[0_0_28px_rgba(214,179,106,0.35)]"
          // Once the liquid-metal artwork is on screen, the CSS glyphs go invisible but keep the layout.
          style={{ fontSize: 'clamp(8.5rem, 34vw, 17rem)', backgroundImage: artShown ? 'none' : undefined }}
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduce ? 0.4 : 1.6, ease: EASE }}
        >
          {liquidOn && <span ref={probeRef} className="inline-block size-0 align-baseline" />}
          {value}
          {liquidOn && <LiquidSeventy textRef={textRef} probeRef={probeRef} onArtShown={setArtShown} />}
        </motion.span>
      </span>
    </motion.div>
  );
}

/** A large outlined "70" used as a quiet background watermark. */
export function SeventyWatermark({ className, tone = 'gold' }: { className?: string; tone?: 'gold' | 'navy' }) {
  return (
    <span
      aria-hidden
      className={cn('pointer-events-none select-none font-display leading-none text-transparent lining-nums', className)}
      style={{ WebkitTextStroke: `1px ${tone === 'gold' ? 'var(--brand-gold)' : 'var(--brand-navy)'}` }}
    >
      70
    </span>
  );
}
