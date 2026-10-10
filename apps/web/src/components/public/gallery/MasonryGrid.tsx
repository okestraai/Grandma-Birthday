import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { ImageIcon, Play } from 'lucide-react';
import type { PublicMedia } from '@birthday/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MediaImage, mediaAlt } from '../media';
import { EASE } from '../reveal';
import { onView } from '../motion';

/** The shared-layout id that links a tile's picture to the same picture in the lightbox. */
export const tileLayoutId = (id: string) => `gallery-media-${id}`;

/** Accessible name for a tile or slide, e.g. "Open photo 3 of 40: Cutting the cake". */
export function mediaLabel(media: PublicMedia, position: number, total: number): string {
  const verb = media.kind === 'VIDEO' ? 'Play video' : 'Open photo';
  const text = mediaAlt(media).trim();
  return `${verb} ${position} of ${total}${text ? `: ${text}` : ''}`;
}

/** CSS aspect-ratio for a media item; videos without dimensions default to 16/9. */
export function mediaAspect(media: PublicMedia): string {
  if (media.width && media.height) return `${media.width} / ${media.height}`;
  return media.kind === 'VIDEO' ? '16 / 9' : '4 / 3';
}

const TILE_ATTR = 'data-gallery-index';

/** The tile button for an index, so the lightbox can return focus to it. */
export function findTile(index: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${TILE_ATTR}="${index}"]`);
}

function Tile({
  media,
  index,
  total,
  onOpen,
  shared,
}: {
  media: PublicMedia;
  index: number;
  total: number;
  onOpen: (index: number) => void;
  /** This tile's picture is about to grow into the lightbox. */
  shared: boolean;
}) {
  const caption = media.caption?.trim();
  const isVideo = media.kind === 'VIDEO';
  const hasPreview = Boolean(media.urls.thumb ?? media.urls.medium);

  return (
    <motion.li
      className="mb-3 break-inside-avoid"
      {...onView({ opacity: 0, y: 36, scale: 0.94 }, { opacity: 1, y: 0, scale: 1 }, { margin: '0px 0px -8% 0px' })}
      // Pages load 20+ at a time: stagger within a small window so late tiles are not slow.
      transition={{ duration: 0.8, ease: EASE, delay: (index % 8) * 0.06 }}
    >
      <button
        type="button"
        {...{ [TILE_ATTR]: index }}
        aria-label={mediaLabel(media, index + 1, total)}
        onClick={() => onOpen(index)}
        className="group relative block w-full overflow-hidden rounded-xl bg-navy/5 text-left shadow-soft outline-none transition-shadow duration-500 ease-luxe hover:shadow-lift focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ivory"
      >
        {!isVideo && hasPreview ? (
          <motion.span className="block" layoutId={shared ? tileLayoutId(media.id) : undefined}>
            <MediaImage
              media={media}
              variant="thumb"
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              alt={mediaAlt(media)}
              className="block h-auto w-full transition-transform duration-[1400ms] ease-luxe group-hover:scale-[1.07] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            />
          </motion.span>
        ) : (
          <span
            aria-hidden
            style={{ aspectRatio: mediaAspect(media) }}
            className="flex w-full flex-col items-center justify-center gap-3 bg-luxury p-4 text-center"
          >
            {isVideo ? (
              <span className="flex size-14 items-center justify-center rounded-full border border-gold/50 bg-navy/40 text-gold transition-transform duration-700 ease-luxe group-hover:scale-105">
                <Play className="ml-0.5 size-5" fill="currentColor" />
              </span>
            ) : (
              <ImageIcon className="size-7 text-gold/60" strokeWidth={1.3} />
            )}
            {isVideo && caption && <span className="line-clamp-2 max-w-[90%] text-xs leading-snug text-ivory/80">{caption}</span>}
            {isVideo && !caption && <span className="text-[11px] uppercase tracking-[0.25em] text-ivory/60">Film</span>}
          </span>
        )}
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-gold/0 transition duration-500 group-hover:ring-gold/40 group-focus-visible:ring-gold/40" />
        {caption && !isVideo && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 hidden bg-gradient-to-t from-navy/85 via-navy/40 to-transparent px-3 pb-3 pt-10 text-xs leading-snug text-ivory opacity-0 transition-opacity duration-500 ease-luxe group-hover:opacity-100 group-focus-visible:opacity-100 sm:block"
          >
            <span className="line-clamp-2">{caption}</span>
          </span>
        )}
      </button>
    </motion.li>
  );
}

/**
 * Masonry of media tiles using CSS columns. Tiles reserve their space from the
 * media's width/height, so nothing shifts as thumbs load. An IntersectionObserver
 * sentinel loads the next page; a "Load more" button is the fallback.
 */
export function MasonryGrid({
  items,
  total,
  onOpen,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  label,
  sharedId = null,
}: {
  items: PublicMedia[];
  total: number;
  onOpen: (index: number) => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  label: string;
  /** Id of the item opening in the lightbox, for the shared zoom. */
  sharedId?: string | null;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const latest = useRef({ hasNextPage, isFetchingNextPage, fetchNextPage });
  useEffect(() => {
    latest.current = { hasNextPage, isFetchingNextPage, fetchNextPage };
  });

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const { hasNextPage: more, isFetchingNextPage: busy, fetchNextPage: next } = latest.current;
        if (entries.some((entry) => entry.isIntersecting) && more && !busy) next();
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, items.length]);

  const shownTotal = Math.max(total, items.length);

  return (
    <div>
      <ul aria-label={label} className="columns-2 gap-3 sm:columns-3 lg:columns-4">
        {items.map((media, index) => (
          <Tile key={media.id} media={media} index={index} total={shownTotal} onOpen={onOpen} shared={media.id === sharedId} />
        ))}
      </ul>

      <div ref={sentinel} aria-hidden className="h-px" />

      <div className="mt-10 flex flex-col items-center gap-4">
        <p role="status" aria-live="polite" className="text-sm text-muted">
          {isFetchingNextPage ? 'Loading…' : `Showing ${items.length.toLocaleString()} of ${shownTotal.toLocaleString()}`}
        </p>
        {hasNextPage && (
          <Button variant="outline" className="text-navy" loading={isFetchingNextPage} onClick={() => fetchNextPage()}>
            Load more
          </Button>
        )}
      </div>
    </div>
  );
}

const SKELETON_RATIOS = ['4 / 5', '3 / 2', '1 / 1', '4 / 3', '2 / 3', '3 / 4', '16 / 9', '4 / 5'];

export function MasonrySkeleton({ count = 12 }: { count?: number }) {
  return (
    <div aria-hidden className="columns-2 gap-3 sm:columns-3 lg:columns-4">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="mb-3 w-full break-inside-avoid rounded-xl" style={{ aspectRatio: SKELETON_RATIOS[i % SKELETON_RATIOS.length] }} />
      ))}
    </div>
  );
}
