import type { InsightDto } from '@ti/shared';
import { INSIGHTS_CONFIG as C } from './insights.config';
import { similarityPercent } from './similarity';

export interface InsightEvent {
  seq: number;
  type: string;
  at: number; // server timestamp, ms
  payload: Record<string, unknown>;
}

/** Event types an insight rule may need to look back at. */
export const INSIGHT_HISTORY_TYPES = ['COPY', 'CUT', 'TEXT_INSERT', 'TEXT_CHANGE', 'TAB_HIDDEN'];
export const INSIGHT_HISTORY_WINDOW_MS = Math.max(
  C.copyPasteWindowMs,
  C.rapidInsertWindowMs,
  C.tabSwitchWindowMs,
);

const num = (v: unknown) => (typeof v === 'number' ? v : 0);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

function insight(
  type: InsightDto['type'],
  severity: InsightDto['severity'],
  ev: InsightEvent,
  message: string,
  relatedSeq: number[],
  details: Record<string, unknown> = {},
): InsightDto {
  return {
    id: `${type}:${ev.seq}`,
    type,
    severity,
    message,
    at: new Date(ev.at).toISOString(),
    relatedSeq,
    details,
  };
}

/**
 * Observations triggered by `ev`, given earlier events (`history`, ascending, may include
 * events outside the windows). Pure and deterministic: used both live and for full recompute.
 * Messages are observations, not conclusions.
 */
export function detectInsights(ev: InsightEvent, history: InsightEvent[]): InsightDto[] {
  const out: InsightDto[] = [];
  const within = (ms: number) => history.filter((h) => h.at >= ev.at - ms && h.seq < ev.seq);

  switch (ev.type) {
    case 'PASTE': {
      const text = str(ev.payload.text);
      const length = num(ev.payload.length) || text.length;
      let best: { seq: number; pct: number; type: string; origin: unknown } | null = null;
      for (const h of within(C.copyPasteWindowMs)) {
        if (h.type !== 'COPY' && h.type !== 'CUT') continue;
        const pct = similarityPercent(str(h.payload.text), text, C.similarityMaxChars);
        if (!best || pct >= best.pct)
          best = { seq: h.seq, pct, type: h.type, origin: h.payload.origin };
      }
      if (best && best.pct >= C.copyPasteMatchMin) {
        out.push(
          insight(
            'COPY_PASTE_MATCH',
            'info',
            ev,
            `Pasted ${length} characters matching text ${best.type === 'CUT' ? 'cut' : 'copied'} earlier ${
              best.origin === 'task_description'
                ? 'from the task description'
                : best.origin === 'page'
                  ? 'from the interview page'
                  : 'in the editor'
            } (${best.pct}% match).`,
            [best.seq, ev.seq],
            { matchPercent: best.pct, sourceSeq: best.seq, length },
          ),
        );
      } else if (length >= C.largePasteChars) {
        out.push(
          insight(
            'LARGE_EXTERNAL_PASTE',
            'notice',
            ev,
            `Pasted ${length} characters with no matching copy recorded on the interview page. The source of the text is unknown.`,
            [ev.seq],
            { length, bestMatchPercent: best?.pct ?? 0 },
          ),
        );
      }
      break;
    }
    case 'TEXT_INSERT':
    case 'TEXT_CHANGE': {
      const typed = num(ev.payload.typedInserted);
      if (typed === 0) break;
      const before = within(C.rapidInsertWindowMs)
        .filter((h) => h.type === 'TEXT_INSERT' || h.type === 'TEXT_CHANGE')
        .reduce((s, h) => s + num(h.payload.typedInserted), 0);
      // Report only when the threshold is crossed, so one burst yields one observation.
      if (before < C.rapidInsertChars && before + typed >= C.rapidInsertChars) {
        out.push(
          insight(
            'RAPID_INSERTION',
            'notice',
            ev,
            `${before + typed} characters were inserted without a paste within ${C.rapidInsertWindowMs / 1000} seconds.`,
            [ev.seq],
            { chars: before + typed, windowMs: C.rapidInsertWindowMs },
          ),
        );
      }
      break;
    }
    case 'TAB_HIDDEN': {
      const count = within(C.tabSwitchWindowMs).filter((h) => h.type === 'TAB_HIDDEN').length + 1;
      if (count % C.tabSwitchCount === 0) {
        out.push(
          insight(
            'FREQUENT_TAB_SWITCHING',
            'info',
            ev,
            `The interview tab was hidden ${count} times within ${C.tabSwitchWindowMs / 60_000} minutes.`,
            [ev.seq],
            { count, windowMs: C.tabSwitchWindowMs },
          ),
        );
      }
      break;
    }
    case 'IDLE': {
      const idleMs = num(ev.payload.idleMs);
      if (ev.payload.phase === 'end' && idleMs >= C.longIdleMs) {
        out.push(
          insight(
            'LONG_IDLE',
            'info',
            ev,
            `No editor activity for ${Math.round(idleMs / 60_000)} minutes.`,
            [ev.seq],
            { idleMs },
          ),
        );
      }
      break;
    }
    case 'SESSION_LOCKED': {
      out.push(
        insight(
          'SESSION_LOCKED',
          'notice',
          ev,
          `The candidate left the interview page (${str(ev.payload.reason) || 'unknown reason'}); the session was paused (${num(ev.payload.lockCount)} time(s) in total).`,
          [ev.seq],
          { reason: ev.payload.reason, lockCount: ev.payload.lockCount },
        ),
      );
      break;
    }
  }
  return out;
}

/** Recomputes all observations for a full, ascending event list. */
export function computeAllInsights(events: InsightEvent[]): InsightDto[] {
  const out: InsightDto[] = [];
  const relevant: InsightEvent[] = [];
  for (const ev of events) {
    // Drop history older than the widest window to keep this linear-ish.
    while (relevant.length && relevant[0].at < ev.at - INSIGHT_HISTORY_WINDOW_MS) relevant.shift();
    out.push(...detectInsights(ev, relevant));
    if (INSIGHT_HISTORY_TYPES.includes(ev.type)) relevant.push(ev);
  }
  return out;
}
