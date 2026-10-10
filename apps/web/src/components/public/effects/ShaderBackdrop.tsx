import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { EffectBoundary, FailureSignal, reportBackdropVisibility, useEffectGate, useIsLeadBackdrop, usePageVisible } from './gate';
import type { BackdropName } from './settings';

const ShaderBackdropCanvas = lazy(() => import('./ShaderBackdropCanvas'));

const THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20);

/**
 * A slow shader-gradient layer for a dark section. It sits on top of the section's existing
 * CSS gradient (the fallback) and fades in only once its first frame is drawn; until then, and
 * whenever it cannot run, the CSS gradient is what shows. It never takes pointer events.
 */
export function ShaderBackdrop({
  name,
  className,
  onLiveChange,
}: {
  name: BackdropName;
  className?: string;
  /** Called with true once the gradient is visible (and false if it goes away). */
  onLiveChange?: (live: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const { mount, inView } = useEffectGate(ref);
  const pageVisible = usePageVisible();
  const lead = useIsLeadBackdrop(id);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const live = ready && !failed;

  // Report how much of this backdrop is on screen, so only the most visible one animates.
  useEffect(() => {
    const el = ref.current;
    if (!el || !mount || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => reportBackdropVisibility(id, entry?.isIntersecting ? entry.intersectionRect.height : 0),
      { threshold: THRESHOLDS },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      reportBackdropVisibility(id, null);
    };
  }, [id, mount]);

  useEffect(() => {
    onLiveChange?.(live);
  }, [live, onLiveChange]);

  return (
    <div
      ref={ref}
      aria-hidden
      data-effect-layer=""
      className={cn(
        'pointer-events-none absolute inset-0 transition-opacity duration-[2000ms] ease-out',
        live ? 'opacity-100' : 'opacity-0',
        className,
      )}
    >
      {mount && !failed && (
        <EffectBoundary name={`shader gradient (${name})`} fallback={<FailureSignal onFail={() => setFailed(true)} />}>
          <Suspense fallback={null}>
            <ShaderBackdropCanvas name={name} active={inView && pageVisible && lead} onReady={() => setReady(true)} />
          </Suspense>
        </EffectBoundary>
      )}
    </div>
  );
}
