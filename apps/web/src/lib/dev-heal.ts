// Development only. When Vite re-bundles its dependencies (a vite.config.ts change, a forced
// restart), a tab that is already open keeps the old React in memory while every page it loads
// afterwards imports the new one. Two Reacts in one page break every hook ("Cannot read properties
// of null (reading 'useState')"). A full reload gives the page one copy again, so do that once by
// itself instead of showing an error. A timestamp in sessionStorage stops it from looping.

const KEY = 'bp:dev-heal';
const WINDOW_MS = 15_000;

// Two copies of React (Chrome and Safari wording), or a dependency file from an older bundle.
// Missing page code is chunk-reload's job, with its own guard, so it is not matched here.
const STALE_DEV_ERROR =
  /Invalid hook call|Cannot read properties of null \(reading 'use[A-Za-z]*'\)|null is not an object \(evaluating '[^']*\.use[A-Za-z]*'\)|Outdated Optimize Dep/i;

export function isStaleDevError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : typeof error === 'string' ? error : '';
  return STALE_DEV_ERROR.test(text);
}

/** Reloads the page once for a stale-bundle error. Returns true when a reload has started. */
export function healStaleDevBundle(error: unknown): boolean {
  if (!import.meta.env.DEV || !isStaleDevError(error)) return false;
  try {
    if (Date.now() - (Number(sessionStorage.getItem(KEY)) || 0) < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false; // Without storage the guard cannot work, so never reload by itself.
  }
  window.location.reload();
  return true;
}

/** Catches the same errors when they happen outside a route (an effect, a lazy import, an event). */
export function installDevHeal(): void {
  if (!import.meta.env.DEV) return;
  window.addEventListener('error', (event) => healStaleDevBundle(event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => healStaleDevBundle(event.reason));
}
