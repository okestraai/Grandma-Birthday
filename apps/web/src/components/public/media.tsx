import { useState, type ImgHTMLAttributes, type SyntheticEvent } from 'react';
import type { PublicMedia } from '@birthday/types';
import { apiUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

export type MediaVariant = 'thumb' | 'medium' | 'original';

/** Best URL for a variant, falling back to larger ones (videos have no thumb/medium). */
export function mediaSrc(media: PublicMedia, variant: MediaVariant = 'medium'): string {
  const { thumb, medium, original } = media.urls;
  const path = variant === 'thumb' ? (thumb ?? medium ?? original) : variant === 'medium' ? (medium ?? original) : original;
  return apiUrl(path);
}

/** Intrinsic size for the requested variant, so the browser can reserve space before the image loads. */
export function mediaSize(media: PublicMedia, variant: MediaVariant): { width: number; height: number } {
  const w = media.width ?? 4;
  const h = media.height ?? 3;
  const max = variant === 'thumb' ? 400 : variant === 'medium' ? 1600 : Math.max(w, h);
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Pixel widths of the resized copies the API makes: thumb is 400 wide, medium fits in 1600x1600. */
function variantWidths(media: PublicMedia): { thumb: number; medium: number } {
  const w = media.width ?? 1600;
  const h = media.height ?? w;
  return { thumb: Math.min(400, w), medium: Math.round(w * Math.min(1, 1600 / Math.max(w, h))) };
}

/**
 * `srcset` offering the thumb and medium copies, so the browser picks by slot size and pixel
 * density. Undefined for videos, or when the image is too small for the copies to differ.
 */
export function mediaSrcSet(media: PublicMedia): string | undefined {
  const { thumb, medium } = media.urls;
  if (!thumb || !medium) return undefined;
  const widths = variantWidths(media);
  if (widths.thumb >= widths.medium) return undefined;
  return `${apiUrl(thumb)} ${widths.thumb}w, ${apiUrl(medium)} ${widths.medium}w`;
}

/** Slot widths assumed when a caller passes no `sizes`: grid tiles for thumbs, half or full width for medium. */
const DEFAULT_SIZES: Record<Exclude<MediaVariant, 'original'>, string> = {
  thumb: '(min-width: 1024px) 25vw, 50vw',
  medium: '(min-width: 1024px) 50vw, 100vw',
};

export function mediaAlt(media: PublicMedia, fallback = ''): string {
  return media.altText ?? media.caption ?? fallback;
}

const xmlEscape = (text: string) => text.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * A navy-to-emerald image with a faint gold label (the "70", or someone's initials), shown in
 * place of a photo that failed to load, for example while the API is down. It is an SVG data URL,
 * so it drops into the same <img> and keeps its box and object-fit.
 */
export function mediaPlaceholder(width: number, height: number, label = '70'): string {
  const size = Math.round(Math.min(width, height) * 0.34);
  const text = label
    ? `<text x='50%' y='50%' dy='0.35em' text-anchor='middle' font-family='Georgia, serif' font-size='${size}' fill='#d6b36a' fill-opacity='0.35'>${xmlEscape(label)}</text>`
    : '';
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}' preserveAspectRatio='xMidYMid slice'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#071a2b'/><stop offset='1' stop-color='#0b3d35'/></linearGradient></defs>` +
    `<rect width='100%' height='100%' fill='url(#g)'/>${text}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Swaps an <img> to the placeholder when its source fails. Keyed by the source, so a new image
 * gets a fresh try.
 */
export function useImageFallback(src: string, placeholder: () => string) {
  const [failed, setFailed] = useState<string | null>(null);
  const broken = failed === src;
  return {
    src: broken ? placeholder() : src,
    broken,
    onError: (event: SyntheticEvent<HTMLImageElement>) => {
      if (!broken && event.currentTarget.getAttribute('src') === src) setFailed(src);
    },
  };
}

type MediaImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'width' | 'height'> & {
  media: PublicMedia;
  variant?: MediaVariant;
  alt?: string;
  /** Load eagerly with high priority (hero images above the fold). */
  priority?: boolean;
  /** Text on the placeholder shown if the image fails to load, e.g. initials. Defaults to "70". */
  fallbackLabel?: string;
};

/**
 * An API image with dimensions, a thumb/medium `srcset`, lazy loading and async decoding.
 * Pass `sizes` when the slot is not a grid tile (thumb) or half/full width (medium).
 * Never use 'original' in grids.
 */
export function MediaImage({ media, variant = 'medium', alt, priority, className, sizes, fallbackLabel, onError, ...rest }: MediaImageProps) {
  const { width, height } = mediaSize(media, variant);
  const fallback = useImageFallback(mediaSrc(media, variant), () => mediaPlaceholder(width, height, fallbackLabel));
  const srcSet = variant === 'original' || fallback.broken ? undefined : mediaSrcSet(media);
  return (
    <img
      src={fallback.src}
      srcSet={srcSet}
      sizes={srcSet ? (sizes ?? DEFAULT_SIZES[variant as Exclude<MediaVariant, 'original'>]) : sizes}
      alt={alt ?? mediaAlt(media)}
      width={width}
      height={height}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : undefined}
      className={cn('bg-navy/5', className)}
      data-fallback={fallback.broken ? '' : undefined}
      {...rest}
      onError={(event) => {
        fallback.onError(event);
        onError?.(event);
      }}
    />
  );
}
