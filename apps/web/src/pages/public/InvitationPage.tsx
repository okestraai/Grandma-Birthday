import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Download, MapPin, Printer } from 'lucide-react';
import type { DigitalInvitation, InvitationEvent } from '@birthday/types';
import { SEO, SITE_URL } from '@/components/seo/SEO';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { QRCodeCard } from '@/components/ui/qr-code-card';
import { apiUrl, isApiError } from '@/lib/api';
import { siteNameOf, useInvitation, useSite } from '@/lib/public-api';
import { cn, formatEventDate, formatEventTime } from '@/lib/utils';
import { GoldRule } from '@/components/public/section';
import { EASE } from '@/components/public/reveal';
import { AddToCalendar } from '@/components/public/event/AddToCalendar';
import { directionsHref, eventLocation, eventTimes } from '@/components/public/event/event-helpers';
import type { CalendarEvent } from '@/components/public/calendar';
import { Sparkles } from '@/components/public/motion';

/** When the envelope's parts move, in seconds from the page appearing. */
const ENVELOPE = { flap: 0.75, away: 1.35, card: 1.25 } as const;

/**
 * A sealed envelope that opens when the pass loads: the seal pops, the flap folds back, and the
 * envelope drops away as the invitation card rises out of it. Purely decorative (aria-hidden,
 * not printed); the pass itself is in the page from the start for screen readers.
 */
function Envelope({ mark, onDone }: { mark: string; onDone: () => void }) {
  return (
    <motion.div
      aria-hidden
      className="no-print pointer-events-none absolute inset-x-4 top-28 z-20 mx-auto h-60 max-w-xl sm:top-32 sm:h-72"
      style={{ perspective: 1200 }}
      initial={{ opacity: 0, y: 40, scale: 0.94 }}
      animate={{ opacity: [0, 1, 1, 0], y: [40, 0, 0, 220], scale: [0.94, 1, 1, 0.96] }}
      transition={{ duration: ENVELOPE.away + 0.7, times: [0, 0.25, ENVELOPE.away / (ENVELOPE.away + 0.7), 1], ease: 'easeInOut' }}
      onAnimationComplete={onDone}
    >
      {/* body */}
      <div className="absolute inset-0 overflow-hidden rounded-2xl border border-gold/50 bg-cream shadow-lift">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(214,179,106,0.18),transparent_60%)]" />
        {/* the front pocket, folded up from the bottom corners */}
        <div className="absolute inset-0 bg-champagne" style={{ clipPath: 'polygon(0 100%, 0 30%, 50% 72%, 100% 30%, 100% 100%)' }} />
        <div className="absolute inset-0 bg-gold/25" style={{ clipPath: 'polygon(0 100%, 50% 60%, 100% 100%)' }} />
      </div>
      {/* the flap, folding back on its top edge */}
      <motion.div
        className="absolute inset-x-0 top-0 h-[62%] origin-top"
        style={{ transformStyle: 'preserve-3d' }}
        initial={{ rotateX: 0 }}
        animate={{ rotateX: 180 }}
        transition={{ delay: ENVELOPE.flap, duration: 0.6, ease: [0.65, 0, 0.35, 1] }}
      >
        <div className="absolute inset-0 rounded-t-2xl bg-gradient-to-b from-gold-rich to-gold" style={{ clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }} />
      </motion.div>
      {/* the wax seal */}
      <motion.div
        className="absolute left-1/2 top-[62%] flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-navy font-display text-xl lining-nums text-gold shadow-[0_6px_18px_rgba(7,26,43,0.45)] ring-2 ring-gold/70"
        initial={{ scale: 1, opacity: 1 }}
        animate={{ scale: [1, 1.18, 0], opacity: [1, 1, 0] }}
        transition={{ delay: ENVELOPE.flap - 0.35, duration: 0.45, times: [0, 0.4, 1] }}
      >
        {mark}
      </motion.div>
    </motion.div>
  );
}

/** Calendar entries for the guest's events; a single event keeps the identifier it always had. */
function calendarEventsFor(inv: DigitalInvitation, token: string): CalendarEvent[] {
  const host = new URL(SITE_URL).host;
  const several = inv.events.length > 1;
  return inv.events.map((event) => ({
    uid: several ? `invitation-${inv.code}-${event.id}@${host}` : `invitation-${inv.code}@${host}`,
    title: several ? `${event.name} · ${inv.celebration.name}` : event.name,
    label: event.name,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    location: eventLocation(event),
    description: [`Invitation for ${inv.guestName} (code ${inv.code})`, event.dressCode ? `Dress code: ${event.dressCode}` : null, `${SITE_URL}/invitation/${token}`]
      .filter(Boolean)
      .join('\n'),
    url: `${SITE_URL}/invitation/${token}`,
  }));
}

/** The guest's events on the pass, when there are several: one row each, with directions. */
function EventList({ events, timezone }: { events: InvitationEvent[]; timezone: string }) {
  return (
    <div className="col-span-2 border-t border-gold/30 pt-3">
      <dt className="text-[10px] font-medium uppercase tracking-[0.25em] text-muted">Your events</dt>
      <dd className="mt-2">
        <ul className="space-y-3">
          {events.map((event) => {
            const directions = directionsHref(event);
            return (
              <li key={event.id} className="rounded-xl border border-gold/25 bg-white/60 px-4 py-3">
                <p className="flex items-baseline justify-between gap-3">
                  <span className="font-display text-lg leading-snug text-navy">{event.name}</span>
                  <span className="shrink-0 text-sm text-navy">
                    {event.partySize} {event.partySize === 1 ? 'guest' : 'guests'}
                  </span>
                </p>
                <p className="mt-0.5 text-sm text-charcoal/80">
                  <time dateTime={event.startsAt}>{formatEventDate(event.startsAt, timezone, { year: undefined })}</time> · {eventTimes(event, timezone)}
                </p>
                <p className="text-sm text-charcoal/75">
                  {event.venueName}, {event.address}
                </p>
                {event.dressCode && <p className="text-sm text-muted">Dress code: {event.dressCode}</p>}
                <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  {event.checkedIn && (
                    <span className="inline-flex items-center gap-1 text-success">
                      <CheckCircle2 className="size-3.5" aria-hidden /> Checked in
                    </span>
                  )}
                  <a
                    href={directions.href}
                    {...(directions.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className="no-print inline-flex min-h-11 items-center gap-1 font-medium text-emerald underline-offset-4 hover:underline"
                  >
                    <MapPin className="size-3.5" aria-hidden /> Directions
                    {directions.newTab && <span className="sr-only"> (opens in a new tab)</span>}
                  </a>
                </p>
              </li>
            );
          })}
        </ul>
      </dd>
    </div>
  );
}

function Backdrop({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative isolate min-h-[100svh] overflow-hidden bg-navy px-4 pb-16 pt-28 sm:pt-32 print:min-h-0 print:bg-white print:p-0">
      <div aria-hidden className="absolute inset-0 -z-10 bg-luxury opacity-90 print:hidden" />
      <style>{'@media print { @page { size: A4 portrait; margin: 10mm; } html, body { background: #fff !important; } }'}</style>
      {children}
    </section>
  );
}

function PassSkeleton() {
  return (
    <div className="mx-auto max-w-xl rounded-[2rem] bg-ivory p-8 shadow-lift" aria-busy="true" aria-label="Loading your invitation">
      <Skeleton className="mx-auto h-3 w-40" />
      <Skeleton className="mx-auto mt-5 h-10 w-64" />
      <Skeleton className="mx-auto mt-8 h-8 w-52" />
      <div className="mt-8 grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
      <Skeleton className="mx-auto mt-8 size-52" />
    </div>
  );
}

function Row({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn('border-t border-gold/30 pt-3', wide && 'col-span-2')}>
      <dt className="text-[10px] font-medium uppercase tracking-[0.25em] text-muted">{label}</dt>
      <dd className="mt-1 text-[15px] leading-snug text-navy">{children}</dd>
    </div>
  );
}

export default function InvitationPage() {
  const { token = '' } = useParams();
  const { data: site } = useSite();
  const query = useInvitation(token);
  const siteName = siteNameOf(site);
  const reduce = useReducedMotion();
  const [sealed, setSealed] = useState(true);

  if (query.isPending) {
    return (
      <Backdrop>
        <SEO title="Your invitation" noindex siteName={siteName} />
        <h1 className="sr-only">Your invitation</h1>
        <PassSkeleton />
      </Backdrop>
    );
  }

  if (query.isError) {
    const err = query.error;
    const notFound = isApiError(err) && (err.status === 404 || err.code === 'INVITATION_NOT_FOUND');
    const revoked = isApiError(err, 'INVITATION_REVOKED');
    const expired = isApiError(err, 'INVITATION_EXPIRED');
    const known = notFound || revoked || expired;
    return (
      <Backdrop>
        <SEO title="Invitation" noindex siteName={siteName} />
        <div className="mx-auto max-w-lg rounded-[2rem] bg-ivory p-8 text-center shadow-lift sm:p-10">
          <h1 className="font-display text-3xl text-navy">
            {revoked ? 'This invitation is no longer valid' : expired ? 'This invitation has expired' : notFound ? 'We could not find this invitation' : 'We could not load your invitation'}
          </h1>
          <GoldRule className="mt-5" />
          {known ? (
            <p className="mt-5 text-[15px] leading-relaxed text-charcoal/80">
              {notFound
                ? 'Please check that the link matches the one in your email. Links are personal and must be copied in full.'
                : 'If you believe this is a mistake, please contact the hosts and they will be glad to help.'}
              {site?.celebration.contactEmail && (
                <>
                  {' '}
                  <a className="font-medium text-emerald underline underline-offset-4" href={`mailto:${site.celebration.contactEmail}`}>
                    {site.celebration.contactEmail}
                  </a>
                </>
              )}
            </p>
          ) : (
            <ErrorState className="mt-6" error={err} onRetry={() => query.refetch()} title="Something went wrong" />
          )}
          <Link to="/" className="mt-8 inline-flex h-11 items-center rounded-full border border-gold/60 px-6 text-sm font-medium text-navy hover:bg-gold/10">
            Visit the celebration website
          </Link>
        </div>
      </Backdrop>
    );
  }

  const inv = query.data;
  const { celebration, events } = inv;
  const timezone = celebration.timezone;
  // One event keeps the original pass layout; several are listed one by one.
  const event = events.length === 1 ? events[0] : null;
  const revoked = inv.status === 'REVOKED';
  const declined = inv.response === 'DECLINED';
  const usable = !revoked && !declined;
  const envelope = usable && sealed && !reduce;

  return (
    <Backdrop>
      <SEO
        title={`Invitation for ${inv.guestName}`}
        description={events[0] ? `${celebration.name} · ${formatEventDate(events[0].startsAt, timezone)}` : celebration.name}
        noindex
        siteName={siteName}
      />

      {(revoked || declined) && (
        <div role="alert" className={cn('mx-auto mb-6 flex max-w-xl gap-3 rounded-2xl border px-5 py-4 text-sm leading-relaxed', revoked ? 'border-error/40 bg-error/15 text-ivory' : 'border-gold/40 bg-white/10 text-ivory')}>
          <AlertTriangle className={cn('mt-0.5 size-5 shrink-0', revoked ? 'text-[#f2a3a1]' : 'text-gold')} aria-hidden />
          <p>
            {revoked
              ? 'This invitation has been withdrawn and can no longer be used for entry. Please contact the hosts if you have any questions.'
              : 'You have let us know that you cannot attend. We will miss you. If your plans change, please contact the hosts.'}
            {site?.celebration.contactEmail && (
              <>
                {' '}
                <a className="font-medium text-gold underline underline-offset-4" href={`mailto:${site.celebration.contactEmail}`}>
                  {site.celebration.contactEmail}
                </a>
              </>
            )}
          </p>
        </div>
      )}

      {envelope && <Envelope mark={String(site?.celebrant.age ?? 70)} onDone={() => setSealed(false)} />}
      <motion.article
        // With the envelope, the card rises out of it; otherwise it simply fades up.
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: envelope ? 140 : 24, scale: envelope ? 0.9 : 1, rotateX: envelope ? 18 : 0 }}
        animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
        transition={{ duration: envelope ? 1.1 : 1, ease: EASE, delay: envelope ? ENVELOPE.card : 0 }}
        style={{ transformPerspective: 1400 }}
        className={cn(
          'relative mx-auto max-w-xl overflow-hidden rounded-[2rem] bg-ivory text-center shadow-lift print:max-w-none print:rounded-none print:shadow-none',
          !usable && 'opacity-80',
        )}
        aria-labelledby="pass-heading"
      >
        <div aria-hidden className="pointer-events-none absolute inset-3 rounded-[1.6rem] border border-gold/50 print:rounded-none" />
        <div aria-hidden className="pointer-events-none absolute inset-[18px] rounded-[1.35rem] border border-gold/20 print:rounded-none" />

        {/* Top band */}
        <div className="relative bg-navy px-8 pb-10 pt-12 text-ivory print:bg-navy [print-color-adjust:exact]">
          <div aria-hidden className="absolute inset-0 bg-luxury opacity-80" />
          <Sparkles count={12} className="print:hidden" />
          <div className="relative">
            <p className="text-[10px] font-medium uppercase tracking-[0.35em] text-gold">You are warmly invited</p>
            <motion.p
              aria-hidden
              className="mt-3 font-display text-7xl lining-nums leading-none text-gold-gradient print:bg-none print:text-gold"
              initial={reduce ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1, ease: EASE, delay: (envelope ? ENVELOPE.card : 0) + 0.5 }}
            >
              70
            </motion.p>
            <p className="mt-3 font-display text-2xl leading-snug">{celebration.celebrantName}</p>
            <p className="mt-1 text-sm text-ivory/70">{celebration.name}</p>
          </div>
        </div>

        <div className="relative px-7 pb-10 pt-8 sm:px-10">
          <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-gold-rich">Guest</p>
          <h1 id="pass-heading" className="mt-2 font-display text-3xl leading-tight text-navy sm:text-4xl">
            <span className="sr-only">Invitation for </span>
            {inv.guestName}
          </h1>
          {inv.categoryName && <p className="mt-1 text-sm text-muted">{inv.categoryName}</p>}
          {inv.checkedIn && event && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
              <CheckCircle2 className="size-3.5" aria-hidden /> Checked in
            </p>
          )}
          <GoldRule className="mt-6" />

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 text-left">
            {event ? (
              <>
                <Row label="Date">
                  <time dateTime={event.startsAt}>{formatEventDate(event.startsAt, timezone)}</time>
                </Row>
                <Row label="Time">
                  {formatEventTime(event.startsAt, timezone)} – {formatEventTime(event.endsAt, timezone)}
                </Row>
                <Row label="Venue" wide>
                  <span className="font-medium">{event.venueName}</span>
                  <br />
                  <span className="text-sm text-charcoal/75">{event.address}</span>
                </Row>
                <Row label="Admits">
                  {inv.partySize} {inv.partySize === 1 ? 'guest' : 'guests'}
                </Row>
                {event.dressCode ? <Row label="Dress code">{event.dressCode}</Row> : <Row label="Invitation code">{inv.code}</Row>}
              </>
            ) : (
              <>
                {events.length > 0 && <EventList events={events} timezone={timezone} />}
                <Row label="Invitation code" wide>
                  {inv.code}
                </Row>
              </>
            )}
            {inv.companions.length > 0 && (
              <Row label={inv.companions.length === 1 ? 'Accompanied by' : `Accompanied by (${inv.companionCount})`} wide>
                {inv.companions.join(', ')}
              </Row>
            )}
          </dl>

          <div className="mt-8 flex flex-col items-center">
            {usable ? (
              <QRCodeCard
                svgUrl={inv.qrSvgUrl}
                alt={`Entry QR code for ${inv.guestName}`}
                caption={`Code ${inv.code}`}
                title={events.length > 1 ? 'Present at the entrance of each event' : 'Present at the entrance'}
                size={200}
                actions={false}
              />
            ) : (
              <p className="rounded-xl border border-dashed border-navy/20 px-6 py-8 text-sm text-muted">
                The entry code is not available for this invitation.
                <br />
                Invitation code: <span className="font-mono text-navy">{inv.code}</span>
              </p>
            )}
          </div>
        </div>
      </motion.article>

      <div className="no-print mx-auto mt-8 flex max-w-xl flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
        {usable && (
          <Button asChild variant="gold">
            <a href={apiUrl(inv.pdfUrl)} target="_blank" rel="noopener" download>
              <Download aria-hidden /> Download PDF
            </a>
          </Button>
        )}
        <Button variant="outline" className="text-ivory" onClick={() => window.print()}>
          <Printer aria-hidden /> Print
        </Button>
        {usable && (
          <AddToCalendar
            events={calendarEventsFor(inv, token)}
            filename={celebration.name}
            showGoogle={false}
            className="justify-center text-ivory [&>button]:w-full sm:[&>button]:w-auto"
          />
        )}
        {event?.mapUrl && (
          <Button asChild variant="ghost" className="text-ivory hover:bg-white/10">
            <a href={event.mapUrl} target="_blank" rel="noopener noreferrer">
              <MapPin aria-hidden /> Directions<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </Button>
        )}
      </div>
      <p className="no-print mx-auto mt-6 max-w-md text-center text-xs leading-relaxed text-ivory/55">
        This pass is personal to you. Please keep it on your phone or bring a printed copy to the entrance.
      </p>
    </Backdrop>
  );
}
