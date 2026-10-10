import { lazy, Suspense, useEffect, useState, type RefObject } from 'react';
import { EffectBoundary, useEffectGate } from './gate';
import { SEVENTY_ART } from './seventy-geometry';

const LiquidMetalLayer = lazy(() => import('./LiquidMetalLayer'));

/**
 * Liquid-gold "70" laid exactly over the live text of the hero's SeventyMark.
 *
 * `textRef` is the numerals' element and `probeRef` a zero-size inline box placed just before
 * the text: its offset gives where the first glyph starts on the baseline, and the artwork's
 * box (in em, from scripts/generate-seventy.mjs) is positioned from there, so it tracks the
 * responsive font size. The layer is a gold-gradient image of the same outline with the
 * LiquidMetal shader on top; once the image has loaded, `onArtShown(true)` lets the parent
 * hide its CSS glyphs. If anything fails, the CSS "70" simply stays.
 */
export function LiquidSeventy({
  textRef,
  probeRef,
  onArtShown,
}: {
  textRef: RefObject<HTMLElement | null>;
  probeRef: RefObject<HTMLElement | null>;
  onArtShown: (shown: boolean) => void;
}) {
  const { mount } = useEffectGate(textRef, { rootMargin: '0px' });
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  // Measure where the text starts once the display font has loaded, and again on resize.
  useEffect(() => {
    if (!mount) return;
    let cancelled = false;
    const measure = () => {
      const probe = probeRef.current;
      if (!cancelled && probe) setOrigin({ x: probe.offsetLeft, y: probe.offsetTop });
    };
    const fonts = document.fonts;
    if (fonts?.ready) {
      // Only draw the artwork when Playfair is really in use, or it would not match the text.
      fonts.ready.then(() => {
        if (fonts.check('600 16px "Playfair Display Variable"')) measure();
      });
    } else {
      measure();
    }
    const el = textRef.current;
    const ro = typeof ResizeObserver !== 'undefined' && el ? new ResizeObserver(measure) : null;
    if (ro && el) ro.observe(el);
    return () => {
      cancelled = true;
      ro?.disconnect();
    };
  }, [mount, probeRef, textRef]);

  const shown = mount && origin !== null && !imageFailed;
  useEffect(() => {
    onArtShown(shown && imageLoaded);
  }, [shown, imageLoaded, onArtShown]);

  if (!shown) return null;
  return (
    <span
      aria-hidden
      data-effect-layer=""
      className="pointer-events-none absolute block select-none"
      style={{
        left: `calc(${origin.x}px + ${SEVENTY_ART.left}em)`,
        top: `calc(${origin.y}px + ${SEVENTY_ART.top}em)`,
        width: `${SEVENTY_ART.width}em`,
        height: `${SEVENTY_ART.height}em`,
      }}
    >
      <img
        src={SEVENTY_ART.goldSrc}
        alt=""
        draggable={false}
        className="absolute inset-0 size-full"
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageFailed(true)}
      />
      {imageLoaded && (
        <EffectBoundary name="liquid metal 70">
          <Suspense fallback={null}>
            <LiquidMetalLayer />
          </Suspense>
        </EffectBoundary>
      )}
    </span>
  );
}
