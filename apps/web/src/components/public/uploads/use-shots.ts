import { useCallback, useEffect, useRef, useState } from 'react';
import { baseMime, kindOf, shotFileName, type ShotKind } from './shot-rules';
import { createMemoryStore, newShotId, openShotStore, type ShotPatch, type ShotRecord, type ShotStore } from './shot-store';

export interface Shot extends ShotRecord {
  /** Object URL for previews; revoked when the shot is removed or the page unmounts. */
  url: string;
}

export interface NewShot {
  blob: Blob;
  /** Original file name, used only for its extension. */
  originalName?: string;
  kind?: ShotKind;
  width?: number;
  height?: number;
  durationSec?: number;
  savedToPhone?: boolean;
}

/** Reads a video's duration from its metadata. Resolves null if the browser can't tell within a few seconds. */
function readVideoDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const finish = (value: number | null) => {
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load?.();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 5000);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null);
    video.onerror = () => finish(null);
    video.src = url;
  });
}

let persistRequested = false;

function requestPersistence() {
  if (persistRequested) return;
  persistRequested = true;
  try {
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    /* ignore */
  }
}

/** The guest's shots for one event, kept in IndexedDB (or memory when the browser refuses). */
export function useShots(token: string, openStore: () => Promise<ShotStore> = openShotStore) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [ready, setReady] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const storeRef = useRef<ShotStore | null>(null);
  const urls = useRef(new Map<string, string>());

  const urlFor = useCallback((row: ShotRecord) => {
    let url = urls.current.get(row.id);
    if (!url) {
      url = URL.createObjectURL(row.blob);
      urls.current.set(row.id, url);
    }
    return url;
  }, []);

  const revoke = useCallback((ids: string[]) => {
    for (const id of ids) {
      const url = urls.current.get(id);
      if (url) URL.revokeObjectURL(url);
      urls.current.delete(id);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const map = urls.current;
    (async () => {
      let store: ShotStore;
      let rows: ShotRecord[];
      try {
        store = await openStore();
        rows = await store.list(token);
      } catch {
        store = createMemoryStore();
        rows = [];
      }
      if (cancelled) return;
      storeRef.current = store;
      setPersistent(store.persistent);
      setShots(rows.map((r) => ({ ...r, url: urlFor(r) })));
      setReady(true);
    })();
    return () => {
      cancelled = true;
      for (const url of map.values()) URL.revokeObjectURL(url);
      map.clear();
    };
  }, [token, openStore, urlFor]);

  const patchLocal = useCallback((id: string, patch: ShotPatch) => {
    setShots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const update = useCallback(
    async (id: string, patch: ShotPatch) => {
      patchLocal(id, patch);
      try {
        await storeRef.current?.update(id, patch);
      } catch {
        /* the on-screen state is still right for this visit */
      }
    },
    [patchLocal],
  );

  const add = useCallback(
    async (items: NewShot[]) => {
      if (!items.length) return [];
      const now = Date.now();
      const rows: ShotRecord[] = items.map((item, i) => {
        const id = newShotId();
        const createdAt = now + i;
        const type = baseMime(item.blob.type) || (item.kind === 'VIDEO' ? 'video/mp4' : '');
        return {
          id,
          token,
          blob: item.blob,
          name: shotFileName(type, createdAt, id, item.originalName),
          type,
          size: item.blob.size,
          kind: item.kind ?? kindOf(type),
          createdAt,
          width: item.width,
          height: item.height,
          durationSec: item.durationSec,
          status: 'new',
          ...(item.savedToPhone ? { savedToPhone: true } : {}),
        };
      });
      setShots((prev) => [...rows.map((r) => ({ ...r, url: urlFor(r) })).reverse(), ...prev]);
      requestPersistence();
      for (const row of rows) {
        try {
          await storeRef.current?.add(row);
        } catch {
          // Some private modes open IndexedDB but refuse to store files. Keep going in memory.
          const memory = createMemoryStore();
          for (const r of rows) await memory.add(r);
          storeRef.current = memory;
          setPersistent(false);
          break;
        }
      }
      for (const row of rows) {
        if (row.kind === 'VIDEO' && !row.durationSec) {
          void readVideoDuration(urlFor(row)).then((d) => {
            if (d) void update(row.id, { durationSec: d });
          });
        }
      }
      return rows.map((r) => r.id);
    },
    [token, update, urlFor],
  );

  const remove = useCallback(
    async (ids: string[]) => {
      const set = new Set(ids);
      setShots((prev) => prev.filter((s) => !set.has(s.id)));
      revoke(ids);
      try {
        await storeRef.current?.remove(ids);
      } catch {
        /* ignore */
      }
    },
    [revoke],
  );

  return { shots, ready, persistent, add, update, remove };
}
