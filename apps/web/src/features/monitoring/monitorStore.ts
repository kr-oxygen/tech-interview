import {
  applyEdits,
  type ActivityEventDto,
  type EditorRange,
  type EditorUpdatedPayload,
  type InsightDto,
  type MonitorJoinData,
  type SessionDto,
} from '@ti/shared';
import { create } from 'zustand';

export interface DocView {
  content: string;
  version: number;
}

export interface Highlight {
  taskId: string;
  range: EditorRange;
  seq: number;
}

interface MonitorState {
  socket: 'connecting' | 'connected' | 'offline';
  session: SessionDto | null;
  docs: Record<string, DocView>;
  candidateConnected: boolean;
  liveEvents: ActivityEventDto[];
  liveInsights: InsightDto[];
  /** On: show the candidate's active task and scroll to their latest edit. */
  follow: boolean;
  /** Task shown while not following. */
  pinnedTaskId: string | null;
  /** Offset just after the candidate's most recent edit (for follow scrolling). */
  lastEdit: { taskId: string; offset: number; version: number } | null;
  highlight: Highlight | null;
  selectedSeq: number | null;
  init: (d: MonitorJoinData) => void;
  setSocket: (s: MonitorState['socket']) => void;
  setSession: (s: SessionDto) => void;
  setCandidateConnected: (v: boolean) => void;
  addEvent: (e: ActivityEventDto) => void;
  addInsight: (i: InsightDto) => void;
  /** Returns false when the delta does not fit (caller re-joins for a full state). */
  applyUpdate: (u: EditorUpdatedPayload) => boolean;
  setActiveTask: (taskId: string) => void;
  /** Shows a specific task and stops following the candidate. */
  pinTask: (taskId: string) => void;
  setFollow: (follow: boolean) => void;
  select: (seq: number | null, highlight?: Highlight | null) => void;
  reset: () => void;
}

const initial = {
  socket: 'connecting' as const,
  session: null,
  docs: {},
  candidateConnected: false,
  liveEvents: [],
  liveInsights: [],
  follow: true,
  pinnedTaskId: null,
  lastEdit: null,
  highlight: null,
  selectedSeq: null,
};

/** Live state of the monitored session (socket-driven). History comes from React Query. */
export const useMonitorStore = create<MonitorState>((set, get) => ({
  ...initial,
  init: (d) =>
    set({
      session: d.session,
      candidateConnected: d.candidateConnected,
      docs: Object.fromEntries(d.taskStates.map((s) => [s.taskId, { content: s.content, version: s.docVersion }])),
    }),
  setSocket: (socket) => set({ socket }),
  setSession: (session) => set({ session }),
  setCandidateConnected: (candidateConnected) => set({ candidateConnected }),
  addEvent: (e) =>
    set((st) =>
      st.liveEvents.some((x) => x.sequenceNumber === e.sequenceNumber) ? st : { liveEvents: [...st.liveEvents, e] },
    ),
  addInsight: (i) =>
    set((st) => (st.liveInsights.some((x) => x.id === i.id) ? st : { liveInsights: [...st.liveInsights, i] })),
  applyUpdate: (u) => {
    const doc = get().docs[u.taskId];
    if (u.kind === 'full') {
      set((st) => ({ docs: { ...st.docs, [u.taskId]: { content: u.content, version: u.docVersion } } }));
      return true;
    }
    if (!doc || doc.version !== u.fromVersion) return false;
    try {
      const content = applyEdits(doc.content, u.edits);
      const last = u.edits.at(-1)?.changes.at(-1);
      set((st) => ({
        docs: { ...st.docs, [u.taskId]: { content, version: u.toVersion } },
        lastEdit: last
          ? { taskId: u.taskId, offset: last.rangeOffset + last.text.length, version: u.toVersion }
          : st.lastEdit,
      }));
      return true;
    } catch {
      return false;
    }
  },
  setActiveTask: (taskId) => set((st) => (st.session ? { session: { ...st.session, activeTaskId: taskId } } : st)),
  pinTask: (pinnedTaskId) => set({ pinnedTaskId, follow: false }),
  setFollow: (follow) => set((st) => ({ follow, pinnedTaskId: follow ? null : st.pinnedTaskId })),
  select: (selectedSeq, highlight = null) => set({ selectedSeq, highlight }),
  reset: () => set(initial),
}));
