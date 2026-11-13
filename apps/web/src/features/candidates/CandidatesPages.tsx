import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { CandidateDto } from '@ti/shared';
import { useDeferredValue, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { formatDateTime } from '../../lib/format';
import { errorMessage } from '../../services/api/client';
import { SessionsTable } from '../interviews/SessionsTable';
import { useCandidate, useCandidateSessions, useCandidates, useDeleteCandidate, useSaveCandidate } from './api';

function CandidateDialog({ candidate, onClose }: { candidate: CandidateDto | null | undefined; onClose: () => void }) {
  const save = useSaveCandidate();
  const [form, setForm] = useState({ name: '', email: '', notes: '' });
  useEffect(() => {
    if (candidate !== undefined) {
      setForm({ name: candidate?.name ?? '', email: candidate?.email ?? '', notes: candidate?.notes ?? '' });
      save.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate]);
  return (
    <Dialog open={candidate !== undefined} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{candidate ? 'Edit candidate' : 'New candidate'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <TextField label="Notes" multiline minRows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          {save.error && <Alert severity="error">{errorMessage(save.error)}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!form.name.trim() || save.isPending}
          onClick={() =>
            save.mutate(
              { id: candidate?.id, dto: { name: form.name.trim(), email: form.email.trim() || null, notes: form.notes || null } },
              { onSuccess: onClose },
            )
          }
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function CandidatesPage() {
  const [q, setQ] = useState('');
  const candidates = useCandidates(useDeferredValue(q));
  const navigate = useNavigate();
  const [editing, setEditing] = useState<CandidateDto | null | undefined>(undefined);
  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5" component="h1">
          Candidates
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing(null)}>
          New candidate
        </Button>
      </Stack>
      <TextField
        placeholder="Search by name or email"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
      />
      {candidates.isLoading && <Skeleton variant="rounded" height={120} />}
      <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Sessions</TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Added</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {candidates.data?.map((c) => (
              <TableRow key={c.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/interviewer/candidates/${c.id}`)}>
                <TableCell>{c.name}</TableCell>
                <TableCell>{c.email ?? '—'}</TableCell>
                <TableCell>{c.sessionCount ?? 0}</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{formatDateTime(c.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
      <CandidateDialog candidate={editing} onClose={() => setEditing(undefined)} />
    </Stack>
  );
}

export function CandidateDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const candidate = useCandidate(id);
  const sessions = useCandidateSessions(id);
  const remove = useDeleteCandidate();
  const [editing, setEditing] = useState<CandidateDto | null | undefined>(undefined);
  if (candidate.isLoading) return <Skeleton variant="rounded" height={200} />;
  if (candidate.error || !candidate.data) return <Alert severity="error">{errorMessage(candidate.error)}</Alert>;
  const c = candidate.data;
  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Typography variant="h5" component="h1">
            {c.name}
          </Typography>
          <Typography color="text.secondary">{c.email ?? 'No email'}</Typography>
          {c.notes && <Typography sx={{ whiteSpace: 'pre-wrap' }}>{c.notes}</Typography>}
          <Stack direction="row" spacing={1}>
            <Button onClick={() => setEditing(c)}>Edit</Button>
            <Button
              color="error"
              disabled={(c.sessionCount ?? 0) > 0}
              onClick={() => window.confirm('Delete this candidate?') && remove.mutate(c.id, { onSuccess: () => navigate('/interviewer/candidates') })}
            >
              Delete
            </Button>
          </Stack>
          {remove.error && <Alert severity="error">{errorMessage(remove.error)}</Alert>}
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Interview history
        </Typography>
        {sessions.data && <SessionsTable sessions={sessions.data} showInterview />}
      </Paper>
      <CandidateDialog candidate={editing} onClose={() => setEditing(undefined)} />
    </Stack>
  );
}
