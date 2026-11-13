import { Box, Button, Stack, Typography } from '@mui/material';
import type { ActivityEventDto } from '@ti/shared';
import { useState } from 'react';
import { formatDateTime } from '../../lib/format';
import type { EventView } from './describeEvent';

const PREVIEW = 3001;

/** Full details of the selected event (text content, positions, timestamps). */
export function EventDetails({ event, view }: { event: ActivityEventDto; view: EventView }) {
  const [full, setFull] = useState(false);
  const text = view.text ?? '';
  const shown = full ? text : text.slice(0, PREVIEW);
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">
        #{event.sequenceNumber} · {view.title}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Server time {formatDateTime(event.timestamp)}
        {event.clientTimestamp ? ` · client ${new Date(event.clientTimestamp).toLocaleTimeString('en-GB')}` : ''}
        {view.summary ? ` · ${view.summary}` : ''}
      </Typography>
      {text && (
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 1,
            maxHeight: 220,
            overflow: 'auto',
            bgcolor: 'action.hover',
            borderRadius: 1,
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {shown}
        </Box>
      )}
      {text.length > PREVIEW && (
        <Button size="small" onClick={() => setFull((v) => !v)} sx={{ alignSelf: 'flex-start' }}>
          {full ? 'Show less' : `Show all ${text.length} characters`}
        </Button>
      )}
    </Stack>
  );
}
