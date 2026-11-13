import AddIcon from '@mui/icons-material/Add';
import {
  Alert,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { formatDateTime } from '../../lib/format';
import { errorMessage } from '../../services/api/client';
import { useCreateInterview, useInterviews } from './api';

export function InterviewsPage() {
  const interviews = useInterviews();
  const create = useCreateInterview();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5" component="h1">
          Interviews
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
          New interview
        </Button>
      </Stack>
      {interviews.error && <Alert severity="error">{errorMessage(interviews.error)}</Alert>}
      {interviews.isLoading && <Skeleton variant="rounded" height={120} />}
      {interviews.data?.length === 0 && (
        <Alert severity="info">No interviews yet. Create one, add tasks, then invite a candidate.</Alert>
      )}
      <Grid container spacing={2}>
        {interviews.data?.map((i) => (
          <Grid key={i.id} size={{ xs: 12, sm: 6, md: 4 }}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardActionArea component={RouterLink} to={`/interviewer/interviews/${i.id}`} sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" component="h2" gutterBottom noWrap>
                    {i.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ minHeight: 40, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {i.description || 'No description'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {i.taskCount ?? 0} task(s) · {i.sessionCount ?? 0} session(s) · updated {formatDateTime(i.updatedAt)}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>New interview</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Title" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
            <TextField
              label="Instructions for the candidate"
              multiline
              minRows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            {create.error && <Alert severity="error">{errorMessage(create.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!title.trim() || create.isPending}
            onClick={() =>
              create.mutate(
                { title: title.trim(), description },
                { onSuccess: (i) => navigate(`/interviewer/interviews/${i.id}`) },
              )
            }
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
