import { describe, expect, it } from 'vitest';
import { buildIdFrom } from './build-version';

describe('buildIdFrom', () => {
  const names = ['assets/index-BGd61v-D.js', 'assets/HomePage-a1b2c3.js', 'assets/index-CkEExe3i.css'];

  it('gives the same short id for the same file names, in any order', () => {
    const id = buildIdFrom(names);
    expect(id).toMatch(/^[0-9a-f]{12}$/);
    expect(buildIdFrom([...names].reverse())).toBe(id);
  });

  it('changes when a code file name changes', () => {
    expect(buildIdFrom(['assets/index-BGd61v-D.js', 'assets/HomePage-zzzzzz.js', 'assets/index-CkEExe3i.css'])).not.toBe(buildIdFrom(names));
  });

  it('ignores files that are not JS or CSS', () => {
    expect(buildIdFrom([...names, 'index.html', '.vite/manifest.json', 'assets/inter-latin-abc.woff2'])).toBe(buildIdFrom(names));
  });
});
