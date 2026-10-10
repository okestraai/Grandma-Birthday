import { useSyncExternalStore } from 'react';
import type { DataRouter } from 'react-router';

// Notices when a newer build has been deployed, by polling /version.json (written by
// scripts/build-version.ts). Open pages then show a Refresh notice, and the next page change
// loads the new version in full instead of switching pages inside the old one.

export interface VersionState {
  /** A build other than the one running here is deployed. */
  available: boolean;
  latestId?: string;
  /** The visitor chose "Later" for this id. */
  dismissed: boolean;
}

const FIRST_CHECK_MS = 30_000;
const INTERVAL_MS = 5 * 60_000;
const MAX_BACKOFF_MS = 30 * 60_000;
// Checks prompted by the tab being shown, going online or a page change.
const MIN_GAP_MS = 60_000;
const TIMEOUT_MS = 5_000;
const DISMISS_KEY = 'bp:update-dismissed';

let state: VersionState = { available: false, dismissed: false };
const listeners = new Set<() => void>();

function setState(next: VersionState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getVersionState = () => state;

export function useVersion(): VersionState {
  return useSyncExternalStore(subscribe, getVersionState, getVersionState);
}

function readDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

/** "Later": hide the notice for this visit, until an even newer build appears. */
export function dismissUpdate() {
  if (!state.latestId) return;
  try {
    sessionStorage.setItem(DISMISS_KEY, state.latestId);
  } catch {
    /* private mode: hidden for this page only */
  }
  setState({ ...state, dismissed: true });
}

let currentId: string | null = null;
let startedAt = 0;
let lastCheck = 0;
let nextDue = 0;
let failures = 0;
let inFlight = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Records the build the server says is deployed. */
export function noteLatestBuild(latestId: string) {
  if (!currentId) return;
  if (latestId === currentId) {
    if (state.available) setState({ available: false, dismissed: false });
    return;
  }
  if (latestId !== state.latestId) setState({ available: true, latestId, dismissed: readDismissed() === latestId });
}

async function fetchLatestId(): Promise<string> {
  const controller = new AbortController();
  const abort = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) throw new Error(`version.json: ${res.status}`);
    const body: unknown = await res.json();
    const id = (body as { buildId?: unknown } | null)?.buildId;
    if (typeof id !== 'string' || !id) throw new Error('version.json: no buildId');
    return id;
  } finally {
    clearTimeout(abort);
  }
}

const hidden = () => document.visibilityState === 'hidden';
// 5 minutes normally; after failures 5, 10, 20, then 30 minutes.
const nextDelay = () => (failures ? Math.min(INTERVAL_MS * 2 ** (failures - 1), MAX_BACKOFF_MS) : INTERVAL_MS);

function arm() {
  clearTimeout(timer);
  timer = undefined;
  if (currentId && !hidden()) timer = setTimeout(() => void check(), Math.max(0, nextDue - Date.now()));
}

async function check() {
  if (!currentId || inFlight) return;
  inFlight = true;
  lastCheck = Date.now();
  clearTimeout(timer);
  try {
    const id = await fetchLatestId();
    failures = 0;
    noteLatestBuild(id);
  } catch {
    failures++; // Never shown: the next check is just later.
  } finally {
    inFlight = false;
    nextDue = Date.now() + nextDelay();
    arm();
  }
}

/** An extra check, at most once a minute, never before the first one or during a backoff. */
function checkSoon(ignoreBackoff = false) {
  const now = Date.now();
  if (!currentId || hidden() || now < startedAt + FIRST_CHECK_MS || now - lastCheck < MIN_GAP_MS) return;
  if (!ignoreBackoff && failures && now < nextDue) return;
  void check();
}

function onVisibility() {
  if (hidden()) {
    clearTimeout(timer);
    timer = undefined;
    return;
  }
  arm();
  checkSoon();
}

const onOnline = () => checkSoon(true);

/** Starts polling. `buildId` is this page's own build, from <meta name="app-build">. */
export function startVersionCheck(buildId: string) {
  stopVersionCheck();
  currentId = buildId;
  startedAt = Date.now();
  nextDue = startedAt + FIRST_CHECK_MS;
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);
  arm();
  return stopVersionCheck;
}

export function stopVersionCheck() {
  clearTimeout(timer);
  timer = undefined;
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('online', onOnline);
  currentId = null;
  lastCheck = 0;
  failures = 0;
  inFlight = false;
  setState({ available: false, dismissed: false });
}

/** A page change inside the app: a chance to check (throttled). */
export const checkOnNavigation = () => checkSoon();

type Go = { assign: (href: string) => void; replace: (href: string) => void; reload: () => void };

// The party camera page never reloads by itself: a guest may be taking or sending photos.
const mayReload = (pathname: string) => !pathname.startsWith('/memories/');

/**
 * Once a new version is known, the next page change loads the target URL in full rather than
 * rendering it with the old code. Links and navigate() calls are caught before the router
 * changes anything; back and forward reload the URL the browser has already moved to.
 * Changes that keep the path (search filters, hashes) stay in the app.
 */
export function watchNavigation(router: DataRouter, go: Go = window.location) {
  let shownPath = router.state.location.pathname;
  let leaving = false;
  const upgrade = (from: string) => state.available && !leaving && mayReload(from);

  const navigate = router.navigate;
  router.navigate = ((to: unknown, opts?: { replace?: boolean }) => {
    const here = router.state.location;
    if (typeof to !== 'number' && to != null && upgrade(here.pathname)) {
      const base = `http://app${here.pathname}${here.search}`;
      const path =
        typeof to === 'string' ? to : `${(to as { pathname?: string }).pathname ?? here.pathname}${(to as { search?: string }).search ?? ''}${(to as { hash?: string }).hash ?? ''}`;
      const url = path.startsWith('/') || path.startsWith('?') || path.startsWith('#') ? new URL(path, base) : null;
      if (url && url.pathname !== here.pathname) {
        leaving = true;
        const href = `${url.pathname}${url.search}${url.hash}`;
        if (opts?.replace) go.replace(href);
        else go.assign(href);
        return Promise.resolve();
      }
    }
    return (navigate as (...args: unknown[]) => Promise<void>)(to, opts);
  }) as DataRouter['navigate'];

  return router.subscribe((next) => {
    const target = next.navigation.location ?? next.location;
    if (target.pathname === shownPath || leaving) return;
    if (upgrade(shownPath)) {
      leaving = true;
      // Back/forward: the address bar already shows the target.
      if (next.historyAction === 'POP') go.reload();
      else go.assign(router.createHref(target));
      return;
    }
    if (next.navigation.state === 'idle') {
      shownPath = next.location.pathname;
      checkOnNavigation();
    }
  });
}
