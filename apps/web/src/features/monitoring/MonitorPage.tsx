import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Switch,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import { LANGUAGE_LABELS, type ActivityEventDto, type InsightDto, type SessionCreatedResponse } from '@ti/shared';
import type { editor } from 'monaco-editor';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { ActivityTimeline } from '../../components/ActivityTimeline/ActivityTimeline';
import { EventDetails } from '../../components/ActivityTimeline/EventDetails';
import { InsightsPanel } from '../../components/ActivityTimeline/InsightsPanel';
import { describeEvent } from '../../components/ActivityTimeline/describeEvent';
import { CodeEditor } from '../../components/CodeEditor/CodeEditor';
import { EditorToolbar } from '../../components/CodeEditor/EditorToolbar';
import { modelPath } from '../../components/CodeEditor/monacoSetup';
import { ConnectionChip } from '../../components/common/ConnectionChip';
import { InterviewTimer } from '../../components/common/InterviewTimer';
import { InviteLinkDialog } from '../../components/common/InviteLinkDialog';
import { useNow } from '../../components/common/useNow';
import { formatTime } from '../../lib/format';
import { SessionStatus, StatusChip } from '../../components/SessionStatus/SessionStatus';
import { errorMessage } from '../../services/api/client';
import { useAllowReturn, useEndSession, useReissueInvite, useSession, useSessionEvents, useSessionInsights } from './api';
import { useMonitorStore } from './monitorStore';
import { useMonitorSocket } from './useMonitorSocket';

/** Events that represent something the candidate did (for "last activity"). */
const CANDIDATE_ACTIONS = new Set([
  'TEXT_INSERT', 'TEXT_DELETE', 'TEXT_CHANGE', 'COPY', 'CUT', 'PASTE', 'SELECTION',
  'EDITOR_FOCUS', 'EDITOR_BLUR', 'TAB_HIDDEN', 'TAB_VISIBLE', 'WINDOW_FOCUS', 'WINDOW_BLUR',
  'TASK_SWITCH', 'NAVIGATION_BACK',
]);

function Section({ title, children, grow }: { title: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', minHeight: 0, ...(grow ? { flex: 1 } : {}) }}>
      <Typography variant="overline" color="text.secondary" component="h2" sx={{ lineHeight: 2 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

export function MonitorPage() {
  const { sessionId = '' } = useParams();
  useMonitorSocket(sessionId);
  const live = useMonitorStore();
  const sessionQ = useSession(sessionId);
  const eventsQ = useSessionEvents(sessionId);
  const insightsQ = useSessionInsights(sessionId);
  const endSession = useEndSession(sessionId);
  const allowReturn = useAllowReturn(sessionId);
  const reissue = useReissueInvite(sessionId);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const now = useNow(10_000);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const decorations = useRef<editor.IEditorDecorationsCollection | null>(null);

  // Load the whole history (paged).
  useEffect(() => {
    if (eventsQ.hasNextPage && !eventsQ.isFetchingNextPage) void eventsQ.fetchNextPage();
  }, [eventsQ]);

  const session = live.session ?? sessionQ.data;

  const events = useMemo(() => {
    const bySeq = new Map<number, ActivityEventDto>();
    for (const page of eventsQ.data?.pages ?? []) for (const e of page.items) bySeq.set(e.sequenceNumber, e);
    for (const e of live.liveEvents) bySeq.set(e.sequenceNumber, e);
    return [...bySeq.values()].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }, [eventsQ.data, live.liveEvents]);

  const insights = useMemo(() => {
    const byId = new Map<string, InsightDto>();
    for (const i of insightsQ.data ?? []) byId.set(i.id, i);
    for (const i of live.liveInsights) byId.set(i.id, i);
    return [...byId.values()].sort((a, b) => a.at.localeCompare(b.at));
  }, [insightsQ.data, live.liveInsights]);

  const flaggedSeq = useMemo(() => new Set(insights.flatMap((i) => i.relatedSeq)), [insights]);

  const derived = useMemo(() => {
    let lastActivity: string | null = null;
    let tabVisible: boolean | null = null;
    for (const e of events) {
      if (CANDIDATE_ACTIONS.has(e.eventType)) lastActivity = e.timestamp;
      if (e.eventType === 'TAB_HIDDEN') tabVisible = false;
      if (e.eventType === 'TAB_VISIBLE') tabVisible = true;
    }
    return { lastActivity, tabVisible };
  }, [events]);

  const tasks = session?.tasks ?? [];
  const shownTaskId =
    (live.follow ? null : live.pinnedTaskId) ?? session?.activeTaskId ?? tasks[0]?.id ?? null;
  const shownTask = tasks.find((t) => t.id === shownTaskId) ?? null;
  const activeTask = tasks.find((t) => t.id === session?.activeTaskId) ?? null;
  const doc = shownTaskId ? live.docs[shownTaskId] : undefined;
  const selected = events.find((e) => e.sequenceNumber === live.selectedSeq) ?? null;

  // Highlight the range of the selected event in the read-only editor.
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    decorations.current?.clear();
    const h = live.highlight;
    if (!h || h.taskId !== shownTaskId) return;
    decorations.current = ed.createDecorationsCollection([
      { range: h.range, options: { className: 'ti-highlight', isWholeLine: false, stickiness: 1 } },
    ]);
    ed.revealRangeInCenterIfOutsideViewport(h.range);
  }, [live.highlight, shownTaskId, doc?.version]);

  // Follow mode: keep the candidate's latest edit in view.
  const lastEdit = live.lastEdit;
  useEffect(() => {
    const ed = editorRef.current;
    const model = ed?.getModel();
    if (!live.follow || !ed || !model || !lastEdit || lastEdit.taskId !== shownTaskId) return;
    // The editor value is set from the store in the same render; wait for it to land.
    const id = requestAnimationFrame(() => {
      if (model.isDisposed()) return;
      const pos = model.getPositionAt(Math.min(lastEdit.offset, model.getValueLength()));
      ed.revealPositionInCenterIfOutsideViewport(pos);
    });
    return () => cancelAnimationFrame(id);
  }, [live.follow, lastEdit, shownTaskId]);

  const selectEvent = (e: ActivityEventDto) => {
    const v = describeEvent(e);
    const highlight = v.range && e.taskId ? { taskId: e.taskId, range: v.range, seq: e.sequenceNumber } : null;
    live.select(e.sequenceNumber, highlight);
    // Inspecting an event in another task (or a range) stops following, so the view stays put.
    if (e.taskId && tasks.some((t) => t.id === e.taskId) && (highlight || e.taskId !== shownTaskId))
      live.pinTask(e.taskId);
  };

  const showLink = (r: unknown) => setInviteUrl((r as SessionCreatedResponse).inviteUrl);

  if (sessionQ.isLoading && !session) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', height: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!session) return <Alert severity="error">{errorMessage(sessionQ.error) || 'Session not found'}</Alert>;

  const isLive = session.status === 'ACTIVE' || session.status === 'CREATED' || session.status === 'LOCKED';
  const actionError = endSession.error ?? allowReturn.error ?? reissue.error;
  // While paused, a re-armed link that has not been used yet means the candidate may come back.
  const returnOpenUntil =
    session.status === 'LOCKED' && !session.inviteConsumed && new Date(session.inviteExpiresAt).getTime() > now
      ? session.inviteExpiresAt
      : null;

  return (
    <Stack spacing={1.5} sx={{ height: { lg: 'calc(100dvh - 96px)' }, minHeight: 0 }}>
      {/* Header */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        <IconButton component={RouterLink} to={`/interviewer/interviews/${session.interviewId}`} aria-label="Back to interview">
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="h6" component="h1" noWrap>
            {session.candidate.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {session.interviewTitle}
          </Typography>
        </Box>
        <StatusChip status={session.status} />
        <InterviewTimer startedAt={session.startedAt} endedAt={session.endedAt} durationMinutes={session.durationMinutes} />
        {isLive && <ConnectionChip state={live.socket} />}
        {session.status === 'LOCKED' && (
          <>
            {returnOpenUntil && (
              <Chip
                size="small"
                color="warning"
                variant="outlined"
                label={`Return allowed until ${formatTime(returnOpenUntil).slice(0, 5)}`}
              />
            )}
            <Tooltip describeChild title="The candidate can reopen their original link (or refresh the paused page) for a short time. The link still works only once.">
              <Button
                variant="contained"
                color="warning"
                size="small"
                disabled={allowReturn.isPending}
                onClick={() => allowReturn.mutate({ newLink: false })}
              >
                {returnOpenUntil ? 'Extend return window' : 'Allow return'}
              </Button>
            </Tooltip>
            <Tooltip describeChild title="Rotates the link: the original one stops working. Use it if the old link may have been shared.">
              <Button
                size="small"
                color="warning"
                disabled={allowReturn.isPending}
                onClick={() => allowReturn.mutate({ newLink: true }, { onSuccess: (r) => setInviteUrl(r.inviteUrl) })}
              >
                With new link
              </Button>
            </Tooltip>
          </>
        )}
        {session.status === 'CREATED' && !session.inviteConsumed && (
          <Button size="small" variant="outlined" disabled={reissue.isPending} onClick={() => reissue.mutate(undefined, { onSuccess: showLink })}>
            New link
          </Button>
        )}
        {isLive && (
          <Button size="small" color="error" variant="outlined" onClick={() => setConfirmEnd(true)}>
            End session
          </Button>
        )}
      </Stack>
      {actionError && <Alert severity="error">{errorMessage(actionError)}</Alert>}
      {session.status === 'LOCKED' && (
        <Alert severity="warning">
          The candidate left the interview page and the session is paused. Use “Allow return” to issue a new one-time link,
          or end the session.
        </Alert>
      )}

      {/* Body */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 420px' },
        }}
      >
        {/* Code */}
        <Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', minHeight: { xs: 420, lg: 0 } }}>
          <EditorToolbar>
            <Tabs
              value={shownTaskId ?? false}
              onChange={(_, v: string) => live.pinTask(v)}
              variant="scrollable"
              sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, textTransform: 'none' } }}
            >
              {tasks.map((t) => (
                <Tab
                  key={t.id}
                  value={t.id}
                  label={
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <span>{t.title}</span>
                      {t.id === session.activeTaskId && isLive && <Chip size="small" label="candidate" sx={{ height: 18 }} />}
                    </Stack>
                  }
                />
              ))}
            </Tabs>
            <FormControlLabel
              sx={{ mr: 0.5, whiteSpace: 'nowrap' }}
              control={<Switch size="small" checked={live.follow} onChange={(_, v) => live.setFollow(v)} />}
              label={<Typography variant="body2">Follow candidate</Typography>}
            />
          </EditorToolbar>
          <Divider />
          <Box sx={{ flex: 1, minHeight: 360 }}>
            {shownTask ? (
              <CodeEditor
                path={modelPath('monitor', shownTask.id, shownTask.language)}
                language={shownTask.language}
                value={doc?.content ?? ''}
                readOnly
                onMount={(ed) => {
                  editorRef.current = ed;
                }}
              />
            ) : (
              <Typography sx={{ p: 2 }}>This interview has no tasks.</Typography>
            )}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, py: 0.5 }}>
            {doc ? `Version ${doc.version} · ${shownTask ? LANGUAGE_LABELS[shownTask.language].name : ''}` : '—'} · read-only. Highlights from the timeline refer
            to the current code.
          </Typography>
        </Paper>

        {/* Side panel */}
        <Stack spacing={1.5} sx={{ minHeight: 0 }}>
          <Section title="Session">
            <SessionStatus
              session={session}
              candidateConnected={live.candidateConnected}
              lastActivity={derived.lastActivity}
              tabVisible={derived.tabVisible}
              currentTaskTitle={activeTask?.title ?? null}
            />
          </Section>
          <Section title={`Observations (${insights.length})`}>
            <Box sx={{ maxHeight: 180, overflow: 'auto' }}>
              <InsightsPanel
                insights={insights}
                onSelect={(i) => {
                  const e = events.find((x) => x.sequenceNumber === i.relatedSeq[0]);
                  if (e) selectEvent(e);
                }}
              />
            </Box>
          </Section>
          <Section title={`Activity timeline (${events.length})`} grow>
            <Box sx={{ flex: 1, minHeight: 260 }}>
              <ActivityTimeline
                events={events}
                selectedSeq={live.selectedSeq}
                flaggedSeq={flaggedSeq}
                onSelect={(e) => selectEvent(e)}
              />
            </Box>
            {selected && (
              <>
                <Divider sx={{ my: 1 }} />
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <EventDetails event={selected} view={describeEvent(selected)} />
                  <Button size="small" onClick={() => live.select(null)}>
                    Close
                  </Button>
                </Stack>
              </>
            )}
          </Section>
        </Stack>
      </Box>

      <InviteLinkDialog url={inviteUrl} title="New one-time link" onClose={() => setInviteUrl(null)} />
      <Dialog open={confirmEnd} onClose={() => setConfirmEnd(false)}>
        <DialogTitle>End this session?</DialogTitle>
        <DialogContent>
          <DialogContentText>The candidate will be disconnected and can no longer edit the code.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmEnd(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={endSession.isPending}
            onClick={() => endSession.mutate(undefined, { onSettled: () => setConfirmEnd(false) })}
          >
            End session
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
