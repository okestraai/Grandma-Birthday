import { useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import type { SiteOverview } from '@birthday/types';
import { useAlbums, useFamily, useProgramme, useTestimonials, useTimeline } from '@/lib/public-api';
import { cn, formatEventDate, initials, paragraphs } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { MediaImage } from '../media';
import { Reveal, popChild, staggerParent } from '../reveal';
import { CountUp, MagneticLink, Marquee, Parallax, SplitText, Sparkles, TiltCard, onView } from '../motion';
import { Eyebrow, GoldRule, SectionHeading } from '../section';
import { SeventyWatermark } from '../seventy';
import { CATEGORY_LABELS, pickHighlights, sortTimeline } from '../timeline/categories';
import { EventDetails } from '../event/EventDetails';
import { AddToCalendar } from '../event/AddToCalendar';
import { audienceNote, calendarEventsFromSite, eventTimes, rsvpClosedMessage } from '../event/event-helpers';
import { ProgrammeTimeline } from '../programme/ProgrammeTimeline';
import { ProgrammeSwitch } from '../programme/ProgrammeEvents';
import { groupsWithItems, pickProgrammeGroup, programmeHref } from '../programme/programme-helpers';
import { ShaderBackdrop } from '../effects/ShaderBackdrop';
import { TestimonialCarousel } from '../testimonials/TestimonialCarousel';

function MoreLink({ to, children, tone = 'light' }: { to: string; children: React.ReactNode; tone?: 'light' | 'dark' }) {
  return (
    <Link
      to={to}
      className={cn(
        'group inline-flex items-center gap-2 text-sm font-medium tracking-wide',
        tone === 'dark' ? 'text-gold hover:text-champagne' : 'text-emerald hover:text-navy',
      )}
    >
      {children}
      <ArrowRight className="size-4 transition-transform duration-300 ease-luxe group-hover:translate-x-1" aria-hidden />
    </Link>
  );
}

/* ---------------------------------------------------------------- Introduction */

export function Introduction({ site }: { site: SiteOverview }) {
  const { celebrant } = site;
  const intro = celebrant.introduction ?? paragraphs(celebrant.biography)[0];
  if (!intro && !celebrant.quote) return null;
  return (
    <section id="introduction" aria-labelledby="intro-heading" className="scroll-mt-20 bg-ivory py-20 sm:py-28">
      <div className="container-page grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <Reveal x={-140} y={0} rotate={-4}>
          <Eyebrow>The guest of honour</Eyebrow>
          <h2 id="intro-heading" className="mt-3 font-display text-3xl leading-tight text-navy sm:text-4xl">
            <SplitText text={`Meet ${celebrant.preferredName}`} trigger="view" variant="dramatic" />
          </h2>
          <GoldRule align="left" className="mt-5" />
          {celebrant.birthPlace && celebrant.birthDate && (
            <p className="mt-6 text-sm text-muted">
              Born {formatEventDate(`${celebrant.birthDate}T12:00:00Z`, 'UTC', { weekday: undefined })} in {celebrant.birthPlace}
            </p>
          )}
        </Reveal>
        <Reveal delay={0.15} x={140} y={0} rotate={3}>
          {intro && (
            <p className="font-display text-xl leading-relaxed text-navy first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:font-display first-letter:text-6xl first-letter:leading-[0.8] first-letter:text-gold-rich sm:text-2xl">
              {intro}
            </p>
          )}
          {celebrant.quote && (
            <figure className="mt-10 border-l border-gold pl-6">
              <blockquote className="font-display text-lg italic leading-relaxed text-emerald-deep">
                <SplitText text={`“${celebrant.quote}”`} trigger="view" stagger={0.035} delay={0.3} />
              </blockquote>
              {celebrant.quoteAttribution && <figcaption className="mt-2 text-sm text-muted">— {celebrant.quoteAttribution}</figcaption>}
            </figure>
          )}
          <div className="mt-8">
            <MoreLink to="/about">Read the biography</MoreLink>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- Story + timeline */

export function StoryTeaser({ site }: { site: SiteOverview }) {
  const timeline = useTimeline();
  const family = useFamily();
  const entries = sortTimeline(timeline.data ?? []);
  const highlights = pickHighlights(entries, 5);
  const age = site.celebrant.age ?? 70;
  const generations = new Set((family.data?.members ?? []).map((m) => m.generation)).size;
  const stats = [
    { value: age, label: 'Years of life' },
    entries.length > 0 ? { value: entries.length, label: 'Milestones remembered' } : null,
    generations > 0 ? { value: generations, label: generations === 1 ? 'Generation' : 'Generations' } : null,
  ].filter((s): s is { value: number; label: string } => s !== null);

  return (
    <section aria-labelledby="story-heading" className="relative isolate overflow-hidden bg-navy py-20 text-ivory sm:py-28">
      <div aria-hidden className="absolute inset-0 -z-10 bg-luxury opacity-80" />
      <Parallax offset={220} scaleFrom={0.7} className="pointer-events-none absolute -left-10 top-10 -z-10">
        <SeventyWatermark className="block text-[18rem] opacity-[0.06] sm:text-[26rem]" />
      </Parallax>
      <Sparkles count={26} className="-z-10" />
      <div className="container-page">
        <Reveal>
          <SectionHeading dramatic
            tone="dark"
            eyebrow={`${age} years in the making`}
            id="story-heading"
            title="A life written in chapters"
            description="From the first chapter to this one: the places, people and moments that shaped a remarkable life."
          />
        </Reveal>

        <Reveal delay={0.1} scale={0.6} y={60}>
          <dl className="mx-auto mt-14 grid max-w-3xl divide-x divide-gold/20 border-y border-gold/20" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col px-2 py-6 text-center">
                <dt className="order-2 mt-2 text-[10px] uppercase tracking-[0.2em] text-ivory/60 sm:text-[11px]">{s.label}</dt>
                <dd className="font-display text-4xl lining-nums text-gold-gradient sm:text-5xl">
                  <CountUp value={s.value} />
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>

        {timeline.isPending && (
          <div className="mt-14 flex gap-4 overflow-hidden" aria-hidden>
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-72 w-64 shrink-0 bg-white/10" />
            ))}
          </div>
        )}
        {timeline.isError && !timeline.data && <ErrorState className="mt-14 bg-ivory" error={timeline.error} onRetry={() => timeline.refetch()} title="We could not load the timeline" />}

        {highlights.length > 0 && (
          <>
            <h3 className="sr-only">Highlights from the timeline</h3>
            <ol
              className="-mx-4 mt-14 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:thin] sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0"
              aria-label="Life highlights"
              tabIndex={0}
            >
              {highlights.map((entry, i) => (
                <Reveal as="li" key={entry.id} delay={i * 0.12} y={160} scale={0.8} rotate={(i % 2 ? 1 : -1) * 8} className="w-[72%] shrink-0 snap-start sm:w-[42%] lg:w-auto">
                  <TiltCard className="h-full rounded-2xl" max={16} lift={1.06}>
                  <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-gold/20 bg-white/[0.04] transition-colors duration-500 hover:border-gold/50">
                    {entry.media ? (
                      <div className="overflow-hidden">
                        <MediaImage media={entry.media} variant="thumb" className="aspect-[4/3] w-full object-cover transition-transform duration-[1.2s] ease-luxe group-hover:scale-105" />
                      </div>
                    ) : (
                      <div aria-hidden className="flex aspect-[4/3] items-center justify-center bg-emerald-deep/60 font-display text-5xl text-gold/50">
                        {entry.year}
                      </div>
                    )}
                    <div className="flex flex-1 flex-col p-5">
                      <p className="font-display text-3xl lining-nums text-gold">{entry.year}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-ivory/50">{CATEGORY_LABELS[entry.category]}</p>
                      <h4 className="mt-3 font-display text-lg leading-snug text-ivory">{entry.title}</h4>
                    </div>
                  </article>
                  </TiltCard>
                </Reveal>
              ))}
            </ol>
          </>
        )}

        <div className="mt-10 text-center">
          <MagneticLink
            to="/story"
            className="inline-flex h-12 items-center justify-center rounded-full border border-gold/60 px-8 text-sm font-medium tracking-wide text-ivory transition-colors duration-300 hover:border-gold hover:bg-gold/10"
          >
            Explore the Journey
          </MagneticLink>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Family */

export function FamilyTeaser() {
  const family = useFamily();
  const members = [...(family.data?.members ?? [])].sort((a, b) => Number(b.isCelebrant) - Number(a.isCelebrant) || a.generation - b.generation || a.sortOrder - b.sortOrder);
  // Saved data (see lib/snapshot) still shows while a refetch is failing.
  if (family.isError && !family.data) return null;
  if (family.data && members.length === 0) return null;
  const shown = members.slice(0, 7);

  return (
    <section aria-labelledby="family-heading" className="bg-cream py-20 sm:py-28">
      <div className="container-page grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <Reveal x={-140} y={0} rotate={-3}>
          <SectionHeading dramatic align="left" eyebrow="Family" id="family-heading" title="Roots, branches and blossoms" description="Parents who began it all, children who carry it forward, and grandchildren who fill every room with joy." />
          <div className="mt-8">
            <MoreLink to="/family">Explore the family tree</MoreLink>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          {family.isPending ? (
            <div className="flex justify-center gap-3" aria-hidden>
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="size-20 rounded-full" />
              ))}
            </div>
          ) : (
            <motion.ul
              className="flex flex-wrap justify-center gap-x-4 gap-y-6"
              variants={{ ...staggerParent, show: { transition: { staggerChildren: 0.12, delayChildren: 0.3 } } }}
              {...onView('hidden', 'show')}
            >
              {shown.map((m) => (
                <motion.li
                  key={m.id}
                  variants={popChild}
                  whileHover={{ scale: 1.18, y: -10, rotate: -3 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                  className="flex w-24 flex-col items-center text-center sm:w-28"
                >
                  {m.photo ? (
                    <MediaImage media={m.photo} variant="thumb" sizes="120px" fallbackLabel={initials(m.fullName)} alt="" className={cn('aspect-square w-full rounded-full object-cover ring-1 ring-gold/50 ring-offset-4 ring-offset-cream', m.isCelebrant && 'ring-2 ring-gold')} />
                  ) : (
                    <span aria-hidden className="flex aspect-square w-full items-center justify-center rounded-full border border-gold/50 bg-ivory font-display text-2xl text-navy">
                      {initials(m.fullName)}
                    </span>
                  )}
                  <span className="mt-3 line-clamp-2 text-sm font-medium leading-tight text-navy">{m.fullName}</span>
                  <span className="mt-0.5 text-xs text-muted">{m.relationshipLabel}</span>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Gallery */

export function GalleryTeaser() {
  const albums = useAlbums();
  if (albums.isError && !albums.data) return null;
  const list = [...(albums.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 3);
  if (albums.data && list.length === 0) return null;

  return (
    <section aria-labelledby="gallery-heading" className="bg-ivory py-20 sm:py-28">
      <div className="container-page">
        <Reveal>
          <SectionHeading dramatic eyebrow="Memories" id="gallery-heading" title="Seven decades in pictures" description="Treasured photographs gathered by family and friends." />
        </Reveal>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {albums.isPending
            ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="aspect-[4/5] rounded-2xl" />)
            : list.map((album, i) => (
                <Reveal
                  key={album.id}
                  delay={i * 0.14}
                  x={i % 3 === 0 ? -180 : i % 3 === 2 ? 180 : 0}
                  y={i % 3 === 1 ? 180 : 60}
                  rotate={i % 3 === 0 ? -10 : i % 3 === 2 ? 10 : 0}
                  scale={0.85}
                  className={cn(i === 0 && 'sm:col-span-2 lg:col-span-1')}
                >
                  <TiltCard className="rounded-2xl" max={14} lift={1.05}>
                  <Link to={`/gallery/${album.slug}`} className="group relative block overflow-hidden rounded-2xl bg-navy shadow-soft">
                    {album.cover ? (
                      <Parallax offset={50} className="scale-125">
                        <MediaImage media={album.cover} variant="medium" alt="" className="aspect-[4/5] w-full object-cover opacity-90 transition-transform duration-[1.4s] ease-luxe group-hover:scale-105 sm:aspect-[4/5]" sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" />
                      </Parallax>
                    ) : (
                      <div aria-hidden className="aspect-[4/5] w-full bg-luxury" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-navy/90 via-navy/20 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-6 text-ivory">
                      <p className="text-[11px] uppercase tracking-[0.25em] text-gold">
                        {album.mediaCount} {album.mediaCount === 1 ? 'memory' : 'memories'}
                      </p>
                      <h3 className="mt-2 font-display text-2xl leading-tight">{album.title}</h3>
                    </div>
                    <span className="absolute inset-3 rounded-xl border border-gold/0 transition-colors duration-700 group-hover:border-gold/50" aria-hidden />
                  </Link>
                  </TiltCard>
                </Reveal>
              ))}
        </div>
        <div className="mt-10 text-center">
          <MoreLink to="/gallery">View the full gallery</MoreLink>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Moments strip */

/**
 * An endless, draggable strip of photographs from the timeline and the album covers.
 * Uses data the page has already asked for; hidden when there are too few pictures.
 */
export function MomentsMarquee() {
  const timeline = useTimeline();
  const albums = useAlbums();
  const moments = [
    ...sortTimeline(timeline.data ?? [])
      .filter((e) => e.media && e.media.kind === 'PHOTO')
      .map((e) => ({ id: `t-${e.id}`, media: e.media!, to: '/story', kicker: String(e.year), title: e.title })),
    ...[...(albums.data ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((a) => a.cover)
      .map((a) => ({ id: `a-${a.id}`, media: a.cover!, to: `/gallery/${a.slug}`, kicker: 'Album', title: a.title })),
  ].slice(0, 16);
  if (moments.length < 4) return null;

  return (
    <section aria-labelledby="moments-heading" className="relative overflow-hidden bg-ivory pb-20 pt-4 sm:pb-24">
      <div className="container-page">
        <h2 id="moments-heading" className="mb-6 text-[11px] font-medium uppercase tracking-[0.3em] text-gold-rich">
          Moments along the way
        </h2>
      </div>
      <Marquee label="Moments along the way" speed={36}>
        {moments.map((m) => (
          <li key={m.id} className="w-52 shrink-0 sm:w-64">
            <Link to={m.to} className="group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-4 focus-visible:ring-offset-ivory" draggable={false}>
              <span className="relative block overflow-hidden rounded-2xl bg-navy shadow-soft">
                <MediaImage media={m.media} variant="thumb" alt="" className="aspect-[4/5] w-full object-cover transition-transform duration-[1.2s] ease-luxe group-hover:scale-110" />
                <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-navy/85 via-navy/10 to-transparent" />
                <span aria-hidden className="pointer-events-none absolute inset-2 rounded-xl border border-gold/0 transition-colors duration-500 group-hover:border-gold/60" />
                <span className="absolute inset-x-0 bottom-0 p-4 text-ivory">
                  <span className="block font-display text-2xl lining-nums text-gold">{m.kicker}</span>
                  <span className="mt-1 line-clamp-2 block text-sm leading-snug">{m.title}</span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </Marquee>
    </section>
  );
}

/* ---------------------------------------------------------------- Event */

export function EventSection({ site }: { site: SiteOverview }) {
  const { celebration } = site;
  const [event] = site.events;
  return (
    <section aria-labelledby="event-heading" className="bg-cream py-20 sm:py-28">
      <div className="container-page grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <Reveal x={-140} y={0} rotate={-3}>
          <SectionHeading
            dramatic
            align="left"
            eyebrow="The celebration"
            id="event-heading"
            title={celebration.name}
            description={celebration.tagline ?? celebration.description ?? undefined}
          />
          <div className="mt-8 flex flex-col gap-5">
            <AddToCalendar events={calendarEventsFromSite(site)} className="text-navy" />
            <MoreLink to="/event">All event details</MoreLink>
          </div>
        </Reveal>
        {event && (
          <Reveal delay={0.15} x={140} y={0} rotate={3}>
            <EventDetails event={event} timezone={celebration.timezone} compact />
          </Reveal>
        )}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Schedule (several events) */

const dayLabel = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone }).format(new Date(iso));

export function ScheduleSection({ site }: { site: SiteOverview }) {
  const { celebration, events } = site;
  return (
    <section aria-labelledby="schedule-heading" className="bg-cream py-20 sm:py-28">
      <div className="container-page grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <Reveal x={-140} y={0} rotate={-3}>
          <SectionHeading
            dramatic
            align="left"
            eyebrow="Schedule"
            id="schedule-heading"
            title={celebration.name}
            description={celebration.tagline ?? celebration.description ?? undefined}
          />
          <div className="mt-8 flex flex-col gap-5">
            <AddToCalendar events={calendarEventsFromSite(site)} filename={celebration.name} className="text-navy" />
            <MoreLink to="/event">All event details</MoreLink>
          </div>
        </Reveal>
        <motion.ol variants={staggerParent} {...onView('hidden', 'show')} className="divide-y divide-gold/25 border-y border-gold/25">
          {events.map((event) => {
            const audience = audienceNote(event);
            return (
              <motion.li key={event.id} variants={popChild}>
                <Link
                  to={`/event#${event.slug}`}
                  className="group grid grid-cols-[4.5rem_1fr_auto] items-start gap-x-4 py-5 transition-colors hover:bg-gold/5 sm:grid-cols-[6rem_1fr_auto] sm:gap-x-6"
                >
                  <time dateTime={event.startsAt} className="pt-1 font-display text-base leading-tight text-gold-rich sm:text-lg">
                    {dayLabel(event.startsAt, celebration.timezone)}
                  </time>
                  <span className="min-w-0">
                    <span className="block font-display text-xl leading-snug text-navy sm:text-2xl">{event.name}</span>
                    <span className="mt-1 block text-sm text-charcoal/80">{eventTimes(event, celebration.timezone)}</span>
                    <span className="block text-sm text-muted">
                      {event.venueName}
                      {event.city ? `, ${event.city}` : ''}
                    </span>
                    {audience && <span className="mt-1 block text-xs uppercase tracking-[0.18em] text-gold-rich">{audience}</span>}
                  </span>
                  <ArrowRight className="mt-2 size-4 text-gold-rich transition-transform duration-300 ease-luxe group-hover:translate-x-1" aria-hidden />
                </Link>
              </motion.li>
            );
          })}
        </motion.ol>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Programme */

/** First items of the chosen event shown on the home page; the rest are on /programme. */
const HOME_PROGRAMME_ITEMS = 5;

export function ProgrammeSection({ timezone }: { timezone?: string }) {
  const programme = useProgramme();
  const [slug, setSlug] = useState<string | null>(null);
  const groups = groupsWithItems(programme.data);
  if ((programme.isError && !programme.data) || (programme.data && groups.length === 0)) return null;
  const several = groups.length > 1;
  const selected = pickProgrammeGroup(groups, slug);
  return (
    <section aria-labelledby="programme-heading" className="bg-ivory py-20 sm:py-28">
      <div className="container-page">
        <Reveal>
          <SectionHeading dramatic eyebrow={several ? 'Order of events' : 'Order of the evening'} id="programme-heading" title="The programme" />
        </Reveal>
        <div className="mx-auto mt-12 max-w-2xl sm:mt-14">
          {programme.isPending || !selected ? (
            <div className="space-y-6" aria-hidden>
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : (
            <ProgrammeSwitch groups={groups} selected={selected} onSelect={setSlug} idPrefix="home-programme" timezone={timezone}>
              {({ event, items }) => (
                <>
                  <p className="mb-10 text-center text-sm text-muted">
                    <time className="block font-medium text-navy sm:inline" dateTime={event.startsAt}>
                      {formatEventDate(event.startsAt, timezone)}
                    </time>
                    <span aria-hidden className="hidden sm:inline"> · </span>
                    <span className="whitespace-nowrap">{eventTimes(event, timezone)}</span>
                    <span aria-hidden> · </span>
                    {event.venueName}
                  </p>
                  <ProgrammeTimeline items={items} limit={HOME_PROGRAMME_ITEMS} eventStart={event.startsAt} timezone={timezone} />
                </>
              )}
            </ProgrammeSwitch>
          )}
        </div>
        {selected && (
          <div className="mt-10 text-center">
            <MoreLink to={programmeHref(groups, selected.event.slug)}>See the full programme</MoreLink>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Tributes */

export function TestimonialsSection() {
  const testimonials = useTestimonials(8);
  const items = testimonials.data?.pages[0]?.items ?? [];
  const featured = items.filter((t) => t.isFeatured);
  const shown = featured.length >= 2 ? featured : items;
  if ((testimonials.isError && !testimonials.data) || (testimonials.data && shown.length === 0)) return null;

  return (
    <section aria-labelledby="tributes-heading" className="relative isolate overflow-hidden bg-navy py-20 text-ivory sm:py-28">
      <div aria-hidden className="absolute inset-0 -z-10 bg-luxury opacity-70" />
      <div className="container-page">
        <Reveal>
          <SectionHeading dramatic tone="dark" eyebrow="Tributes" id="tributes-heading" title="In their words" />
        </Reveal>
        <div className="mt-12">
          {testimonials.isPending ? (
            <div className="mx-auto max-w-2xl space-y-3" aria-hidden>
              <Skeleton className="h-5 bg-white/10" />
              <Skeleton className="h-5 bg-white/10" />
              <Skeleton className="mx-auto h-5 w-2/3 bg-white/10" />
            </div>
          ) : (
            <TestimonialCarousel items={shown} />
          )}
        </div>
        <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <MoreLink to="/testimonials" tone="dark">
            Read every tribute
          </MoreLink>
          <span aria-hidden className="hidden text-gold/50 sm:inline">·</span>
          <MoreLink to="/testimonials#leave-message" tone="dark">
            Leave a birthday message
          </MoreLink>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- RSVP */

export function RsvpCta({ site }: { site: SiteOverview }) {
  const { celebration } = site;
  const { rsvp } = celebration;
  return (
    <section aria-labelledby="rsvp-heading" className="relative isolate overflow-hidden bg-ivory py-20 sm:py-28">
      <div className="container-page">
        <Reveal scale={0.65} y={120} rotate={-4} className="relative isolate mx-auto max-w-3xl overflow-hidden rounded-[2rem] bg-navy px-6 py-16 text-center text-ivory shadow-lift sm:px-12">
          <div aria-hidden className="absolute inset-0 -z-10 bg-luxury" />
          <ShaderBackdrop name="rsvp" className="-z-10" />
          <Parallax offset={120} scaleFrom={0.6} className="pointer-events-none absolute -bottom-20 left-1/2 -z-10 -translate-x-1/2">
            <SeventyWatermark className="block text-[18rem] opacity-[0.08]" />
          </Parallax>
          <Sparkles count={30} className="-z-10" />
          <div aria-hidden className="absolute inset-3 rounded-[1.6rem] border border-gold/30" />
          <Eyebrow tone="dark">Kindly reply</Eyebrow>
          <h2 id="rsvp-heading" className="mt-4 font-display text-3xl leading-tight sm:text-5xl">
            <SplitText text="Will you join us?" trigger="view" delay={0.35} variant="dramatic" />
          </h2>
          <GoldRule className="mt-6" />
          {rsvp.open ? (
            <>
              <p className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-ivory/75">
                {rsvp.mode === 'INVITE_ONLY'
                  ? 'Please reply using the personal link in your invitation.'
                  : 'We would be honoured by your presence.'}
                {rsvp.deadline && (
                  <>
                    {' '}Kindly respond by <time dateTime={rsvp.deadline}>{formatEventDate(rsvp.deadline, celebration.timezone)}</time>.
                  </>
                )}
              </p>
              <MagneticLink
                to="/rsvp"
                strength={0.6}
                className="relative mt-9 inline-flex h-12 items-center justify-center rounded-full bg-gold px-10 text-sm font-semibold tracking-wide text-navy shadow-soft transition-shadow duration-300 ease-luxe hover:shadow-gold"
              >
                RSVP now
              </MagneticLink>
            </>
          ) : (
            <p className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-ivory/75">{rsvpClosedMessage(rsvp, celebration.timezone)}</p>
          )}
        </Reveal>
      </div>
    </section>
  );
}
