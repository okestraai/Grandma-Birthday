import { lazy, Suspense, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { EffectBoundary, FailureSignal, useEffectGate, usePageVisible } from './gate';

const MedallionScene = lazy(() => import('./MedallionScene'));

const LABEL = 'A gold medallion engraved with the number 70';

/** The static medallion: a CSS gold disc with a raised rim and an embossed "70". */
function MedallionArt({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('absolute inset-[9%] rounded-full', className)}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle at 34% 28%, #F6EBCF 0%, #D6B36A 34%, #B88A35 68%, #7D5A1F 100%)',
          boxShadow:
            '0 22px 40px -18px rgba(0,0,0,0.6), inset 0 0 0 2px rgba(246,235,207,0.65), inset 0 0 0 8px rgba(184,138,53,0.95), inset 0 0 0 9px rgba(246,235,207,0.55), inset 0 6px 14px rgba(255,255,255,0.25), inset 0 -10px 18px rgba(80,52,14,0.45)',
        }}
      />
      <div className="absolute inset-[16%] rounded-full border border-[#F6EBCF]/40" />
      <span
        className="absolute inset-0 flex items-center justify-center font-display font-semibold lining-nums leading-none tracking-[-0.04em] text-[#9A7129]"
        style={{ fontSize: '34cqw', textShadow: '0 1px 0 rgba(246,235,207,0.75), 0 -1px 0 rgba(80,52,14,0.55), 0 3px 6px rgba(80,52,14,0.35)' }}
      >
        70
      </span>
    </div>
  );
}

/**
 * A slowly turning gold medallion engraved with "70", drawn with three.js. Visitors can drag it
 * round (mouse or touch; vertical swipes still scroll the page). The CSS medallion shows first
 * and stays for reduced motion, missing WebGL, or any failure.
 */
export function Medallion({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { mount, inView } = useEffectGate(ref);
  const pageVisible = usePageVisible();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const live = ready && !failed;

  return (
    <div
      ref={ref}
      role="img"
      aria-label={live ? `${LABEL}. Drag to turn it.` : LABEL}
      data-testid="medallion"
      className={cn('relative aspect-square select-none [container-type:inline-size]', className)}
    >
      <MedallionArt className={cn('transition-opacity duration-700', live ? 'opacity-0' : 'opacity-100')} />
      {mount && !failed && (
        <EffectBoundary name="medallion" fallback={<FailureSignal onFail={() => setFailed(true)} />}>
          <Suspense fallback={null}>
            <div className={cn('absolute inset-0 transition-opacity duration-700', live ? 'opacity-100' : 'opacity-0')}>
              <MedallionScene active={inView && pageVisible} onReady={() => setReady(true)} />
            </div>
          </Suspense>
        </EffectBoundary>
      )}
    </div>
  );
}
