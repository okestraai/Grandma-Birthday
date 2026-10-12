import type { ReactNode } from 'react';
import { motion, type Variants } from 'motion/react';
import { CalendarDays, Car, Clock, Mail, MapPin, Palette, Phone, Shirt, User, Users } from 'lucide-react';
import type { PublicEvent } from '@birthday/types';
import { cn, formatEventDate } from '@/lib/utils';
import { audienceNote, eventTimes, mapHref, type CelebrationContact } from './event-helpers';
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

/**
 * Definition list of every detail of one event; empty fields are left out. Times are shown in the
 * celebration's time zone. The contact block appears only when `contact` is given.
 */
export function EventDetails({
  event,
  timezone,
  contact,
  compact = false,
}: {
  event: PublicEvent;
  timezone: string;
  contact?: CelebrationContact | null;
  compact?: boolean;
}) {
  const audience = audienceNote(event);
  return (
    <motion.dl
      className={cn('grid gap-x-10', !compact && 'sm:grid-cols-2')}
      variants={list}
      {...onView('hidden', 'show')}
    >
      <Detail icon={<CalendarDays />} label="Date">
        <time dateTime={event.startsAt}>{formatEventDate(event.startsAt, timezone)}</time>
      </Detail>
      <Detail icon={<Clock />} label="Time">
        {eventTimes(event, timezone)}
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
      {audience && (
        <Detail icon={<Users />} label="Guests">
          {audience}
        </Detail>
      )}
      {event.parkingInfo && (
        <Detail icon={<Car />} label="Parking" className={cn(!compact && 'sm:col-span-2')}>
          {event.parkingInfo}
        </Detail>
      )}
      {!compact && contact && (contact.contactName || contact.contactEmail || contact.contactPhone) && (
        <Detail icon={<User />} label="Contact" className="sm:col-span-2">
          {contact.contactName && <span className="block">{contact.contactName}</span>}
          <span className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {contact.contactEmail && (
              <a href={`mailto:${contact.contactEmail}`} className="inline-flex items-center gap-1.5 text-emerald hover:text-navy">
                <Mail className="size-3.5" aria-hidden /> {contact.contactEmail}
              </a>
            )}
            {contact.contactPhone && (
              <a href={`tel:${contact.contactPhone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 text-emerald hover:text-navy">
                <Phone className="size-3.5" aria-hidden /> {contact.contactPhone}
              </a>
            )}
          </span>
        </Detail>
      )}
    </motion.dl>
  );
}
