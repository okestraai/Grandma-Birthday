import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useReducedMotion } from 'motion/react';
import { ArrowLeft, Images } from 'lucide-react';
import { SEO } from '@/components/seo/SEO';
import { PageHero } from '@/components/public/section';
import { itemCountLabel } from '@/components/public/gallery/AlbumCard';
import { MasonryGrid, MasonrySkeleton, findTile } from '@/components/public/gallery/MasonryGrid';
import { Lightbox } from '@/components/public/gallery/Lightbox';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { isApiError } from '@/lib/api';
import { siteNameOf, useAlbum, useAlbumMedia, useSite } from '@/lib/public-api';

function BackToGallery() {
  return (
    <Link
      to="/gallery"
      className="inline-flex items-center gap-2 rounded-sm outline-none transition-colors hover:text-ivory focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-4 focus-visible:ring-offset-navy"
    >
      <ArrowLeft aria-hidden className="size-3.5" />
      Gallery
    </Link>
  );
}

export default function AlbumPage() {
  const { album: slug = '' } = useParams();
  const { data: site } = useSite();
  const album = useAlbum(slug);
  const media = useAlbumMedia(slug);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // The item whose tile grows into the viewer. It is marked one frame before the viewer
  // opens, so the tile is measured as the starting point of the shared zoom.
  const [sharedId, setSharedId] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  const items = useMemo(() => media.data?.pages.flatMap((page) => page.items) ?? [], [media.data]);
  const total = media.data?.pages[0]?.total ?? album.data?.mediaCount ?? items.length;
  const siteName = siteNameOf(site);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = media;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const openAt = useCallback(
    (index: number) => {
      const item = items[index];
      if (reduceMotion || !item || item.kind !== 'PHOTO') {
        setOpenIndex(index);
        return;
      }
      setSharedId(item.id);
      requestAnimationFrame(() => setOpenIndex(index));
    },
    [items, reduceMotion],
  );

  const notFound = album.isError && isApiError(album.error) && (album.error.status === 404 || album.error.code === 'NOT_FOUND');

  if (notFound) {
    return (
      <>
        <SEO title="Album not found" description="This album could not be found." siteName={siteName} noindex />
        <PageHero eyebrow={<BackToGallery />} title="Album not found" description="This album may have been renamed or removed." />
        <section className="bg-ivory py-14 sm:py-20">
          <div className="container-page">
            <EmptyState
              icon={<Images className="size-7" />}
              title="We could not find that album"
              description="Browse the full gallery to find the photographs you are looking for."
              action={
                <Button asChild variant="primary">
                  <Link to="/gallery">Back to the gallery</Link>
                </Button>
              }
            />
          </div>
        </section>
      </>
    );
  }

  const data = album.data;

  return (
    <>
      {data ? (
        <SEO
          title={data.title}
          description={data.description ?? `Photographs and films from ${data.title}.`}
          image={data.cover?.urls.medium ?? null}
          siteName={siteName}
        />
      ) : (
        <SEO title="Gallery" siteName={siteName} />
      )}

      <PageHero
        eyebrow={<BackToGallery />}
        title={
          data ? (
            data.title
          ) : album.isError ? (
            'Album'
          ) : (
            <>
              <span className="sr-only">Loading album</span>
              <span aria-hidden className="block h-12 w-3/4 max-w-md animate-pulse rounded-lg bg-ivory/10 sm:h-14" />
            </>
          )
        }
        description={data?.description ?? undefined}
      >
        {data && (
          <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.3em] text-gold">{itemCountLabel(total)}</p>
        )}
      </PageHero>

      <section aria-label="Photographs and films" className="bg-ivory py-10 sm:py-16">
        <div className="container-page">
          {album.isError && !data ? (
            <ErrorState error={album.error} onRetry={() => void album.refetch()} title="We could not load this album" />
          ) : media.isPending ? (
            <div role="status" aria-label="Loading photographs">
              <MasonrySkeleton />
            </div>
          ) : media.isError && items.length === 0 ? (
            <ErrorState error={media.error} onRetry={() => void media.refetch()} title="We could not load the photographs" />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Images className="size-7" />}
              title="No photographs here yet"
              description="This album is still being filled. Please check back soon."
              action={
                <Button asChild variant="outline" className="text-navy">
                  <Link to="/gallery">Browse other albums</Link>
                </Button>
              }
            />
          ) : (
            <>
              <MasonryGrid
                items={items}
                total={total}
                onOpen={openAt}
                sharedId={sharedId}
                hasNextPage={Boolean(hasNextPage)}
                isFetchingNextPage={isFetchingNextPage}
                fetchNextPage={loadMore}
                label={data ? `${data.title}: photographs and films` : 'Photographs and films'}
              />
              {media.isFetchNextPageError && (
                <ErrorState className="mt-8" error={media.error} onRetry={loadMore} title="We could not load more photographs" />
              )}
            </>
          )}
        </div>
      </section>

      <Lightbox
        items={items}
        index={openIndex}
        total={total}
        onIndexChange={setOpenIndex}
        onOpenChange={(open) => {
          if (!open) {
            setOpenIndex(null);
            // Let the tile take the picture back before it drops the shared id.
            const closing = sharedId;
            window.setTimeout(() => setSharedId((id) => (id === closing ? null : id)), 900);
          }
        }}
        sharedId={sharedId}
        hasMore={Boolean(hasNextPage)}
        onNeedMore={loadMore}
        title={data?.title}
        getReturnFocus={findTile}
      />
    </>
  );
}
