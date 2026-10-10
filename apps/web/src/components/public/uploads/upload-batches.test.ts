import { EMPTY_RESULT, mergeResults, overallPercent, toBatches } from './upload-batches';

describe('upload batching', () => {
  it('splits into batches of five', () => {
    expect(toBatches([1, 2, 3, 4, 5, 6, 7]).map((b) => b.length)).toEqual([5, 2]);
    expect(toBatches([])).toEqual([]);
  });

  it('merges results across batches', () => {
    const merged = mergeResults(mergeResults(EMPTY_RESULT, { accepted: 2, rejected: [], moderated: false }), {
      accepted: 1,
      rejected: [{ filename: 'x.gif', code: 'UNSUPPORTED_FILE_TYPE', reason: 'Unsupported' }],
      moderated: true,
    });
    expect(merged).toEqual({ accepted: 3, rejected: [{ filename: 'x.gif', code: 'UNSUPPORTED_FILE_TYPE', reason: 'Unsupported' }], moderated: true });
  });

  it('computes overall progress by bytes', () => {
    expect(overallPercent(50, 25, 100)).toBe(75);
    expect(overallPercent(0, 0, 0)).toBe(0);
    expect(overallPercent(100, 50, 100)).toBe(100);
  });
});
