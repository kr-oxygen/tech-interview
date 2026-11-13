import { Box, Chip, Stack, Typography } from '@mui/material';
import type { SessionDto, SessionStatus as Status } from '@ti/shared';
import type { ReactNode } from 'react';
import { formatDateTime, formatDuration } from '../../lib/format';
import { useNow } from '../common/useNow';

export const STATUS_CHIP: Record<Status, { label: string; color: 'default' | 'success' | 'warning' | 'error' | 'info' }> = {
  CREATED: { label: 'Not started', color: 'default' },
  ACTIVE: { label: 'In progress', color: 'success' },
  LOCKED: { label: 'Paused', color: 'warning' },
  ENDED: { label: 'Completed', color: 'info' },
  EXPIRED: { label: 'Expired', color: 'error' },
};

export function StatusChip({ status }: { status: Status }) {
  const c = STATUS_CHIP[status];
  return <Chip size="small" label={c.label} color={c.color} />;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 1, alignItems: 'center' }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

interface Props {
  session: SessionDto;
  candidateConnected: boolean;
  lastActivity: string | null;
  tabVisible: boolean | null;
  currentTaskTitle: string | null;
}

/** Connection, duration, last activity, visibility and current task. */
export function SessionStatus({ session, candidateConnected, lastActivity, tabVisible, currentTaskTitle }: Props) {
  const now = useNow();
  const started = session.startedAt ? new Date(session.startedAt).getTime() : null;
  const ended = session.endedAt ? new Date(session.endedAt).getTime() : now;
  const live = session.status === 'ACTIVE' || session.status === 'CREATED';
  return (
    <Stack spacing={0.75}>
      <Row label="Status">
        <StatusChip status={session.status} />
      </Row>
      <Row label="Candidate">
        <Chip
          size="small"
          variant="outlined"
          color={candidateConnected ? 'success' : 'default'}
          label={candidateConnected ? 'Online' : 'Offline'}
        />
      </Row>
      <Row label="Duration">
        <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {started ? `${formatDuration(ended - started)} of ${session.durationMinutes} min` : '—'}
        </Typography>
      </Row>
      <Row label="Last activity">
        <Typography variant="body2">
          {lastActivity ? `${formatDuration(now - new Date(lastActivity).getTime())} ago` : '—'}
        </Typography>
      </Row>
      {live && (
        <Row label="Browser tab">
          {tabVisible === null ? (
            <Typography variant="body2">—</Typography>
          ) : (
            <Chip size="small" variant="outlined" color={tabVisible ? 'success' : 'warning'} label={tabVisible ? 'Visible' : 'Hidden'} />
          )}
        </Row>
      )}
      <Row label="Current task">
        <Typography variant="body2" noWrap>
          {currentTaskTitle ?? '—'}
        </Typography>
      </Row>
      <Row label="Paused">
        <Typography variant="body2">{session.lockCount} time(s)</Typography>
      </Row>
      <Row label="Started">
        <Typography variant="body2">{formatDateTime(session.startedAt)}</Typography>
      </Row>
    </Stack>
  );
}
