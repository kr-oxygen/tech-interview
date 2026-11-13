import type { ActivityEventDto, EditorRange } from '@ti/shared';
import type { TimelineFilter } from '../../stores/uiStore';
import { FILTER_TYPES } from '../../stores/uiStore';

export interface EventView {
  title: string;
  summary: string;
  category: TimelineFilter;
  /** Text worth showing in full in the details panel (copied/pasted/inserted text). */
  text?: string;
  range?: EditorRange;
  emphasis?: boolean;
}

const n = (v: unknown) => (typeof v === 'number' ? v : 0);
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const lines = (r?: EditorRange) =>
  r ? (r.startLineNumber === r.endLineNumber ? `line ${r.startLineNumber}` : `lines ${r.startLineNumber}–${r.endLineNumber}`) : '';

export function categoryOf(type: string): TimelineFilter {
  for (const [cat, types] of Object.entries(FILTER_TYPES)) {
    if ((types as string[]).includes(type)) return cat as TimelineFilter;
  }
  return 'session';
}

interface AppliedEdit {
  source: string;
  changes: Array<{ text: string; deletedText?: string; rangeLength: number }>;
}

export function describeEvent(e: ActivityEventDto): EventView {
  const p = e.payload;
  const category = categoryOf(e.eventType);
  switch (e.eventType) {
    case 'TEXT_INSERT':
    case 'TEXT_DELETE':
    case 'TEXT_CHANGE': {
      const edits = (p.edits as AppliedEdit[] | undefined) ?? [];
      const inserted = edits.flatMap((x) => x.changes.map((c) => c.text)).join('');
      const deleted = edits.flatMap((x) => x.changes.map((c) => c.deletedText ?? '')).join('');
      const sources = (p.sources as string[] | undefined) ?? [];
      const parts = [];
      if (n(p.inserted)) parts.push(`+${n(p.inserted)} chars`);
      if (n(p.deleted)) parts.push(`−${n(p.deleted)} chars`);
      const via = sources.filter((x) => x !== 'input');
      return {
        title: e.eventType === 'TEXT_INSERT' ? 'Inserted' : e.eventType === 'TEXT_DELETE' ? 'Deleted' : 'Changed',
        summary: `${parts.join(', ')}${via.length ? ` (${via.join(', ')})` : ''} · v${n(p.toVersion)}`,
        category,
        text: [inserted && `Inserted:\n${inserted}`, deleted && `Deleted:\n${deleted}`].filter(Boolean).join('\n\n'),
        emphasis: Boolean(p.isLarge),
      };
    }
    case 'DOCUMENT_RESYNC':
      return { title: 'Document re-synchronised', summary: `${n(p.length)} chars · v${n(p.docVersion)}`, category };
    case 'COPY':
    case 'CUT': {
      const range = p.selection as EditorRange | undefined;
      const where =
        p.origin === 'task_description' ? 'from task description' : p.origin === 'page' ? 'from page' : lines(range);
      return {
        title: e.eventType === 'COPY' ? (p.origin ? 'Copy outside editor' : 'Copy') : 'Cut',
        summary: `${n(p.length)} chars · ${where}${p.truncated ? ' · truncated' : ''}`,
        category,
        text: s(p.text),
        range,
        emphasis: n(p.length) >= 200,
      };
    }
    case 'PASTE': {
      const range = (p.range as EditorRange | null) ?? undefined;
      return {
        title: 'Paste',
        summary: `${n(p.length)} chars${range ? ` · ${lines(range)}` : ''}${p.truncated ? ' · truncated' : ''}`,
        category,
        text: s(p.text),
        range,
        emphasis: n(p.length) >= 200,
      };
    }
    case 'SELECTION': {
      const range = p.selection as EditorRange | undefined;
      return {
        title: 'Selection',
        summary: `${n(p.length)} chars · ${lines(range)}${p.truncated ? ' · truncated' : ''}`,
        category,
        range,
        text: typeof p.text === 'string' ? p.text : undefined,
      };
    }
    case 'EDITOR_FOCUS':
      return { title: 'Editor focused', summary: '', category };
    case 'EDITOR_BLUR':
      return { title: 'Editor lost focus', summary: '', category };
    case 'TAB_HIDDEN':
      return { title: 'Tab hidden', summary: 'Candidate switched away from the interview tab', category, emphasis: true };
    case 'TAB_VISIBLE':
      return { title: 'Tab visible', summary: 'Candidate returned to the interview tab', category };
    case 'WINDOW_BLUR':
      return { title: 'Window lost focus', summary: '', category };
    case 'WINDOW_FOCUS':
      return { title: 'Window focused', summary: '', category };
    case 'IDLE':
      return p.phase === 'end'
        ? { title: 'Activity resumed', summary: `after ${Math.round(n(p.idleMs) / 1000)} s idle`, category }
        : { title: 'Idle', summary: `no editor activity for ${Math.round(n(p.idleMs) / 1000)} s`, category };
    case 'NAVIGATION_BACK':
      return { title: 'Pressed Back', summary: 'Navigation was blocked and a warning shown', category, emphasis: true };
    case 'PAGE_UNLOAD':
      return { title: 'Left the page', summary: 'Tab closed, reloaded or navigated away', category, emphasis: true };
    case 'SESSION_STARTED':
      return { title: 'Session started', summary: '', category };
    case 'SESSION_ENDED':
      return { title: 'Session ended', summary: `by ${s(p.by)}`, category };
    case 'CANDIDATE_CONNECTED':
      return { title: 'Candidate connected', summary: '', category };
    case 'CANDIDATE_DISCONNECTED':
      return { title: 'Candidate disconnected', summary: '', category };
    case 'SESSION_LOCKED':
      return {
        title: 'Session paused',
        summary: s(p.reason) === 'PAGE_UNLOAD' ? 'Candidate left the page' : 'Connection lost for too long',
        category,
        emphasis: true,
      };
    case 'RETURN_ALLOWED':
      return {
        title: 'Return allowed',
        summary: p.newLink ? 'New link issued by interviewer' : 'Original link re-enabled by interviewer',
        category,
      };
    case 'SESSION_RESUMED':
      return { title: 'Session resumed', summary: 'Candidate returned through the link', category };
    case 'TASK_SWITCH':
      return { title: 'Switched task', summary: '', category };
    default:
      return { title: e.eventType, summary: '', category };
  }
}
