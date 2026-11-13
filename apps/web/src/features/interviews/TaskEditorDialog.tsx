import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { Language, TaskDto } from '@ti/shared';
import { useEffect, useState } from 'react';
import { CodeEditor } from '../../components/CodeEditor/CodeEditor';
import { modelPath } from '../../components/CodeEditor/monacoSetup';
import { errorMessage } from '../../services/api/client';
import { useSaveTask } from './api';

interface Props {
  interviewId: string;
  /** undefined = closed, null = new task */
  task: TaskDto | null | undefined;
  onClose: () => void;
}

export function TaskEditorDialog({ interviewId, task, onClose }: Props) {
  const save = useSaveTask(interviewId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState<Language>('typescript');
  const [initialCode, setInitialCode] = useState('');

  useEffect(() => {
    if (task === undefined) return;
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setLanguage(task?.language ?? 'typescript');
    setInitialCode(task?.initialCode ?? '');
    save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);

  return (
    <Dialog open={task !== undefined} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{task ? 'Edit task' : 'New task'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Title" required fullWidth value={title} onChange={(e) => setTitle(e.target.value)} />
            <TextField
              select
              label="Language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="typescript">TypeScript</MenuItem>
              <MenuItem value="javascript">JavaScript</MenuItem>
            </TextField>
          </Stack>
          <TextField
            label="Description (Markdown)"
            multiline
            minRows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Box>
            <Typography variant="caption" color="text.secondary">
              Initial code shown to the candidate
            </Typography>
            <Box sx={{ height: 280, border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
              <CodeEditor
                path={modelPath('task-editor', task?.id ?? 'new', language)}
                language={language}
                value={initialCode}
                onChange={setInitialCode}
              />
            </Box>
          </Box>
          {save.error && <Alert severity="error">{errorMessage(save.error)}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!title.trim() || save.isPending}
          onClick={() =>
            save.mutate(
              { id: task?.id, dto: { title: title.trim(), description, language, initialCode } },
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
