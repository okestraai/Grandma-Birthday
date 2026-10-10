import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { healStaleDevBundle, isStaleDevError } from './dev-heal';

const reload = vi.fn();

beforeEach(() => {
  sessionStorage.clear();
  reload.mockReset();
  vi.stubGlobal('location', { ...window.location, reload });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dev self-repair for a stale Vite bundle', () => {
  it('recognises two copies of React and outdated dependency files', () => {
    expect(isStaleDevError(new TypeError("Cannot read properties of null (reading 'useContext')"))).toBe(true);
    expect(isStaleDevError(new TypeError("Cannot read properties of null (reading 'useState')"))).toBe(true);
    expect(isStaleDevError(new TypeError("null is not an object (evaluating 'dispatcher.useState')"))).toBe(true);
    expect(isStaleDevError(new Error('Invalid hook call. Hooks can only be called inside of the body of a function component.'))).toBe(true);
    expect(isStaleDevError(new Error('Outdated Optimize Dep'))).toBe(true);
  });

  it('leaves ordinary errors alone', () => {
    expect(isStaleDevError(new TypeError("Cannot read properties of undefined (reading 'toLocaleString')"))).toBe(false);
    expect(isStaleDevError(new TypeError("Cannot read properties of null (reading 'name')"))).toBe(false);
    // Missing page code after a deploy is handled by chunk-reload, not here.
    expect(isStaleDevError(new TypeError('Failed to fetch dynamically imported module: /src/pages/public/AboutPage.tsx'))).toBe(false);
    expect(healStaleDevBundle(new Error('Something else'))).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads once, then not again within the guard window', () => {
    const error = new TypeError("Cannot read properties of null (reading 'useContext')");
    expect(healStaleDevBundle(error)).toBe(true);
    expect(healStaleDevBundle(error)).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('reloads again once the guard window has passed', () => {
    const error = new Error('Invalid hook call.');
    expect(healStaleDevBundle(error)).toBe(true);
    sessionStorage.setItem('bp:dev-heal', String(Date.now() - 20_000));
    expect(healStaleDevBundle(error)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
