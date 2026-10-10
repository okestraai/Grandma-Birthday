import { Link } from 'react-router';
import { ArrowUpRight, Images } from 'lucide-react';
import type { AlbumSummary } from '@birthday/types';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { MediaImage } from '../media';

/** "1 item" / "24 items". Albums can mix photos and videos, and the summary does not say which. */
export function itemCountLabel(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? 'item' : 'items'}`;
}

/**
 * An album on the gallery index: portrait cover with a fine gold inner frame,
 * slow zoom on hover, then title, description and count.
 * `feature` widens the card to two columns on large screens.
 */
export function AlbumCard({ album, feature = false, priority = false }: { album: AlbumSummary; feature?: boolean; priority?: boolean }) {
  return (
    <article className="group relative">
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl bg-navy shadow-soft transition-shadow duration-700 ease-luxe group-hover:shadow-lift',
          feature ? 'aspect-[4/5] lg:aspect-[16/11]' : 'aspect-[4/5]',
        )}
      >
        {album.cover ? (
          <MediaImage
            media={album.cover}
            variant={feature ? 'medium' : 'thumb'}
            alt=""
            priority={priority}
            className="absolute inset-0 size-full object-cover transition-transform duration-[1600ms] ease-luxe group-hover:scale-[1.08] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div aria-hidden className="absolute inset-0 flex items-center justify-center bg-luxury">
            <Images className="size-10 text-gold/60" strokeWidth={1.2} />
          </div>
        )}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-navy/45 via-transparent to-transparent" />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-3 rounded-xl border border-gold/30 transition-colors duration-700 ease-luxe group-hover:border-gold/60"
        />
        <span
          aria-hidden
          className="absolute bottom-5 left-5 rounded-full bg-navy/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-ivory backdrop-blur-sm"
        >
          {itemCountLabel(album.mediaCount)}
        </span>
      </div>

      <div className="mt-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className={cn('font-display leading-snug text-navy', feature ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl')}>
            <Link
              to={`/gallery/${encodeURIComponent(album.slug)}`}
              className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-gold focus-visible:after:ring-offset-4 focus-visible:after:ring-offset-ivory"
            >
              {album.title}
            </Link>
          </h2>
          {album.description && (
            <p className="mt-2 line-clamp-2 text-[15px] leading-relaxed text-muted">{album.description}</p>
          )}
          <p className="sr-only">{itemCountLabel(album.mediaCount)}</p>
        </div>
        <ArrowUpRight
          aria-hidden
          className="mt-1.5 size-5 shrink-0 text-gold-rich transition-transform duration-500 ease-luxe group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        />
      </div>
    </article>
  );
}

export function AlbumCardSkeleton({ feature = false }: { feature?: boolean }) {
  return (
    <div className={cn(feature && 'lg:col-span-2')}>
      <Skeleton className={cn('rounded-2xl', feature ? 'aspect-[4/5] lg:aspect-[16/11]' : 'aspect-[4/5]')} />
      <Skeleton className="mt-5 h-6 w-2/3" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-4/5" />
    </div>
  );
}
