import { isChunkError, reloadForUpdate, reloadOnPreloadError, resetChunkReload, setReloadTarget } from './chunk-reload';

describe('isChunkError', () => {
  it('knows the browsers’ and Vite’s messages for missing page code', () => {
    for (const message of [
      'Failed to fetch dynamically imported module: https://x.test/assets/A-1.js',
      'Importing a module script failed.',
      'error loading dynamically imported module: https://x.test/assets/A-1.js',
      'Unable to preload CSS for /assets/A-1.css',
    ]) {
      expect(isChunkError(new TypeError(message))).toBe(true);
    }
    expect(isChunkError(new Error('Network request failed'))).toBe(false);
    expect(isChunkError('Failed to fetch dynamically imported module')).toBe(false);
  });
});

describe('vite:preloadError', () => {
  const realLocation = window.location;
  afterEach(() => Object.defineProperty(window, 'location', { configurable: true, value: realLocation }));

  it('reloads once and swallows the error, then lets later failures through', () => {
    sessionStorage.clear();
    resetChunkReload();
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, pathname: '/story', reload } });
    reloadOnPreloadError();

    const first = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    // The page came back on the same broken deploy: no second automatic reload.
    resetChunkReload();
    const second = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('goes to the page being navigated to, when there is one', () => {
    sessionStorage.clear();
    resetChunkReload();
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, pathname: '/', assign, reload: vi.fn() } });
    setReloadTarget(() => '/story');
    try {
      expect(reloadForUpdate()).toBe(true);
      expect(assign).toHaveBeenCalledWith('/story');
    } finally {
      setReloadTarget(() => null);
      resetChunkReload();
    }
  });
});
