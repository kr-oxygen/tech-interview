import { C2S, MAX_CLIPBOARD_TEXT, MAX_SELECTION_TEXT, type Edit, type EditSource, type EditorRange } from '@ti/shared';
import type { IDisposable, editor } from 'monaco-editor';
import type { CandidateConnection, DocumentProvider } from '../../services/websocket/candidateConnection';

export const EDIT_BATCH_MS = 150;
export const SELECTION_DEBOUNCE_MS = 700;
export const IDLE_AFTER_MS = 60_000;
const IDLE_CHECK_MS = 5_000;

type Model = editor.ITextModel;

const toRange = (r: {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}): EditorRange => ({
  startLineNumber: r.startLineNumber,
  startColumn: r.startColumn,
  endLineNumber: r.endLineNumber,
  endColumn: r.endColumn,
});

function clip(text: string) {
  return text.length > MAX_CLIPBOARD_TEXT
    ? { text: text.slice(0, MAX_CLIPBOARD_TEXT), length: text.length, truncated: true }
    : { text, length: text.length, truncated: false };
}

/**
 * Subscribes to Monaco model events (document changes) and DOM/browser events
 * (clipboard, focus, visibility) and forwards them through the candidate connection.
 */
export class EditorTracker implements DocumentProvider {
  private readonly disposables: IDisposable[] = [];
  private readonly domCleanups: Array<() => void> = [];
  private readonly pending = new Map<string, Edit[]>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private selectionTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private lastSelectionKey = '';
  private domPasteText: string | null = null;
  private lastActivity = Date.now();
  private idleSince: number | null = null;
  private taskId: string;
  private readonly ed: editor.IStandaloneCodeEditor;
  private readonly conn: CandidateConnection;
  private readonly modelFor: (taskId: string) => Model | null;

  constructor(
    ed: editor.IStandaloneCodeEditor,
    conn: CandidateConnection,
    taskId: string,
    modelFor: (taskId: string) => Model | null,
  ) {
    this.ed = ed;
    this.conn = conn;
    this.taskId = taskId;
    this.modelFor = modelFor;
    conn.setDocumentProvider(this);
    this.attach();
  }

  // --------------------------------------------------------- DocumentProvider

  getContent(taskId: string): string | null {
    return this.modelFor(taskId)?.getValue() ?? null;
  }

  discardPending(taskId: string) {
    this.pending.delete(taskId);
  }

  // ------------------------------------------------------------------- public

  setTask(taskId: string) {
    if (taskId === this.taskId) return;
    this.flush();
    this.taskId = taskId;
    this.lastSelectionKey = '';
  }

  /** Current local version of the active document including unflushed edits. */
  docVersion(taskId = this.taskId) {
    return this.conn.version(taskId) + (this.pending.get(taskId)?.length ?? 0);
  }

  flush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    for (const [taskId, edits] of this.pending) {
      if (edits.length) this.conn.sendEdits(taskId, edits);
    }
    this.pending.clear();
  }

  dispose() {
    this.flush();
    if (this.selectionTimer) clearTimeout(this.selectionTimer);
    if (this.idleTimer) clearInterval(this.idleTimer);
    this.disposables.forEach((d) => d.dispose());
    this.domCleanups.forEach((f) => f());
  }

  // ------------------------------------------------------------------ private

  private send(event: string, data: Record<string, unknown> = {}) {
    this.conn.send(event, this.taskId, data);
  }

  private markActivity() {
    const now = Date.now();
    if (this.idleSince !== null) {
      this.send(C2S.EDITOR_IDLE, { phase: 'end', idleMs: now - this.idleSince });
      this.idleSince = null;
    }
    this.lastActivity = now;
  }

  private queueEdit(edit: Edit) {
    const list = this.pending.get(this.taskId) ?? [];
    list.push(edit);
    this.pending.set(this.taskId, list);
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), EDIT_BATCH_MS);
  }

  private selectedText(model: Model): { text: string; selection: EditorRange } | null {
    const selections = this.ed.getSelections() ?? [];
    if (selections.length === 0) return null;
    const primary = selections[0];
    if (selections.every((s) => s.isEmpty())) {
      // Monaco copies the whole line when nothing is selected (emptySelectionClipboard).
      const line = primary.startLineNumber;
      return {
        text: model.getLineContent(line) + model.getEOL(),
        selection: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: model.getLineMaxColumn(line) },
      };
    }
    const text = selections
      .filter((s) => !s.isEmpty())
      .map((s) => model.getValueInRange(s))
      .join(model.getEOL());
    return { text, selection: toRange(primary) };
  }

  private attach() {
    const ed = this.ed;

    // Document changes (Monaco model events).
    this.disposables.push(
      ed.onDidChangeModelContent((e) => {
        if (e.isFlush) return; // programmatic setValue, not a candidate action
        const source: EditSource = e.isUndoing ? 'undo' : e.isRedoing ? 'redo' : 'input';
        this.queueEdit({
          source,
          at: Date.now(),
          changes: e.changes.map((c) => ({
            range: toRange(c.range),
            rangeOffset: c.rangeOffset,
            rangeLength: c.rangeLength,
            text: c.text,
          })),
        });
        this.markActivity();
      }),
    );

    // Fired after the paste edit was applied — also for context-menu paste (no DOM event).
    this.disposables.push(
      ed.onDidPaste((e) => {
        const model = ed.getModel();
        const list = this.pending.get(this.taskId);
        if (list?.length) list[list.length - 1].source = 'paste';
        this.flush();
        const text = this.domPasteText ?? (model ? model.getValueInRange(e.range) : '');
        this.domPasteText = null;
        this.send(C2S.EDITOR_PASTE, { ...clip(text), range: toRange(e.range), docVersion: this.docVersion() });
      }),
    );

    this.disposables.push(
      ed.onDidChangeCursorSelection((e) => {
        this.markActivity();
        if (this.selectionTimer) clearTimeout(this.selectionTimer);
        const sel = e.selection;
        if (sel.isEmpty()) return;
        this.selectionTimer = setTimeout(() => {
          const model = ed.getModel();
          const key = `${this.taskId}:${sel.toString()}`;
          if (!model || key === this.lastSelectionKey) return;
          this.lastSelectionKey = key;
          const text = model.getValueInRange(sel);
          this.send(C2S.EDITOR_SELECTION, {
            selection: toRange(sel),
            length: text.length,
            text: text.slice(0, MAX_SELECTION_TEXT),
            truncated: text.length > MAX_SELECTION_TEXT,
            docVersion: this.docVersion(),
          });
        }, SELECTION_DEBOUNCE_MS);
      }),
    );

    this.disposables.push(
      ed.onDidFocusEditorText(() => {
        this.markActivity();
        this.send(C2S.EDITOR_FOCUS);
      }),
      ed.onDidBlurEditorText(() => this.send(C2S.EDITOR_BLUR)),
    );

    // Clipboard (DOM events). Capture phase runs before Monaco mutates the document,
    // so the selection is still intact for CUT.
    const container = ed.getContainerDomNode();
    const onCopyOrCut = (kind: 'copy' | 'cut') => () => {
      const model = ed.getModel();
      if (!model) return;
      this.flush();
      const sel = this.selectedText(model);
      if (!sel) return;
      this.send(kind === 'copy' ? C2S.EDITOR_COPY : C2S.EDITOR_CUT, {
        ...clip(sel.text),
        selection: sel.selection,
        docVersion: this.docVersion(),
      });
      this.markActivity();
    };
    const onCopy = onCopyOrCut('copy');
    const onCut = onCopyOrCut('cut');
    const onPaste = (e: ClipboardEvent) => {
      this.flush();
      this.domPasteText = e.clipboardData?.getData('text/plain') ?? null;
    };
    const onKeyDown = () => this.markActivity();
    container.addEventListener('copy', onCopy, true);
    container.addEventListener('cut', onCut, true);
    container.addEventListener('paste', onPaste, true);
    container.addEventListener('keydown', onKeyDown, true);

    // Copy anywhere else on the page (task description, headings…). Elements can name their
    // origin with `data-copy-origin`; editor copies are handled above.
    const onPageCopy = (e: ClipboardEvent) => {
      const target = e.target instanceof Node ? e.target : null;
      if (target && container.contains(target)) return;
      const selection = document.getSelection();
      const text = selection?.toString() ?? '';
      if (!text) return;
      // The copy event targets the focused element (often <body>); the selection says where the text is.
      const anchor = selection?.anchorNode ?? null;
      const el = anchor instanceof Element ? anchor : anchor?.parentElement;
      const origin = el?.closest('[data-copy-origin="task_description"]') ? 'task_description' : 'page';
      this.send(C2S.PAGE_COPY, { ...clip(text), origin });
      this.markActivity();
    };
    document.addEventListener('copy', onPageCopy, true);
    this.domCleanups.push(() => document.removeEventListener('copy', onPageCopy, true));
    this.domCleanups.push(() => {
      container.removeEventListener('copy', onCopy, true);
      container.removeEventListener('cut', onCut, true);
      container.removeEventListener('paste', onPaste, true);
      container.removeEventListener('keydown', onKeyDown, true);
    });

    // Browser activity.
    const onVisibility = () => this.send(C2S.BROWSER_VISIBILITY, { visible: document.visibilityState === 'visible' });
    const onWinFocus = () => this.send(C2S.BROWSER_WINDOW_FOCUS, { focused: true });
    const onWinBlur = () => this.send(C2S.BROWSER_WINDOW_FOCUS, { focused: false });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onWinFocus);
    window.addEventListener('blur', onWinBlur);
    this.domCleanups.push(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onWinFocus);
      window.removeEventListener('blur', onWinBlur);
    });

    // Idle detection.
    this.idleTimer = setInterval(() => {
      const idleFor = Date.now() - this.lastActivity;
      if (this.idleSince === null && idleFor >= IDLE_AFTER_MS) {
        this.idleSince = this.lastActivity;
        this.send(C2S.EDITOR_IDLE, { phase: 'start', idleMs: idleFor });
      }
    }, IDLE_CHECK_MS);
  }
}
