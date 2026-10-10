/**
 * Shared gating for the public pages' WebGL effects (shader gradient, liquid metal, liquid glass,
 * 3D medallion). Nothing here imports three.js or a shader library: each effect's heavy module
 * is loaded with a dynamic import only after these checks pass, so the static design (the
 * fallback) is always what renders first, and stays in place when a check fails.
 */
import { Component, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';

/* ------------------------------------------------------------------ capability checks */

let webglSupport: boolean | undefined;

/**
 * True when the browser can create a WebGL context without a major performance caveat
 * (software rendering). Checked once, and the probe context is released straight away.
 */
export function hasWebGL(): boolean {
  if (webglSupport !== undefined) return webglSupport;
  webglSupport = false;
  try {
    if (typeof window === 'undefined' || typeof window.WebGLRenderingContext === 'undefined') return false;
    const canvas = document.createElement('canvas');
    const attrs: WebGLContextAttributes = { failIfMajorPerformanceCaveat: true };
    const gl = (canvas.getContext('webgl2', attrs) ?? canvas.getContext('webgl', attrs)) as WebGLRenderingContext | null;
    if (gl) {
      webglSupport = true;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

/** Test hook: forget the cached WebGL probe. */
export function resetWebGLProbe() {
  webglSupport = undefined;
}

function subscribeMedia(query: string) {
  return (onChange: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const mql = window.matchMedia(query);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  };
}

/** Live `matchMedia` result. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useMemo(() => subscribeMedia(query), [query]);
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

type DeviceHints = Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };

/** Phones, tablets and narrow windows: the WebGL effects are skipped there. */
export const SMALL_OR_TOUCH = '(pointer: coarse), (max-width: 767px)';

/**
 * False on devices that should not load the WebGL effects: data saver on, 4 GB of memory or
 * less, or 4 CPU cores or fewer. A browser that does not report a value is allowed.
 */
export function deviceCanRunEffects(nav: DeviceHints | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  if (!nav) return false;
  if (nav.connection?.saveData) return false;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 && nav.deviceMemory <= 4) return false;
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 4) return false;
  return true;
}

/* The effects wait until the page has loaded and the browser is idle, so they never compete
   with the first paint or the hero image. Shared by every effect on the page. */
let idle = false;
let idleScheduled = false;
const idleListeners = new Set<() => void>();

function scheduleIdle() {
  if (idleScheduled || typeof window === 'undefined') return;
  idleScheduled = true;
  const done = () => {
    idle = true;
    idleListeners.forEach((l) => l());
  };
  const afterLoad = () => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(done, { timeout: 3000 });
    else window.setTimeout(done, 1200);
  };
  if (document.readyState === 'complete') afterLoad();
  else window.addEventListener('load', afterLoad, { once: true });
}

function subscribeIdle(listener: () => void) {
  idleListeners.add(listener);
  scheduleIdle();
  return () => {
    idleListeners.delete(listener);
  };
}

/** True once the page has loaded and the browser has had an idle moment. */
export function useIdleAfterLoad(): boolean {
  return useSyncExternalStore(
    subscribeIdle,
    () => idle,
    () => false,
  );
}

/** Test hook: wait for the next idle moment again. */
export function resetIdle() {
  idle = false;
  idleScheduled = false;
}

/** Phones get lighter settings (pixel ratio 1). */
export function useIsPhone(): boolean {
  return useMediaQuery('(max-width: 767px), (pointer: coarse) and (max-width: 1024px)');
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

/** False while the tab is hidden. */
export function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== 'hidden',
    () => true,
  );
}

/**
 * Whether the element intersects the viewport (grown by `rootMargin`). Without
 * IntersectionObserver it reports false, so effects never start blind.
 */
export function useInView(ref: RefObject<Element | null>, rootMargin = '0px'): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return inView;
}

/**
 * The decision every effect wrapper makes before loading anything:
 * - `enabled`: motion is allowed, the device is not a phone, tablet or low-end machine, the page
 *   has loaded and gone idle, and WebGL works (checked after mount, so the first render, and
 *   any server or test render, is always the fallback);
 * - `mount`: enabled and the element has come near the viewport at least once (sticky, so the
 *   effect is not torn down and re-created while scrolling past);
 * - `inView`: the element is on screen right now, for pausing.
 */
export function useEffectGate(ref: RefObject<Element | null>, { rootMargin = '200px', when = true }: { rootMargin?: string; when?: boolean } = {}) {
  const reduced = usePrefersReducedMotion();
  const small = useMediaQuery(SMALL_OR_TOUCH);
  const idleNow = useIdleAfterLoad();
  const allowed = when && !reduced && !small && idleNow;
  const [webgl, setWebgl] = useState(false);
  useEffect(() => {
    if (allowed) setWebgl(deviceCanRunEffects() && hasWebGL());
  }, [allowed]);
  const enabled = allowed && webgl;
  const near = useInView(ref, rootMargin);
  const inView = useInView(ref, '0px');
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (enabled && near) setSeen(true);
  }, [enabled, near]);
  return { enabled, mount: enabled && seen, inView };
}

/* ------------------------------------------------------------------ failure handling */

/**
 * Error boundary for one effect. A failure (chunk load, shader compile, lost context) renders
 * `fallback` (usually nothing, because the static design is already underneath) and is only
 * reported in development.
 */
export class EffectBoundary extends Component<{ children: ReactNode; fallback?: ReactNode; name: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    if (import.meta.env.DEV) console.warn(`[effects] ${this.props.name} disabled:`, error);
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}

/** Rendered by an error boundary: tells the wrapper to drop the effect and keep the static design. */
export function FailureSignal({ onFail }: { onFail: () => void }) {
  useEffect(() => onFail(), [onFail]);
  return null;
}

/* ------------------------------------------------------------------ one gradient at a time */

/**
 * The home page has two shader-gradient backdrops (hero and RSVP band). Only one may animate:
 * each reports how many pixels of it are on screen and the larger one wins; the other holds
 * its last frame.
 */
const visibility = new Map<string, number>();
const listeners = new Set<() => void>();
let leader: string | null = null;

function electLeader() {
  let best: string | null = null;
  let bestRatio = 0;
  for (const [id, ratio] of visibility) {
    if (ratio > bestRatio) {
      best = id;
      bestRatio = ratio;
    }
  }
  if (best !== leader) {
    leader = best;
    listeners.forEach((l) => l());
  }
}

export function reportBackdropVisibility(id: string, visiblePixels: number | null) {
  if (visiblePixels === null || visiblePixels <= 0) visibility.delete(id);
  else visibility.set(id, visiblePixels);
  electLeader();
}

function subscribeLeader(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useIsLeadBackdrop(id: string): boolean {
  return useSyncExternalStore(
    subscribeLeader,
    () => leader === id,
    () => false,
  );
}
