import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { Clock, MapPin, Shirt } from 'lucide-react';
import type { ProgrammeGroup, PublicEvent } from '@birthday/types';
import { cn, formatEventDate } from '@/lib/utils';
import { EASE } from '../reveal';
import { useLiteMotion, useReduceMotion } from '../motion';
import { eventTimes } from '../event/event-helpers';
import { DirectionsLink } from '../event/DirectionsLink';

/** "Sat 21 Nov" in the celebration's time zone. */
function shortDay(iso: string, timezone?: string): string {
  return formatEventDate(iso, timezone, { weekday: 'short', month: 'short', year: undefined });
}

/**
 * Segmented pills, one per event, with tab semantics: arrow keys, Home and End move between
 * events and select them. With many events the pills scroll sideways inside their own strip.
 */
function EventTabs({
  groups,
  selected,
  onSelect,
  idPrefix,
  timezone,
}: {
  groups: ProgrammeGroup[];
  selected: string;
  onSelect: (slug: string) => void;
  idPrefix: string;
  timezone?: string;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const tabs = useRef(new Map<string, HTMLButtonElement>());
  const reduce = useReduceMotion();

  // Keep the chosen pill in view inside the strip, without scrolling the page.
  useEffect(() => {
    const list = strip.current;
    const tab = tabs.current.get(selected);
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    list.scrollTo?.({ left: tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2, behavior: reduce ? 'auto' : 'smooth' });
  }, [selected, reduce]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const count = groups.length;
    const at = groups.findIndex((g) => g.event.slug === selected);
    const next = { ArrowRight: (at + 1) % count, ArrowLeft: (at - 1 + count) % count, Home: 0, End: count - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const slug = groups[next].event.slug;
    onSelect(slug);
    tabs.current.get(slug)?.focus();
  };

  return (
    <div ref={strip} className="-mx-4 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
      <div
        role="tablist"
        aria-label="Choose an event"
        onKeyDown={onKeyDown}
        className="mx-auto flex w-max gap-1 rounded-full border border-gold/30 bg-white/80 p-1 shadow-soft"
      >
        {groups.map(({ event }) => {
          const active = event.slug === selected;
          return (
            <button
              key={event.id}
              ref={(el) => {
                if (el) tabs.current.set(event.slug, el);
                else tabs.current.delete(event.slug);
              }}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${event.slug}`}
              aria-selected={active}
              aria-controls={`${idPrefix}-panel`}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(event.slug)}
              className={cn(
                'relative flex min-h-11 flex-col items-center justify-center whitespace-nowrap rounded-full px-4 py-1.5 transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-rich sm:px-5',
                active ? 'text-ivory' : 'text-navy/70 hover:text-navy',
              )}
            >
              {active && (
                <motion.span
                  aria-hidden
                  layoutId={`${idPrefix}-pill`}
                  className="absolute inset-0 rounded-full bg-navy"
                  transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                />
              )}
              <span className="relative text-[13px] font-medium leading-tight">{event.name}</span>
              <span className={cn('relative mt-0.5 text-[10px] uppercase tracking-[0.18em]', active ? 'text-gold' : 'text-gold-rich')}>
                {shortDay(event.startsAt, timezone)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const panel: Variants = {
  enter: ({ dir, offset }: { dir: number; offset: number }) => ({ opacity: 0, x: dir * offset }),
  center: { opacity: 1, x: 0, transition: { duration: 0.4, ease: EASE } },
  exit: ({ dir, offset }: { dir: number; offset: number }) => ({ opacity: 0, x: -dir * offset, transition: { duration: 0.18, ease: 'easeIn' } }),
};

/**
 * One event's programme at a time. Several events get the pills; the panel crossfades and slides
 * towards the newly chosen event. One event shows just its panel.
 */
export function ProgrammeSwitch({
  groups,
  selected,
  onSelect,
  idPrefix,
  timezone,
  className,
  children,
}: {
  groups: ProgrammeGroup[];
  selected: ProgrammeGroup;
  onSelect: (slug: string) => void;
  idPrefix: string;
  timezone?: string;
  className?: string;
  children: (group: ProgrammeGroup) => ReactNode;
}) {
  const reduce = useReduceMotion();
  const lite = useLiteMotion();
  const several = groups.length > 1;
  const index = groups.indexOf(selected);
  // Slide in the direction of travel along the pills.
  const [last, setLast] = useState(index);
  const [dir, setDir] = useState(1);
  if (last !== index) {
    setDir(index > last ? 1 : -1);
    setLast(index);
  }
  const custom = { dir, offset: reduce ? 0 : lite ? 14 : 32 };

  return (
    <div className={className}>
      {several && <EventTabs groups={groups} selected={selected.event.slug} onSelect={onSelect} idPrefix={idPrefix} timezone={timezone} />}
      <AnimatePresence mode="wait" initial={false} custom={custom}>
        <motion.div
          key={selected.event.id}
          custom={custom}
          variants={panel}
          initial="enter"
          animate="center"
          exit="exit"
          {...(several ? { role: 'tabpanel', id: `${idPrefix}-panel`, 'aria-labelledby': `${idPrefix}-tab-${selected.event.slug}` } : {})}
          className={cn(several && 'mt-8')}
        >
          {children(selected)}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** The chosen event above its running order: name, day, times, venue with directions, dress code. */
export function ProgrammeEventCard({ event, timezone }: { event: PublicEvent; timezone?: string }) {
  return (
    <div className="rounded-[1.75rem] border border-gold/30 bg-white p-6 shadow-soft sm:p-8">
      <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-gold-rich">
        <time dateTime={event.startsAt}>{formatEventDate(event.startsAt, timezone)}</time>
      </p>
      <h2 className="mt-2 font-display text-2xl leading-tight text-navy sm:text-3xl">{event.name}</h2>
      <ul className="mt-5 grid gap-3 text-[15px] text-navy sm:grid-cols-2 sm:gap-x-8">
        <li className="flex gap-3">
          <Clock className="mt-1 size-4 shrink-0 text-gold-rich" aria-hidden />
          <span>
            <span className="sr-only">Time: </span>
            {eventTimes(event, timezone)}
          </span>
        </li>
        <li className="flex gap-3">
          <MapPin className="mt-1 size-4 shrink-0 text-gold-rich" aria-hidden />
          <span className="min-w-0">
            <span className="sr-only">Venue: </span>
            <span className="font-medium">{event.venueName}</span>
            <span className="block text-sm text-charcoal/75">{event.address}</span>
          </span>
        </li>
        {event.dressCode && (
          <li className="flex gap-3 sm:col-span-2">
            <Shirt className="mt-1 size-4 shrink-0 text-gold-rich" aria-hidden />
            <span>
              <span className="text-muted">Dress code: </span>
              {event.dressCode}
            </span>
          </li>
        )}
      </ul>
      <div className="mt-6 border-t border-gold/25 pt-5">
        <DirectionsLink
          event={event}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-gold/60 px-6 text-sm font-medium text-navy transition-colors hover:border-gold hover:bg-gold/10"
        />
      </div>
    </div>
  );
}
