import { request } from './api';

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('refresh on 401', () => {
  it('refreshes once for several requests that fail together, and retries each', async () => {
    let session = 'old';
    let refreshes = 0;
    let release!: () => void;
    const refreshed = new Promise<void>((resolve) => (release = resolve));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/auth/refresh')) {
          refreshes += 1;
          await refreshed;
          session = 'new';
          return json(200);
        }
        return session === 'new' ? json(200, { url }) : json(401);
      }),
    );

    const calls = ['/a', '/b', '/c'].map((path) => request<{ url: string }>('GET', path));
    await new Promise((r) => setTimeout(r, 0));
    release();
    const results = await Promise.all(calls);
    expect(refreshes).toBe(1);
    expect(results.map((r) => r.url)).toEqual(['/api/a', '/api/b', '/api/c']);
  });

  it('retries without another refresh when the 401 arrives after a refresh already finished', async () => {
    let session = 'old';
    let refreshes = 0;
    let slowAttempts = 0;
    let releaseSlow!: () => void;
    const slow = new Promise<void>((resolve) => (releaseSlow = resolve));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/auth/refresh')) {
          refreshes += 1;
          session = 'new';
          return json(200);
        }
        if (url.endsWith('/slow')) {
          // The first attempt was sent with the old token and answers after the refresh is done.
          slowAttempts += 1;
          if (slowAttempts > 1) return json(200, { url });
          await slow;
          return json(401);
        }
        return session === 'new' ? json(200, { url }) : json(401);
      }),
    );

    const slowCall = request<{ url: string }>('GET', '/slow');
    await request('GET', '/fast');
    releaseSlow();
    expect((await slowCall).url).toBe('/api/slow');
    expect(slowAttempts).toBe(2);
    expect(refreshes).toBe(1);
  });
});
