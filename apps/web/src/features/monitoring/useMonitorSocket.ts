import { useQueryClient } from '@tanstack/react-query';
import {
  I2S,
  S2C,
  type Ack,
  type ActivityEventDto,
  type EditorUpdatedPayload,
  type InsightDto,
  type MonitorJoinData,
  type SessionDto,
} from '@ti/shared';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { qk } from '../../services/api/queryKeys';
import { useAuthStore } from '../../stores/authStore';
import { useMonitorStore } from './monitorStore';

/** Joins the observers room of a session and keeps the monitor store in sync. */
export function useMonitorSocket(sessionId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

  useEffect(() => {
    if (!token) return;
    const store = useMonitorStore.getState();
    store.reset();
    const socket = io({ auth: { token }, transports: ['websocket'] });
    let joinedBefore = false;

    const join = async () => {
      try {
        const ack = (await socket.timeout(10_000).emitWithAck(I2S.MONITOR_JOIN, { sessionId })) as Ack<MonitorJoinData>;
        if (ack.ok && ack.data) {
          useMonitorStore.getState().init(ack.data);
          useMonitorStore.getState().setSocket('connected');
          // Events may have been missed while offline: refetch history.
          if (joinedBefore) qc.invalidateQueries({ queryKey: qk.sessionEvents(sessionId) });
          joinedBefore = true;
        }
      } catch {
        useMonitorStore.getState().setSocket('offline');
      }
    };

    socket.on('connect', join);
    socket.on('disconnect', () => useMonitorStore.getState().setSocket('offline'));
    socket.on('connect_error', () => useMonitorStore.getState().setSocket('offline'));

    socket.on(S2C.ACTIVITY_RECORDED, (e: ActivityEventDto) => useMonitorStore.getState().addEvent(e));
    socket.on(S2C.INSIGHT_DETECTED, (i: InsightDto) => useMonitorStore.getState().addInsight(i));
    socket.on(S2C.EDITOR_UPDATED, (u: EditorUpdatedPayload) => {
      if (!useMonitorStore.getState().applyUpdate(u)) void join(); // out of sync → full state
    });
    socket.on(S2C.SESSION_CONNECTED, () => useMonitorStore.getState().setCandidateConnected(true));
    socket.on(S2C.SESSION_DISCONNECTED, () => useMonitorStore.getState().setCandidateConnected(false));
    socket.on(S2C.TASK_SWITCHED, ({ taskId }: { taskId: string }) => useMonitorStore.getState().setActiveTask(taskId));
    const onSession = (s: SessionDto) => {
      useMonitorStore.getState().setSession(s);
      qc.setQueryData(qk.session(sessionId), s);
      qc.invalidateQueries({ queryKey: ['interviews'] });
    };
    socket.on(S2C.SESSION_STATUS, onSession);
    socket.on(S2C.SESSION_ENDED, onSession);

    return () => {
      socket.disconnect();
      useMonitorStore.getState().reset();
    };
  }, [sessionId, token, qc]);
}
