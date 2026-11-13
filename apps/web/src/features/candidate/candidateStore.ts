import type { SessionDto, TaskStateDto } from '@ti/shared';
import { create } from 'zustand';
import type { ConnectionStatus } from '../../services/websocket/candidateConnection';

interface CandidateState {
  connection: ConnectionStatus;
  session: SessionDto | null;
  taskStates: Record<string, TaskStateDto>;
  activeTaskId: string | null;
  queueSize: number;
  serverOffsetMs: number;
  setConnection: (c: ConnectionStatus) => void;
  setSession: (s: SessionDto) => void;
  setJoin: (s: SessionDto, states: TaskStateDto[], serverTime: string, first: boolean) => void;
  setActiveTask: (id: string) => void;
  setQueueSize: (n: number) => void;
  reset: () => void;
}

const initial = {
  connection: 'connecting' as ConnectionStatus,
  session: null,
  taskStates: {},
  activeTaskId: null,
  queueSize: 0,
  serverOffsetMs: 0,
};

/** Live candidate workspace state (socket-driven). */
export const useCandidateStore = create<CandidateState>((set) => ({
  ...initial,
  setConnection: (connection) => set({ connection }),
  setSession: (session) =>
    set((st) => ({ session, activeTaskId: st.activeTaskId ?? session.activeTaskId ?? session.tasks[0]?.id ?? null })),
  setJoin: (session, states, serverTime, first) =>
    set((st) => ({
      session,
      // Initial contents only on first join; afterwards the local editor is authoritative.
      taskStates: first ? Object.fromEntries(states.map((s) => [s.taskId, s])) : st.taskStates,
      activeTaskId: st.activeTaskId ?? session.activeTaskId ?? session.tasks[0]?.id ?? null,
      serverOffsetMs: new Date(serverTime).getTime() - Date.now(),
    })),
  setActiveTask: (activeTaskId) => set({ activeTaskId }),
  setQueueSize: (queueSize) => set({ queueSize }),
  reset: () => set(initial),
}));
