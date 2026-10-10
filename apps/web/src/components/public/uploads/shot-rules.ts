import type { UploadPageConfig } from '@birthday/types';
import { formatSize } from '@/lib/utils';
import { BATCH_SIZE, toBatches } from './upload-batches';

export type ShotKind = 'PHOTO' | 'VIDEO';

/** Recorder types in order of preference. MP4 plays everywhere, including iPhone Photos. */
export const RECORDER_TYPES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'] as const;

/** The first recorder type the browser supports, or '' to let the browser choose. */
export function pickRecorderType(isSupported: (type: string) => boolean): string {
  return RECORDER_TYPES.find((t) => {
    try {
      return isSupported(t);
    } catch {
      return false;
    }
  }) ?? '';
}

/** "video/webm;codecs=vp9,opus" -> "video/webm". */
export function baseMime(type: string): string {
  return type.split(';')[0].trim().toLowerCase();
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

export function extensionFor(type: string, fallbackName = ''): string {
  const known = EXTENSIONS[baseMime(type)];
  if (known) return known;
  const fromName = /\.([a-z0-9]{1,5})$/i.exec(fallbackName)?.[1];
  return fromName ? fromName.toLowerCase() : type.startsWith('video/') ? 'mp4' : 'jpg';
}

export function kindOf(type: string): ShotKind {
  return type.startsWith('video/') ? 'VIDEO' : 'PHOTO';
}

/** A filename that is unique per shot, so the server's per-file answers map back to one item. */
export function shotFileName(type: string, createdAt: number, id: string, originalName = ''): string {
  const suffix = id.replace(/[^a-z0-9]/gi, '').slice(0, 6);
  return `shot-${createdAt}-${suffix}.${extensionFor(type, originalName)}`;
}

/** Stop a recording at this share of the video limit so the file still fits after the last chunk. */
export const RECORDING_STOP_RATIO = 0.95;

/** True once the recorded bytes reach the point where the video would soon exceed the limit. */
export function shouldStopRecording(recordedBytes: number, maxVideoBytes: number, ratio = RECORDING_STOP_RATIO): boolean {
  if (!Number.isFinite(maxVideoBytes) || maxVideoBytes <= 0) return false;
  return recordedBytes >= maxVideoBytes * ratio;
}

type Limits = Pick<UploadPageConfig, 'acceptedMimeTypes' | 'maxPhotoBytes' | 'maxVideoBytes' | 'videoUploadsEnabled'>;

/** Why a shot can't be sent, in the guest's words, or null when it can. */
export function shotProblem(shot: { type: string; size: number; kind: ShotKind }, limits: Limits): string | null {
  if (shot.kind === 'VIDEO' && !limits.videoUploadsEnabled) return 'Videos can’t be sent here, only photos.';
  const type = baseMime(shot.type);
  if (type && !limits.acceptedMimeTypes.map(baseMime).includes(type)) return 'This type of file can’t be sent.';
  const limit = shot.kind === 'VIDEO' ? limits.maxVideoBytes : limits.maxPhotoBytes;
  if (shot.size > limit) {
    const noun = shot.kind === 'VIDEO' ? 'video' : 'photo';
    return `This ${noun} is ${formatSize(shot.size)}. ${shot.kind === 'VIDEO' ? 'Videos' : 'Photos'} can be at most ${formatSize(limit)}.`;
  }
  return null;
}

/**
 * Request groups for sending: photos together (up to the batch size and the server's per-request cap),
 * videos one per request so the progress bar means something.
 */
export function planRequests<T extends { kind: ShotKind }>(items: T[], maxFilesPerUpload: number): T[][] {
  const size = Math.max(1, Math.min(BATCH_SIZE, maxFilesPerUpload || BATCH_SIZE));
  const photos = items.filter((i) => i.kind !== 'VIDEO');
  const videos = items.filter((i) => i.kind === 'VIDEO');
  return [...toBatches(photos, size), ...videos.map((v) => [v])];
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
