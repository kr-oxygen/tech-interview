import { computeAllInsights, detectInsights, type InsightEvent } from './insights';
import { INSIGHTS_CONFIG as C } from './insights.config';

let seq = 0;
const ev = (type: string, at: number, payload: Record<string, unknown> = {}): InsightEvent => ({
  seq: ++seq,
  type,
  at,
  payload,
});

describe('insights', () => {
  beforeEach(() => (seq = 0));

  it('correlates a paste with an earlier copy', () => {
    const text = 'x'.repeat(640);
    const copy = ev('COPY', 1_000, { text, length: 640 });
    const paste = ev('PASTE', 36_000, { text, length: 640 });
    const [i] = detectInsights(paste, [copy]);
    expect(i.type).toBe('COPY_PASTE_MATCH');
    expect(i.details.matchPercent).toBe(100);
    expect(i.relatedSeq).toEqual([copy.seq, paste.seq]);
  });

  it('reports a large paste without matching copy, as an observation', () => {
    const [i] = detectInsights(ev('PASTE', 0, { text: 'y'.repeat(850), length: 850 }), []);
    expect(i.type).toBe('LARGE_EXTERNAL_PASTE');
    expect(i.message).toMatch(/source of the text is unknown/);
  });

  it('ignores small unmatched pastes and copies outside the window', () => {
    expect(detectInsights(ev('PASTE', 0, { text: 'short', length: 5 }), [])).toEqual([]);
    const old = ev('COPY', 0, { text: 'z'.repeat(300) });
    const [i] = detectInsights(
      ev('PASTE', C.copyPasteWindowMs + 1, { text: 'z'.repeat(300), length: 300 }),
      [old],
    );
    expect(i.type).toBe('LARGE_EXTERNAL_PASTE');
  });

  it('reports rapid typed insertion once when crossing the threshold', () => {
    const events = [
      ev('TEXT_INSERT', 0, { typedInserted: 200 }),
      ev('TEXT_INSERT', 2_000, { typedInserted: 150 }),
      ev('TEXT_INSERT', 3_000, { typedInserted: 100 }),
    ];
    const found = computeAllInsights(events).filter((i) => i.type === 'RAPID_INSERTION');
    expect(found).toHaveLength(1);
    expect(found[0].relatedSeq).toEqual([2]);
  });

  it('does not count pasted text as typed', () => {
    expect(computeAllInsights([ev('TEXT_INSERT', 0, { typedInserted: 0, inserted: 900 })])).toEqual(
      [],
    );
  });

  it('reports frequent tab switching every N hides', () => {
    const events = Array.from({ length: 10 }, (_, k) => ev('TAB_HIDDEN', k * 10_000));
    expect(
      computeAllInsights(events).filter((i) => i.type === 'FREQUENT_TAB_SWITCHING'),
    ).toHaveLength(2);
  });

  it('reports long idle and session locks', () => {
    expect(detectInsights(ev('IDLE', 0, { phase: 'end', idleMs: C.longIdleMs }), [])[0].type).toBe(
      'LONG_IDLE',
    );
    expect(detectInsights(ev('IDLE', 0, { phase: 'start', idleMs: C.longIdleMs }), [])).toEqual([]);
    expect(
      detectInsights(ev('SESSION_LOCKED', 0, { reason: 'PAGE_UNLOAD', lockCount: 1 }), [])[0].type,
    ).toBe('SESSION_LOCKED');
  });
});
