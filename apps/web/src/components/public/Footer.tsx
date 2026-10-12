import { Link } from 'react-router';
import { Mail, MapPin, Phone } from 'lucide-react';
import type { SiteOverview } from '@birthday/types';
import { formatEventDate, formatEventTime } from '@/lib/utils';
import { celebrantName } from '@/lib/public-api';
import { NAV_LINKS } from './nav';
import { celebrationDates, eventTimes } from './event/event-helpers';
import { GoldRule } from './section';
import { SeventyWatermark } from './seventy';
import { CountUp, Parallax } from './motion';

export function Footer({ site }: { site: SiteOverview | undefined }) {
  const celebration = site?.celebration;
  const events = site?.events ?? [];
  const [event] = events;
  const year = celebration ? new Date(celebration.startsAt).getFullYear() : new Date().getFullYear();

  return (
    <footer className="no-print relative isolate overflow-hidden bg-navy text-ivory">
      <div aria-hidden className="absolute inset-0 -z-10 bg-luxury opacity-40" />
      <Parallax offset={60} className="pointer-events-none absolute -bottom-16 -right-4 -z-10">
        <SeventyWatermark className="block text-[14rem] opacity-[0.08] sm:text-[20rem]" />
      </Parallax>
      <div className="container-page py-16 sm:py-20">
        <div className="grid gap-12 md:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            <p className="font-display text-5xl lining-nums text-gold-gradient">
              <CountUp value={site?.celebrant.age ?? 70} duration={2.2} />
            </p>
            {site && (
              <>
                <p className="mt-4 font-display text-2xl leading-snug">{celebrantName(site.celebrant)}</p>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-ivory/65">{celebration?.tagline ?? celebration?.name}</p>
              </>
            )}
            <GoldRule align="left" className="mt-6" />
          </div>

          {site && celebration && event && (
            <div>
              <h2 className="text-[11px] font-medium uppercase tracking-[0.3em] text-gold">The celebration</h2>
              {events.length === 1 ? (
                <>
                  <p className="mt-4 text-sm leading-relaxed text-ivory/85">
                    <time dateTime={event.startsAt}>{formatEventDate(event.startsAt, celebration.timezone)}</time>
                    <br />
                    {formatEventTime(event.startsAt, celebration.timezone)}
                  </p>
                  <p className="mt-4 flex gap-2 text-sm leading-relaxed text-ivory/85">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
                    <span>
                      {event.venueName}
                      <br />
                      <span className="text-ivory/60">{event.address}</span>
                    </span>
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-4 text-sm leading-relaxed text-ivory/85">
                    <time dateTime={celebration.startsAt}>{celebrationDates(site)}</time>
                  </p>
                  <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ivory/85">
                    {events.map((e) => (
                      <li key={e.id} className="flex gap-2">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
                        <span>
                          {e.name}
                          <br />
                          <span className="text-ivory/60">
                            {formatEventDate(e.startsAt, celebration.timezone, { year: undefined })}, {eventTimes(e, celebration.timezone)} · {e.venueName}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {(celebration.contactEmail || celebration.contactPhone) && (
                <div className="mt-4 space-y-2 text-sm">
                  {celebration.contactName && <p className="text-ivory/60">Enquiries: {celebration.contactName}</p>}
                  {celebration.contactEmail && (
                    <a href={`mailto:${celebration.contactEmail}`} className="flex items-center gap-2 text-ivory/85 hover:text-gold">
                      <Mail className="size-4 text-gold" aria-hidden /> {celebration.contactEmail}
                    </a>
                  )}
                  {celebration.contactPhone && (
                    <a href={`tel:${celebration.contactPhone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-2 text-ivory/85 hover:text-gold">
                      <Phone className="size-4 text-gold" aria-hidden /> {celebration.contactPhone}
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          <nav aria-label="Footer">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.3em] text-gold">Explore</h2>
            <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm md:grid-cols-1">
              {NAV_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-ivory/80 transition-colors hover:text-gold">
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/rsvp" className="text-ivory/80 transition-colors hover:text-gold">
                  RSVP
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-gold/15 pt-6 text-xs text-ivory/50 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {site ? `The family of ${celebrantName(site.celebrant)}` : 'The family'}. With love and gratitude.
          </p>
          <p>Photographs are shared privately with guests. Please ask before reposting.</p>
        </div>
      </div>
    </footer>
  );
}
