import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PublicTestimonial } from '@birthday/types';
import { cn } from '@/lib/utils';
import { EASE } from '../reveal';
import { FeaturedTestimonial } from './TestimonialCard';

const slide = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 80, rotateY: dir * 10 }),
  center: { opacity: 1, x: 0, rotateY: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -80, rotateY: dir * -10 }),
};

/**
 * One tribute at a time with previous/next controls, dot navigation, arrow keys and swipe.
 * No autoplay: people read at their own pace, and moving text is hard for some readers.
 */
export function TestimonialCarousel({ items }: { items: PublicTestimonial[] }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const reduce = useReducedMotion();
  if (items.length === 0) return null;
  const current = items[index % items.length];
  const go = (next: number) => {
    setDirection(next > index ? 1 : -1);
    setIndex((next + items.length) % items.length);
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -70 || info.velocity.x < -400) go(index + 1);
    else if (info.offset.x > 70 || info.velocity.x > 400) go(index - 1);
  };

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Birthday tributes"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(index + 1);
        if (e.key === 'ArrowLeft') go(index - 1);
      }}
    >
      <div className="relative min-h-[18rem]" style={{ perspective: 1200 }} aria-live="polite">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={current.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${items.length}`}
            custom={direction}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.6, ease: EASE }}
            // No swipe on a video tribute, so its controls can be used freely.
            drag={items.length > 1 && !reduce && !current.video ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.5}
            onDragEnd={onDragEnd}
            className={cn(items.length > 1 && !reduce && !current.video && 'cursor-grab touch-pan-y active:cursor-grabbing')}
          >
            <FeaturedTestimonial t={current} />
          </motion.div>
        </AnimatePresence>
      </div>
      {items.length > 1 && (
        <div className="mt-10 flex items-center justify-center gap-5">
          <button
            type="button"
            onClick={() => go(index - 1)}
            className="flex size-11 items-center justify-center rounded-full border border-gold/40 text-ivory transition-colors hover:border-gold hover:bg-white/5"
            aria-label="Previous tribute"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <div className="flex items-center gap-1">
            {items.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Show tribute ${i + 1} from ${t.authorName}`}
                aria-current={i === index ? 'true' : undefined}
                className="flex size-6 items-center justify-center"
              >
                <span className="relative block h-1.5 w-1.5 rounded-full bg-ivory/35">
                  {i === index && (
                    <motion.span
                      layoutId="tribute-dot"
                      className="absolute -inset-x-2 inset-y-0 rounded-full bg-gold"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => go(index + 1)}
            className="flex size-11 items-center justify-center rounded-full border border-gold/40 text-ivory transition-colors hover:border-gold hover:bg-white/5"
            aria-label="Next tribute"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
