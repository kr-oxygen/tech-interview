export const LANGUAGES = ['javascript', 'typescript', 'go'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Display names: `name` for text, `short` for chips. */
export const LANGUAGE_LABELS: Record<Language, { name: string; short: string }> = {
  typescript: { name: 'TypeScript', short: 'TS' },
  javascript: { name: 'JavaScript', short: 'JS' },
  go: { name: 'Go', short: 'Go' },
};

export const SESSION_STATUSES = ['CREATED', 'ACTIVE', 'LOCKED', 'ENDED', 'EXPIRED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const LOCK_REASONS = ['PAGE_UNLOAD', 'DISCONNECT_TIMEOUT'] as const;
export type LockReason = (typeof LOCK_REASONS)[number];

export const SNAPSHOT_REASONS = [
  'INITIAL',
  'PERIODIC',
  'LARGE_CHANGE',
  'TASK_SWITCH',
  'SESSION_END',
  'RESYNC',
] as const;
export type SnapshotReason = (typeof SNAPSHOT_REASONS)[number];

/** Types persisted in ActivityEvent.eventType */
export const ACTIVITY_EVENT_TYPES = [
  // editing
  'TEXT_INSERT',
  'TEXT_DELETE',
  'TEXT_CHANGE',
  'DOCUMENT_RESYNC',
  // clipboard
  'COPY',
  'CUT',
  'PASTE',
  'SELECTION',
  // editor / browser
  'EDITOR_FOCUS',
  'EDITOR_BLUR',
  'TAB_HIDDEN',
  'TAB_VISIBLE',
  'WINDOW_FOCUS',
  'WINDOW_BLUR',
  'IDLE',
  'NAVIGATION_BACK',
  'PAGE_UNLOAD',
  // session lifecycle (server generated)
  'SESSION_STARTED',
  'SESSION_ENDED',
  'CANDIDATE_CONNECTED',
  'CANDIDATE_DISCONNECTED',
  'SESSION_LOCKED',
  'RETURN_ALLOWED',
  'SESSION_RESUMED',
  'TASK_SWITCH',
] as const;
export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

export const INSIGHT_TYPES = [
  'COPY_PASTE_MATCH',
  'LARGE_EXTERNAL_PASTE',
  'RAPID_INSERTION',
  'FREQUENT_TAB_SWITCHING',
  'LONG_IDLE',
  'SESSION_LOCKED',
] as const;
export type InsightType = (typeof INSIGHT_TYPES)[number];

export const EDIT_SOURCES = ['input', 'paste', 'undo', 'redo', 'other'] as const;
export type EditSource = (typeof EDIT_SOURCES)[number];
