// Production web server for the Vite build (no dependencies, Node 22+).
//
//  - Serves dist/ with long-lived caching for hashed assets, and ETag/Last-Modified for the rest.
//  - Sends /version.json uncached (server/version.mjs), so open tabs notice a new deploy.
//  - Sends the .br/.gz copies written at build time (scripts/precompress.mjs) when the browser
//    accepts them; the rewritten index.html is compressed per request.
//  - Proxies /api/* and /sitemap.xml to the API, so the browser sees one origin
//    (session cookies stay first-party and SameSite=Lax works). If the API cannot be reached,
//    the proxy answers 502 or 503 straight away instead of hanging.
//  - For page requests, asks the API for that page's SEO metadata and injects it into
//    index.html, so crawlers and link previews that do not run JavaScript still get
//    the right title, description, image and JSON-LD.
//  - Keeps a last-good copy of the public API data (server/snapshot.mjs) and injects it into
//    public pages, so the site still shows the celebration while the API is down.
//
// Environment:
//   PORT            port to listen on (default 8080)
//   API_ORIGIN      where the API runs, e.g. http://api:4100 (required)
//   PUBLIC_WEB_URL  public origin, used in robots.txt (default http://localhost:PORT)
//   SNAPSHOT_DIR    folder for the saved public data (default <os temp dir>/birthday-web-snapshot)

import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants as zlib, gzip } from 'node:zlib';
import { createSnapshotStore, injectSnapshot, wantsSnapshot } from './snapshot.mjs';
import { sendVersion, VERSION_PATH } from './version.mjs';

const PORT = Number(process.env.PORT ?? 8080);
const API_ORIGIN = new URL(process.env.API_ORIGIN ?? 'http://localhost:4100');
const SITE_URL = (process.env.PUBLIC_WEB_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '');
const DIST = resolve(import.meta.dirname, '..', 'dist');
const SEO_TIMEOUT_MS = 1500;
const SNAPSHOT_DIR = process.env.SNAPSHOT_DIR || join(tmpdir(), 'birthday-web-snapshot');
// How long the proxy waits to connect to the API, and (for reads) for its first byte.
const PROXY_CONNECT_TIMEOUT_MS = 5000;
const PROXY_READ_TIMEOUT_MS = 30_000;
// After the API fails to answer, page requests skip the SEO lookup for this long.
const API_DOWN_BACKOFF_MS = 10_000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};

// Types worth compressing on the fly (the precompressed copies cover the built files).
const COMPRESSIBLE = /^(text\/|application\/(json|xml|manifest\+json)|image\/svg\+xml)/;
const PRECOMPRESSED = [
  { encoding: 'br', ext: '.br' },
  { encoding: 'gzip', ext: '.gz' },
];

const brotli = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

/** Encodings the client accepts, from Accept-Encoding (anything with q=0 is refused). */
function accepted(req) {
  const header = String(req.headers['accept-encoding'] ?? '');
  const out = new Set();
  for (const part of header.split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    if (name && !(q && Number(q.slice(2)) === 0)) out.add(name);
  }
  return out;
}

/** True when an If-None-Match list names this ETag (weak or strong). */
function etagMatches(header, etag) {
  if (!header) return false;
  const bare = etag.replace(/^W\//, '');
  return header.split(',').some((tag) => {
    const t = tag.trim();
    return t === '*' || t.replace(/^W\//, '') === bare;
  });
}

async function compressed(body, encodings) {
  if (encodings.has('br')) {
    return { encoding: 'br', body: await brotli(body, { params: { [zlib.BROTLI_PARAM_QUALITY]: 5 } }) };
  }
  if (encodings.has('gzip')) return { encoding: 'gzip', body: await gzipAsync(body, { level: 6 }) };
  return { encoding: null, body: Buffer.from(body) };
}

/** Sends a text body, compressed when the client accepts it. HEAD gets the headers only. */
async function sendText(req, res, status, headers, text) {
  const { encoding, body } = await compressed(text, accepted(req));
  res.writeHead(status, {
    ...headers,
    Vary: 'Accept-Encoding',
    'Content-Length': body.length,
    ...(encoding ? { 'Content-Encoding': encoding } : {}),
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

const template = await readFile(join(DIST, 'index.html'), 'utf8');

// Vite's build manifest, used to preload the public layout and home page chunks with the entry
// script, rather than after it has run and matched the route. Missing manifest: no preloads.
const manifest = await readFile(join(DIST, '.vite', 'manifest.json'), 'utf8')
  .then(JSON.parse)
  .catch(() => null);

function chunkFiles(keys) {
  const seen = new Set();
  const files = [];
  const walk = (key) => {
    if (seen.has(key) || !manifest?.[key]) return;
    seen.add(key);
    files.push(manifest[key].file);
    for (const dep of manifest[key].imports ?? []) walk(dep);
  };
  keys.forEach(walk);
  return files;
}

function preloadTags(keys) {
  if (!manifest) return '';
  const already = new Set(chunkFiles(['index.html'])); // index.html links these itself
  return chunkFiles(keys)
    .filter((file) => !already.has(file))
    .map((file) => `    <link rel="modulepreload" crossorigin href="/${file}" />`)
    .join('\n');
}

const LAYOUT = 'src/pages/public/PublicLayout.tsx';
const PRELOAD_HOME = preloadTags([LAYOUT, 'src/pages/public/HomePage.tsx']);
const PRELOAD_PUBLIC = preloadTags([LAYOUT]);

function withPreloads(html, pathname) {
  const tags = pathname === '/' ? PRELOAD_HOME : /^\/(admin|memories)(\/|$)/.test(pathname) ? '' : PRELOAD_PUBLIC;
  return tags ? html.replace('</head>', `${tags}\n  </head>`) : html;
}

const escape = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function renderHead(seo) {
  const tag = (html) => `    ${html.replace(/^<(\w+)/, '<$1 data-seo="server"')}`;
  const lines = [
    tag(`<title>${escape(seo.title)}</title>`),
    tag(`<meta name="description" content="${escape(seo.description)}" />`),
    tag(`<link rel="canonical" href="${escape(seo.canonicalUrl)}" />`),
    tag(`<meta name="robots" content="${seo.noindex ? 'noindex, nofollow' : 'index, follow'}" />`),
    tag(`<meta property="og:title" content="${escape(seo.title)}" />`),
    tag(`<meta property="og:description" content="${escape(seo.description)}" />`),
    tag(`<meta property="og:type" content="${escape(seo.type)}" />`),
    tag(`<meta property="og:url" content="${escape(seo.canonicalUrl)}" />`),
    tag(`<meta property="og:image" content="${escape(seo.imageUrl ?? `${SITE_URL}/og-default.jpg`)}" />`),
    tag(`<meta name="twitter:card" content="summary_large_image" />`),
    tag(`<meta name="twitter:title" content="${escape(seo.title)}" />`),
    tag(`<meta name="twitter:description" content="${escape(seo.description)}" />`),
    tag(`<meta name="twitter:image" content="${escape(seo.imageUrl ?? `${SITE_URL}/og-default.jpg`)}" />`),
    ...(seo.jsonLd ?? []).map((schema) =>
      tag(`<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`),
    ),
  ];
  return lines.join('\n');
}

let apiDownUntil = 0;
const apiLooksDown = () => Date.now() < apiDownUntil;

async function seoFor(path) {
  if (apiLooksDown()) return null;
  try {
    const url = new URL(`/api/seo?path=${encodeURIComponent(path)}`, API_ORIGIN);
    const res = await fetch(url, { signal: AbortSignal.timeout(SEO_TIMEOUT_MS) });
    if (res.status >= 502 && res.status <= 504) apiDownUntil = Date.now() + API_DOWN_BACKOFF_MS;
    return res.ok ? await res.json() : null;
  } catch {
    // Unreachable or too slow: skip the lookup for a few seconds so pages stay fast.
    apiDownUntil = Date.now() + API_DOWN_BACKOFF_MS;
    return null; // The page still works; it keeps the default tags (or the saved site's, below).
  }
}

/** Basic tags from the saved site data, for when the SEO lookup fails. Null without a snapshot. */
function fallbackSeo(site, pathname) {
  if (!site?.celebrant || !site.event) return null;
  const c = site.celebrant;
  const name = !c.honorific || c.fullName.startsWith(c.honorific) ? c.fullName : `${c.honorific} ${c.fullName}`;
  return {
    title: site.branding?.siteTitle ?? `${name} at ${c.age ?? 70}`,
    description: site.branding?.siteDescription ?? `Celebrate ${c.age ?? 70} years of ${name} at ${site.event.venueName}.`,
    canonicalUrl: `${SITE_URL}${pathname}`,
    type: 'website',
    noindex: false,
    imageUrl: null,
    jsonLd: [],
  };
}

const snapshots = createSnapshotStore({ apiOrigin: API_ORIGIN, dir: SNAPSHOT_DIR });
await snapshots.load();
snapshots.start();

function proxyError(res, status, message) {
  if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ success: false, statusCode: status, code: 'INTERNAL_ERROR', message }));
}

function proxy(req, res, pathOverride) {
  const target = new URL(pathOverride ?? req.url, API_ORIGIN);
  const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
  const headers = { ...req.headers, host: target.host };
  headers['x-forwarded-for'] = [req.headers['x-forwarded-for'], req.socket.remoteAddress].filter(Boolean).join(', ');
  headers['x-forwarded-proto'] = req.headers['x-forwarded-proto'] ?? 'http';
  let timedOut = false;
  const giveUp = () => {
    timedOut = true;
    upstream.destroy();
  };
  const upstream = send(target, { method: req.method, headers }, (up) => {
    clearTimeout(readTimer);
    res.writeHead(up.statusCode ?? 502, up.headers);
    up.pipe(res);
  });
  // A host that is down may never refuse the connection, so do not wait for ever. Uploads can
  // take a long time to send, so only reads get a limit on waiting for the answer.
  const connectTimer = setTimeout(giveUp, PROXY_CONNECT_TIMEOUT_MS);
  const readTimer = req.method === 'GET' || req.method === 'HEAD' ? setTimeout(giveUp, PROXY_READ_TIMEOUT_MS) : undefined;
  upstream.on('socket', (socket) => {
    if (!socket.connecting) return clearTimeout(connectTimer);
    socket.once('connect', () => clearTimeout(connectTimer));
  });
  upstream.on('close', () => {
    clearTimeout(connectTimer);
    clearTimeout(readTimer);
  });
  upstream.on('error', () => {
    if (timedOut) proxyError(res, 503, 'The server is taking too long to answer right now.');
    else proxyError(res, 502, 'The server is not reachable right now.');
  });
  req.pipe(upstream);
}

async function serveFile(req, res, file, pathname, info) {
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  const immutable = pathname.startsWith('/assets/');
  if (pathname === VERSION_PATH) return sendVersion(req, res, file, SECURITY_HEADERS);
  if (pathname === '/robots.txt') {
    const text = (await readFile(file, 'utf8')).replaceAll('__SITE_URL__', SITE_URL);
    return sendText(req, res, 200, { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': 'public, max-age=3600' }, text);
  }

  // Pick a precompressed copy the client accepts.
  let body = { file, size: info.size, encoding: null };
  const encodings = accepted(req);
  const compressible = COMPRESSIBLE.test(type) || file.endsWith('.wasm');
  if (compressible) {
    for (const { encoding, ext } of PRECOMPRESSED) {
      if (!encodings.has(encoding)) continue;
      const alt = await stat(file + ext).catch(() => null);
      if (alt?.isFile()) {
        body = { file: file + ext, size: alt.size, encoding };
        break;
      }
    }
  }

  // Validators come from the original file; each encoding gets its own ETag.
  const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}${body.encoding ? `-${body.encoding}` : ''}"`;
  const headers = {
    ...SECURITY_HEADERS,
    'Content-Type': type,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    ETag: etag,
    'Last-Modified': info.mtime.toUTCString(),
    ...(compressible ? { Vary: 'Accept-Encoding' } : {}),
  };

  const ifNoneMatch = req.headers['if-none-match'];
  const ifModifiedSince = Date.parse(req.headers['if-modified-since'] ?? '');
  const fresh = ifNoneMatch
    ? etagMatches(ifNoneMatch, etag)
    : Number.isFinite(ifModifiedSince) && Math.floor(info.mtimeMs / 1000) <= Math.floor(ifModifiedSince / 1000);
  if (fresh) {
    res.writeHead(304, headers);
    return res.end();
  }

  res.writeHead(200, { ...headers, 'Content-Length': body.size, ...(body.encoding ? { 'Content-Encoding': body.encoding } : {}) });
  if (req.method === 'HEAD') return res.end();
  createReadStream(body.file).on('error', () => res.destroy()).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://local');
    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith('/api/')) return proxy(req, res);
    if (pathname === '/sitemap.xml') return proxy(req, res, '/api/sitemap.xml');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, SECURITY_HEADERS);
      return res.end();
    }

    // Static files (path traversal is blocked by normalising inside DIST). Dot paths such as
    // /.vite/manifest.json are build metadata, not site files.
    if (pathname.includes('/.')) {
      res.writeHead(404, SECURITY_HEADERS);
      return res.end('Not found');
    }
    const file = normalize(join(DIST, pathname));
    if (file.startsWith(DIST) && pathname !== '/' && pathname !== '/index.html') {
      const info = await stat(file).catch(() => null);
      if (info?.isFile()) return serveFile(req, res, file, pathname, info);
      if (/\.[a-z0-9]+$/i.test(pathname)) {
        res.writeHead(404, SECURITY_HEADERS);
        return res.end('Not found');
      }
    }

    // A page route: inject SEO metadata, and for public pages the saved public data, into the app shell.
    const withData = wantsSnapshot(pathname);
    const [fetched, snapshot] = await Promise.all([
      seoFor(pathname),
      withData ? snapshots.forPage(apiLooksDown() ? 0 : SEO_TIMEOUT_MS) : null,
    ]);
    const seo = fetched ?? (withData ? fallbackSeo(snapshots.site(), pathname) : null);
    let html = withPreloads(
      seo ? template.replace(/<!--seo-start-->[\s\S]*<!--seo-end-->/, `<!--seo-start-->\n${renderHead(seo)}\n    <!--seo-end-->`) : template,
      pathname,
    );
    if (snapshot) html = injectSnapshot(html, snapshot);
    const headers = {
      ...SECURITY_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      ...(seo?.noindex ? { 'X-Robots-Tag': 'noindex' } : {}),
    };
    return sendText(req, res, seo && seo.title?.startsWith('Page not found') ? 404 : 200, headers, html);
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', msg: 'request failed', url: req.url, error: String(error) }));
    if (!res.headersSent) res.writeHead(500, SECURITY_HEADERS);
    res.end('Something went wrong');
  }
});

server.listen(PORT, () => {
  console.log(JSON.stringify({ level: 'info', msg: `web listening on :${PORT}`, api: API_ORIGIN.origin }));
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    snapshots.stop();
    server.close(() => process.exit(0));
  });
}
