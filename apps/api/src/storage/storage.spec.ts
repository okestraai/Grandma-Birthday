import { storageLevel } from './quota.service';
import { parseRange } from './storage.service';

describe('storageLevel', () => {
  it.each([
    [0, 'OK'],
    [79.9, 'OK'],
    [80, 'WARNING'],
    [94.9, 'WARNING'],
    [95, 'CRITICAL'],
    [99.9, 'CRITICAL'],
    [100, 'FULL'],
    [120, 'FULL'],
  ] as const)('%s%% is %s', (percent, level) => {
    expect(storageLevel(percent)).toBe(level);
  });
});

describe('parseRange', () => {
  it('parses byte ranges for video seeking', () => {
    expect(parseRange('bytes=0-99')).toEqual({ offset: 0, count: 100 });
    expect(parseRange('bytes=500-')).toEqual({ offset: 500, count: undefined });
  });
  it('ignores missing, suffix and malformed ranges', () => {
    expect(parseRange(undefined)).toBeNull();
    expect(parseRange('bytes=-500')).toBeNull();
    expect(parseRange('bytes=9-3')).toBeNull();
    expect(parseRange('items=0-1')).toBeNull();
  });
});
