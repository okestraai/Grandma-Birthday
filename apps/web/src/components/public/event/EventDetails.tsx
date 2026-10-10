import type { ReactNode } from 'react';
import { motion, type Variants } from 'motion/react';
import { CalendarDays, Car, Clock, Mail, MapPin, Palette, Phone, Shirt, User } from 'lucide-react';
import type { PublicEvent } from '@birthday/types';
import { cn, formatEventDate, formatEventTime } from '@/lib/utils';
import { mapHref } from './event-helpers';
import { EASE } from '../reveal';
import { onView } from '../motion';

const list: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } };
const row: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};
const badge: Variants = {
  hidden: { scale: 0, rotate: -90 },
  show: { scale: 1, rotate: 0, transition: { type: 'spring', stiffness: 300, damping: 16, delay: 0.1 } },
};

function Detail({ icon, label, children, className }: { icon: ReactNode; label: string; children: ReactNode; className?: string }) {
  return (
    <motion.div variants={row} className={cn('group flex gap-4 border-t border-gold/25 py-5', className)}>
      <motion.span
        variants={badge}
        className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-gold/40 text-gold-rich transition-colors duration-300 group-hover:bg-gold/15 [&_svg]:size-4"
        aria-hidden
      >
        {icon}
      </motion.span>
      <div className="min-w-0">
        <dt className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted">{label}</dt>
        <dd className="mt-1.5 text-[15px] leading-relaxed text-navy">{children}</dd>
      </div>
    </motion.div>
  );
}

/** Definition list of every event detail the API provides; empty fields are left out. */
export function EventDetails({ event, compact = false }: { event: PublicEvent; compact?: boolean }) {
  const sameDay =
    formatEventDate(event.startsAt, event.timezone) === formatEventDate(event.endsAt, event.timezone);

  return (
    <motion.dl
      className={cn('grid gap-x-10', !compact && 'sm:grid-cols-2')}
      variants={list}
      {...onView('hidden', 'show')}
    >
      <Detail icon={<CalendarDays />} label="Date">
        <time dateTime={event.startsAt}>{formatEventDate(event.startsAt, event.timezone)}</time>
      </Detail>
      <Detail icon={<Clock />} label="Time">
        {formatEventTime(event.startsAt, event.timezone)} – {sameDay ? formatEventTime(event.endsAt, event.timezone) : `${formatEventDate(event.endsAt, event.timezone)}, ${formatEventTime(event.endsAt, event.timezone)}`}
      </Detail>
      <Detail icon={<MapPin />} label="Venue" className={cn(!compact && 'sm:col-span-2')}>
        <span className="font-medium">{event.venueName}</span>
        <br />
        <span className="text-charcoal/80">{event.address}</span>
        <br />
        <a
          href={mapHref(event)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex text-sm font-medium text-emerald underline decoration-gold/60 underline-offset-4 hover:text-navy"
        >
          Open in maps<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </Detail>
      {event.dressCode && (
        <Detail icon={<Shirt />} label="Dress code">
          {event.dressCode}
        </Detail>
      )}
      {event.theme && (
        <Detail icon={<Palette />} label="Theme">
          {event.theme}
        </Detail>
      )}
      {event.parkingInfo && (
        <Detail icon={<Car />} label="Parking" className={cn(!compact && 'sm:col-span-2')}>
          {event.parkingInfo}
        </Detail>
      )}
      {!compact && (event.contactName || event.contactEmail || event.contactPhone) && (
        <Detail icon={<User />} label="Contact" className="sm:col-span-2">
          {event.contactName && <span className="block">{event.contactName}</span>}
          <span className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {event.contactEmail && (
              <a href={`mailto:${event.contactEmail}`} className="inline-flex items-center gap-1.5 text-emerald hover:text-navy">
                <Mail className="size-3.5" aria-hidden /> {event.contactEmail}
              </a>
            )}
            {event.contactPhone && (
              <a href={`tel:${event.contactPhone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 text-emerald hover:text-navy">
                <Phone className="size-3.5" aria-hidden /> {event.contactPhone}
              </a>
            )}
          </span>
        </Detail>
      )}
    </motion.dl>
  );
}
