// Runs under the web tests (jsdom environment); only needs the file system.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sendVersion } from './version.mjs';

function fakeRes() {
  const res = { status: 0, headers: {}, body: undefined };
  res.writeHead = (status, headers) => Object.assign(res, { status, headers });
  res.end = (body) => {
    res.body = body;
  };
  return res;
}

let dir;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bp-version-test-'));
  await writeFile(join(dir, 'version.json'), '{"buildId":"abc123def456","builtAt":"2026-10-05T00:00:00.000Z"}\n');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('sendVersion', () => {
  it('sends version.json with no-store and no validators', async () => {
    const res = fakeRes();
    await sendVersion({ method: 'GET', headers: { 'accept-encoding': 'br, gzip' } }, res, join(dir, 'version.json'), { 'X-Frame-Options': 'DENY' });
    expect(res.status).toBe(200);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.headers['Content-Type']).toBe('application/json');
    expect(res.headers['X-Frame-Options']).toBe('DENY');
    expect(res.headers.ETag).toBeUndefined();
    expect(res.headers['Last-Modified']).toBeUndefined();
    expect(res.headers['Content-Encoding']).toBeUndefined();
    expect(JSON.parse(String(res.body)).buildId).toBe('abc123def456');
  });

  it('answers HEAD without a body', async () => {
    const res = fakeRes();
    await sendVersion({ method: 'HEAD', headers: {} }, res, join(dir, 'version.json'));
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.body).toBeUndefined();
  });
});
