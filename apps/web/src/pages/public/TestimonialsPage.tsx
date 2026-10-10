import { SEO } from '@/components/seo/SEO';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { siteNameOf, useSite, useTestimonials } from '@/lib/public-api';
import { PageHero, SectionHeading } from '@/components/public/section';
import { Reveal } from '@/components/public/reveal';
import { Magnetic, TiltCard } from '@/components/public/motion';
import { FeaturedTestimonial, TestimonialCard } from '@/components/public/testimonials/TestimonialCard';
import { TestimonialForm } from '@/components/public/testimonials/TestimonialForm';

function WallSkeleton() {
  return (
    <div className="columns-1 gap-5 sm:columns-2 lg:columns-3" aria-busy="true" aria-label="Loading tributes">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="mb-5 break-inside-avoid rounded-2xl border border-gold/20 bg-white p-6">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-11/12" />
          {i % 2 === 0 && <Skeleton className="mt-2 h-4 w-4/5" />}
          <div className="mt-6 flex items-center gap-3">
            <Skeleton className="size-11 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TestimonialsPage() {
  const { data: site, isError: siteFailed, error: siteError, refetch: refetchSite } = useSite();
  const testimonials = useTestimonials(12);
  const all = testimonials.data?.pages.flatMap((p) => p.items) ?? [];
  const featured = all.find((t) => t.isFeatured) ?? null;
  const rest = featured ? all.filter((t) => t.id !== featured.id) : all;
  const total = testimonials.data?.pages[0]?.total ?? 0;
  const features = site?.features;
  const name = site?.celebrant.preferredName;

  return (
    <>
      <SEO
        title="Tributes"
        description={name ? `Birthday messages and tributes for ${name} from family and friends. Leave your own message.` : 'Birthday messages and tributes from family and friends.'}
        siteName={siteNameOf(site)}
      />
      <PageHero
        eyebrow="Tributes"
        title="Words from the heart"
        description={name ? `Messages of love, gratitude and celebration for ${name}, from the people whose lives have been touched along the way.` : 'Messages of love, gratitude and celebration.'}
      >
        {features?.testimonialsOpen && (
          <Magnetic className="mt-8 inline-flex">
            <a href="#leave-message" className="inline-flex h-11 items-center rounded-full bg-gold px-6 text-sm font-semibold text-navy shadow-soft transition-shadow hover:shadow-gold">
              Leave a birthday message
            </a>
          </Magnetic>
        )}
      </PageHero>

      {featured && (
        <section aria-label="Featured tribute" className="relative isolate overflow-hidden bg-emerald-deep py-16 text-ivory sm:py-24">
          <div aria-hidden className="absolute inset-0 -z-10 bg-luxury opacity-60" />
          <div className="container-page">
            <Reveal scale={0.94}>
              <FeaturedTestimonial t={featured} />
            </Reveal>
          </div>
        </section>
      )}

      <section aria-labelledby="wall-heading" className="bg-ivory py-16 sm:py-24">
        <div className="container-page">
          <h2 id="wall-heading" className="sr-only">
            All tributes
          </h2>
          {testimonials.isPending && <WallSkeleton />}
          {testimonials.isError && !testimonials.data && <ErrorState error={testimonials.error} onRetry={() => testimonials.refetch()} title="We could not load the tributes" />}
          {testimonials.data && all.length === 0 && (
            <EmptyState
              title="Be the first to leave a message"
              description="Tributes appear here after the family has read them."
              action={
                features?.testimonialsOpen ? (
                  <a href="#leave-message" className="text-sm font-medium text-emerald underline underline-offset-4">
                    Write a message
                  </a>
                ) : undefined
              }
            />
          )}
          {rest.length > 0 && (
            <ul className="columns-1 gap-5 sm:columns-2 lg:columns-3">
              {rest.map((t, i) => (
                <Reveal as="li" key={t.id} delay={(i % 3) * 0.08} y={40} scale={0.96} className="mb-5 break-inside-avoid">
                  <TiltCard className="rounded-2xl" max={4} lift={1}>
                    <TestimonialCard t={t} />
                  </TiltCard>
                </Reveal>
              ))}
            </ul>
          )}
          {testimonials.hasNextPage && (
            <div className="mt-10 flex flex-col items-center gap-2">
              <Button variant="outline" className="text-navy" loading={testimonials.isFetchingNextPage} onClick={() => testimonials.fetchNextPage()}>
                Load more tributes
              </Button>
              <p className="text-xs text-muted" aria-live="polite">
                Showing {all.length} of {total}
              </p>
            </div>
          )}
          {testimonials.isFetchNextPageError && <p role="alert" className="mt-4 text-center text-sm text-error">We could not load more tributes. Please try again.</p>}
        </div>
      </section>

      <section id="leave-message" aria-labelledby="leave-message-heading" className="scroll-mt-20 bg-cream py-16 sm:py-24">
        <div className="container-page">
          <div className="mx-auto max-w-2xl">
            <SectionHeading
              eyebrow="Your message"
              id="leave-message-heading"
              title="Leave a birthday message"
              description={name ? `Share a memory, a blessing or a simple word of love for ${name}.` : 'Share a memory, a blessing or a simple word of love.'}
            />
            <div className="mt-10">
              {!site ? (
                siteFailed ? (
                  <ErrorState error={siteError} onRetry={() => refetchSite()} title="We could not load the message form" />
                ) : (
                  <Skeleton className="h-96 rounded-2xl" />
                )
              ) : features?.testimonialsOpen ? (
                <TestimonialForm allowPhotos={features.testimonialsAllowPhotos} allowVideos={features.testimonialsAllowVideos} celebrantFirstName={name} />
              ) : (
                <EmptyState title="The message book is closed" description="Thank you for thinking of the family. New messages are not being accepted at the moment." />
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
