import { z } from 'zod';
import { EDIT_SOURCES, type ActivityEventType } from './enums';
import type { ActivityEventDto, InsightDto, SessionDto, TaskStateDto } from './models';

// ---------- Primitive schemas ----------
export const rangeSchema = z.object({
  startLineNumber: z.number().int().min(1),
  startColumn: z.number().int().min(1),
  endLineNumber: z.number().int().min(1),
  endColumn: z.number().int().min(1),
});
export type EditorRange = z.infer<typeof rangeSchema>;

/** Mirrors Monaco IModelContentChange (offsets relative to the pre-edit document). */
export const contentChangeSchema = z.object({
  range: rangeSchema,
  rangeOffset: z.number().int().min(0),
  rangeLength: z.number().int().min(0),
  text: z.string().max(500_000),
});
export type ContentChange = z.infer<typeof contentChangeSchema>;

/** One Monaco content-change event (all changes share the same pre-edit state). */
export const editSchema = z.object({
  changes: z.array(contentChangeSchema).min(1).max(1000),
  /** Detected on the client: DOM paste flag, Monaco isUndoing/isRedoing, else input. */
  source: z.enum(EDIT_SOURCES).default('input'),
  at: z.number().int(),
});
export type Edit = z.infer<typeof editSchema>;

/** Every candidate event carries this envelope for dedup + ordering. */
export const envelopeSchema = z.object({
  clientEventId: z.string().uuid(),
  clientTimestamp: z.number().int(),
  taskId: z.string().uuid().nullable(),
});
export type Envelope = z.infer<typeof envelopeSchema>;

// ---------- Candidate -> Server ----------
export const C2S = {
  SESSION_JOIN: 'session:join',
  SESSION_START: 'session:start',
  SESSION_END: 'session:end',
  TASK_SWITCH: 'task:switch',
  EDITOR_CHANGE: 'editor:change',
  EDITOR_RESYNC: 'editor:resync',
  EDITOR_COPY: 'editor:copy',
  EDITOR_CUT: 'editor:cut',
  EDITOR_PASTE: 'editor:paste',
  EDITOR_SELECTION: 'editor:selection',
  EDITOR_FOCUS: 'editor:focus',
  EDITOR_BLUR: 'editor:blur',
  EDITOR_IDLE: 'editor:idle',
  BROWSER_VISIBILITY: 'browser:visibility',
  BROWSER_WINDOW_FOCUS: 'browser:window-focus',
  BROWSER_NAVIGATION_BACK: 'browser:navigation-back',
  /** Copy outside the editor (e.g. from the task description). */
  PAGE_COPY: 'page:copy',
} as const;

export const MAX_CLIPBOARD_TEXT = 100_000;
/** Selected text is recorded up to this length (longer selections are truncated). */
export const MAX_SELECTION_TEXT = 10_000;
export const MAX_DOCUMENT_SIZE = 500_000;

const clipboardText = z.string().max(MAX_CLIPBOARD_TEXT);

export const editorChangeSchema = envelopeSchema.extend({
  taskId: z.string().uuid(),
  fromVersion: z.number().int().min(0),
  toVersion: z.number().int().min(1),
  edits: z.array(editSchema).min(1).max(500),
});
export type EditorChangeMsg = z.infer<typeof editorChangeSchema>;

export const editorResyncSchema = envelopeSchema.extend({
  taskId: z.string().uuid(),
  docVersion: z.number().int().min(0),
  content: z.string().max(MAX_DOCUMENT_SIZE),
});
export type EditorResyncMsg = z.infer<typeof editorResyncSchema>;

export const taskSwitchSchema = envelopeSchema.extend({
  toTaskId: z.string().uuid(),
});
export type TaskSwitchMsg = z.infer<typeof taskSwitchSchema>;

export const clipboardCopySchema = envelopeSchema.extend({
  text: clipboardText,
  length: z.number().int().min(0),
  truncated: z.boolean().default(false),
  selection: rangeSchema,
  docVersion: z.number().int().min(0),
});
export type ClipboardCopyMsg = z.infer<typeof clipboardCopySchema>;

/** Copy from the page outside the editor. Recorded as COPY with an `origin`. */
export const pageCopySchema = envelopeSchema.extend({
  text: clipboardText,
  length: z.number().int().min(0),
  truncated: z.boolean().default(false),
  origin: z.enum(['task_description', 'page']),
});
export type PageCopyMsg = z.infer<typeof pageCopySchema>;

export const clipboardPasteSchema = envelopeSchema.extend({
  text: clipboardText,
  length: z.number().int().min(0),
  truncated: z.boolean().default(false),
  /** Range in the document now occupied by the pasted text */
  range: rangeSchema.nullable(),
  docVersion: z.number().int().min(0),
});
export type ClipboardPasteMsg = z.infer<typeof clipboardPasteSchema>;

export const selectionSchema = envelopeSchema.extend({
  selection: rangeSchema,
  length: z.number().int().min(0),
  /** The selected text (clipped to MAX_SELECTION_TEXT). */
  text: z.string().max(MAX_SELECTION_TEXT).optional(),
  truncated: z.boolean().default(false),
  docVersion: z.number().int().min(0),
});
export type SelectionMsg = z.infer<typeof selectionSchema>;

export const simpleEventSchema = envelopeSchema;
export type SimpleEventMsg = z.infer<typeof simpleEventSchema>;

export const visibilitySchema = envelopeSchema.extend({ visible: z.boolean() });
export const windowFocusSchema = envelopeSchema.extend({ focused: z.boolean() });
export const idleSchema = envelopeSchema.extend({
  phase: z.enum(['start', 'end']),
  idleMs: z.number().int().min(0),
});

/**
 * Generic "activity-only" events: they are validated, persisted and broadcast,
 * but do not change document state. Maps WS event -> schema + persisted type.
 */
export const ACTIVITY_MESSAGES = {
  [C2S.EDITOR_COPY]: { schema: clipboardCopySchema, type: () => 'COPY' },
  [C2S.EDITOR_CUT]: { schema: clipboardCopySchema, type: () => 'CUT' },
  [C2S.PAGE_COPY]: { schema: pageCopySchema, type: () => 'COPY' },
  [C2S.EDITOR_PASTE]: { schema: clipboardPasteSchema, type: () => 'PASTE' },
  [C2S.EDITOR_SELECTION]: { schema: selectionSchema, type: () => 'SELECTION' },
  [C2S.EDITOR_FOCUS]: { schema: simpleEventSchema, type: () => 'EDITOR_FOCUS' },
  [C2S.EDITOR_BLUR]: { schema: simpleEventSchema, type: () => 'EDITOR_BLUR' },
  [C2S.EDITOR_IDLE]: { schema: idleSchema, type: () => 'IDLE' },
  [C2S.BROWSER_VISIBILITY]: {
    schema: visibilitySchema,
    type: (m: { visible: boolean }) => (m.visible ? 'TAB_VISIBLE' : 'TAB_HIDDEN'),
  },
  [C2S.BROWSER_WINDOW_FOCUS]: {
    schema: windowFocusSchema,
    type: (m: { focused: boolean }) => (m.focused ? 'WINDOW_FOCUS' : 'WINDOW_BLUR'),
  },
  [C2S.BROWSER_NAVIGATION_BACK]: { schema: simpleEventSchema, type: () => 'NAVIGATION_BACK' },
} as const satisfies Record<
  string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { schema: z.ZodTypeAny; type: (m: any) => ActivityEventType }
>;
export type ActivityMessageName = keyof typeof ACTIVITY_MESSAGES;

// ---------- Interviewer -> Server ----------
export const I2S = {
  MONITOR_JOIN: 'monitor:join',
} as const;
export const monitorJoinSchema = z.object({ sessionId: z.string().uuid() });

// ---------- Server -> Clients ----------
export const S2C = {
  SESSION_CONNECTED: 'session:connected',
  SESSION_DISCONNECTED: 'session:disconnected',
  EDITOR_UPDATED: 'editor:updated',
  ACTIVITY_RECORDED: 'activity:recorded',
  SESSION_STATUS: 'session:status',
  SESSION_ENDED: 'session:ended',
  TASK_SWITCHED: 'task:switched',
  INSIGHT_DETECTED: 'insight:detected',
} as const;

export type EditorUpdatedPayload =
  | { kind: 'delta'; taskId: string; fromVersion: number; toVersion: number; edits: Edit[] }
  | { kind: 'full'; taskId: string; docVersion: number; content: string };

export interface SessionConnectionPayload {
  at: string;
  connected: boolean;
}

// ---------- Acks ----------
export type AckError =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'SESSION_NOT_ACTIVE'
  | 'RESYNC'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'INTERNAL';

export type Ack<T = unknown> =
  | { ok: true; seq?: number; data?: T }
  | { ok: false; error: AckError; message?: string; serverVersion?: number };

export interface CandidateJoinData {
  session: SessionDto;
  taskStates: TaskStateDto[];
  serverTime: string;
}

export interface MonitorJoinData {
  session: SessionDto;
  taskStates: TaskStateDto[];
  candidateConnected: boolean;
  serverTime: string;
}

export type { ActivityEventDto, InsightDto };
