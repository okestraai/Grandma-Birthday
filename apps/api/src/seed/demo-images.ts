import sharp from 'sharp';

/**
 * Generated placeholder artwork for demo data. No text is drawn (so rendering does not
 * depend on installed fonts) and no real people are depicted. Replace with real photos
 * through the admin dashboard.
 */

type Palette = [string, string, string];

export const PALETTES: Record<string, Palette> = {
  sepia: ['#3b2a1a', '#8a6a44', '#e9d7b5'],
  emerald: ['#071A2B', '#0B3D35', '#D6B36A'],
  dusk: ['#1d2340', '#6b4a6e', '#f1c7a0'],
  garden: ['#0f2e22', '#3f7a4f', '#f4e7c3'],
  ivory: ['#b9a27a', '#efe4cc', '#fbf8f1'],
  night: ['#05101c', '#12365a', '#d6b36a'],
  rose: ['#3a1622', '#a0525e', '#f6dcc9'],
};

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** A soft "photograph": gradient light, bokeh and a few gentle silhouettes. */
export async function scene(seed: number, palette: Palette, width = 1600, height = 1067, people = 3): Promise<Buffer> {
  const r = rng(seed);
  const [dark, mid, light] = palette;
  const bokeh = Array.from({ length: 22 }, () => {
    const cx = Math.round(r() * width);
    const cy = Math.round(r() * height * 0.7);
    const rad = Math.round(20 + r() * 90);
    return `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${light}" opacity="${(0.05 + r() * 0.18).toFixed(2)}"/>`;
  }).join('');
  const figures = Array.from({ length: people }, (_, i) => {
    const x = Math.round(((i + 1) / (people + 1)) * width + (r() - 0.5) * 80);
    const scale = 0.8 + r() * 0.35;
    const headR = Math.round(58 * scale);
    const headY = Math.round(height * 0.5 - 40 * scale);
    const bodyW = Math.round(190 * scale);
    return `<g fill="${dark}" opacity="0.82">
      <circle cx="${x}" cy="${headY}" r="${headR}"/>
      <path d="M ${x - bodyW / 2} ${height} Q ${x - bodyW / 2} ${headY + headR * 1.4} ${x} ${headY + headR * 1.2} Q ${x + bodyW / 2} ${headY + headR * 1.4} ${x + bodyW / 2} ${height} Z"/>
    </g>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${dark}"/><stop offset="0.55" stop-color="${mid}"/><stop offset="1" stop-color="${light}"/>
      </linearGradient>
      <radialGradient id="glow" cx="${(0.3 + r() * 0.4).toFixed(2)}" cy="0.3" r="0.7">
        <stop offset="0" stop-color="${light}" stop-opacity="0.55"/><stop offset="1" stop-color="${light}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="vignette" cx="0.5" cy="0.5" r="0.75">
        <stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <rect width="100%" height="100%" fill="url(#glow)"/>
    ${bokeh}
    ${figures}
    <rect width="100%" height="100%" fill="url(#vignette)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 86 }).toBuffer();
}

/** A portrait: single silhouette with a gold rim light, portrait orientation. */
export async function portrait(seed: number, palette: Palette = PALETTES.emerald, width = 1200, height = 1500): Promise<Buffer> {
  const [dark, mid, light] = palette;
  const r = rng(seed);
  const cx = width / 2 + (r() - 0.5) * 60;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <radialGradient id="bg" cx="0.5" cy="0.35" r="0.8">
        <stop offset="0" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/>
      </radialGradient>
      <linearGradient id="rim" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${light}" stop-opacity="0.9"/><stop offset="0.25" stop-color="${light}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <circle cx="${cx + 140}" cy="${height * 0.2}" r="260" fill="${light}" opacity="0.12"/>
    <g>
      <ellipse cx="${cx}" cy="${height * 0.38}" rx="170" ry="205" fill="${dark}"/>
      <path d="M ${cx - 420} ${height} C ${cx - 400} ${height * 0.66} ${cx - 190} ${height * 0.6} ${cx} ${height * 0.6} C ${cx + 190} ${height * 0.6} ${cx + 400} ${height * 0.66} ${cx + 420} ${height} Z" fill="${dark}"/>
      <ellipse cx="${cx}" cy="${height * 0.38}" rx="170" ry="205" fill="url(#rim)"/>
      <path d="M ${cx - 420} ${height} C ${cx - 400} ${height * 0.66} ${cx - 190} ${height * 0.6} ${cx} ${height * 0.6} L ${cx} ${height} Z" fill="url(#rim)"/>
    </g>
    <circle cx="${cx - 60}" cy="${height * 0.68}" r="14" fill="${light}" opacity="0.8"/>
    <circle cx="${cx - 20}" cy="${height * 0.7}" r="14" fill="${light}" opacity="0.8"/>
    <circle cx="${cx + 20}" cy="${height * 0.7}" r="14" fill="${light}" opacity="0.8"/>
    <circle cx="${cx + 60}" cy="${height * 0.68}" r="14" fill="${light}" opacity="0.8"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}
