import { isIOS, keepCopyName, saveShotsToPhone, shareableCount, type SaveItem } from './save-to-phone';

function item(id: string): SaveItem {
  return { id, blob: new Blob([id], { type: 'image/jpeg' }), name: `${id}.jpg`, type: 'image/jpeg', url: `blob:${id}` };
}

afterEach(() => vi.restoreAllMocks());

describe('save to phone', () => {
  it('shares all selected files in one sheet and reports them saved', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const out = await saveShotsToPhone([item('a'), item('b')], { canShare: () => true, share });
    expect(share).toHaveBeenCalledTimes(1);
    const files = share.mock.calls[0][0].files as File[];
    expect(files.map((f) => f.name)).toEqual(['a.jpg', 'b.jpg']);
    expect(out).toEqual({ savedIds: ['a', 'b'], remainingIds: [], cancelled: false });
  });

  it('treats a cancelled share sheet as nothing saved, not an error', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    const out = await saveShotsToPhone([item('a')], { canShare: () => true, share });
    expect(out).toEqual({ savedIds: [], remainingIds: ['a'], cancelled: true });
    expect(click).not.toHaveBeenCalled();
  });

  it('shares the largest group the sheet accepts and leaves the rest for the next tap', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = (d: ShareData) => (d.files?.length ?? 0) <= 2;
    const out = await saveShotsToPhone([item('a'), item('b'), item('c'), item('d'), item('e')], { canShare, share });
    expect(out.savedIds).toEqual(['a', 'b']);
    expect(out.remainingIds).toEqual(['c', 'd', 'e']);
    expect(shareableCount([new File(['x'], 'x')], () => false)).toBe(0);
  });

  it('downloads when files can’t be shared', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const out = await saveShotsToPhone([item('a'), item('b')], {});
    expect(click).toHaveBeenCalledTimes(2);
    expect(out.savedIds).toEqual(['a', 'b']);
  });

  it('detects iPhone and iPad', () => {
    expect(isIOS({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 })).toBe(true);
    expect(isIOS({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isIOS({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
    expect(isIOS({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', platform: 'Linux armv8l', maxTouchPoints: 5 })).toBe(false);
    // Emulated Android on a Mac keeps the Mac platform string; the user agent wins.
    expect(isIOS({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(false);
  });

  it('names kept copies by date and number', () => {
    expect(keepCopyName('image/jpeg', 3, new Date(2026, 8, 26))).toBe('celebration-2026-09-26-3.jpg');
    expect(keepCopyName('video/webm', 1, new Date(2026, 8, 26))).toBe('celebration-2026-09-26-1.webm');
  });
});
