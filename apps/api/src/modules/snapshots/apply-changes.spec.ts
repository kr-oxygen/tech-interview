import { applyChanges, applyEdits, editStats, type Edit } from '@ti/shared';

const ch = (rangeOffset: number, rangeLength: number, text: string) => ({
  range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
  rangeOffset,
  rangeLength,
  text,
});

describe('applyChanges / applyEdits', () => {
  it('inserts, deletes and replaces', () => {
    expect(applyChanges('abc', [ch(3, 0, 'd')])).toBe('abcd');
    expect(applyChanges('abcd', [ch(1, 2, '')])).toBe('ad');
    expect(applyChanges('abcd', [ch(1, 2, 'XY')])).toBe('aXYd');
  });

  it('applies multi-cursor changes against the pre-edit document regardless of order', () => {
    // Monaco offsets in one event refer to the original text.
    expect(applyChanges('a b c', [ch(0, 1, 'A'), ch(4, 1, 'C')])).toBe('A b C');
    expect(applyChanges('a b c', [ch(4, 1, 'C'), ch(0, 1, 'A')])).toBe('A b C');
  });

  it('applies sequential edits in order', () => {
    const edits: Edit[] = [
      { source: 'input', at: 0, changes: [ch(0, 0, 'x')] },
      { source: 'input', at: 0, changes: [ch(1, 0, 'y')] },
    ];
    expect(applyEdits('', edits)).toBe('xy');
    expect(editStats(edits)).toEqual({ inserted: 2, deleted: 0, maxInsert: 1 });
  });

  it('rejects out-of-bounds changes', () => {
    expect(() => applyChanges('ab', [ch(1, 5, '')])).toThrow(RangeError);
  });
});
