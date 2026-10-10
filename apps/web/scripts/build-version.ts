// Gives every build an id, so open tabs can tell when a newer version has been deployed.
// The id is a hash of the emitted JS and CSS file names. Those names carry a content hash, so the
// id changes only when the shipped code changes; rebuilding the same code keeps it.
//
// The id goes into index.html as <meta name="app-build"> and into dist/version.json, which the
// app polls (src/lib/version.ts).

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';

/** Short id for a build, from its output file names (order and non-JS/CSS files do not matter). */
export function buildIdFrom(fileNames: Iterable<string>): string {
  const names = [...new Set(fileNames)].filter((name) => /\.(m?js|css)$/.test(name)).sort();
  return createHash('sha256').update(names.join('\n')).digest('hex').slice(0, 12);
}

const META = /<meta name="app-build" content="[^"]*"\s*\/?>/;

export function buildVersion(): Plugin {
  let injected: string | undefined;
  return {
    name: 'build-version',
    apply: 'build',
    // The HTML is transformed once every chunk has been rendered, so the bundle already lists them.
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        injected = buildIdFrom(Object.keys(ctx.bundle ?? {}));
        return [{ tag: 'meta', attrs: { name: 'app-build', content: injected }, injectTo: 'head' }];
      },
    },
    async writeBundle(options, bundle) {
      const dir = options.dir ?? path.resolve('dist');
      const buildId = buildIdFrom(Object.keys(bundle));
      // Should not happen, but if a later step emitted more code, the page must carry the final id.
      if (buildId !== injected) {
        const file = path.join(dir, 'index.html');
        const html = await readFile(file, 'utf8');
        await writeFile(file, html.replace(META, `<meta name="app-build" content="${buildId}">`));
        this.warn(`build id changed after the HTML was written (${injected} -> ${buildId}); index.html updated`);
      }
      await writeFile(path.join(dir, 'version.json'), `${JSON.stringify({ buildId, builtAt: new Date().toISOString() })}\n`);
    },
  };
}
