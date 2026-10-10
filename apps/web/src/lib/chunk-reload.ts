// After a deploy, an open tab may ask for page code that is no longer on the server. One full
// reload fixes that; a timestamp in sessionStorage stops it from reloading in a loop.

const KEY = 'bp:chunk-reload';
const WINDOW_MS = 30_000;

// Chrome, Safari, Firefox, Vite's CSS preload, and webpack-style names.
const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Loading (CSS )?chunk .* failed|ChunkLoadError/i;

export function isChunkError(error: unknown): boolean {
  return error instanceof Error && CHUNK_ERROR.test(`${error.name}: ${error.message}`);
}

let reloading = false;
let pendingHref: () => string | null = () => null;

/** Where an in-app navigation is heading, so a failed page change lands on the page that was asked for. */
export function setReloadTarget(target: () => string | null) {
  pendingHref = target;
}

/** True while a reload for a new version is under way (the page is about to go). */
export const reloadingForUpdate = () => reloading;

/** Whether an automatic reload is allowed: not on the party camera page, and not twice in 30 s. */
export function canReloadForUpdate(pathname = window.location.pathname): boolean {
  if (reloading) return true;
  if (pathname.startsWith('/memories/')) return false;
  try {
    return Date.now() - (Number(sessionStorage.getItem(KEY)) || 0) >= WINDOW_MS;
  } catch {
    return false; // Without storage the guard cannot work, so never reload by itself.
  }
}

function loadInFull(href: string | null) {
  if (href) window.location.assign(href);
  else window.location.reload();
}

/**
 * Loads the page in full once: the page being navigated to, if any, else the current URL.
 * Returns false when the guard says no.
 */
export function reloadForUpdate(load: (href: string | null) => void = loadInFull): boolean {
  if (reloading) return true;
  if (!canReloadForUpdate()) return false;
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  reloading = true;
  load(pendingHref());
  return true;
}

/** Vite fires this when a lazy chunk (or its CSS) fails to load. */
export function reloadOnPreloadError() {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForUpdate()) event.preventDefault();
  });
}

/** For tests. */
export function resetChunkReload() {
  reloading = false;
}
