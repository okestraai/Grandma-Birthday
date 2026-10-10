import { extensionFor } from './shot-rules';

/** iPhone, iPod, or iPad (iPadOS reports itself as a Mac with a touch screen). */
export function isIOS(nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> = navigator): boolean {
  if (/iPad|iPhone|iPod/.test(nav.userAgent)) return true;
  if (/Android/i.test(nav.userAgent)) return false;
  return nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1;
}

/** Starts a download of one blob through a temporary `<a download>` link. */
export function downloadBlob(blob: Blob, filename: string, url?: string): void {
  const href = url ?? URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before the URL goes away.
  if (!url) setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

/** "celebration-2026-09-26-3.jpg" */
export function keepCopyName(type: string, n: number, date = new Date()): string {
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `celebration-${day}-${n}.${extensionFor(type)}`;
}

export interface SaveItem {
  id: string;
  blob: Blob;
  name: string;
  type: string;
  url?: string;
}

export interface SaveOutcome {
  /** Shots now on the phone (shared to the share sheet or downloaded). */
  savedIds: string[];
  /** Shots still to save; each group needs a fresh tap because sharing needs a user gesture. */
  remainingIds: string[];
  cancelled: boolean;
}

type ShareApi = {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
};

/** How many of the leading files the share sheet accepts at once (0 if it takes none). */
export function shareableCount(files: File[], canShare: (data: ShareData) => boolean): number {
  let n = files.length;
  while (n > 0) {
    try {
      if (canShare({ files: files.slice(0, n) })) return n;
    } catch {
      /* treat as not shareable */
    }
    n = n > 1 ? Math.floor(n / 2) : 0;
  }
  return 0;
}

/**
 * Saves shots to the phone in one share sheet (iPhone: "Save N Images"; Android: gallery or Google Photos).
 * When the sheet can't take them all, it shares the largest group it can and leaves the rest for the next tap.
 * Without file sharing, it downloads them. A cancelled share sheet is not an error.
 */
export async function saveShotsToPhone(items: SaveItem[], api: ShareApi = navigator): Promise<SaveOutcome> {
  if (!items.length) return { savedIds: [], remainingIds: [], cancelled: false };
  const files = items.map((s) => new File([s.blob], s.name, { type: s.type }));
  const canShare = api.canShare?.bind(api);
  const n = canShare && api.share ? shareableCount(files, canShare) : 0;
  if (n > 0) {
    try {
      await api.share!({ files: files.slice(0, n) });
      return { savedIds: items.slice(0, n).map((s) => s.id), remainingIds: items.slice(n).map((s) => s.id), cancelled: false };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { savedIds: [], remainingIds: items.map((s) => s.id), cancelled: true };
      }
      // Some browsers refuse at the last moment (size, gesture). Fall back to downloads.
    }
  }
  for (const item of items) downloadBlob(item.blob, item.name, item.url);
  return { savedIds: items.map((s) => s.id), remainingIds: [], cancelled: false };
}
