import { motion } from 'motion/react';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE } from '../reveal';
import { onView, useReduceMotion } from '../motion';

// A few made-up streets and a route: an illustration, not a real map.
const STREETS = ['M0 40 H320', 'M0 96 H320', 'M0 150 H320', 'M70 0 V190', 'M180 0 V190', 'M260 0 V190', 'M0 190 L140 0'];
const ROUTE = 'M18 176 C 60 170, 70 120, 110 118 S 170 96, 180 70 S 220 44, 228 52';

/**
 * A small illustrated map for the "Getting there" card: streets fade in, a gold route draws
 * itself to the venue, and the pin drops in with a pulse. Decorative (aria-hidden); the address
 * and the directions link sit next to it as text.
 */
export function VenueMap({ className }: { className?: string }) {
  const reduce = useReduceMotion();
  const view = reduce ? { initial: false as const, animate: 'show' } : onView('hidden', 'show');

  return (
    <motion.div aria-hidden className={cn('relative overflow-hidden rounded-2xl border border-gold/25 bg-cream', className)} {...view}>
      <svg viewBox="0 0 320 190" className="block h-auto w-full">
        {STREETS.map((d, i) => (
          <motion.path
            key={d}
            d={d}
            stroke="var(--brand-navy)"
            strokeOpacity={0.09}
            strokeWidth={i === STREETS.length - 1 ? 10 : 6}
            fill="none"
            variants={{ hidden: { pathLength: 0 }, show: { pathLength: 1, transition: { duration: 0.8, delay: i * 0.05, ease: EASE } } }}
          />
        ))}
        <motion.path
          d={ROUTE}
          stroke="var(--brand-gold-rich)"
          strokeWidth={3}
          strokeLinecap="round"
          fill="none"
          variants={{ hidden: { pathLength: 0, opacity: 0 }, show: { pathLength: 1, opacity: 1, transition: { duration: 1.4, delay: 0.4, ease: EASE } } }}
        />
        <circle cx="18" cy="176" r="5" fill="var(--brand-emerald)" />
      </svg>
      <motion.span
        className="absolute left-[71%] top-[27%] -translate-x-1/2 -translate-y-full text-emerald"
        variants={{ hidden: { y: -40, opacity: 0 }, show: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 380, damping: 12, delay: 1.6 } } }}
      >
        <MapPin className="size-8 fill-gold stroke-navy" strokeWidth={1.5} />
      </motion.span>
      {!reduce && (
        <motion.span
          className="absolute left-[71%] top-[27%] size-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gold"
          initial={{ scale: 0.2, opacity: 0 }}
          animate={{ scale: [0.2, 1.6], opacity: [0.8, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, delay: 2, ease: 'easeOut' }}
        />
      )}
    </motion.div>
  );
}
