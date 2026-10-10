/**
 * Lazy chunk: Paper Shaders' LiquidMetal over the "70" artwork. Imported only by LiquidSeventy.
 * The shader pauses itself when off screen or when the tab is hidden.
 */
import { useEffect, useRef, useState } from 'react';
import { LiquidMetal } from '@paper-design/shaders-react';
import { useIsPhone } from './gate';
import { SEVENTY_ART } from './seventy-geometry';
import { LIQUID_SEVENTY } from './settings';

export default function LiquidMetalLayer() {
  const ref = useRef<HTMLDivElement>(null);
  const phone = useIsPhone();
  const [shown, setShown] = useState(false);
  const [box, setBox] = useState({ w: 300, h: 220 });

  useEffect(() => {
    const t = window.setTimeout(() => setShown(true), LIQUID_SEVENTY.fadeInDelay);
    return () => window.clearTimeout(t);
  }, []);

  // Cap the canvas at 1.5 device pixels per CSS pixel (1 on phones).
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setBox({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cap = phone ? 1 : 1.5;
  const maxPixelCount = Math.max(1, Math.ceil(box.w * box.h * cap * cap));

  const { blend, intensity, shader } = LIQUID_SEVENTY;
  return (
    <div
      ref={ref}
      className="absolute inset-0 transition-opacity duration-[1600ms] ease-out"
      style={{ mixBlendMode: blend, opacity: shown ? intensity : 0 }}
    >
      <LiquidMetal
        image={SEVENTY_ART.maskSrc}
        colorBack="#00000000"
        {...shader}
        shape="none"
        fit="contain"
        scale={1}
        minPixelRatio={1}
        maxPixelCount={maxPixelCount}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
    </div>
  );
}
