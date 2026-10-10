import { MapPin, Mic } from 'lucide-react';
import type { ProgrammeItem } from '@birthday/types';
import { motion } from 'motion/react';
import { cn, formatClock } from '@/lib/utils';
import { Reveal } from '../reveal';
import { ScrollLine, onView } from '../motion';

/**
 * Vertical programme: time on the left, a gold spine with dots, and the item on the right.
 * The spine draws itself down as the list scrolls past; items slide in one after another.
 */
export function ProgrammeTimeline({ items, tone = 'light', limit }: { items: ProgrammeItem[]; tone?: 'light' | 'dark'; limit?: number }) {
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.startTime.localeCompare(b.startTime));
  const shown = limit ? sorted.slice(0, limit) : sorted;
  const dark = tone === 'dark';

  return (
    <ol className="relative">
      <ScrollLine tone={tone} className="absolute bottom-2 left-[6rem] top-2 sm:left-[9rem]" />
      {shown.map((item, i) => (
        <Reveal as="li" key={item.id} delay={Math.min(i, 6) * 0.08} x={32} y={0} className="relative grid grid-cols-[4.75rem_1fr] gap-x-5 pb-9 last:pb-0 sm:grid-cols-[7rem_1fr] sm:gap-x-8">
          <div className="pt-0.5 text-right">
            <time className={cn('font-display text-lg leading-none sm:text-xl', dark ? 'text-gold' : 'text-gold-rich')} dateTime={item.startTime}>
              {formatClock(item.startTime)}
            </time>
            {item.endTime && (
              <p className={cn('mt-1 text-xs', dark ? 'text-ivory/50' : 'text-muted')}>
                <span className="sr-only">until </span>
                {formatClock(item.endTime)}
              </p>
            )}
          </div>
          <div className="relative pb-1 pl-6 sm:pl-8">
            <motion.span
              aria-hidden
              className={cn(
                'absolute -left-[4.5px] top-1.5 z-10 size-2.5 border border-gold',
                i === 0 ? 'bg-gold' : dark ? 'bg-navy' : 'bg-ivory',
              )}
              {...onView({ scale: 0, rotate: 0 }, { scale: 1, rotate: 45 }, { margin: '0px 0px -15% 0px' })}
              transition={{ type: 'spring', stiffness: 320, damping: 14, delay: 0.25 }}
            />
            <h3 className={cn('font-display text-xl leading-snug sm:text-2xl', dark ? 'text-ivory' : 'text-navy')}>{item.title}</h3>
            {item.description && (
              <p className={cn('mt-2 max-w-xl text-[15px] leading-relaxed', dark ? 'text-ivory/70' : 'text-charcoal/80')}>{item.description}</p>
            )}
            {(item.speaker || item.location) && (
              <p className={cn('mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm', dark ? 'text-ivory/60' : 'text-muted')}>
                {item.speaker && (
                  <span className="inline-flex items-center gap-1.5">
                    <Mic className="size-3.5 text-gold-rich" aria-hidden />
                    {item.speaker}
                  </span>
                )}
                {item.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5 text-gold-rich" aria-hidden />
                    {item.location}
                  </span>
                )}
              </p>
            )}
          </div>
        </Reveal>
      ))}
    </ol>
  );
}
