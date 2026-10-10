import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { buildVersion } from './scripts/build-version.ts';

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:4100';

// Opt-in HTTPS for testing the party camera on a phone on the same Wi-Fi (see scripts/dev-cert.sh).
const certDir = path.resolve(import.meta.dirname, '.cert');
const devHttps =
  process.env.DEV_HTTPS === '1' && fs.existsSync(path.join(certDir, 'cert.pem'))
    ? { key: fs.readFileSync(path.join(certDir, 'key.pem')), cert: fs.readFileSync(path.join(certDir, 'cert.pem')) }
    : undefined;

/**
 * Preloads the Latin files of the two variable fonts (Inter, Playfair Display upright), so the
 * browser fetches them with the CSS rather than after it has laid out the first text. The file
 * names come from the build output, because the hashes are only known then.
 */
function preloadFonts(): Plugin {
  const wanted = /^assets\/(inter-latin-wght-normal|playfair-display-latin-wght-normal)-[\w-]+\.woff2$/;
  return {
    name: 'preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        return Object.values(ctx.bundle ?? {})
          .filter((file) => file.type === 'asset' && wanted.test(file.fileName))
          .map((file) => ({
            tag: 'link',
            attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${file.fileName}`, crossorigin: '' },
            injectTo: 'head' as const,
          }));
      },
    },
  };
}

export default defineConfig({
  // The HTTPS phone-testing server keeps its own dependency cache, so it can run beside the
  // normal dev server without the two overwriting each other's pre-bundled React.
  cacheDir: devHttps ? 'node_modules/.vite-https' : 'node_modules/.vite',
  plugins: [react(), tailwindcss(), preloadFonts(), buildVersion()],
  // Pre-bundle every dependency the app uses when the dev server starts. Otherwise Vite discovers
  // packages lazily (charts, QR scanner, menus) as pages are first opened, re-bundles, and an open
  // tab can end up with two copies of React ("Invalid hook call" / reading 'useState' of null).
  optimizeDeps: {
    entries: ['index.html', 'src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}', '!src/test/**'],
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-router',
      '@tanstack/react-query',
      'motion/react',
      'radix-ui',
      'lucide-react',
      'react-hook-form',
      '@hookform/resolvers/zod',
      'zod',
      'sonner',
      'recharts',
      'qr-scanner',
      'clsx',
      'tailwind-merge',
      'class-variance-authority',
      // Public-page visual effects (loaded lazily, but pre-bundled so first use never re-bundles).
      'three',
      '@react-three/fiber',
      '@shadergradient/react',
      '@paper-design/shaders-react',
      'html2canvas',
    ],
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    port: 5173,
    https: devHttps,
    host: devHttps ? true : undefined,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/sitemap.xml': { target: apiTarget, rewrite: () => '/api/sitemap.xml' },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/sitemap.xml': { target: apiTarget, rewrite: () => '/api/sitemap.xml' },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    // server/index.mjs reads this to add modulepreload links for the home route's chunks.
    manifest: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.mjs', 'scripts/**/*.test.ts'],
  },
});
