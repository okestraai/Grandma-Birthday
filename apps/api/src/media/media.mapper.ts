import type { AdminMedia, MediaUrls, PublicMedia } from '@birthday/types';
import type { Media, Prisma } from '../generated/prisma/client';

export type MediaVariant = 'thumb' | 'medium' | 'original';

/** Changes whenever the row changes, so a URL carrying it can be cached for good. */
export function mediaVersion(media: Pick<Media, 'updatedAt'>): string {
  return media.updatedAt.getTime().toString(36);
}

export function mediaUrls(media: Pick<Media, 'id' | 'thumbKey' | 'mediumKey' | 'updatedAt'>): MediaUrls {
  const base = `/api/media/${media.id}`;
  const v = `?v=${mediaVersion(media)}`;
  return {
    thumb: media.thumbKey ? `${base}/thumb${v}` : null,
    medium: media.mediumKey ? `${base}/medium${v}` : null,
    original: `${base}/original${v}`,
  };
}

/** Only the columns the public mapping reads. Use it when including media for public output. */
export const PUBLIC_MEDIA_SELECT = {
  id: true,
  kind: true,
  mimeType: true,
  width: true,
  height: true,
  caption: true,
  altText: true,
  thumbKey: true,
  mediumKey: true,
  status: true,
  updatedAt: true,
} satisfies Prisma.MediaSelect;

export type PublicMediaRow = Prisma.MediaGetPayload<{ select: typeof PUBLIC_MEDIA_SELECT }>;

type PublicFields = Pick<Media, 'id' | 'kind' | 'mimeType' | 'width' | 'height' | 'caption' | 'altText' | 'thumbKey' | 'mediumKey' | 'updatedAt'>;

export function toPublicMedia(media: PublicFields): PublicMedia {
  return {
    id: media.id,
    kind: media.kind,
    mimeType: media.mimeType,
    width: media.width,
    height: media.height,
    caption: media.caption,
    altText: media.altText,
    urls: mediaUrls(media),
  };
}

/** Only approved media may appear on public pages. */
export function publicMediaOrNull(media: (PublicFields & { status: Media['status'] }) | null | undefined): PublicMedia | null {
  return media && media.status === 'APPROVED' ? toPublicMedia(media) : null;
}

export type AdminMediaRow = Media & {
  album: { title: string } | null;
  uploadedBy: { name: string } | null;
};

export const ADMIN_MEDIA_INCLUDE = {
  album: { select: { title: true } },
  uploadedBy: { select: { name: true } },
} as const;

export function toAdminMedia(media: AdminMediaRow): AdminMedia {
  return {
    ...toPublicMedia(media),
    source: media.source,
    status: media.status,
    originalFilename: media.originalFilename,
    sizeBytes: Number(media.sizeBytes),
    storedBytes: Number(media.storedBytes),
    albumId: media.albumId,
    albumTitle: media.album?.title ?? null,
    sortOrder: media.sortOrder,
    uploaderName: media.uploaderName,
    uploaderMessage: media.uploaderMessage,
    uploadedByName: media.uploadedBy?.name ?? null,
    reviewedAt: media.reviewedAt?.toISOString() ?? null,
    createdAt: media.createdAt.toISOString(),
  };
}
