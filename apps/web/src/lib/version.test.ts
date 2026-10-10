import { createMemoryRouter } from 'react-router';
import { checkOnNavigation, dismissUpdate, getVersionState, noteLatestBuild, startVersionCheck, stopVersionCheck, watchNavigation } from './version';

const MIN = 60_000;
let visibility: DocumentVisibilityState = 'visible';
let fetchMock: ReturnType<typeof vi.fn>;

function serve(buildId: string) {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ buildId, builtAt: '2026-10-05T00:00:00.000Z' })));
}

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  sessionStorage.clear();
});
afterEach(() => {
  stopVersionCheck();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('version check', () => {
  it('shows nothing when the deployed build is this one', async () => {
    serve('aaa');
    startVersionCheck('aaa');
    await vi.advanceTimersByTimeAsync(29_000);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/^\/version\.json\?t=\d+$/);
    expect(init).toMatchObject({ cache: 'no-store' });
    expect(getVersionState().available).toBe(false);
  });

  it('flags a new version when the ids differ, then keeps checking every 5 minutes', async () => {
    serve('bbb');
    startVersionCheck('aaa');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(getVersionState()).toMatchObject({ available: true, latestId: 'bbb', dismissed: false });
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('backs off after failures (5, 10, 20, then 30 minutes) and never flags anything', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    startVersionCheck('aaa');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const expectNextAfter = async (minutes: number, calls: number) => {
      await vi.advanceTimersByTimeAsync(minutes * MIN - 1);
      expect(fetchMock).toHaveBeenCalledTimes(calls - 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(calls);
    };
    await expectNextAfter(5, 2);
    await expectNextAfter(10, 3);
    await expectNextAfter(20, 4);
    await expectNextAfter(30, 5);
    await expectNextAfter(30, 6);
    expect(getVersionState().available).toBe(false);

    // A success resets the interval to 5 minutes.
    serve('aaa');
    await vi.advanceTimersByTimeAsync(30 * MIN);
    await expectNextAfter(5, 8);
  });

  it('gives up on a request after 5 seconds', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
    startVersionCheck('aaa');
    await vi.advanceTimersByTimeAsync(30_000 + 5_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });

  it('pauses while the tab is hidden and checks when it is shown again', async () => {
    serve('bbb');
    startVersionCheck('aaa');
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(20 * MIN);
    expect(fetchMock).not.toHaveBeenCalled();

    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getVersionState().available).toBe(true);

    // Shown again within a minute: no extra check.
    setVisibility('hidden');
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('checks when the browser comes back online, at most once a minute', async () => {
    serve('aaa');
    startVersionCheck('aaa');
    await vi.advanceTimersByTimeAsync(30_000);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MIN);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('checks on page changes at most once a minute, and not before the first check', async () => {
    serve('aaa');
    startVersionCheck('aaa');
    checkOnNavigation();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    checkOnNavigation();
    await vi.advanceTimersByTimeAsync(59_000);
    checkOnNavigation();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    checkOnNavigation();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    checkOnNavigation();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('"Later" hides the notice for that build only, for the rest of the visit', () => {
    startVersionCheck('aaa');
    noteLatestBuild('bbb');
    dismissUpdate();
    expect(getVersionState()).toMatchObject({ available: true, latestId: 'bbb', dismissed: true });
    expect(sessionStorage.getItem('bp:update-dismissed')).toBe('bbb');

    // Same visit, page reloaded on the old build: still dismissed for bbb.
    startVersionCheck('aaa');
    noteLatestBuild('bbb');
    expect(getVersionState().dismissed).toBe(true);

    // An even newer build brings it back.
    noteLatestBuild('ccc');
    expect(getVersionState()).toMatchObject({ available: true, latestId: 'ccc', dismissed: false });
  });
});

describe('watchNavigation', () => {
  const routes = [{ path: '/', element: null }, { path: '/story', element: null }, { path: '/memories/upload/:token', element: null }, { path: '/admin/*', element: null }];

  function setup(initial: string) {
    vi.useRealTimers();
    const router = createMemoryRouter(routes, { initialEntries: [initial] });
    const go = { assign: vi.fn(), replace: vi.fn(), reload: vi.fn() };
    const unsubscribe = watchNavigation(router, go);
    return { router, go, unsubscribe };
  }

  it('navigates inside the app while no new version is known', async () => {
    const { router, go } = setup('/');
    await router.navigate('/story');
    expect(router.state.location.pathname).toBe('/story');
    expect(go.assign).not.toHaveBeenCalled();
  });

  it('loads the next page in full once a new version is known', async () => {
    const { router, go } = setup('/');
    startVersionCheck('aaa');
    noteLatestBuild('bbb');

    await router.navigate('/story?x=1#top');
    expect(go.assign).toHaveBeenCalledWith('/story?x=1#top');
    expect(router.state.location.pathname).toBe('/');
  });

  it('uses replace for replace navigations, and keeps same-page changes in the app', async () => {
    const { router, go } = setup('/admin/guests');
    startVersionCheck('aaa');
    noteLatestBuild('bbb');

    await router.navigate('?page=2');
    expect(router.state.location.search).toBe('?page=2');
    expect(go.assign).not.toHaveBeenCalled();

    await router.navigate({ pathname: '/admin/login' }, { replace: true });
    expect(go.replace).toHaveBeenCalledWith('/admin/login');
  });

  it('reloads on back/forward once a new version is known', async () => {
    const { router, go } = setup('/');
    await router.navigate('/story');
    startVersionCheck('aaa');
    noteLatestBuild('bbb');
    await router.navigate(-1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(go.reload).toHaveBeenCalledTimes(1);
  });

  it('never reloads from the party camera page', async () => {
    const { router, go } = setup('/memories/upload/tok');
    startVersionCheck('aaa');
    noteLatestBuild('bbb');
    await router.navigate('/');
    expect(router.state.location.pathname).toBe('/');
    expect(go.assign).not.toHaveBeenCalled();
    expect(go.reload).not.toHaveBeenCalled();
  });
});
