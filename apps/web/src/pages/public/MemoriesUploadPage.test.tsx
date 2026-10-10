import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UploadPageConfig } from '@birthday/types';
import { jsonResponse, mockFetch, renderRoute } from '@/test/public-helpers';
import { ApiError, uploadWithProgress } from '@/lib/api';
import { createMemoryStore, type ShotStore } from '@/components/public/uploads/shot-store';
import { noteLatestBuild, startVersionCheck, stopVersionCheck } from '@/lib/version';
import MemoriesUploadPage from './MemoriesUploadPage';

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  uploadWithProgress: vi.fn(),
}));

const MB = 1024 * 1024;

const config: UploadPageConfig = {
  open: true,
  closedReason: null,
  eventName: 'A Celebration of Seventy Years',
  celebrantName: 'Dr. Margaret Adaeze Okonkwo',
  maxPhotoBytes: 1 * MB,
  maxVideoBytes: 10 * MB,
  videoUploadsEnabled: false,
  maxFilesPerUpload: 10,
  acceptedMimeTypes: ['image/jpeg', 'image/png'],
};

function renderPage(store: ShotStore = createMemoryStore()) {
  const openStore = async () => store;
  return renderRoute(<MemoriesUploadPage openStore={openStore} />, { path: '/memories/upload/:token', route: '/memories/upload/tok123' });
}

const realUA = navigator.userAgent;
function setUserAgent(ua: string, platform = 'Linux armv8l', touch = 5) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touch, configurable: true });
}

let urlCount = 0;
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => `blob:preview-${++urlCount}`);
  URL.revokeObjectURL = vi.fn();
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(uploadWithProgress).mockReset();
  setUserAgent(realUA, '', 0);
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
  delete (window as unknown as { ImageCapture?: unknown }).ImageCapture;
});

async function pick(container: HTMLElement, files: File[]) {
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'Capture the Celebration' });
  const input = container.querySelector('[data-testid="picker-input"]') as HTMLInputElement;
  await user.upload(input, files);
  await screen.findByRole('heading', { name: /My shots/ });
  return user;
}

describe('MemoriesUploadPage', () => {
  it('shows the closed state when uploads are closed', async () => {
    mockFetch({ '/api/uploads/tok123': () => jsonResponse({ ...config, open: false, closedReason: 'CLOSED_BY_ADMIN' }) });
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Uploads have closed' })).toBeInTheDocument();
    expect(screen.queryByText('Open camera')).not.toBeInTheDocument();
  });

  it('shows the album-full state', async () => {
    mockFetch({ '/api/uploads/tok123': () => jsonResponse({ ...config, open: false, closedReason: 'STORAGE_FULL' }) });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Our album is full' })).toBeInTheDocument();
  });

  it('shows a friendly message when the link is no longer active', async () => {
    mockFetch({
      '/api/uploads/tok123': () => jsonResponse({ success: false, statusCode: 404, code: 'UPLOAD_TOKEN_INVALID', message: 'Invalid token' }, 404),
    });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'This link is no longer active' })).toBeInTheDocument();
  });

  it('welcomes the guest with the three ways in and the privacy line', async () => {
    mockFetch({ '/api/uploads/tok123': () => jsonResponse(config) });
    renderPage();
    await screen.findByRole('heading', { name: 'Capture the Celebration' });
    expect(screen.getByRole('button', { name: /Open camera/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Use my phone’s camera app/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Choose from my photos/ })).toBeInTheDocument();
    expect(screen.getByText('Nothing is sent until you choose.')).toBeInTheDocument();
    expect(screen.getByText(/Want everything in your Photos\?/)).toBeInTheDocument();
  });

  it('sends only selected, unsent shots and maps the server’s reason to the right one', async () => {
    mockFetch({ '/api/uploads/tok123': () => jsonResponse(config) });
    vi.mocked(uploadWithProgress).mockImplementation(async (_path, form) => {
      const names = (form as FormData).getAll('files').map((f) => (f as File).name);
      return { accepted: names.length - 1, moderated: true, rejected: [{ filename: names[1], code: 'UNSUPPORTED_FILE_TYPE', reason: 'We couldn’t read this photo.' }] } as never;
    });
    const store = createMemoryStore();
    const { container } = renderPage(store);
    const user = await pick(container, [
      new File(['a'], 'one.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'two.jpg', { type: 'image/jpeg' }),
      new File(['c'], 'three.png', { type: 'image/png' }),
    ]);

    // Picked files arrive selected; leave the newest one out.
    expect(screen.getByRole('button', { name: 'Share selected (3)' })).toBeEnabled();
    await user.click(screen.getByRole('checkbox', { name: 'Select photo 1' }));
    await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Ada');
    await user.click(screen.getByRole('button', { name: 'Share selected (2)' }));

    await screen.findByRole('heading', { name: 'Thank you' });
    expect(screen.getByText(/1 memory received/)).toBeInTheDocument();
    expect(uploadWithProgress).toHaveBeenCalledTimes(1);
    const form = vi.mocked(uploadWithProgress).mock.calls[0][1];
    const sentNames = form.getAll('files').map((f) => (f as File).name);
    expect(sentNames).toHaveLength(2);
    expect(form.get('uploaderName')).toBe('Ada');

    const rows = await store.list('tok123');
    const byName = new Map(rows.map((r) => [r.name, r]));
    expect(byName.get(sentNames[0])).toMatchObject({ status: 'sent' });
    expect(byName.get(sentNames[1])).toMatchObject({ status: 'failed', error: 'We couldn’t read this photo.' });
    expect(rows.filter((r) => r.status === 'new')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /My shots/ }));
    expect(await screen.findByText(/Couldn’t send: We couldn’t read this photo\./)).toBeInTheDocument();
    expect(screen.getAllByText('Sent')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument();
  });

  it('offers the new version, but never while shots are sending', async () => {
    mockFetch({ '/api/uploads/tok123': () => jsonResponse(config) });
    let finish: (value: unknown) => void = () => {};
    vi.mocked(uploadWithProgress).mockImplementation(() => new Promise((resolve) => (finish = resolve)) as never);
    startVersionCheck('aaa');
    noteLatestBuild('bbb');
    try {
      const { container } = renderPage({ ...createMemoryStore(), persistent: true });
      const user = await pick(container, [new File(['a'], 'one.jpg', { type: 'image/jpeg' })]);
      expect(screen.getByText('A new version of the site is ready.')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Share selected (1)' }));
      await waitFor(() => expect(uploadWithProgress).toHaveBeenCalledTimes(1));
      expect(screen.queryByText('A new version of the site is ready.')).not.toBeInTheDocument();

      finish({ accepted: 1, moderated: false, rejected: [] });
      await screen.findByRole('heading', { name: 'Thank you' });
      expect(screen.getByText('A new version of the site is ready.')).toBeInTheDocument();
    } finally {
      stopVersionCheck();
    }
  });

  it('does not offer a reload when unsent shots are kept only in this page', async () => {
    mockFetch({ '/api/uploads/tok123': () => jsonResponse(config) });
    startVersionCheck('aaa');
    noteLatestBuild('bbb');
    try {
      const { container } = renderPage(createMemoryStore());
      await pick(container, [new File(['a'], 'one.jpg', { type: 'image/jpeg' })]);
      expect(screen.queryByText('A new version of the site is ready.')).not.toBeInTheDocument();
    } finally {
      stopVersionCheck();
    }
  });

  it('shows the exact limit on an oversize shot and never sends it', async () => {
    mockFetch({ '/api/uploads/tok123': () => jsonResponse(config) });
    const { container } = renderPage();
    await pick(container, [new File([new Uint8Array(2 * MB)], 'huge.jpg', { type: 'image/jpeg' })]);
    expect(screen.getByText(/This photo is 2 MB\. Photos can be at most 1 MB\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share selected (0)' })).toBeDisabled();
    expect(uploadWithProgress).not.toHaveBeenCalled();
  });

  it('shows the server’s message when a request fails and keeps the shots', async () => {
    mockFetch({ '/api/uploads/tok123': () => jsonResponse(config) });
    const message = 'You have shared a lot of photos in the last hour. Please try again a little later.';
    vi.mocked(uploadWithProgress).mockRejectedValueOnce(new ApiError(429, { code: 'RATE_LIMITED', message }));
    const { container } = renderPage();
    const user = await pick(container, [new File(['a'], 'one.jpg', { type: 'image/jpeg' })]);
    await user.click(screen.getByRole('button', { name: 'Share selected (1)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument();
  });

  it('shows the closed notice when uploads close mid-send', async () => {
    mockFetch({ '/api/uploads/tok123': () => jsonResponse(config) });
    vi.mocked(uploadWithProgress).mockRejectedValueOnce(new ApiError(403, { code: 'UPLOADS_CLOSED', message: 'Closed' }));
    const { container } = renderPage();
    const user = await pick(container, [new File(['a'], 'one.jpg', { type: 'image/jpeg' })]);
    await user.click(screen.getByRole('button', { name: 'Share selected (1)' }));
    expect(await screen.findByRole('heading', { name: 'Uploads have closed' })).toBeInTheDocument();
    expect(screen.getByText('Your shots are still saved on this phone.')).toBeInTheDocument();
  });

  it('keeps unsent shots across a reload', async () => {
    mockFetch({ '/api/uploads/tok123': () => jsonResponse(config) });
    const store = createMemoryStore();
    const first = renderPage(store);
    await pick(first.container, [new File(['a'], 'one.jpg', { type: 'image/jpeg' })]);
    first.unmount();
    renderPage(store);
    expect(await screen.findByRole('button', { name: /My shots \(1\)/ })).toBeInTheDocument();
  });

  it('deletes selected shots after confirming', async () => {
    mockFetch({ '/api/uploads/tok123': () => jsonResponse(config) });
    const store = createMemoryStore();
    const { container } = renderPage(store);
    const user = await pick(container, [new File(['a'], 'one.jpg', { type: 'image/jpeg' }), new File(['b'], 'two.jpg', { type: 'image/jpeg' })]);
    await user.click(screen.getByRole('button', { name: 'Delete selected (2)' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(async () => expect(await store.list('tok123')).toHaveLength(0));
    expect(screen.getByText('No shots yet.')).toBeInTheDocument();
  });

  it('shares the selection to the phone in one sheet and marks it saved', async () => {
    mockFetch({ '/api/uploads/tok123': () => jsonResponse(config) });
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { canShare: () => true, share });
    const store = createMemoryStore();
    const { container } = renderPage(store);
    const user = await pick(container, [new File(['a'], 'one.jpg', { type: 'image/jpeg' }), new File(['b'], 'two.jpg', { type: 'image/jpeg' })]);
    await user.click(screen.getByRole('button', { name: 'Save to my phone (2)' }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect((share.mock.calls[0][0].files as File[]).length).toBe(2);
    expect(await screen.findAllByText('Saved')).toHaveLength(2);
    expect((await store.list('tok123')).every((r) => r.savedToPhone)).toBe(true);
    delete (navigator as unknown as { canShare?: unknown }).canShare;
    delete (navigator as unknown as { share?: unknown }).share;
  });

  it('does nothing when the guest cancels the share sheet', async () => {
    mockFetch({ '/api/uploads/tok123': () => jsonResponse(config) });
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    Object.assign(navigator, { canShare: () => true, share });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const store = createMemoryStore();
    const { container } = renderPage(store);
    const user = await pick(container, [new File(['a'], 'one.jpg', { type: 'image/jpeg' })]);
    await user.click(screen.getByRole('button', { name: 'Save to my phone (1)' }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    expect(click).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect((await store.list('tok123'))[0].savedToPhone).toBeUndefined();
    delete (navigator as unknown as { canShare?: unknown }).canShare;
    delete (navigator as unknown as { share?: unknown }).share;
  });

  it('on iPhone shows the save-to-Photos banner and hides the keep-a-copy toggle', async () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', 'iPhone', 5);
    mockFetch({ '/api/uploads/tok123': () => jsonResponse(config) });
    const { container } = renderPage();
    await pick(container, [new File(['a'], 'one.jpg', { type: 'image/jpeg' })]);
    expect(screen.getByText(/Save these to your Photos: tap Save all, then ‘Save Images’/)).toBeInTheDocument();
    expect(screen.queryByText('Keep a copy on this phone')).not.toBeInTheDocument();
  });

  it('on Android shows the keep-a-copy toggle and no iPhone banner', async () => {
    setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130');
    mockFetch({ '/api/uploads/tok123': () => jsonResponse(config) });
    const { container } = renderPage();
    await pick(container, [new File(['a'], 'one.jpg', { type: 'image/jpeg' })]);
    expect(screen.getByText('Keep a copy on this phone')).toBeInTheDocument();
    expect(screen.queryByText(/Save these to your Photos/)).not.toBeInTheDocument();
  });

  describe('in-page camera', () => {
    it('offers the phone camera app and photo picker on an insecure link', async () => {
      Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
      mockFetch({ '/api/uploads/tok123': () => jsonResponse(config) });
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole('button', { name: /Open camera/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Camera' });
      expect(within(dialog).getByRole('alert')).toHaveTextContent('only works on a secure (https) link');
      expect(within(dialog).getByRole('button', { name: /Use my phone’s camera app/ })).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: /Choose from my photos/ })).toBeInTheDocument();
    });

    it('offers the fallbacks when camera permission is denied', async () => {
      Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')) },
        configurable: true,
      });
      mockFetch({ '/api/uploads/tok123': () => jsonResponse({ ...config, videoUploadsEnabled: true }) });
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole('button', { name: /Open camera/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Camera' });
      expect(await within(dialog).findByText(/Camera access is turned off/)).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Take photo' })).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Record video' })).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: /Choose from my photos/ })).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: /Try the camera again/ })).toBeInTheDocument();
    });

    it('on Android with keep-a-copy on, downloads each shot as it is taken', async () => {
      setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130');
      localStorage.setItem('party-shots:keep-copy:tok123', 'true');
      const track = { stop: vi.fn(), getCapabilities: () => ({}), getSettings: () => ({ width: 4000, height: 3000 }) };
      const stream = { getVideoTracks: () => [track], getAudioTracks: () => [], getTracks: () => [track] };
      Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
      Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn().mockResolvedValue(stream) }, configurable: true });
      (window as unknown as { ImageCapture: unknown }).ImageCapture = class {
        takePhoto() {
          return Promise.resolve(new Blob(['jpeg'], { type: 'image/jpeg' }));
        }
      };
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
      const downloads: string[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download);
      });
      mockFetch({ '/api/uploads/tok123': () => jsonResponse(config) });
      const store = createMemoryStore();
      const user = userEvent.setup();
      renderPage(store);
      await user.click(await screen.findByRole('button', { name: /Open camera/ }));
      const shutter = await screen.findByRole('button', { name: 'Take photo' });
      await waitFor(() => expect(shutter).toBeEnabled());
      await user.click(shutter);
      await waitFor(() => expect(downloads).toHaveLength(1));
      expect(downloads[0]).toMatch(/^celebration-\d{4}-\d{2}-\d{2}-1\.jpg$/);
      await waitFor(async () => expect(await store.list('tok123')).toHaveLength(1));
      expect((await store.list('tok123'))[0]).toMatchObject({ kind: 'PHOTO', savedToPhone: true, status: 'new' });
      expect(screen.getByRole('button', { name: 'My shots (1)' })).toBeInTheDocument();

      // Closing the camera stops the stream.
      await user.click(screen.getByRole('button', { name: 'Close camera' }));
      expect(track.stop).toHaveBeenCalled();
    });
  });
});
