import { baseMime, extensionFor, pickRecorderType, planRequests, shotFileName, shotProblem, shouldStopRecording } from './shot-rules';

const MB = 1024 * 1024;
const limits = {
  acceptedMimeTypes: ['image/jpeg', 'image/png', 'video/mp4', 'video/webm'],
  maxPhotoBytes: 1 * MB,
  maxVideoBytes: 10 * MB,
  videoUploadsEnabled: true,
};

describe('video auto-stop', () => {
  it('stops at 95% of the video limit', () => {
    expect(shouldStopRecording(9 * MB, 10 * MB)).toBe(false);
    expect(shouldStopRecording(9.5 * MB - 1, 10 * MB)).toBe(false);
    expect(shouldStopRecording(9.5 * MB, 10 * MB)).toBe(true);
    expect(shouldStopRecording(11 * MB, 10 * MB)).toBe(true);
  });

  it('never stops without a usable limit', () => {
    expect(shouldStopRecording(50 * MB, 0)).toBe(false);
    expect(shouldStopRecording(50 * MB, Number.NaN)).toBe(false);
  });
});

describe('recorder type', () => {
  it('prefers mp4, then webm', () => {
    expect(pickRecorderType((t) => t.startsWith('video/webm'))).toBe('video/webm;codecs=vp9,opus');
    expect(pickRecorderType((t) => t === 'video/mp4')).toBe('video/mp4');
    expect(pickRecorderType(() => false)).toBe('');
  });

  it('strips codecs and picks the right extension', () => {
    expect(baseMime('video/webm;codecs=vp9,opus')).toBe('video/webm');
    expect(extensionFor('video/mp4;codecs=avc1')).toBe('mp4');
    expect(extensionFor('video/webm')).toBe('webm');
    expect(shotFileName('image/jpeg', 1700000000000, 'ab-12cd-ef')).toBe('shot-1700000000000-ab12cd.jpg');
  });
});

describe('shot problems', () => {
  it('names the exact limit for an oversize photo', () => {
    expect(shotProblem({ type: 'image/jpeg', size: 2 * MB, kind: 'PHOTO' }, limits)).toBe('This photo is 2 MB. Photos can be at most 1 MB.');
    expect(shotProblem({ type: 'image/jpeg', size: MB, kind: 'PHOTO' }, limits)).toBeNull();
  });

  it('refuses unaccepted types and videos when videos are off', () => {
    expect(shotProblem({ type: 'image/heic', size: 10, kind: 'PHOTO' }, limits)).toMatch(/type of file/);
    expect(shotProblem({ type: 'video/mp4', size: 10, kind: 'VIDEO' }, { ...limits, videoUploadsEnabled: false })).toMatch(/only photos/);
    expect(shotProblem({ type: 'video/webm;codecs=vp9', size: 10, kind: 'VIDEO' }, limits)).toBeNull();
  });
});

describe('request planning', () => {
  it('groups photos under the per-request cap and sends videos one at a time', () => {
    const items = [
      ...Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, kind: 'PHOTO' as const })),
      { id: 'v1', kind: 'VIDEO' as const },
      { id: 'v2', kind: 'VIDEO' as const },
    ];
    expect(planRequests(items, 20).map((g) => g.map((i) => i.id).join(','))).toEqual(['p0,p1,p2,p3,p4', 'p5,p6', 'v1', 'v2']);
    expect(planRequests(items, 3).map((g) => g.length)).toEqual([3, 3, 1, 1, 1]);
  });
});
