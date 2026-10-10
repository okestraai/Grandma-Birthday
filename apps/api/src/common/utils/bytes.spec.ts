import { formatSize } from './bytes';

describe('formatSize', () => {
  it('never rounds a real limit down to zero', () => {
    expect(formatSize(204800)).toBe('200 KB');
    expect(formatSize(102400)).toBe('100 KB');
    expect(formatSize(10 * 1024 * 1024)).toBe('10 MB');
    expect(formatSize(1.5 * 1024 ** 3)).toBe('1.5 GB');
    expect(formatSize(512)).toBe('512 bytes');
  });
});
