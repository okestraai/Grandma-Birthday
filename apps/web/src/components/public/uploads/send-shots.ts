import type { UploadPageConfig, UploadResult } from '@birthday/types';
import { ApiError, errorMessage, isApiError, isServerUnreachable } from '@/lib/api';
import { formatSize } from '@/lib/utils';
import { planRequests, type ShotKind } from './shot-rules';
import type { ShotPatch } from './shot-store';

export type StopKind = 'closed' | 'invalid' | 'quota';

export interface SendableShot {
  id: string;
  blob: Blob;
  name: string;
  kind: ShotKind;
  size: number;
}

export interface SendOptions {
  shots: SendableShot[];
  config: Pick<UploadPageConfig, 'maxFilesPerUpload' | 'maxPhotoBytes' | 'maxVideoBytes' | 'videoUploadsEnabled'>;
  uploaderName?: string;
  message?: string;
  upload: (form: FormData, onProgress: (percent: number) => void, signal?: AbortSignal) => Promise<UploadResult>;
  /** Per-shot progress while its request is in flight. */
  onProgress?: (ids: string[], percent: number, overall: number) => void;
  /** Called once per shot with its final state for this run. */
  onShotDone: (id: string, patch: ShotPatch) => void;
  signal?: AbortSignal;
  retries?: number;
  retryDelayMs?: number;
}

export interface SendOutcome {
  accepted: number;
  moderated: boolean;
  /** Sending can't continue on this link. */
  stop?: StopKind;
  /** A problem that a retry may fix; already worded for the guest. */
  error?: string;
}

function stopKindOf(err: unknown): StopKind | null {
  const code = err instanceof ApiError ? err.code : null;
  if (code === 'UPLOADS_CLOSED') return 'closed';
  if (code === 'UPLOAD_TOKEN_INVALID' || (isApiError(err) && err.status === 404)) return 'invalid';
  if (code === 'STORAGE_QUOTA_EXCEEDED') return 'quota';
  return null;
}

function friendlyError(err: unknown, config: SendOptions['config']): string {
  if (err instanceof DOMException && err.name === 'AbortError') return 'Sending stopped. Your shots are still here.';
  if (err instanceof TypeError) return 'The connection dropped. Your shots are still saved. Tap Retry.';
  if (isServerUnreachable(err)) return 'We couldn’t reach the server. Your shots are still saved on this phone. Tap Retry in a moment.';
  if (isApiError(err) && err.status === 413 && err.code === 'INTERNAL_ERROR') {
    // A proxy refused the request before the API saw it, so there is no message from the server.
    return `One of your shots is too big. Photos can be up to ${formatSize(config.maxPhotoBytes)}${config.videoUploadsEnabled ? ` and videos up to ${formatSize(config.maxVideoBytes)}` : ''}.`;
  }
  // FILE_TOO_LARGE, RATE_LIMITED and the rest carry a precise message from the server.
  return errorMessage(err);
}

/**
 * Sends shots in request-sized groups (videos alone), maps the server's per-file answers back to each shot
 * by filename, and stops at the first request that fails.
 */
export async function sendShots(opts: SendOptions): Promise<SendOutcome> {
  const { shots, config, upload, onShotDone, signal } = opts;
  const retries = opts.retries ?? 2;
  const retryDelay = opts.retryDelayMs ?? 1000;
  const requests = planRequests(shots, config.maxFilesPerUpload);
  const totalBytes = shots.reduce((sum, s) => sum + s.size, 0) || 1;
  let doneBytes = 0;
  const outcome: SendOutcome = { accepted: 0, moderated: false };

  for (const group of requests) {
    const form = new FormData();
    for (const shot of group) form.append('files', shot.blob, shot.name);
    if (opts.uploaderName?.trim()) form.set('uploaderName', opts.uploaderName.trim());
    if (opts.message?.trim()) form.set('message', opts.message.trim());
    const ids = group.map((s) => s.id);
    const groupBytes = group.reduce((sum, s) => sum + s.size, 0);
    opts.onProgress?.(ids, 0, Math.round((doneBytes / totalBytes) * 100));

    let result: UploadResult;
    try {
      let attempt = 0;
      for (;;) {
        try {
          result = await upload(
            form,
            (p) => opts.onProgress?.(ids, p, Math.min(100, Math.round(((doneBytes + (p / 100) * groupBytes) / totalBytes) * 100))),
            signal,
          );
          break;
        } catch (err) {
          if (err instanceof TypeError && attempt < retries && !signal?.aborted) {
            attempt += 1;
            await new Promise((r) => setTimeout(r, retryDelay * attempt));
            continue;
          }
          throw err;
        }
      }
    } catch (err) {
      const stop = stopKindOf(err);
      if (stop) return { ...outcome, stop };
      const error = friendlyError(err, config);
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      // Leave cancelled shots as they were; mark the others so the guest sees what went wrong.
      if (!aborted) for (const id of ids) onShotDone(id, { status: 'failed', error });
      return { ...outcome, error };
    }

    const reasons = new Map(result.rejected.map((r) => [r.filename, r.reason]));
    for (const shot of group) {
      const reason = reasons.get(shot.name);
      onShotDone(shot.id, reason ? { status: 'failed', error: reason } : { status: 'sent', error: undefined });
    }
    outcome.accepted += result.accepted;
    outcome.moderated ||= result.moderated;
    doneBytes += groupBytes;
    if (result.rejected.some((r) => r.code === 'STORAGE_QUOTA_EXCEEDED')) return { ...outcome, stop: 'quota' };
  }
  return outcome;
}
