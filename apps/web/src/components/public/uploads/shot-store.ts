import type { ShotKind } from './shot-rules';

export type ShotStatus = 'new' | 'sent' | 'failed';

export interface ShotRecord {
  id: string;
  token: string;
  blob: Blob;
  name: string;
  type: string;
  size: number;
  kind: ShotKind;
  createdAt: number;
  width?: number;
  height?: number;
  durationSec?: number;
  status: ShotStatus;
  error?: string;
  /** The guest saved a copy to their phone (share sheet or download). */
  savedToPhone?: boolean;
}

export type ShotPatch = Partial<Pick<ShotRecord, 'status' | 'error' | 'width' | 'height' | 'durationSec' | 'savedToPhone'>>;

/** Shots kept on the guest's phone, per event token. */
export interface ShotStore {
  /** False for the in-memory fallback: shots are lost when the page closes. */
  readonly persistent: boolean;
  /** Newest first. */
  list(token: string): Promise<ShotRecord[]>;
  add(shot: ShotRecord): Promise<void>;
  update(id: string, patch: ShotPatch): Promise<void>;
  remove(ids: string[]): Promise<void>;
}

const DB_NAME = 'party-shots';
const STORE = 'shots';
const DB_VERSION = 1;

function newestFirst(a: ShotRecord, b: ShotRecord) {
  return b.createdAt - a.createdAt;
}

export function createMemoryStore(): ShotStore {
  const rows = new Map<string, ShotRecord>();
  return {
    persistent: false,
    async list(token) {
      return [...rows.values()].filter((r) => r.token === token).sort(newestFirst);
    },
    async add(shot) {
      rows.set(shot.id, shot);
    },
    async update(id, patch) {
      const row = rows.get(id);
      if (row) rows.set(id, { ...row, ...patch });
    },
    async remove(ids) {
      for (const id of ids) rows.delete(id);
    },
  };
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('Aborted', 'AbortError'));
  });
}

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = factory.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('token', 'token', { unique: false });
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('IndexedDB is blocked'));
  });
}

export function createIdbStore(db: IDBDatabase): ShotStore {
  return {
    persistent: true,
    async list(token) {
      const tx = db.transaction(STORE, 'readonly');
      const rows = await req(tx.objectStore(STORE).index('token').getAll(IDBKeyRange.only(token)));
      return (rows as ShotRecord[]).sort(newestFirst);
    },
    async add(shot) {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(shot);
      await done(tx);
    },
    async update(id, patch) {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      // Read and write inside the same callback so the transaction stays active.
      const get = store.get(id);
      get.onsuccess = () => {
        const row = get.result as ShotRecord | undefined;
        if (row) store.put({ ...row, ...patch });
      };
      await done(tx);
    },
    async remove(ids) {
      if (!ids.length) return;
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const id of ids) store.delete(id);
      await done(tx);
    },
  };
}

/**
 * IndexedDB when the browser allows it (it can be missing or refused in private mode),
 * otherwise an in-memory store.
 */
export async function openShotStore(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<ShotStore> {
  if (!factory) return createMemoryStore();
  try {
    return createIdbStore(await openDb(factory));
  } catch {
    return createMemoryStore();
  }
}

export function newShotId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
