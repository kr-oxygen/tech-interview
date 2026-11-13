import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import { Chip, Tooltip } from '@mui/material';
import { formatDuration } from '../../lib/format';
import { useNow } from './useNow';

interface Props {
  startedAt: string | null;
  endedAt?: string | null;
  durationMinutes: number;
  /** server time − client time, to keep timers consistent across clocks */
  offsetMs?: number;
}

/** Remaining time; turns red and counts overtime when the planned duration is exceeded. */
export function InterviewTimer({ startedAt, endedAt, durationMinutes, offsetMs = 0 }: Props) {
  const now = useNow() + offsetMs;
  if (!startedAt) return <Chip size="small" icon={<TimerOutlinedIcon />} label={`${durationMinutes}:00`} />;
  const end = endedAt ? new Date(endedAt).getTime() : now;
  const elapsed = end - new Date(startedAt).getTime();
  const remaining = durationMinutes * 60_000 - elapsed;
  const overtime = remaining < 0;
  return (
    <Tooltip title={`Elapsed ${formatDuration(elapsed)} of ${durationMinutes} min`}>
      <Chip
        size="small"
        icon={<TimerOutlinedIcon />}
        color={overtime ? 'error' : remaining < 5 * 60_000 ? 'warning' : 'default'}
        label={overtime ? `+${formatDuration(-remaining)} overtime` : formatDuration(remaining)}
        sx={{ fontVariantNumeric: 'tabular-nums' }}
      />
    </Tooltip>
  );
}
