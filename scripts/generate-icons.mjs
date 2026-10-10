#!/usr/bin/env node
/**
 * Generates the web app's static brand assets in apps/web/public:
 *   favicon.svg, favicon-32.png, apple-touch-icon.png (180), icon-192.png, icon-512.png,
 *   icon-maskable-512.png, og-default.jpg (1200x630).
 *
 * The "70" and the headline are converted to vector paths from the bundled Playfair Display
 * and Inter fonts (via fontkit), so the output does not depend on fonts installed on the machine.
 *
 * Run from the repo root: node scripts/generate-icons.mjs
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const fontkit = require('fontkit');
const sharp = require('sharp');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = (file) => path.join(root, 'apps/web/public', file);
const fontsDir = path.join(root, 'node_modules/@fontsource-variable');
const playfair = fontkit.openSync(path.join(fontsDir, 'playfair-display/files/playfair-display-latin-wght-normal.woff2'));
const inter = fontkit.openSync(path.join(fontsDir, 'inter/files/inter-latin-wght-normal.woff2'));

const NAVY = '#071A2B';
const EMERALD_DEEP = '#0B3D35';
const EMERALD = '#12665A';

/**
 * Lays out text as a single SVG path, scaled so the cap height (or given size) fits.
 * Returns the path plus its rendered width/height in output units.
 */
function textPath(font, text, fontSize, { features = [], letterSpacing = 0 } = {}) {
  const run = font.layout(text, features);
  const scale = fontSize / font.unitsPerEm;
  let x = 0;
  const parts = [];
  run.glyphs.forEach((glyph, i) => {
    const d = glyph.path.scale(scale, -scale).translate(x, 0).toSVG();
    parts.push(d);
    x += run.positions[i].xAdvance * scale + letterSpacing;
  });
  const width = x - letterSpacing;
  const bbox = run.bbox;
  return { d: parts.join(' '), width, top: -bbox.maxY * scale, bottom: -bbox.minY * scale, left: bbox.minX * scale };
}

/** "70" in lining figures, centred in a box of the given size. */
function seventy(fontSize, cx, cy) {
  const t = textPath(playfair, '70', fontSize, { features: ['lnum'] });
  const height = t.bottom - t.top;
  const x = cx - t.width / 2;
  const y = cy - t.top - height / 2;
  return `<path transform="translate(${x.toFixed(2)} ${y.toFixed(2)})" d="${t.d}"/>`;
}

function centeredText(font, text, fontSize, cx, baseline, opts) {
  const t = textPath(font, text, fontSize, opts);
  return `<path transform="translate(${(cx - t.width / 2).toFixed(2)} ${baseline})" d="${t.d}"/>`;
}

const goldGradient = (id) => `
  <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#B88A35"/>
    <stop offset="0.45" stop-color="#D6B36A"/>
    <stop offset="1" stop-color="#F1E3C0"/>
  </linearGradient>`;

/** Square icon. `bleed` = full-bleed background (apple/maskable); otherwise rounded corners. */
function iconSvg(size, { bleed = false, safe = 1, ring: showRing = true, text = 0.5 } = {}) {
  const r = bleed ? 0 : size * 0.22;
  const inner = size * safe;
  const ring = size * 0.5 - size * (1 - safe) * 0.5 - size * 0.07;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    ${goldGradient('g')}
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${NAVY}"/>
      <stop offset="1" stop-color="${EMERALD_DEEP}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/>
  ${showRing ? `<circle cx="${size / 2}" cy="${size / 2}" r="${ring.toFixed(2)}" fill="none" stroke="#D6B36A" stroke-opacity="0.55" stroke-width="${Math.max(1, size / 96).toFixed(2)}"/>` : ''}
  <g fill="url(#g)">${seventy(inner * text, size / 2, size / 2)}</g>
</svg>`;
}

function ogSvg() {
  const W = 1200;
  const H = 630;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    ${goldGradient('g')}
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${NAVY}"/>
      <stop offset="0.55" stop-color="${EMERALD_DEEP}"/>
      <stop offset="1" stop-color="${EMERALD}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.45">
      <stop offset="0" stop-color="#D6B36A" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#D6B36A" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="28" y="28" width="${W - 56}" height="${H - 56}" rx="18" fill="none" stroke="#D6B36A" stroke-opacity="0.45"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="12" fill="none" stroke="#D6B36A" stroke-opacity="0.18"/>
  <g fill="#D6B36A">${centeredText(inter, 'A PRIVATE CELEBRATION', 17, W / 2, 118, { letterSpacing: 6 })}</g>
  <g fill="url(#g)">${seventy(250, W / 2, 285)}</g>
  <g fill="none" stroke="#D6B36A" stroke-opacity="0.8">
    <line x1="${W / 2 - 90}" y1="440" x2="${W / 2 - 14}" y2="440"/>
    <line x1="${W / 2 + 14}" y1="440" x2="${W / 2 + 90}" y2="440"/>
  </g>
  <rect x="${W / 2 - 5}" y="435" width="10" height="10" fill="#D6B36A" transform="rotate(45 ${W / 2} 440)"/>
  <g fill="#FAF7F0">${centeredText(playfair, 'A Celebration of Seventy Years', 50, W / 2, 522)}</g>
  <g fill="#FAF7F0" fill-opacity="0.7">${centeredText(inter, 'Life  ·  Love  ·  Legacy', 20, W / 2, 568, { letterSpacing: 2 })}</g>
</svg>`;
}

async function png(svg, file, size) {
  await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(out(file));
  console.log('wrote', file);
}

// Tiny sizes drop the ring and enlarge the numerals so they stay legible in a browser tab.
writeFileSync(out('favicon.svg'), iconSvg(64, { ring: false, text: 0.62 }));
console.log('wrote favicon.svg');
await png(iconSvg(256, { ring: false, text: 0.62 }), 'favicon-32.png', 32);
await png(iconSvg(360, { bleed: true, safe: 0.9 }), 'apple-touch-icon.png', 180);
await png(iconSvg(384), 'icon-192.png', 192);
await png(iconSvg(512), 'icon-512.png', 512);
// Maskable icons keep their content inside the central 80% safe zone.
await png(iconSvg(512, { bleed: true, safe: 0.8 }), 'icon-maskable-512.png', 512);
await sharp(Buffer.from(ogSvg())).jpeg({ quality: 88, mozjpeg: true }).toFile(out('og-default.jpg'));
console.log('wrote og-default.jpg');
