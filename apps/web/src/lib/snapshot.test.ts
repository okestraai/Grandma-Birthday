import { QueryClient } from '@tanstack/react-query';
import {
  SNAPSHOT_MAX_AGE_MS,
  SNAPSHOT_MAX_BYTES,
  SNAPSHOT_STORAGE_KEY,
  buildSnapshot,
  isSnapshotKey,
  newestPerKey,
  parseSnapshot,
  persistPublicQueries,
  readInjectedSnapshot,
  readStoredSnapshot,
  restorePublicSnapshot,
  seedQueryClient,
  writeSnapshot,
} from './snapshot';

const NOW = Date.now();

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function injected(json: string) {
  const script = document.createElement('script');
  script.type = 'application/json';
  script.id = 'bp-snapshot';
  script.textContent = json;
  document.body.appendChild(script);
}

afterEach(() => {
  window.localStorage.clear();
  document.getElementById('bp-snapshot')?.remove();
  vi.useRealTimers();
});

describe('isSnapshotKey', () => {
  it('allows whole-site public data only', () => {
    for (const key of [['public', 'site'], ['public', 'timeline'], ['public', 'family'], ['public', 'albums'], ['public', 'album', 'x'], ['public', 'album', 'x', 'media'], ['public', 'programme'], ['public', 'testimonials', 12]]) {
      expect(isSnapshotKey(key)).toBe(true);
    }
    for (const key of [['public', 'rsvp', 'form'], ['public', 'rsvp', 'invite', 't'], ['public', 'invitation', 't'], ['public', 'uploads', 't'], ['admin', 'site'], ['auth', 'me']]) {
      expect(isSnapshotKey(key)).toBe(false);
    }
  });
});

describe('parseSnapshot', () => {
  it('drops malformed, disallowed and old entries', () => {
    const text = JSON.stringify({
      v: 1,
      entries: [
        { key: ['public', 'site'], data: { ok: 1 }, updatedAt: NOW - 1000 },
        { key: ['public', 'invitation', 'secret'], data: { name: 'Ada' }, updatedAt: NOW },
        { key: ['admin', 'guests'], data: [], updatedAt: NOW },
        { key: ['public', 'timeline'], data: [], updatedAt: NOW - SNAPSHOT_MAX_AGE_MS - 1 },
        { key: 'public', data: 1, updatedAt: NOW },
        { key: ['public', 'family'], updatedAt: NOW },
      ],
    });
    expect(parseSnapshot(text, NOW)).toEqual([{ key: ['public', 'site'], data: { ok: 1 }, updatedAt: NOW - 1000 }]);
  });

  it('ignores junk and other versions', () => {
    expect(parseSnapshot('not json')).toEqual([]);
    expect(parseSnapshot(JSON.stringify({ v: 2, entries: [] }))).toEqual([]);
    expect(parseSnapshot(null)).toEqual([]);
  });

  it('reads the snapshot the web server injects, including escaped "<"', () => {
    injected(JSON.stringify({ v: 1, entries: [{ key: ['public', 'site'], data: { t: '</script><b>' }, updatedAt: NOW }] }).replace(/</g, '\\u003c'));
    expect(readInjectedSnapshot(NOW)).toEqual([{ key: ['public', 'site'], data: { t: '</script><b>' }, updatedAt: NOW }]);
  });
});

describe('newestPerKey', () => {
  it('keeps the most recently fetched copy of each query', () => {
    const older = { key: ['public', 'site'], data: 'old', updatedAt: 1 };
    const newer = { key: ['public', 'site'], data: 'new', updatedAt: 2 };
    const other = { key: ['public', 'albums'], data: [], updatedAt: 1 };
    expect(newestPerKey([newer, other], [older])).toEqual([newer, other]);
    expect(newestPerKey([older], [newer])).toEqual([newer]);
  });
});

describe('seeding', () => {
  it('seeds with the saved time and marks the data stale', () => {
    const qc = client();
    const seeded = seedQueryClient(qc, [
      { key: ['public', 'site'], data: { name: 'saved' }, updatedAt: NOW - 5000 },
      { key: ['public', 'uploads', 't'], data: { secret: true }, updatedAt: NOW },
    ]);
    expect(seeded).toBe(1);
    const state = qc.getQueryState(['public', 'site']);
    expect(qc.getQueryData(['public', 'site'])).toEqual({ name: 'saved' });
    expect(state?.dataUpdatedAt).toBe(NOW - 5000);
    expect(state?.isInvalidated).toBe(true);
    expect(qc.getQueryData(['public', 'uploads', 't'])).toBeUndefined();
  });

  it('prefers whichever of localStorage and the injected snapshot is newer, per query', () => {
    window.localStorage.setItem(
      SNAPSHOT_STORAGE_KEY,
      JSON.stringify({
        v: 1,
        entries: [
          { key: ['public', 'site'], data: 'stored-site', updatedAt: NOW - 100 },
          { key: ['public', 'albums'], data: 'stored-albums', updatedAt: NOW - 10_000 },
        ],
      }),
    );
    injected(
      JSON.stringify({
        v: 1,
        entries: [
          { key: ['public', 'site'], data: 'server-site', updatedAt: NOW - 10_000 },
          { key: ['public', 'albums'], data: 'server-albums', updatedAt: NOW - 100 },
        ],
      }),
    );
    const qc = client();
    restorePublicSnapshot(qc, '/');
    expect(qc.getQueryData(['public', 'site'])).toBe('stored-site');
    expect(qc.getQueryData(['public', 'albums'])).toBe('server-albums');
  });

  it('does nothing on admin pages', () => {
    injected(JSON.stringify({ v: 1, entries: [{ key: ['public', 'site'], data: 'x', updatedAt: NOW }] }));
    const qc = client();
    restorePublicSnapshot(qc, '/admin/guests');
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
  });
});

describe('persisting', () => {
  it('saves successful public queries only, with infinite queries cut to their first page', () => {
    const qc = client();
    qc.setQueryData(['public', 'site'], { name: 'live' });
    qc.setQueryData(['public', 'testimonials', 12], { pages: [{ items: [1] }, { items: [2] }], pageParams: [1, 2] });
    qc.setQueryData(['public', 'invitation', 'tok'], { guest: 'Ada' });
    qc.setQueryData(['public', 'rsvp', 'form'], { questions: [] });
    qc.setQueryData(['admin', 'guests'], [{ name: 'Ada' }]);

    const snapshot = buildSnapshot(qc, []);
    const keys = snapshot.entries.map((e) => e.key);
    expect(keys).toEqual([['public', 'site'], ['public', 'testimonials', 12]]);
    expect(snapshot.entries[1].data).toEqual({ pages: [{ items: [1] }], pageParams: [1] });
  });

  it('keeps earlier saved entries that are not in the cache any more', () => {
    const qc = client();
    qc.setQueryData(['public', 'site'], 'live');
    const snapshot = buildSnapshot(qc, [{ key: ['public', 'family'], data: 'saved', updatedAt: NOW - 1 }]);
    expect(snapshot.entries.map((e) => e.key)).toEqual([['public', 'family'], ['public', 'site']]);
  });

  it('skips writing a snapshot that is too large', () => {
    expect(writeSnapshot({ v: 1, entries: [{ key: ['public', 'site'], data: 'x'.repeat(SNAPSHOT_MAX_BYTES), updatedAt: NOW }] })).toBe(false);
    expect(window.localStorage.getItem(SNAPSHOT_STORAGE_KEY)).toBeNull();
  });

  it('survives storage that throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(writeSnapshot({ v: 1, entries: [] })).toBe(false);
    spy.mockRestore();
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(readStoredSnapshot()).toEqual([]);
    get.mockRestore();
  });

  it('writes after a successful fetch, throttled', async () => {
    vi.useFakeTimers();
    const qc = client();
    const stop = persistPublicQueries(qc, 1000);
    await qc.fetchQuery({ queryKey: ['public', 'site'], queryFn: async () => ({ name: 'fetched' }) });
    await qc.fetchQuery({ queryKey: ['public', 'albums'], queryFn: async () => [] });
    await qc.fetchQuery({ queryKey: ['public', 'invitation', 'tok'], queryFn: async () => ({ guest: 'Ada' }) });
    expect(window.localStorage.getItem(SNAPSHOT_STORAGE_KEY)).toBeNull();
    vi.advanceTimersByTime(1000);
    const saved = readStoredSnapshot();
    expect(saved.map((e) => e.key)).toEqual([['public', 'site'], ['public', 'albums']]);
    stop();
  });
});
