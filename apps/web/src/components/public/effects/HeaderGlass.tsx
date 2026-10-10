import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { deviceCanRunEffects, hasWebGL, useIdleAfterLoad, useMediaQuery, usePrefersReducedMotion } from './gate';
import { HEADER_GLASS } from './settings';
import type { GlassPill } from './glass-pill';

/**
 * A compact liquid-glass pill behind the desktop nav links, shown only while the header sits
 * transparent over the home hero. Place it inside a `relative` box that wraps the link list,
 * before the list, so the links paint above it.
 *
 * The glass refracts a one-off snapshot of the top of the hero (taken with html2canvas after
 * the fonts load, and only when the page is at the top). If the snapshot fails or takes longer
 * than HEADER_GLASS.snapshotTimeout, or WebGL is missing, nothing renders and the header keeps
 * its normal styles. The nav is only visible from the `xl` breakpoint, so that is the gate.
 */
export function HeaderGlass({ visible }: { visible: boolean }) {
  const desktop = useMediaQuery('(min-width: 1280px)');
  const reduced = usePrefersReducedMotion();
  const idle = useIdleAfterLoad();
  const [webgl, setWebgl] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<GlassPill | null>(null);

  useEffect(() => {
    if (desktop && !reduced && idle) setWebgl(deviceCanRunEffects() && hasWebGL());
  }, [desktop, reduced, idle]);
  const enabled = desktop && !reduced && webgl && !failed;

  // Build the pill the first time the header is transparent at the top of the page.
  useEffect(() => {
    if (!enabled || !visible || pillRef.current) return;
    let cancelled = false;
    (async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      // Let the hero's first paint settle before taking the snapshot.
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      const host = hostRef.current;
      if (cancelled || !host || window.scrollY > 4) return;
      const { createGlassPill } = await import('./glass-pill');
      if (cancelled) return;
      const pill = await createGlassPill(host);
      if (cancelled) {
        pill.destroy();
        return;
      }
      pillRef.current = pill;
      setReady(true);
    })().catch((error: unknown) => {
      if (import.meta.env.DEV) console.warn('[effects] header glass disabled:', error);
      setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, visible]);

  useEffect(
    () => () => {
      pillRef.current?.destroy();
      pillRef.current = null;
    },
    [],
  );

  // The glass has no scroll of its own to follow; redraw it when it comes back into view.
  useEffect(() => {
    if (visible) pillRef.current?.redraw();
  }, [visible]);

  if (!enabled) return null;
  return (
    <div
      aria-hidden
      data-effect-layer=""
      data-testid="header-glass"
      className={cn(
        'pointer-events-none absolute -inset-x-5 -inset-y-1.5 rounded-full transition-opacity duration-700 ease-out',
        ready && visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div ref={hostRef} className="absolute inset-0 overflow-hidden rounded-full" />
      {/* navy wash and a fine champagne edge, so the ivory labels stay crisp on the glass */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          backgroundColor: `rgba(7, 26, 43, ${HEADER_GLASS.navyTint})`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 0 0 1px rgba(241,227,192,0.16), 0 8px 24px -12px rgba(0,0,0,0.45)',
        }}
      />
    </div>
  );
}
