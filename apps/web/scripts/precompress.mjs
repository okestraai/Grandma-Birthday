// Writes .br and .gz copies of the text files in dist/ after `vite build`, so the production
// server (server/index.mjs) can send them without compressing on every request.
// Only files over 1 KB are compressed; a copy that is not smaller is skipped. version.json is
// never compressed: the server sends it as is, uncached (it is tiny and changes on every deploy).

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';

const DIST = resolve(import.meta.dirname, '..', 'dist');
const EXTENSIONS = new Set(['.js', '.mjs', '.css', '.html', '.svg', '.json', '.webmanifest', '.txt', '.xml', '.wasm']);
const MIN_BYTES = 1024;
const SKIP = new Set([join(DIST, 'version.json')]);

const br = promisify(brotliCompress);
const gz = promisify(gzip);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

let files = 0;
let before = 0;
let afterBr = 0;
for await (const file of walk(DIST)) {
  if (!EXTENSIONS.has(extname(file)) || SKIP.has(file)) continue;
  if ((await stat(file)).size < MIN_BYTES) continue;
  const source = await readFile(file);
  const [brotli, gzipped] = await Promise.all([
    br(source, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
        [constants.BROTLI_PARAM_SIZE_HINT]: source.length,
      },
    }),
    gz(source, { level: constants.Z_BEST_COMPRESSION }),
  ]);
  if (brotli.length < source.length) await writeFile(`${file}.br`, brotli);
  if (gzipped.length < source.length) await writeFile(`${file}.gz`, gzipped);
  files++;
  before += source.length;
  afterBr += Math.min(brotli.length, source.length);
}

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
console.log(`precompressed ${files} files: ${kb(before)} -> ${kb(afterBr)} brotli`);
