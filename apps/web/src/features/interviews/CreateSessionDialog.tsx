import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import type { CandidateDto } from '@ti/shared';
import { useDeferredValue, useState } from 'react';
import { errorMessage } from '../../services/api/client';
import { useCandidates } from '../candidates/api';
import { useCreateSession } from './api';

interface Props {
  interviewId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (inviteUrl: string) => void;
}

/** Pick an existing candidate or create one, then generate the one-time link. */
export function CreateSessionDialog({ interviewId, open, onClose, onCreated }: Props) {
  const create = useCreateSession(interviewId);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [query, setQuery] = useState('');
  const candidates = useCandidates(useDeferredValue(query));
  const [candidate, setCandidate] = useState<CandidateDto | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [duration, setDuration] = useState(60);
  const [ttl, setTtl] = useState(72);

  const valid = mode === 'existing' ? !!candidate : name.trim().length > 0;

  const submit = () =>
    create.mutate(
      {
        ...(mode === 'existing'
          ? { candidateId: candidate!.id }
          : { newCandidate: { name: name.trim(), email: email.trim() || null } }),
        durationMinutes: duration,
        inviteTtlHours: ttl,
      },
      {
        onSuccess: (r) => {
          onCreated(r.inviteUrl);
          setCandidate(null);
          setName('');
          setEmail('');
          onClose();
        },
      },
    );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New session</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, v) => v && setMode(v)}>
            <ToggleButton value="existing" sx={{ textTransform: 'none' }}>
              Existing candidate
            </ToggleButton>
            <ToggleButton value="new" sx={{ textTransform: 'none' }}>
              New candidate
            </ToggleButton>
          </ToggleButtonGroup>
          {mode === 'existing' ? (
            <Autocomplete
              options={candidates.data ?? []}
              value={candidate}
              onChange={(_, v) => setCandidate(v)}
              inputValue={query}
              onInputChange={(_, v) => setQuery(v)}
              filterOptions={(x) => x}
              getOptionLabel={(c) => (c.email ? `${c.name} <${c.email}>` : c.name)}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              loading={candidates.isFetching}
              noOptionsText="No candidates — switch to “New candidate”"
              renderInput={(params) => <TextField {...params} label="Candidate" required />}
            />
          ) : (
            <>
              <TextField label="Candidate name" required value={name} onChange={(e) => setName(e.target.value)} />
              <TextField label="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </>
          )}
          <Stack direction="row" spacing={2}>
            <TextField
              label="Duration (minutes)"
              type="number"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              slotProps={{ htmlInput: { min: 5, max: 480 } }}
              fullWidth
            />
            <TextField
              label="Link valid for (hours)"
              type="number"
              value={ttl}
              onChange={(e) => setTtl(Number(e.target.value))}
              slotProps={{ htmlInput: { min: 1, max: 720 } }}
              fullWidth
            />
          </Stack>
          {create.error && <Alert severity="error">{errorMessage(create.error)}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!valid || create.isPending} onClick={submit}>
          Create link
        </Button>
      </DialogActions>
    </Dialog>
  );
}
