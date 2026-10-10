#!/usr/bin/env node
/**
 * Generates the assets for the liquid-metal "70" in the home hero:
 *   apps/web/public/brand/seventy-mask.png   solid glyphs on a transparent background (the shader mask)
 *   apps/web/public/brand/seventy-gold.svg   the same outline filled with the brand gold gradient
 *   apps/web/src/components/public/effects/seventy-geometry.ts   where the artwork sits, in em
 *   apps/web/src/components/public/effects/seventy-outline.ts    the outline (y up, font units) for the
 *     3D medallion on the Event page; kept apart so it only ships in the medallion's lazy chunk
 *
 * The outline is "70" in Playfair Display at weight 600 with lining figures and -0.04em
 * tracking, which is how the hero renders it in CSS (font-semibold lining-nums tracking-[-0.04em]).
 * The geometry file lets the page lay the effect exactly over the live text.
 *
 * fontkit cannot build a variation instance from a WOFF2 file, so the weight is applied by
 * running the font's own gvar deltas over the default outlines (see `glyphsAt`).
 *
 * Run from the repo root: node scripts/generate-seventy.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const fontkit = require('fontkit');
const sharp = require('sharp');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fontFile = path.join(root, 'node_modules/@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2');

const TEXT = '70';
const WEIGHT = 600;
const TRACKING_EM = -0.04;
/**
 * Kerning between "7" and "0" at weight 600, in font units. The font's GPOS kerning is variable
 * (0 at weight 400) and fontkit does not evaluate those deltas, so this is measured in Chrome:
 * width("70") - width("7") - width("0") at font-size 1000px, weight 600, lining figures.
 */
const KERN_7_0 = -6.4;
const PAD_EM = 0.03; // transparent margin around the outline, so the shader never clips at the edge
const MASK_WIDTH = 1200; // px; the shader works on a 512px-short-side copy, so this is plenty

/** Outlines of `text` at the given weight, with advances, in font units (y up). */
function glyphsAt(text, weight) {
  const base = fontkit.openSync(fontFile);
  const varied = fontkit.openSync(fontFile);
  varied.variationCoords = [weight];
  const processor = varied._variationProcessor;
  const run = base.layout(text, ['lnum']);
  return run.glyphs.map((glyph) => {
    const decoded = glyph._decode();
    const advance = glyph.advanceWidth;
    // Two phantom points carry the advance width through the variation.
    const Point = decoded.points[0].constructor;
    const points = [...decoded.points.map((p) => p.copy()), new Point(false, true, 0, 0), new Point(false, true, advance, 0), new Point(false, true, 0, 0), new Point(false, true, 0, 0)];
    processor.transformPoints(glyph.id, points);
    const phantom = points.splice(-4, 4);
    decoded.points.forEach((p, i) => {
      p.x = points[i].x;
      p.y = points[i].y;
    });
    base._glyphs[glyph.id] = null; // drop any cached path so it is rebuilt from the varied points
    const fresh = base.getGlyph(glyph.id);
    return { path: fresh.path, advance: phantom[1].x - phantom[0].x, upm: base.unitsPerEm };
  });
}

const glyphs = glyphsAt(TEXT, WEIGHT);
const upm = glyphs[0].upm;
const tracking = TRACKING_EM * upm;

// Lay out in font units, y down (SVG), baseline at y = 0.
let x = 0;
let minX = Infinity;
let minY = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;
const parts = [];
const partsUp = []; // y up, for three.js shapes
for (const g of glyphs) {
  partsUp.push(g.path.translate(x, 0).toSVG());
  const p = g.path.scale(1, -1).translate(x, 0);
  const b = p.bbox;
  minX = Math.min(minX, b.minX);
  minY = Math.min(minY, b.minY);
  maxX = Math.max(maxX, b.maxX);
  maxY = Math.max(maxY, b.maxY);
  parts.push(p.toSVG());
  x += g.advance + tracking + KERN_7_0;
}
const pad = PAD_EM * upm;
const vb = { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad };
const r = (n) => Math.round(n * 100) / 100;
const viewBox = `${r(vb.x)} ${r(vb.y)} ${r(vb.w)} ${r(vb.h)}`;
const d = parts.join(' ');

const goldSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#B88A35"/>
      <stop offset="0.45" stop-color="#D6B36A"/>
      <stop offset="1" stop-color="#F1E3C0"/>
    </linearGradient>
  </defs>
  <path fill="url(#g)" d="${d}"/>
</svg>
`;
const maskHeight = Math.round((MASK_WIDTH * vb.h) / vb.w);
const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MASK_WIDTH}" height="${maskHeight}" viewBox="${viewBox}"><path fill="#fff" d="${d}"/></svg>`;

const brandDir = path.join(root, 'apps/web/public/brand');
mkdirSync(brandDir, { recursive: true });
writeFileSync(path.join(brandDir, 'seventy-gold.svg'), goldSvg);
console.log('wrote public/brand/seventy-gold.svg');
await sharp(Buffer.from(maskSvg)).png({ compressionLevel: 9 }).toFile(path.join(brandDir, 'seventy-mask.png'));
console.log(`wrote public/brand/seventy-mask.png (${MASK_WIDTH}x${maskHeight})`);

// Box of the image relative to the text's origin (start of the line, on the baseline), in em.
const em = (n) => Math.round((n / upm) * 10000) / 10000;
const geometry = `// Generated by scripts/generate-seventy.mjs. Do not edit by hand.
/**
 * Where the "70" artwork in /brand/seventy-*.{png,svg} sits relative to the live text:
 * offsets are in em from the start of the text on its baseline (top is negative: above it).
 */
export const SEVENTY_ART = {
  maskSrc: '/brand/seventy-mask.png',
  goldSrc: '/brand/seventy-gold.svg',
  left: ${em(vb.x)},
  top: ${em(vb.y)},
  width: ${em(vb.w)},
  height: ${em(vb.h)},
} as const;
`;
const outline = `// Generated by scripts/generate-seventy.mjs. Do not edit by hand.
/** The hero's "70" as an SVG path in font units (${upm} per em), y pointing up, baseline at 0. */
export const SEVENTY_OUTLINE = {
  unitsPerEm: ${upm},
  minX: ${r(minX)},
  maxX: ${r(maxX)},
  minY: ${r(-maxY)},
  maxY: ${r(-minY)},
  d: '${partsUp.join(' ')}',
} as const;
`;
const effectsDir = path.join(root, 'apps/web/src/components/public/effects');
mkdirSync(effectsDir, { recursive: true });
writeFileSync(path.join(effectsDir, 'seventy-geometry.ts'), geometry);
console.log('wrote src/components/public/effects/seventy-geometry.ts');
writeFileSync(path.join(effectsDir, 'seventy-outline.ts'), outline);
console.log('wrote src/components/public/effects/seventy-outline.ts');
