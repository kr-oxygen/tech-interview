import type { OnMount } from '@monaco-editor/react';
import {
  AppBar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Toolbar,
  Typography,
} from '@mui/material';
import { C2S, type SessionDto } from '@ti/shared';
import type { editor } from 'monaco-editor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CodeEditor } from '../../components/CodeEditor/CodeEditor';
import { EditorToolbar } from '../../components/CodeEditor/EditorToolbar';
import { modelPath, monaco } from '../../components/CodeEditor/monacoSetup';
import { CenteredMessage } from '../../components/common/CenteredMessage';
import { ConnectionChip } from '../../components/common/ConnectionChip';
import { InterviewTimer } from '../../components/common/InterviewTimer';
import { Markdown } from '../../components/common/Markdown';
import { CandidateConnection } from '../../services/websocket/candidateConnection';
import { EditorTracker } from '../activity/editorTracker';
import { SessionEndedMessage, SessionPausedMessage } from './CandidateEntryPage';
import { useCandidateStore } from './candidateStore';
import { usePageLeaveGuard } from './usePageLeaveGuard';

export const taskModelUri = (taskId: string, language: string) => modelPath('task', taskId, language);

const envelope = (taskId: string | null) => ({
  clientEventId: crypto.randomUUID(),
  clientTimestamp: Date.now(),
  taskId,
});

async function waitForDrain(conn: CandidateConnection, timeoutMs = 5_000) {
  const start = Date.now();
  while (conn.pendingCount > 0 && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 100));
  }
}

interface Props {
  candidateToken: string;
  /** Called when the session gets paused or the token is revoked; the entry page takes over. */
  onAccessLost: () => void;
}

export function CandidateWorkspace({ candidateToken, onAccessLost }: Props) {
  const store = useCandidateStore();
  const { session, connection, activeTaskId, taskStates } = store;
  const connRef = useRef<CandidateConnection | null>(null);
  const trackerRef = useRef<EditorTracker | null>(null);
  const [ed, setEd] = useState<editor.IStandaloneCodeEditor | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const [backWarning, setBackWarning] = useState(false);

  // Connection lifecycle.
  useEffect(() => {
    const s = useCandidateStore.getState();
    const conn = new CandidateConnection(candidateToken, {
      onStatus: s.setConnection,
      onJoin: (data, first) => s.setJoin(data.session, data.taskStates, data.serverTime, first),
      onSession: s.setSession,
      onQueueSize: s.setQueueSize,
    });
    connRef.current = conn;
    conn.connect();
    return () => {
      trackerRef.current?.dispose();
      trackerRef.current = null;
      conn.disconnect();
      useCandidateStore.getState().reset();
    };
  }, [candidateToken]);

  const tasks = useMemo(() => session?.tasks ?? [], [session?.tasks]);
  const activeTask = tasks.find((t) => t.id === activeTaskId) ?? tasks[0];
  const isActive = session?.status === 'ACTIVE';

  // Activity tracking runs only while the session is active.
  useEffect(() => {
    const conn = connRef.current;
    if (!ed || !conn || !isActive || !activeTask) return;
    if (!trackerRef.current) {
      const langOf = (id: string) => tasks.find((t) => t.id === id)?.language ?? 'typescript';
      trackerRef.current = new EditorTracker(ed, conn, activeTask.id, (id) =>
        monaco.editor.getModel(monaco.Uri.parse(taskModelUri(id, langOf(id)))),
      );
    }
    return undefined;
  }, [ed, isActive, activeTask, tasks]);

  useEffect(() => {
    if (!isActive) {
      trackerRef.current?.dispose();
      trackerRef.current = null;
    }
  }, [isActive]);

  const onMount: OnMount = useCallback((instance) => {
    // LF everywhere so offsets match the server document.
    const lf = () => instance.getModel()?.setEOL(monaco.editor.EndOfLineSequence.LF);
    lf();
    instance.onDidChangeModel(lf);
    setEd(instance);
  }, []);

  const switchTask = (taskId: string) => {
    if (taskId === activeTask?.id) return;
    trackerRef.current?.setTask(taskId);
    store.setActiveTask(taskId);
    if (isActive) connRef.current?.send(C2S.TASK_SWITCH, activeTask?.id ?? null, { toTaskId: taskId });
  };

  const start = async () => {
    const ack = await connRef.current?.request<SessionDto>(C2S.SESSION_START, envelope(activeTask?.id ?? null));
    if (ack?.ok && ack.data) store.setSession(ack.data);
  };

  const end = async () => {
    const conn = connRef.current;
    if (!conn) return;
    setEnding(true);
    trackerRef.current?.flush();
    await waitForDrain(conn);
    const ack = await conn.request<SessionDto>(C2S.SESSION_END, envelope(activeTask?.id ?? null));
    setEnding(false);
    setConfirmEnd(false);
    if (ack.ok && ack.data) store.setSession(ack.data);
  };

  const guardActive =
    (session?.status === 'ACTIVE' || session?.status === 'CREATED') &&
    ['connected', 'connecting', 'reconnecting'].includes(connection);

  usePageLeaveGuard({
    active: guardActive,
    candidateToken,
    onBackAttempt: () => {
      connRef.current?.send(C2S.BROWSER_NAVIGATION_BACK, activeTask?.id ?? null);
      setBackWarning(true);
    },
  });

  const accessLost = connection === 'locked' || connection === 'invalid' || session?.status === 'LOCKED';
  useEffect(() => {
    if (accessLost) onAccessLost();
  }, [accessLost, onAccessLost]);

  // Terminal states.
  if (accessLost) return <SessionPausedMessage />;
  if (connection === 'ended' || session?.status === 'ENDED') return <SessionEndedMessage />;
  if (connection === 'replaced') {
    return (
      <CenteredMessage title="Opened in another tab">
        <Typography>The interview was opened in another browser tab. Please continue there.</Typography>
      </CenteredMessage>
    );
  }
  if (!session || !activeTask) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <AppBar position="static" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar variant="dense" sx={{ gap: 1, flexWrap: 'wrap', py: 0.5 }}>
          <Typography variant="subtitle1" component="h1" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
            {session.interviewTitle}
          </Typography>
          <InterviewTimer
            startedAt={session.startedAt}
            durationMinutes={session.durationMinutes}
            offsetMs={store.serverOffsetMs}
          />
          <ConnectionChip state={connection} pending={store.queueSize} />
          {isActive && (
            <Button size="small" color="error" variant="outlined" onClick={() => setConfirmEnd(true)}>
              Finish
            </Button>
          )}
        </Toolbar>
      </AppBar>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(280px, 35%) 1fr' },
          gridTemplateRows: { xs: 'auto 1fr', md: '1fr' },
        }}
      >
        <Paper square elevation={0} sx={{ borderRight: { md: 1 }, borderColor: 'divider', overflow: 'auto', maxHeight: { xs: '35dvh', md: 'none' } }}>
          {tasks.length > 1 && (
            <Tabs
              value={activeTask.id}
              onChange={(_, v) => switchTask(v)}
              variant="scrollable"
              sx={{ borderBottom: 1, borderColor: 'divider' }}
            >
              {tasks.map((t, i) => (
                <Tab key={t.id} value={t.id} label={`${i + 1}. ${t.title}`} sx={{ textTransform: 'none' }} />
              ))}
            </Tabs>
          )}
          <Box sx={{ p: 2 }} data-copy-origin="task_description">
            <Typography variant="h6" component="h2" gutterBottom>
              {activeTask.title}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
              Language: {activeTask.language === 'typescript' ? 'TypeScript' : 'JavaScript'}
            </Typography>
            <Markdown>{activeTask.description}</Markdown>
          </Box>
        </Paper>

        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
          <EditorToolbar
            onFormat={isActive ? () => ed?.getAction('editor.action.formatDocument')?.run() : undefined}
          />
          <Box sx={{ flex: 1, minHeight: 300 }}>
            <CodeEditor
              path={taskModelUri(activeTask.id, activeTask.language)}
              language={activeTask.language}
              defaultValue={taskStates[activeTask.id]?.content ?? ''}
              readOnly={!isActive}
              onMount={onMount}
            />
          </Box>
          {session.status === 'CREATED' && (
            <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(0,0,0,0.45)', p: 2 }}>
              <Paper sx={{ p: 3, maxWidth: 420 }}>
                <Stack spacing={2}>
                  <Typography variant="h6" component="h2">
                    Ready to start?
                  </Typography>
                  <Typography variant="body2">
                    The timer ({session.durationMinutes} min) starts when you click Start. Read the task on the left
                    first if you like.
                  </Typography>
                  <Button variant="contained" onClick={start} disabled={connection !== 'connected'}>
                    Start interview
                  </Button>
                </Stack>
              </Paper>
            </Box>
          )}
        </Box>
      </Box>

      <Dialog open={confirmEnd} onClose={() => !ending && setConfirmEnd(false)}>
        <DialogTitle>Finish the interview?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Your code will be submitted and you will not be able to edit it afterwards.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmEnd(false)} disabled={ending}>
            Continue working
          </Button>
          <Button color="error" variant="contained" onClick={end} disabled={ending}>
            {ending ? 'Submitting…' : 'Finish'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={backWarning}
        autoHideDuration={8000}
        onClose={() => setBackWarning(false)}
        message="Leaving this page pauses your session. Use the Finish button when you are done."
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      />
    </Box>
  );
}
