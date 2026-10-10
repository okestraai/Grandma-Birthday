import { Images } from 'lucide-react';
import { SEO } from '@/components/seo/SEO';
import { PageHero } from '@/components/public/section';
import { Reveal } from '@/components/public/reveal';
import { TiltCard } from '@/components/public/motion';
import { AlbumCard, AlbumCardSkeleton } from '@/components/public/gallery/AlbumCard';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { siteNameOf, useAlbums, useSite } from '@/lib/public-api';

const DECADES = ['', 'one decade', 'two decades', 'three decades', 'four decades', 'five decades', 'six decades', 'seven decades', 'eight decades', 'nine decades', 'ten decades'];

export default function GalleryPage() {
  const { data: site } = useSite();
  const age = site?.celebrant.age ?? 70;
  const span = DECADES[Math.floor(age / 10)] || 'a lifetime';
  const albums = useAlbums();
  const list = albums.data ?? [];
  const featureFirst = list.length >= 2;

  return (
    <>
      <SEO
        title="Gallery"
        description={`Photographs and films gathered from across ${span}, and from the celebration itself.`}
        image={list[0]?.cover?.urls.medium ?? null}
        siteName={siteNameOf(site)}
      />

      <PageHero
        eyebrow="Gallery"
        title={`Moments across ${span}`}
        description="Albums of family, friendship and milestones. Choose an album to browse its photographs and films."
      />

      <section aria-label="Albums" className="bg-ivory py-14 sm:py-20">
        <div className="container-page">
          {albums.isPending ? (
            <div role="status" aria-label="Loading albums" className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              <AlbumCardSkeleton feature />
              {Array.from({ length: 4 }, (_, i) => (
                <AlbumCardSkeleton key={i} />
              ))}
            </div>
          ) : albums.isError && !albums.data ? (
            <ErrorState error={albums.error} onRetry={() => void albums.refetch()} title="We could not load the gallery" />
          ) : list.length === 0 ? (
            <EmptyState
              icon={<Images className="size-7" />}
              title="The gallery is being prepared"
              description="Photographs will appear here soon. Please check back closer to the celebration."
            />
          ) : (
            <ul className="grid items-start gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((album, i) => {
                const feature = featureFirst && i === 0;
                return (
                  <Reveal as="li" key={album.id} delay={Math.min(i, 5) * 0.1} y={48} scale={0.94} className={feature ? 'lg:col-span-2' : undefined}>
                    <TiltCard className="rounded-2xl" max={feature ? 5 : 8}>
                      <AlbumCard album={album} feature={feature} priority={i < 2} />
                    </TiltCard>
                  </Reveal>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
