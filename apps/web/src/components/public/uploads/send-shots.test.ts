import type { UploadResult } from '@birthday/types';
import { ApiError } from '@/lib/api';
import { sendShots, type SendableShot } from './send-shots';
import type { ShotPatch } from './shot-store';

const config = { maxFilesPerUpload: 10, maxPhotoBytes: 1024 * 1024, maxVideoBytes: 10 * 1024 * 1024, videoUploadsEnabled: true };

function shot(id: string, kind: 'PHOTO' | 'VIDEO' = 'PHOTO'): SendableShot {
  const blob = new Blob([id], { type: kind === 'VIDEO' ? 'video/mp4' : 'image/jpeg' });
  return { id, blob, name: `shot-${id}.${kind === 'VIDEO' ? 'mp4' : 'jpg'}`, kind, size: blob.size };
}

describe('sendShots', () => {
  it('sends videos one per request and maps rejections by filename', async () => {
    const requests: string[][] = [];
    const upload = vi.fn(async (form: FormData): Promise<UploadResult> => {
      const names = form.getAll('files').map((f) => (f as File).name);
      requests.push(names);
      const rejected = names.includes('shot-b.jpg') ? [{ filename: 'shot-b.jpg', code: 'FILE_TOO_LARGE' as const, reason: 'Too big' }] : [];
      return { accepted: names.length - rejected.length, rejected, moderated: false };
    });
    const done = new Map<string, ShotPatch>();
    const out = await sendShots({ shots: [shot('a'), shot('v', 'VIDEO'), shot('b')], config, upload, onShotDone: (id, p) => done.set(id, p) });
    expect(requests).toEqual([['shot-a.jpg', 'shot-b.jpg'], ['shot-v.mp4']]);
    expect(done.get('a')).toMatchObject({ status: 'sent' });
    expect(done.get('b')).toEqual({ status: 'failed', error: 'Too big' });
    expect(done.get('v')).toMatchObject({ status: 'sent' });
    expect(out).toEqual({ accepted: 2, moderated: false });
  });

  it('retries a dropped connection, then reports it kindly', async () => {
    const upload = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const done = new Map<string, ShotPatch>();
    const out = await sendShots({ shots: [shot('a')], config, upload, onShotDone: (id, p) => done.set(id, p), retryDelayMs: 0 });
    expect(upload).toHaveBeenCalledTimes(3);
    expect(out.error).toMatch(/connection dropped/);
    expect(done.get('a')).toMatchObject({ status: 'failed' });
  });

  it('stops on closed uploads without marking shots failed', async () => {
    const upload = vi.fn().mockRejectedValue(new ApiError(403, { code: 'UPLOADS_CLOSED', message: 'Closed' }));
    const onShotDone = vi.fn();
    expect(await sendShots({ shots: [shot('a')], config, upload, onShotDone })).toMatchObject({ stop: 'closed' });
    expect(onShotDone).not.toHaveBeenCalled();
  });
});
