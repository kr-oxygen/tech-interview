import { Box, Paper, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export function CenteredMessage({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2, bgcolor: 'background.default' }}>
      <Paper sx={{ p: { xs: 3, sm: 4 }, maxWidth: 560, width: '100%' }}>
        <Stack spacing={2} alignItems="flex-start">
          {icon}
          <Typography variant="h5" component="h1">
            {title}
          </Typography>
          {children}
        </Stack>
      </Paper>
    </Box>
  );
}
