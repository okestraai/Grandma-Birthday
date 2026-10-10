import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { TimelineCategory, TimelineEntry } from '@birthday/types';
import { SEO } from '@/components/seo/SEO';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { siteNameOf, useSite, useTimeline } from '@/lib/public-api';
import { cn, paragraphs } from '@/lib/utils';
import { MediaImage } from '@/components/public/media';
import { EASE } from '@/components/public/reveal';
import { PageHero } from '@/components/public/section';
import { CATEGORY_LABELS, monthName, sortTimeline } from '@/components/public/timeline/categories';
import { CountUp, Parallax, ScrollLine, TiltCard, onView, useSeen } from '@/components/public/motion';

type Filter = TimelineCategory | 'ALL';

/**
 * One milestone. It slides in from its own side (left or right of the spine), its year counts
 * up, and while it sits in the middle of the screen its marker glows as the active chapter.
 */
function TimelineItem({ entry, index, showDecade }: { entry: TimelineEntry; index: number; showDecade: boolean }) {
  const left = index % 2 === 0;
  const month = monthName(entry.month);
  const ref = useRef<HTMLLIElement>(null);
  const active = useSeen(ref, { once: false, margin: '-45% 0px -45% 0px' });
  const milestone = entry.category === 'MILESTONE' || entry.category === 'BIRTH';
  return (
    <motion.li
      ref={ref}
      layout="position"
      {...onView({ opacity: 0, x: left ? -56 : 56 }, { opacity: 1, x: 0 }, { margin: '0px 0px -12% 0px' })}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={{ duration: 0.9, ease: EASE }}
      className="relative pb-14 pl-10 last:pb-0 lg:grid lg:grid-cols-2 lg:gap-16 lg:pl-0"
    >
      {showDecade && (
        <p aria-hidden className="mb-6 font-display text-sm italic text-gold-rich lg:col-span-2 lg:mb-10 lg:text-center">
          <span className="rounded-full border border-gold/40 bg-ivory px-4 py-1.5">The {Math.floor(entry.year / 10) * 10}s</span>
        </p>
      )}
      {/* spine marker: glows while this is the chapter in the middle of the screen */}
      <motion.span
        aria-hidden
        className={cn(
          'absolute left-[3px] top-2 z-10 size-3 rotate-45 border border-gold bg-ivory lg:left-1/2 lg:-ml-1.5',
          showDecade && 'top-[3.6rem] lg:top-[5.1rem]',
          milestone ? 'bg-gold' : '',
        )}
        animate={active ? { scale: 1.6, boxShadow: '0 0 0 4px rgba(214,179,106,0.25), 0 0 18px 4px rgba(214,179,106,0.55)' } : { scale: 1, boxShadow: '0 0 0 0 rgba(214,179,106,0), 0 0 0 0 rgba(214,179,106,0)' }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      />
      <div className={cn(left ? 'lg:col-start-1 lg:pr-4 lg:text-right' : 'lg:col-start-2 lg:pl-4')}>
        <p className={cn('font-display text-4xl lining-nums leading-none transition-colors duration-500 sm:text-5xl', active ? 'text-gold' : 'text-gold-rich')}>
          <time dateTime={entry.month ? `${entry.year}-${String(entry.month).padStart(2, '0')}` : String(entry.year)}>
            <CountUp value={entry.year} from={entry.year - 25} duration={1.4} grouping={false} />
          </time>
        </p>
        <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.25em] text-muted">
          {month && <span>{month} · </span>}
          {CATEGORY_LABELS[entry.category]}
        </p>
        <h2 className="mt-3 font-display text-2xl leading-snug text-navy">{entry.title}</h2>
        {entry.description && (
          <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-charcoal/85">
            {paragraphs(entry.description).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        )}
      </div>
      {entry.media && (
        <figure className={cn('mt-6 lg:mt-0', left ? 'lg:col-start-2 lg:row-start-1 lg:pl-4' : 'lg:col-start-1 lg:row-start-1 lg:pr-4', showDecade && 'lg:row-start-2')}>
          <TiltCard className="rounded-2xl" max={6}>
            <div className="overflow-hidden rounded-2xl shadow-soft ring-1 ring-gold/25">
              <Parallax offset={16} className="scale-[1.08]">
                <MediaImage media={entry.media} variant="medium" className="w-full object-cover" sizes="(min-width: 1024px) 40vw, 100vw" alt={entry.media.altText ?? entry.title} />
              </Parallax>
            </div>
          </TiltCard>
          {entry.media.caption && <figcaption className="mt-2 text-xs text-muted">{entry.media.caption}</figcaption>}
        </figure>
      )}
    </motion.li>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-12 pl-10" aria-busy="true" aria-label="Loading the timeline">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

export default function StoryPage() {
  const { data: site } = useSite();
  const timeline = useTimeline();
  const [filter, setFilter] = useState<Filter>('ALL');

  const entries = useMemo(() => sortTimeline(timeline.data ?? []), [timeline.data]);
  const categories = useMemo(() => {
    const present = new Set(entries.map((e) => e.category));
    return (Object.keys(CATEGORY_LABELS) as TimelineCategory[]).filter((c) => present.has(c));
  }, [entries]);
  const shown = filter === 'ALL' ? entries : entries.filter((e) => e.category === filter);
  const firstYear = entries[0]?.year;
  const lastYear = entries.at(-1)?.year;
  const name = site?.celebrant.preferredName;

  return (
    <>
      <SEO
        title="Life Story"
        description={
          name && firstYear && lastYear
            ? `The life of ${name}, from ${firstYear} to ${lastYear}: milestones, family, faith and achievements.`
            : 'Seven decades of milestones, family, faith and achievements.'
        }
        siteName={siteNameOf(site)}
      />
      <PageHero
        eyebrow="The journey"
        title={firstYear && lastYear ? `${firstYear} – ${lastYear}` : 'A life in chapters'}
        description={name ? `Walk through the years of ${name}'s life, one chapter at a time.` : 'Walk through the years, one chapter at a time.'}
      />

      <section className="bg-ivory py-14 sm:py-20" aria-label="Timeline">
        <div className="container-page">
          {categories.length > 1 && (
            <div className="sticky top-[72px] z-20 -mx-4 mb-12 border-b border-gold/20 bg-ivory/95 px-4 py-3 backdrop-blur-sm sm:mx-0 sm:rounded-full sm:border sm:px-3">
              <div role="group" aria-label="Filter by category" className="flex gap-2 overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:justify-center">
                {(['ALL', ...categories] as Filter[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={filter === c}
                    onClick={() => setFilter(c)}
                    className={cn(
                      'relative h-9 shrink-0 rounded-full px-4 text-sm transition-colors duration-300',
                      filter === c ? 'text-ivory' : 'text-navy hover:bg-navy/5',
                    )}
                  >
                    {filter === c && (
                      <motion.span
                        aria-hidden
                        layoutId="story-filter-pill"
                        className="absolute inset-0 rounded-full bg-navy"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      />
                    )}
                    <span className="relative">{c === 'ALL' ? 'All chapters' : CATEGORY_LABELS[c]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="sr-only" aria-live="polite">
            {timeline.data && `${shown.length} ${shown.length === 1 ? 'moment' : 'moments'} shown`}
          </p>

          {timeline.isPending && <TimelineSkeleton />}
          {timeline.isError && !timeline.data && <ErrorState error={timeline.error} onRetry={() => timeline.refetch()} title="We could not load the timeline" />}
          {timeline.data && entries.length === 0 && (
            <EmptyState title="The story is being written" description="The family is gathering the milestones. Please check back soon." />
          )}

          {shown.length > 0 && (
            <div className="relative mx-auto max-w-5xl">
              <ScrollLine className="absolute bottom-0 left-[8px] top-2 lg:left-1/2" />
              <ol className="relative" aria-label={filter === 'ALL' ? 'Life timeline' : `Life timeline: ${CATEGORY_LABELS[filter]}`}>
                <AnimatePresence initial={false}>
                  {shown.map((entry, i) => (
                    <TimelineItem
                      key={entry.id}
                      entry={entry}
                      index={i}
                      showDecade={i === 0 || Math.floor(shown[i - 1].year / 10) !== Math.floor(entry.year / 10)}
                    />
                  ))}
                </AnimatePresence>
              </ol>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
