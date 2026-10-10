import { useEffect, useState, type RefObject } from 'react';
import { useReducedMotionConfig } from 'motion/react';

const FINE_POINTER = '(hover: hover) and (pointer: fine)';

function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

const LITE = '(pointer: coarse), (max-width: 767px)';
const WIDE = '(min-width: 1024px)';

function useMatch(query: string): boolean {
  const [value, setValue] = useState(() => matches(query));
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const update = () => setValue(list.matches);
    update();
    list.addEventListener?.('change', update);
    return () => list.removeEventListener?.('change', update);
  }, [query]);
  return value;
}

/** True on a mouse or trackpad. Phones and tablets report a coarse pointer. */
export function useFinePointer(): boolean {
  return useMatch(FINE_POINTER);
}

/** Phones, tablets and narrow windows: effects there use fewer pieces and cheaper properties. */
export function useLiteMotion(): boolean {
  return useMatch(LITE);
}

/** The `lg` breakpoint and up. */
export function useWideScreen(): boolean {
  return useMatch(WIDE);
}

/**
 * True when motion should be calm: the visitor asked for reduced motion (MotionConfig "user"),
 * or a MotionConfig above says "always". Every effect in this folder checks it.
 */
export function useReduceMotion(): boolean {
  return Boolean(useReducedMotionConfig());
}

/** Pointer-driven effects (tilt, magnetic pull, mouse parallax) run only with a mouse and without reduced motion. */
export function usePointerEffects(): boolean {
  const reduce = useReduceMotion();
  const fine = useFinePointer();
  return fine && !reduce;
}

/** Without IntersectionObserver, "in view" never fires, so reveals must start visible. */
export function canObserve(): boolean {
  return typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function';
}

/** A soft spring shared by the pointer effects. */
export const SOFT_SPRING = { stiffness: 180, damping: 18, mass: 0.4 } as const;

type Target = string | Record<string, unknown>;
type ViewportOptions = { once?: boolean; margin?: string; amount?: number | 'some' | 'all' };

/**
 * Props for "animate from `hidden` to `shown` when scrolled into view", once. Without
 * IntersectionObserver (old browsers, some test setups) the element simply renders `shown`:
 * motion's own whileInView would throw there, and nothing may be left invisible.
 */
export function onView<T extends Target>(hidden: T, shown: T, viewport: ViewportOptions = {}) {
  if (!canObserve()) return { initial: false as const, animate: shown };
  return { initial: hidden, whileInView: shown, viewport: { once: true, margin: '0px 0px -10% 0px', ...viewport } };
}

/**
 * True once the element has been on screen (or at once without IntersectionObserver).
 * `margin` works like CSS rootMargin; with `once: false` it turns false again when it leaves.
 */
export function useSeen(ref: RefObject<Element | null>, { once = true, margin = '0px', amount = 0 }: { once?: boolean; margin?: string; amount?: number } = {}): boolean {
  const [seen, setSeen] = useState(() => !canObserve());
  useEffect(() => {
    const el = ref.current;
    if (!el || !canObserve()) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setSeen(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setSeen(false);
        }
      },
      { rootMargin: margin, threshold: amount },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, once, margin, amount]);
  return seen;
}

/**
 * False while the element is well off screen, so looping animations can pause. Starts true, and
 * stays true without IntersectionObserver, so nothing is ever left frozen by mistake.
 */
export function useOnScreen(ref: RefObject<Element | null>, margin = '100px'): boolean {
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || !canObserve()) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(Boolean(entry?.isIntersecting)), { rootMargin: margin });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, margin]);
  return onScreen;
}
