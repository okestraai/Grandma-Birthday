import { createMemoryStore, openShotStore, type ShotRecord } from './shot-store';

function shot(id: string, token: string, createdAt: number): ShotRecord {
  const blob = new Blob(['x'], { type: 'image/jpeg' });
  return { id, token, blob, name: `shot-${createdAt}-${id}.jpg`, type: 'image/jpeg', size: blob.size, kind: 'PHOTO', createdAt, status: 'new' };
}

describe('shot store', () => {
  it('adds and lists shots per token, newest first', async () => {
    const store = createMemoryStore();
    await store.add(shot('a', 't1', 1));
    await store.add(shot('b', 't1', 3));
    await store.add(shot('c', 't2', 2));
    expect((await store.list('t1')).map((s) => s.id)).toEqual(['b', 'a']);
    expect((await store.list('t2')).map((s) => s.id)).toEqual(['c']);
  });

  it('updates status and deletes', async () => {
    const store = createMemoryStore();
    await store.add(shot('a', 't1', 1));
    await store.add(shot('b', 't1', 2));
    await store.update('a', { status: 'failed', error: 'Too big' });
    await store.update('b', { status: 'sent', savedToPhone: true });
    const rows = await store.list('t1');
    expect(rows.find((r) => r.id === 'a')).toMatchObject({ status: 'failed', error: 'Too big' });
    expect(rows.find((r) => r.id === 'b')).toMatchObject({ status: 'sent', savedToPhone: true });
    await store.remove(['a']);
    expect((await store.list('t1')).map((s) => s.id)).toEqual(['b']);
  });

  it('falls back to memory when IndexedDB is missing or refuses to open', async () => {
    expect((await openShotStore(undefined)).persistent).toBe(false);
    const broken = {
      open: () => {
        const req = {} as IDBOpenDBRequest;
        queueMicrotask(() => {
          Object.defineProperty(req, 'error', { value: new DOMException('nope', 'InvalidStateError') });
          (req.onerror as (() => void) | null)?.();
        });
        return req;
      },
    } as unknown as IDBFactory;
    const store = await openShotStore(broken);
    expect(store.persistent).toBe(false);
    await store.add(shot('a', 't1', 1));
    expect(await store.list('t1')).toHaveLength(1);
  });
});
