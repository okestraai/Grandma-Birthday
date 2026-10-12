// Last-good copies of the public API responses, for when the API is down.
//
// The web server keeps the site, timeline, family, albums, programme and first page of tributes
// in memory and in a JSON file, refreshes them in the background, and injects them into public
// pages as <script type="application/json" id="bp-snapshot">. The browser seeds its query cache
// from it (src/lib/snapshot.ts), so even a first-time visitor sees the celebration while the API
// is unreachable. Only anonymous public endpoints are fetched: no cookies, nothing personal.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * What to keep, as the web app's query keys (src/lib/public-api.ts) and the API paths behind them.
 * Tribute pages are infinite queries, so they are stored in that shape: one page, page param 1.
 */
export const SNAPSHOT_SOURCES = [
  { key: ['public', 'site'], path: '/api/site' },
  { key: ['public', 'timeline'], path: '/api/timeline' },
  { key: ['public', 'family'], path: '/api/family' },
  { key: ['public', 'albums'], path: '/api/albums' },
  { key: ['public', 'programme'], path: '/api/programme' },
  { key: ['public', 'testimonials', 8], path: '/api/testimonials/public?page=1&pageSize=8', infinite: true },
  { key: ['public', 'testimonials', 12], path: '/api/testimonials/public?page=1&pageSize=12', infinite: true },
];

const FILE_NAME = 'public-snapshot.json';
/** Bumped when the saved data changes shape; keep in step with src/lib/snapshot.ts. Older files are ignored. */
export const SNAPSHOT_VERSION = 2;
/** Larger than this and the snapshot is left out of pages rather than slowing them down. */
export const MAX_INJECT_BYTES = 1_500_000;

/** Paths whose HTML gets the snapshot: public pages, not admin or the guest upload page. */
export function wantsSnapshot(pathname) {
  return !/^\/(admin|memories)(\/|$)/.test(pathname);
}

/**
 * The <script> tag for a snapshot. Every "<" is written as \u003c (still valid JSON), so no
 * value can close the tag or open a comment.
 */
export function snapshotScript(snapshot) {
  if (!snapshot?.entries?.length) return '';
  const json = JSON.stringify(snapshot).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  if (json.length > MAX_INJECT_BYTES) return '';
  return `<script type="application/json" id="bp-snapshot">${json}</script>`;
}

/** Puts the snapshot tag just before the app's root element. */
export function injectSnapshot(html, snapshot) {
  const tag = snapshotScript(snapshot);
  return tag ? html.replace('<div id="root">', `${tag}\n    <div id="root">`) : html;
}

/**
 * @param {{ apiOrigin: URL, dir: string, timeoutMs?: number, refreshMs?: number, fetchImpl?: typeof fetch, now?: () => number }} options
 */
export function createSnapshotStore({ apiOrigin, dir, timeoutMs = 3000, refreshMs = 60_000, fetchImpl = fetch, now = Date.now }) {
  const file = join(dir, FILE_NAME);
  /** Query-key JSON -> { key, data, updatedAt } */
  const entries = new Map();
  let inFlight = null;
  let lastAttempt = 0;
  let timer = null;

  const snapshot = () => ({ v: SNAPSHOT_VERSION, entries: [...entries.values()] });

  async function load() {
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8'));
      if (parsed?.v !== SNAPSHOT_VERSION || !Array.isArray(parsed.entries)) return;
      const allowed = new Set(SNAPSHOT_SOURCES.map((s) => JSON.stringify(s.key)));
      for (const entry of parsed.entries) {
        const id = JSON.stringify(entry?.key);
        if (allowed.has(id) && typeof entry.updatedAt === 'number' && entry.data !== undefined) entries.set(id, entry);
      }
    } catch {
      // No file yet, or unreadable: start empty.
    }
  }

  async function save() {
    try {
      await mkdir(dir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(snapshot()));
      await rename(tmp, file);
    } catch (error) {
      console.error(JSON.stringify({ level: 'warn', msg: 'snapshot not saved', error: String(error) }));
    }
  }

  async function fetchOne(source) {
    const res = await fetchImpl(new URL(source.path, apiOrigin), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok || !String(res.headers.get('content-type')).includes('application/json')) return null;
    const data = await res.json();
    return source.infinite ? { pages: [data], pageParams: [1] } : data;
  }

  /** Fetches every source; a failure keeps the previous copy. Resolves to true if anything was fetched. */
  function refresh() {
    lastAttempt = now();
    inFlight ??= (async () => {
      const results = await Promise.allSettled(SNAPSHOT_SOURCES.map(fetchOne));
      let changed = false;
      results.forEach((result, i) => {
        if (result.status !== 'fulfilled' || result.value == null) return;
        const { key } = SNAPSHOT_SOURCES[i];
        entries.set(JSON.stringify(key), { key, data: result.value, updatedAt: now() });
        changed = true;
      });
      if (changed) await save();
      return changed;
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  /** Starts a refresh if the last one was a while ago. Never waits. */
  function refreshIfDue() {
    if (!inFlight && now() - lastAttempt >= refreshMs) void refresh();
  }

  /**
   * The snapshot for a page. When nothing is saved yet it waits (up to `waitMs`) for a refresh,
   * so the very first visitor after a deploy gets one too.
   */
  async function forPage(waitMs) {
    refreshIfDue();
    if (entries.size === 0 && waitMs > 0) {
      const pending = inFlight ?? refresh();
      await Promise.race([pending, new Promise((r) => setTimeout(r, waitMs).unref?.())]);
    }
    return snapshot();
  }

  function start() {
    void refresh();
    timer = setInterval(() => void refresh(), refreshMs);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
  }

  const site = () => entries.get(JSON.stringify(['public', 'site']))?.data ?? null;

  return { load, refresh, refreshIfDue, forPage, start, stop, snapshot, site, file };
}
