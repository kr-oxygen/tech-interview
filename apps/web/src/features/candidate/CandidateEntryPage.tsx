import LockClockOutlinedIcon from '@mui/icons-material/LockClockOutlined';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CandidateTokenResponse, InviteInfoDto } from '@ti/shared';
import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CenteredMessage } from '../../components/common/CenteredMessage';
import { safeGet, safeSet } from '../../lib/storage';
import { ApiError, api, errorMessage } from '../../services/api/client';
import { CandidateWorkspace } from './CandidateWorkspace';

const TRACKED = [
  ['Copy, cut and paste inside the editor', 'including the copied or pasted text'],
  ['Copying text elsewhere on this page', 'e.g. from the task description, including the copied text'],
  ['Text selection inside the editor', 'position and the selected text'],
  ['Code changes', 'every edit you make, so the interviewer can follow your process'],
  ['Editor focus', 'when the editor gains or loses focus'],
  ['Browser tab visibility and window focus', 'when you switch to another tab or window'],
  ['Leaving this page', 'closing the tab, reloading or going back pauses the session'],
] as const;

const tokenKey = (invite: string) => `ti.candidate.${invite}`;

export function SessionPausedMessage() {
  return (
    <CenteredMessage title="Session paused" icon={<LockClockOutlinedIcon color="warning" fontSize="large" />}>
      <Typography>
        You left the interview page, so the session was paused. Your code has been saved.
      </Typography>
      <Typography>
        Please contact your interviewer. Once they allow you to continue, this page will let you back in — keep it
        open, or reopen your original link.
      </Typography>
    </CenteredMessage>
  );
}

export function SessionEndedMessage() {
  return (
    <CenteredMessage title="Interview finished">
      <Typography>This interview session has ended. Thank you for your time!</Typography>
    </CenteredMessage>
  );
}

/** /candidate/session/:token — consent screen, then the workspace. */
export function CandidateEntryPage() {
  const { token = '' } = useParams();
  const [candidateToken, setCandidateToken] = useState<string | null>(() => safeGet('session', tokenKey(token)));
  const [consent, setConsent] = useState(false);
  const qc = useQueryClient();

  const info = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api<InviteInfoDto>('GET', `/candidate/invite?token=${encodeURIComponent(token)}`, { token: null }),
    enabled: !candidateToken,
    retry: false,
    // While paused, wait for the interviewer to allow the return.
    refetchInterval: (q) => (q.state.data?.status === 'LOCKED' && q.state.data.linkState !== 'valid' ? 5_000 : false),
  });

  /** The session was paused (or our token revoked): drop the token and go back to the link flow. */
  const onAccessLost = useCallback(() => {
    safeSet('session', tokenKey(token), null);
    qc.removeQueries({ queryKey: ['invite', token] });
    setCandidateToken(null);
  }, [qc, token]);

  const exchange = useMutation({
    mutationFn: () =>
      api<CandidateTokenResponse>('POST', '/candidate/sessions/exchange', {
        body: { token, consent: true },
        token: null,
      }),
    onSuccess: (r) => {
      safeSet('session', tokenKey(token), r.candidateToken);
      setCandidateToken(r.candidateToken);
    },
  });

  if (candidateToken) return <CandidateWorkspace candidateToken={candidateToken} onAccessLost={onAccessLost} />;

  if (info.isLoading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }
  if (info.error) {
    return (
      <CenteredMessage title="Link not valid">
        <Typography>This interview link is not valid. Please check it or ask your interviewer for a new one.</Typography>
      </CenteredMessage>
    );
  }
  const i = info.data!;
  if (i.status === 'LOCKED' && i.linkState !== 'valid') return <SessionPausedMessage />;
  if (i.status === 'LOCKED') {
    // The interviewer re-enabled the link: consent was given before, so just continue.
    return (
      <CenteredMessage title="You can continue">
        <Typography>
          Your interviewer has allowed you to return to <strong>{i.interviewTitle}</strong>. Your code has been
          kept; the same recording rules apply.
        </Typography>
        {exchange.error && (
          <Alert severity="error" sx={{ width: '100%' }}>
            {errorMessage(exchange.error)}
          </Alert>
        )}
        <Button variant="contained" size="large" disabled={exchange.isPending} onClick={() => exchange.mutate()}>
          Continue interview
        </Button>
      </CenteredMessage>
    );
  }
  if (i.status === 'ENDED') return <SessionEndedMessage />;
  if (i.linkState === 'used') {
    return (
      <CenteredMessage title="Link already used">
        <Typography>
          This link has already been used to join the interview. Links work only once — please ask your
          interviewer for a new one.
        </Typography>
      </CenteredMessage>
    );
  }
  if (i.linkState === 'expired' || i.status === 'EXPIRED') {
    return (
      <CenteredMessage title="Link expired">
        <Typography>This interview link has expired. Please ask your interviewer for a new one.</Typography>
      </CenteredMessage>
    );
  }

  const exchangeError =
    exchange.error instanceof ApiError && exchange.error.code === 'SESSION_LOCKED'
      ? 'This session is paused. Please contact your interviewer.'
      : exchange.error
        ? errorMessage(exchange.error)
        : null;

  return (
    <CenteredMessage title={i.interviewTitle}>
      <Typography>
        Hello, <strong>{i.candidateName}</strong>. This technical interview is planned for{' '}
        <strong>{i.durationMinutes} minutes</strong>. You will solve the tasks in a code editor in this browser
        tab; no installation is needed.
      </Typography>
      {i.interviewDescription && (
        <Typography color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
          {i.interviewDescription}
        </Typography>
      )}
      <Divider flexItem />
      <Typography variant="subtitle1" component="h2">
        What is recorded
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Your interviewer can follow your work live and review it afterwards. The following is recorded in this
        browser tab only:
      </Typography>
      <List dense disablePadding>
        {TRACKED.map(([primary, secondary]) => (
          <ListItem key={primary} disableGutters>
            <ListItemText primary={primary} secondary={secondary} />
          </ListItem>
        ))}
      </List>
      <Alert severity="info" sx={{ width: '100%' }}>
        Nothing outside this tab is monitored: not other applications, other tabs’ content, your screen, camera or
        microphone. We cannot see where copied text came from. Recorded data is kept for {i.retentionDays} days.
      </Alert>
      <Alert severity="warning" sx={{ width: '100%' }}>
        Closing this tab, reloading the page or pressing Back will <strong>pause the session</strong>; only your
        interviewer can let you continue. The link works once.
      </Alert>
      <FormControlLabel
        control={<Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} />}
        label="I have read and agree to the recording described above"
      />
      {exchangeError && (
        <Alert severity="error" sx={{ width: '100%' }}>
          {exchangeError}
        </Alert>
      )}
      <Button
        variant="contained"
        size="large"
        disabled={!consent || exchange.isPending}
        onClick={() => exchange.mutate()}
      >
        Continue
      </Button>
    </CenteredMessage>
  );
}
