// /version.json names the build that is deployed now. Open tabs poll it to notice a new version,
// so it must never be cached: no ETag, no compression (it is a few dozen bytes).

import { readFile } from 'node:fs/promises';

export const VERSION_PATH = '/version.json';

/** Sends dist/version.json with Cache-Control: no-store. HEAD gets the headers only. */
export async function sendVersion(req, res, file, headers = {}) {
  const body = await readFile(file);
  res.writeHead(200, {
    ...headers,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}
