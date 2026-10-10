// Runs under the web tests (jsdom environment); the store only needs fetch, URL and the file system.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSnapshotStore, injectSnapshot, snapshotScript, SNAPSHOT_SOURCES, wantsSnapshot } from './snapshot.mjs';

const API = new URL('http://api.test');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fake API answering every snapshot source, with a body that names the path. */
function fakeApi(overrides = {}) {
  return vi.fn(async (url) => {
    const path = `${url.pathname}${url.search}`;
    if (overrides[path]) return overrides[path]();
    if (path.startsWith('/api/testimonials/public')) return json({ items: [{ id: 't1' }], page: 1, totalPages: 1, total: 1 });
    return json({ from: path });
  });
}

let dir;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bp-snapshot-test-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('snapshotScript', () => {
  it('escapes "<" so the data cannot close the script tag', () => {
    const tag = snapshotScript({ v: 1, entries: [{ key: ['public', 'site'], data: { name: '</script><script>alert(1)</script><!--' }, updatedAt: 1 }] });
    const body = tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('</script>'));
    expect(body).not.toContain('<');
    expect(JSON.parse(body).entries[0].data.name).toBe('</script><script>alert(1)</script><!--');
    expect(tag.startsWith('<script type="application/json" id="bp-snapshot">')).toBe(true);
  });

  it('is empty without entries', () => {
    expect(snapshotScript({ v: 1, entries: [] })).toBe('');
    expect(injectSnapshot('<div id="root"></div>', { v: 1, entries: [] })).toBe('<div id="root"></div>');
  });

  it('goes just before the root element', () => {
    const html = injectSnapshot('<body><div id="root"></div></body>', { v: 1, entries: [{ key: ['public', 'site'], data: 1, updatedAt: 1 }] });
    expect(html).toMatch(/<script type="application\/json" id="bp-snapshot">.*<\/script>\s*<div id="root">/);
  });
});

describe('wantsSnapshot', () => {
  it('is for public pages only', () => {
    for (const path of ['/', '/story', '/gallery/wedding', '/invitation/abc', '/rsvp']) expect(wantsSnapshot(path)).toBe(true);
    for (const path of ['/admin', '/admin/login', '/admin/guests', '/memories/upload/tok']) expect(wantsSnapshot(path)).toBe(false);
  });
});

describe('createSnapshotStore', () => {
  it('fetches only the public sources, stores query-shaped data and writes the file', async () => {
    const fetchImpl = fakeApi();
    const store = createSnapshotStore({ apiOrigin: API, dir, fetchImpl, now: () => 1000 });
    await store.refresh();

    const paths = fetchImpl.mock.calls.map(([url]) => url.pathname);
    expect(paths.every((p) => !p.startsWith('/api/admin') && !p.startsWith('/api/auth'))).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(SNAPSHOT_SOURCES.length);

    const snap = store.snapshot();
    expect(snap.entries.find((e) => e.key[1] === 'site')).toEqual({ key: ['public', 'site'], data: { from: '/api/site' }, updatedAt: 1000 });
    expect(snap.entries.find((e) => e.key[1] === 'testimonials' && e.key[2] === 12)?.data).toEqual({
      pages: [{ items: [{ id: 't1' }], page: 1, totalPages: 1, total: 1 }],
      pageParams: [1],
    });
    const saved = JSON.parse(await readFile(store.file, 'utf8'));
    expect(saved.entries).toHaveLength(SNAPSHOT_SOURCES.length);
  });

  it('keeps the last good copy when the API fails, and reloads it after a restart', async () => {
    const first = createSnapshotStore({ apiOrigin: API, dir, fetchImpl: fakeApi(), now: () => 1000 });
    await first.refresh();

    const down = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const second = createSnapshotStore({ apiOrigin: API, dir, fetchImpl: down, now: () => 2000 });
    await second.load();
    expect(await second.refresh()).toBe(false);
    expect(second.site()).toEqual({ from: '/api/site' });
    expect(second.snapshot().entries.every((e) => e.updatedAt === 1000)).toBe(true);
  });

  it('does not keep error answers', async () => {
    const store = createSnapshotStore({
      apiOrigin: API,
      dir,
      fetchImpl: fakeApi({ '/api/site': () => json({ message: 'Down' }, 503) }),
    });
    await store.refresh();
    expect(store.site()).toBeNull();
    expect(store.snapshot().entries).toHaveLength(SNAPSHOT_SOURCES.length - 1);
  });

  it('ignores entries in the file that are not public sources', async () => {
    const { writeFile } = await import('node:fs/promises');
    const store = createSnapshotStore({ apiOrigin: API, dir, fetchImpl: fakeApi() });
    await writeFile(
      store.file,
      JSON.stringify({ v: 1, entries: [{ key: ['public', 'site'], data: 1, updatedAt: 1 }, { key: ['admin', 'guests'], data: [], updatedAt: 1 }] }),
    );
    await store.load();
    expect(store.snapshot().entries.map((e) => e.key)).toEqual([['public', 'site']]);
  });
});
