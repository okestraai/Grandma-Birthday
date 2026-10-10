import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { EASE } from '../reveal';
import { useReduceMotion } from '../motion';

const SEEN_KEY = 'bp_intro_seen';
/** How long the opening holds the hero back; the hero's own animations wait this long. */
export const INTRO_SECONDS = 0.95;

function seenThisVisit(): boolean {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** True when the opening should play: the first home page view of a visit, without reduced motion. */
export function useIntro(): boolean {
  const reduce = useReduceMotion();
  const [play] = useState(() => typeof window !== 'undefined' && !seenThisVisit());
  useEffect(() => {
    try {
      window.sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Private mode: the opening simply plays again next time.
    }
  }, []);
  return play && !reduce;
}

/**
 * The opening: a gold line draws across a navy screen, a small "70" glows on it, then the
 * screen parts top and bottom to reveal the hero. Covers the page only for a moment and
 * never takes clicks once it starts to open.
 */
export function HeroIntro() {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setGone(true), (INTRO_SECONDS + 0.9) * 1000);
    return () => window.clearTimeout(timer);
  }, []);
  if (gone) return null;

  const part = { duration: 0.9, ease: [0.76, 0, 0.24, 1] as const, delay: INTRO_SECONDS - 0.2 };
  return (
    <div aria-hidden data-testid="hero-intro" className="pointer-events-none fixed inset-0 z-[80]">
      <motion.div className="absolute inset-x-0 top-0 h-1/2 bg-navy" initial={{ y: 0 }} animate={{ y: '-100%' }} transition={part} />
      <motion.div className="absolute inset-x-0 bottom-0 h-1/2 bg-navy" initial={{ y: 0 }} animate={{ y: '100%' }} transition={part} />
      <motion.div
        className="absolute left-0 right-0 top-1/2 h-px origin-center bg-gradient-to-r from-transparent via-gold to-transparent"
        initial={{ scaleX: 0, opacity: 1 }}
        animate={{ scaleX: [0, 1, 1], opacity: [1, 1, 0] }}
        transition={{ duration: INTRO_SECONDS + 0.4, times: [0, 0.55, 1], ease: EASE }}
      />
      <motion.span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-display text-6xl text-gold-gradient drop-shadow-[0_0_30px_rgba(214,179,106,0.6)]"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0, 1, 0], scale: [0.6, 1, 1.6] }}
        transition={{ duration: INTRO_SECONDS + 0.3, times: [0, 0.45, 1], ease: EASE }}
      >
        70
      </motion.span>
    </div>
  );
}
