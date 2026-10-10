import type { UploadResult } from '@birthday/types';

export const BATCH_SIZE = 5;

/** Splits files into request-sized batches so progress and partial failures stay manageable. */
export function toBatches<T>(items: T[], size = BATCH_SIZE): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

export function mergeResults(a: UploadResult, b: UploadResult): UploadResult {
  return {
    accepted: a.accepted + b.accepted,
    rejected: [...a.rejected, ...b.rejected],
    moderated: a.moderated || b.moderated,
  };
}

export const EMPTY_RESULT: UploadResult = { accepted: 0, rejected: [], moderated: false };

/** Overall percentage across every batch, weighted by bytes. */
export function overallPercent(doneBytes: number, currentLoaded: number, totalBytes: number): number {
  if (totalBytes <= 0) return 0;
  return Math.min(100, Math.round(((doneBytes + currentLoaded) / totalBytes) * 100));
}
