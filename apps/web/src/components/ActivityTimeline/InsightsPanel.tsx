import { Alert, Stack, Typography } from '@mui/material';
import type { InsightDto } from '@ti/shared';
import { formatTime } from '../../lib/format';

interface Props {
  insights: InsightDto[];
  onSelect: (insight: InsightDto) => void;
}

/** Observations derived from the activity log — context for the interviewer, not verdicts. */
export function InsightsPanel({ insights, onSelect }: Props) {
  if (insights.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No observations.
      </Typography>
    );
  }
  return (
    <Stack spacing={1}>
      <Typography variant="caption" color="text.secondary">
        Observations are context for your judgement, not evidence of cheating or AI use.
      </Typography>
      {insights.map((i) => (
        <Alert
          key={i.id}
          severity={i.severity === 'notice' ? 'warning' : 'info'}
          variant="outlined"
          onClick={() => onSelect(i)}
          sx={{ cursor: 'pointer', py: 0, '& .MuiAlert-message': { py: 0.75 } }}
        >
          <Typography variant="caption" color="text.secondary" component="span" sx={{ mr: 1 }}>
            {formatTime(i.at)}
          </Typography>
          <Typography variant="body2" component="span">
            {i.message}
          </Typography>
        </Alert>
      ))}
    </Stack>
  );
}
