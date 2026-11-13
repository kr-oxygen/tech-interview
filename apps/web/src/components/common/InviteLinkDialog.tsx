import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  TextField,
  Tooltip,
} from '@mui/material';
import { useState } from 'react';

interface Props {
  url: string | null;
  title?: string;
  onClose: () => void;
}

/** Shows a one-time invitation link (only its hash is stored server-side). */
export function InviteLinkDialog({ url, title = 'Invitation link', onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Dialog open={!!url} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          Send this link to the candidate. It works once and is shown only now — if it gets lost, issue a new one.
        </Alert>
        <TextField
          fullWidth
          value={url ?? ''}
          onFocus={(e) => e.target.select()}
          slotProps={{
            input: {
              readOnly: true,
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title={copied ? 'Copied' : 'Copy'}>
                    <IconButton onClick={copy} aria-label="Copy link">
                      <ContentCopyIcon />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            },
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}
