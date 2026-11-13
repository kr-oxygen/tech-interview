import { Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import type { SessionDto } from '@ti/shared';
import { useNavigate } from 'react-router-dom';
import { StatusChip } from '../../components/SessionStatus/SessionStatus';
import { formatDateTime } from '../../lib/format';

export function SessionsTable({ sessions, showInterview = false }: { sessions: SessionDto[]; showInterview?: boolean }) {
  const navigate = useNavigate();
  if (sessions.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No sessions yet.
      </Typography>
    );
  }
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>{showInterview ? 'Interview' : 'Candidate'}</TableCell>
          <TableCell>Status</TableCell>
          <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Created</TableCell>
          <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Started</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {sessions.map((s) => (
          <TableRow key={s.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/interviewer/sessions/${s.id}`)}>
            <TableCell>{showInterview ? s.interviewTitle : s.candidate.name}</TableCell>
            <TableCell>
              <StatusChip status={s.status} />
            </TableCell>
            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{formatDateTime(s.createdAt)}</TableCell>
            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{formatDateTime(s.startedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
