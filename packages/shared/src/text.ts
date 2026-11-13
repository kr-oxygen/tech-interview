import type { ContentChange, Edit } from './ws';

/**
 * Applies one Monaco content-change event. All changes in a single event refer to the
 * pre-edit document, so they are applied from the highest offset to the lowest.
 */
export function applyChanges(content: string, changes: ContentChange[]): string {
  const sorted = [...changes].sort((a, b) => b.rangeOffset - a.rangeOffset);
  let result = content;
  for (const c of sorted) {
    if (c.rangeOffset + c.rangeLength > result.length) {
      throw new RangeError(
        `Change out of bounds: offset ${c.rangeOffset}+${c.rangeLength} > ${result.length}`,
      );
    }
    result = result.slice(0, c.rangeOffset) + c.text + result.slice(c.rangeOffset + c.rangeLength);
  }
  return result;
}

/** Applies a sequence of Monaco content-change events in order. */
export function applyEdits(content: string, edits: Edit[]): string {
  return edits.reduce((acc, e) => applyChanges(acc, e.changes), content);
}

export interface EditStats {
  inserted: number;
  deleted: number;
  /** Largest single inserted text in the batch */
  maxInsert: number;
}

export function editStats(edits: Edit[]): EditStats {
  let inserted = 0;
  let deleted = 0;
  let maxInsert = 0;
  for (const e of edits) {
    for (const c of e.changes) {
      inserted += c.text.length;
      deleted += c.rangeLength;
      maxInsert = Math.max(maxInsert, c.text.length);
    }
  }
  return { inserted, deleted, maxInsert };
}
