import { Box } from '@mui/material';
import ReactMarkdown from 'react-markdown';

/** Task descriptions are Markdown (raw HTML is not rendered). */
export function Markdown({ children }: { children: string }) {
  return (
    <Box
      sx={{
        '& pre': { p: 1.5, borderRadius: 1, bgcolor: 'action.hover', overflowX: 'auto' },
        '& code': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.9em' },
        '& p:first-of-type': { mt: 0 },
        overflowWrap: 'anywhere',
      }}
    >
      <ReactMarkdown>{children || '_No description._'}</ReactMarkdown>
    </Box>
  );
}
