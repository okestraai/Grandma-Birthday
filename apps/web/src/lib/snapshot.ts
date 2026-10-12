import { hashKey, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { isDemoData } from './demo-fallback';

/**
 * Last-good copies of the public site's data, so the site still shows something when the API is down.
 *
 * Two sources seed the query cache before the first render:
 *  - the browser's own copy in localStorage, written after every successful public fetch;
 *  - a copy the production web server injects into the page as <script id="bp-snapshot">,
 *    for visitors who have never been here before.
 * Per query, the newer of the two wins. Seeded data is marked stale, so it is refetched at once;
 * the page shows the saved copy meanwhile.
 *
 * Only whole-site public data is kept. Anything behind a personal link (RSVP invites,
 * invitations, upload links), all admin data and sample data (lib/demo-fallback.ts) are never stored.
 */

/**
 * Bumped when the shape of the saved data changes, so an old copy is never read as new data.
 * Version 2: the site has a celebration and several events (`site.event` became `site.celebration` and `site.events`).
 * Keep in step with server/snapshot.mjs.
 */
export const SNAPSHOT_VERSION = 2;
export const SNAPSHOT_STORAGE_KEY = 'bp_public_snapshot_v2';
export const SNAPSHOT_MAX_BYTES = 1_500_000;
export const SNAPSHOT_MAX_AGE_MS = 30 * 24 * 60 * 60_000;
const WRITE_THROTTLE_MS = 2_000;

/** Second key segment of the public queries that may be saved. */
const SAVED_PUBLIC_KEYS = new Set(['site', 'timeline', 'family', 'albums', 'album', 'programme', 'testimonials']);

export interface SnapshotEntry {
  key: QueryKey;
  data: unknown;
  /** When the data was fetched (ms since epoch). */
  updatedAt: number;
}

export interface Snapshot {
  v: typeof SNAPSHOT_VERSION;
  entries: SnapshotEntry[];
}

export function isSnapshotKey(key: QueryKey): boolean {
  return key[0] === 'public' && typeof key[1] === 'string' && SAVED_PUBLIC_KEYS.has(key[1]);
}

function isEntry(value: unknown): value is SnapshotEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<SnapshotEntry>;
  return Array.isArray(entry.key) && typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt) && entry.data !== undefined;
}

/** Valid, allowed, recent entries from untrusted JSON text; anything malformed is dropped. */
export function parseSnapshot(text: string | null | undefined, now = Date.now()): SnapshotEntry[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as Partial<Snapshot> | null;
    if (!parsed || parsed.v !== SNAPSHOT_VERSION || !Array.isArray(parsed.entries)) return [];
    return parsed.entries.filter((e): e is SnapshotEntry => isEntry(e) && isSnapshotKey(e.key) && now - e.updatedAt <= SNAPSHOT_MAX_AGE_MS);
  } catch {
    return [];
  }
}

export function readStoredSnapshot(now = Date.now()): SnapshotEntry[] {
  try {
    return parseSnapshot(window.localStorage.getItem(SNAPSHOT_STORAGE_KEY), now);
  } catch {
    return [];
  }
}

export function readInjectedSnapshot(now = Date.now()): SnapshotEntry[] {
  try {
    return parseSnapshot(document.getElementById('bp-snapshot')?.textContent, now);
  } catch {
    return [];
  }
}

/** One entry per query key, keeping the most recently fetched. */
export function newestPerKey(...lists: SnapshotEntry[][]): SnapshotEntry[] {
  const byKey = new Map<string, SnapshotEntry>();
  for (const entry of lists.flat()) {
    const hash = hashKey(entry.key);
    const current = byKey.get(hash);
    if (!current || entry.updatedAt > current.updatedAt) byKey.set(hash, entry);
  }
  return [...byKey.values()];
}

/**
 * Puts saved data into the cache, keeping its original fetch time and marking it stale, so the
 * first observer refetches straight away. Data already in the cache is left alone.
 */
export function seedQueryClient(client: QueryClient, entries: SnapshotEntry[]): number {
  let seeded = 0;
  for (const entry of entries) {
    if (!isSnapshotKey(entry.key) || client.getQueryData(entry.key) !== undefined) continue;
    client.setQueryData(entry.key, entry.data, { updatedAt: entry.updatedAt });
    void client.invalidateQueries({ queryKey: entry.key, exact: true, refetchType: 'none' });
    seeded++;
  }
  return seeded;
}

/** Infinite queries keep only their first page: enough to show something, and much smaller. */
function trimmed(data: unknown): unknown {
  if (data && typeof data === 'object' && 'pages' in data && 'pageParams' in data) {
    const { pages, pageParams } = data as { pages: unknown[]; pageParams: unknown[] };
    if (Array.isArray(pages) && Array.isArray(pageParams)) return { pages: pages.slice(0, 1), pageParams: pageParams.slice(0, 1) };
  }
  return data;
}

/** The snapshot to store: what was saved before, overlaid with every successful public query now in the cache. */
export function buildSnapshot(client: QueryClient, previous: SnapshotEntry[], now = Date.now()): Snapshot {
  const current: SnapshotEntry[] = [];
  for (const query of client.getQueryCache().getAll()) {
    const { data, dataUpdatedAt, status } = query.state;
    if (!isSnapshotKey(query.queryKey) || data === undefined || status === 'pending' || !dataUpdatedAt) continue;
    // Sample data shown while the API is down is never saved as the last good copy.
    if (isDemoData(data)) continue;
    current.push({ key: query.queryKey, data: trimmed(data), updatedAt: dataUpdatedAt });
  }
  const entries = newestPerKey(previous, current).filter((e) => now - e.updatedAt <= SNAPSHOT_MAX_AGE_MS);
  return { v: SNAPSHOT_VERSION, entries };
}

/** Writes the snapshot; skipped when it would be too large. Returns whether it was written. */
export function writeSnapshot(snapshot: Snapshot): boolean {
  try {
    const text = JSON.stringify(snapshot);
    if (text.length > SNAPSHOT_MAX_BYTES) return false;
    window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Saves public data after each successful fetch, at most once every couple of seconds.
 * Returns an unsubscribe function.
 */
export function persistPublicQueries(client: QueryClient, throttleMs = WRITE_THROTTLE_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    writeSnapshot(buildSnapshot(client, readStoredSnapshot()));
  };
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success' || !isSnapshotKey(event.query.queryKey)) return;
    timer ??= setTimeout(flush, throttleMs);
  });
  return () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
  };
}

/** Called once from main.tsx before the first render. Admin pages are left untouched. */
export function restorePublicSnapshot(client: QueryClient, pathname: string): void {
  if (pathname.startsWith('/admin')) return;
  try {
    // The copy saved before version 2 can never be read again.
    window.localStorage.removeItem('bp_public_snapshot_v1');
  } catch {
    // Storage blocked: nothing to tidy.
  }
  seedQueryClient(client, newestPerKey(readStoredSnapshot(), readInjectedSnapshot()));
}
