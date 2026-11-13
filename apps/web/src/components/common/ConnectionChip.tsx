import CircleIcon from '@mui/icons-material/Circle';
import { Chip } from '@mui/material';

const LABELS: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'default' }> = {
  connected: { label: 'Connected', color: 'success' },
  connecting: { label: 'Connecting…', color: 'warning' },
  reconnecting: { label: 'Reconnecting…', color: 'warning' },
  offline: { label: 'Offline', color: 'error' },
};

export function ConnectionChip({ state, pending = 0 }: { state: string; pending?: number }) {
  const cfg = LABELS[state] ?? { label: state, color: 'default' as const };
  return (
    <Chip
      size="small"
      variant="outlined"
      color={cfg.color}
      icon={<CircleIcon sx={{ fontSize: 10 }} />}
      label={pending > 0 && state !== 'connected' ? `${cfg.label} (${pending} unsent)` : cfg.label}
    />
  );
}
