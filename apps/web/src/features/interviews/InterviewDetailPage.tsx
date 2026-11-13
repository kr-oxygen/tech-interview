import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { LANGUAGE_LABELS, type TaskDto } from '@ti/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { InviteLinkDialog } from '../../components/common/InviteLinkDialog';
import { errorMessage } from '../../services/api/client';
import { CreateSessionDialog } from './CreateSessionDialog';
import { SessionsTable } from './SessionsTable';
import { TaskEditorDialog } from './TaskEditorDialog';
import {
  useDeleteInterview,
  useDeleteTask,
  useInterview,
  useInterviewSessions,
  useTasks,
  useUpdateInterview,
} from './api';

export function InterviewDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const interview = useInterview(id);
  const tasks = useTasks(id);
  const sessions = useInterviewSessions(id);
  const update = useUpdateInterview(id);
  const remove = useDeleteInterview();
  const deleteTask = useDeleteTask(id);
  const [editing, setEditing] = useState<TaskDto | null | undefined>(undefined);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (interview.data) {
      setTitle(interview.data.title);
      setDescription(interview.data.description);
    }
  }, [interview.data]);

  if (interview.isLoading) return <Skeleton variant="rounded" height={200} />;
  if (interview.error) return <Alert severity="error">{errorMessage(interview.error)}</Alert>;

  const dirty = interview.data && (title !== interview.data.title || description !== interview.data.description);
  const hasTasks = (tasks.data?.length ?? 0) > 0;

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <TextField label="Interview title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <TextField
            label="Instructions for the candidate"
            multiline
            minRows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Stack direction="row" spacing={1}>
            <Button variant="contained" disabled={!dirty || !title.trim() || update.isPending} onClick={() => update.mutate({ title: title.trim(), description })}>
              Save
            </Button>
            <Button
              color="error"
              onClick={() => {
                if (window.confirm('Delete this interview with all its sessions and recorded activity?')) {
                  remove.mutate(id, { onSuccess: () => navigate('/interviewer/interviews') });
                }
              }}
            >
              Delete interview
            </Button>
          </Stack>
          {(update.error || remove.error) && <Alert severity="error">{errorMessage(update.error ?? remove.error)}</Alert>}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" component="h2">
            Tasks
          </Typography>
          <Button startIcon={<AddIcon />} onClick={() => setEditing(null)}>
            Add task
          </Button>
        </Stack>
        <List dense>
          {tasks.data?.map((t, i) => (
            <ListItem
              key={t.id}
              divider
              secondaryAction={
                <Box>
                  <IconButton aria-label="Edit task" onClick={() => setEditing(t)}>
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    aria-label="Delete task"
                    onClick={() => window.confirm(`Delete task “${t.title}”?`) && deleteTask.mutate(t.id)}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Box>
              }
            >
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <span>
                      {i + 1}. {t.title}
                    </span>
                    <Chip size="small" label={LANGUAGE_LABELS[t.language].short} />
                  </Stack>
                }
                secondary={t.description.slice(0, 120) || 'No description'}
              />
            </ListItem>
          ))}
        </List>
        {!hasTasks && !tasks.isLoading && (
          <Typography variant="body2" color="text.secondary">
            Add at least one task before inviting a candidate.
          </Typography>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="h6" component="h2">
            Sessions
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} disabled={!hasTasks} onClick={() => setSessionOpen(true)}>
            Invite candidate
          </Button>
        </Stack>
        {sessions.data && <SessionsTable sessions={sessions.data} />}
      </Paper>

      <TaskEditorDialog interviewId={id} task={editing} onClose={() => setEditing(undefined)} />
      <CreateSessionDialog interviewId={id} open={sessionOpen} onClose={() => setSessionOpen(false)} onCreated={setInviteUrl} />
      <InviteLinkDialog url={inviteUrl} onClose={() => setInviteUrl(null)} />
    </Stack>
  );
}
