import { Link } from 'react-router';
import { ArrowRight, Sparkle } from 'lucide-react';
import { SEO } from '@/components/seo/SEO';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { celebrantName, siteNameOf, useSite } from '@/lib/public-api';
import { formatEventDate, paragraphs } from '@/lib/utils';
import { MediaImage, mediaSrc } from '@/components/public/media';
import { Reveal } from '@/components/public/reveal';
import { Eyebrow, GoldRule, PageHero } from '@/components/public/section';
import { personJsonLd } from '@/components/public/jsonld';
import { SeventyWatermark } from '@/components/public/seventy';
import { CountUp, Parallax, SplitText, TiltCard } from '@/components/public/motion';

function AboutSkeleton() {
  return (
    <>
      <PageHero eyebrow="Biography" title={<Skeleton className="h-12 w-72 max-w-full bg-white/10" />} />
      <div className="container-page grid gap-12 py-16 lg:grid-cols-[0.8fr_1.2fr]" aria-busy="true">
        <Skeleton className="aspect-[4/5] w-full rounded-2xl" />
        <div className="space-y-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-4" style={{ width: `${90 - (i % 3) * 12}%` }} />
          ))}
        </div>
      </div>
    </>
  );
}

export default function AboutPage() {
  const { data: site, isError, error, refetch } = useSite();
  if (!site && !isError) return <AboutSkeleton />;
  if (!site) {
    return (
      <>
        <PageHero eyebrow="Biography" title="A life well lived" />
        <div className="container-page py-16">
          <ErrorState error={error} onRetry={() => refetch()} />
        </div>
      </>
    );
  }

  const { celebrant } = site;
  const name = celebrantName(celebrant);
  const bio = paragraphs(celebrant.biography);
  const birth = celebrant.birthDate ? formatEventDate(`${celebrant.birthDate}T12:00:00Z`, 'UTC', { weekday: undefined }) : null;
  const description = celebrant.introduction ?? bio[0] ?? `The life and legacy of ${name}.`;

  return (
    <>
      <SEO
        title={`About ${celebrant.preferredName}`}
        description={description.slice(0, 300)}
        image={celebrant.portrait ? mediaSrc(celebrant.portrait, 'medium') : null}
        type="profile"
        jsonLd={personJsonLd(celebrant)}
        siteName={siteNameOf(site)}
      />
      <PageHero eyebrow="Biography" title={name} description={celebrant.introduction ?? undefined} />

      <article className="bg-ivory">
        <div className="container-page grid gap-12 py-16 sm:py-24 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <aside className="lg:sticky lg:top-28 lg:self-start">
            {celebrant.portrait && (
              <Reveal as="figure" className="relative" x={-40} y={0} scale={0.96}>
                <div aria-hidden className="absolute -inset-3 rounded-[2rem] border border-gold/40" />
                <TiltCard className="rounded-[1.6rem]" max={6}>
                  <div className="overflow-hidden rounded-[1.6rem] shadow-lift">
                    <Parallax offset={20} className="scale-110">
                      <MediaImage
                        media={celebrant.portrait}
                        variant="medium"
                        priority
                        alt={celebrant.portrait.altText ?? `Portrait of ${name}`}
                        className="aspect-[4/5] w-full object-cover"
                      />
                    </Parallax>
                  </div>
                </TiltCard>
                {celebrant.portrait.caption && <figcaption className="mt-5 text-center text-xs text-muted">{celebrant.portrait.caption}</figcaption>}
              </Reveal>
            )}
            {(birth || celebrant.birthPlace || celebrant.age) && (
              <Reveal delay={0.1} className="mt-10 rounded-2xl border border-gold/30 bg-white p-6 shadow-soft">
                <h2 className="text-[11px] font-medium uppercase tracking-[0.3em] text-gold-rich">Important dates</h2>
                <dl className="mt-4 divide-y divide-navy/10 text-[15px]">
                  {birth && (
                    <div className="flex justify-between gap-4 py-3">
                      <dt className="text-muted">Born</dt>
                      <dd className="text-right text-navy">
                        <time dateTime={celebrant.birthDate!}>{birth}</time>
                      </dd>
                    </div>
                  )}
                  {celebrant.birthPlace && (
                    <div className="flex justify-between gap-4 py-3">
                      <dt className="text-muted">Birthplace</dt>
                      <dd className="text-right text-navy">{celebrant.birthPlace}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-4 py-3">
                    <dt className="text-muted">Celebrating</dt>
                    <dd className="text-right text-navy">
                      <time dateTime={site.event.startsAt}>{formatEventDate(site.event.startsAt, site.event.timezone)}</time>
                    </dd>
                  </div>
                  {celebrant.age != null && (
                    <div className="flex items-baseline justify-between gap-4 py-3">
                      <dt className="text-muted">Years</dt>
                      <dd className="font-display text-3xl lining-nums text-gold-rich">
                        <CountUp value={celebrant.age} />
                      </dd>
                    </div>
                  )}
                </dl>
              </Reveal>
            )}
          </aside>

          <div>
            <Reveal>
              <Eyebrow>A life in full</Eyebrow>
            </Reveal>
            {bio.length > 0 ? (
              <div className="mt-6 space-y-6 text-[15px] leading-[1.85] text-charcoal sm:text-base">
                {bio.map((p, i) => (
                  <Reveal key={i} delay={Math.min(i, 3) * 0.05}>
                    <p className={i === 0 ? 'first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:font-display first-letter:text-6xl first-letter:leading-[0.8] first-letter:text-gold-rich' : undefined}>{p}</p>
                  </Reveal>
                ))}
              </div>
            ) : (
              <p className="mt-6 text-[15px] text-muted">The family is still writing this chapter. Please check back soon.</p>
            )}

            {celebrant.quote && (
              <Reveal as="figure" className="relative my-16 overflow-hidden rounded-[1.75rem] bg-navy px-8 py-12 text-center text-ivory sm:px-14">
                <div aria-hidden className="absolute inset-0 -z-0 bg-luxury opacity-80" />
                <Parallax offset={40} className="absolute -right-6 -top-12">
                  <SeventyWatermark className="block text-[12rem] opacity-[0.08]" />
                </Parallax>
                <div className="relative">
                  <span aria-hidden className="block font-display text-6xl leading-[0.5] text-gold">“</span>
                  <blockquote className="mt-5 font-display text-xl italic leading-relaxed sm:text-2xl">
                    <SplitText text={celebrant.quote} trigger="view" stagger={0.04} delay={0.2} />
                  </blockquote>
                  {celebrant.quoteAttribution && <figcaption className="mt-5 text-xs uppercase tracking-[0.25em] text-gold">{celebrant.quoteAttribution}</figcaption>}
                </div>
              </Reveal>
            )}

            {celebrant.achievements.length > 0 && (
              <section aria-labelledby="achievements-heading" className="mt-16">
                <Reveal>
                  <h2 id="achievements-heading" className="font-display text-3xl text-navy">Achievements</h2>
                  <GoldRule align="left" className="mt-4" />
                </Reveal>
                <ul className="mt-8 grid gap-4 sm:grid-cols-2">
                  {celebrant.achievements.map((a, i) => (
                    <Reveal as="li" key={i} delay={Math.min(i, 5) * 0.07} x={i % 2 === 0 ? -32 : 32} y={0}>
                      <TiltCard className="h-full rounded-xl" max={6}>
                        <div className="flex h-full gap-3 rounded-xl border border-gold/25 bg-white p-5 text-[15px] leading-relaxed text-charcoal shadow-soft">
                          <Sparkle className="mt-1 size-4 shrink-0 text-gold-rich" aria-hidden />
                          <span>{a}</span>
                        </div>
                      </TiltCard>
                    </Reveal>
                  ))}
                </ul>
              </section>
            )}

            {celebrant.values.length > 0 && (
              <section aria-labelledby="values-heading" className="mt-16">
                <Reveal>
                  <h2 id="values-heading" className="font-display text-3xl text-navy">What {celebrant.preferredName} holds dear</h2>
                  <GoldRule align="left" className="mt-4" />
                </Reveal>
                <ul className="mt-8 flex flex-wrap gap-3">
                  {celebrant.values.map((v, i) => (
                    <Reveal as="li" key={i} delay={Math.min(i, 6) * 0.06} y={12} scale={0.7} className="rounded-full border border-gold/50 bg-cream px-5 py-2.5 font-display text-lg italic text-emerald-deep transition-colors duration-300 hover:border-gold hover:bg-champagne">
                      {v}
                    </Reveal>
                  ))}
                </ul>
              </section>
            )}

            <Reveal className="mt-16 flex flex-col gap-4 border-t border-gold/25 pt-8 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-display text-xl text-navy">Walk through the years</p>
              <Link to="/story" className="group inline-flex items-center gap-2 text-sm font-medium text-emerald hover:text-navy">
                Explore the life story
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </Link>
            </Reveal>
          </div>
        </div>
      </article>
    </>
  );
}
