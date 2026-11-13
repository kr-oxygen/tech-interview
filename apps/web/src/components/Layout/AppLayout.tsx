import LogoutIcon from '@mui/icons-material/Logout';
import { AppBar, Box, Button, Container, IconButton, Stack, Toolbar, Tooltip, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { NavLink, Outlet, useMatch } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

function NavButton({ to, children }: { to: string; children: string }) {
  const active = useMatch({ path: to, end: false });
  return (
    <Button component={NavLink} to={to} color="inherit" sx={{ fontWeight: active ? 700 : 400, textTransform: 'none' }}>
      {children}
    </Button>
  );
}

export function AppLayout() {
  const { user, logout } = useAuthStore();
  const qc = useQueryClient();
  const wide = useMatch('/interviewer/sessions/:id');
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar variant="dense" sx={{ gap: 1 }}>
          <Typography variant="subtitle1" component="div" sx={{ fontWeight: 700, mr: 2 }}>
            Tech Interview
          </Typography>
          <Stack direction="row" spacing={0.5} sx={{ flexGrow: 1 }}>
            <NavButton to="/interviewer/interviews">Interviews</NavButton>
            <NavButton to="/interviewer/candidates">Candidates</NavButton>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
            {user?.name}
          </Typography>
          <Tooltip title="Sign out">
            <IconButton
              onClick={() => {
                logout();
                qc.clear();
              }}
              aria-label="Sign out"
            >
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>
      <Container maxWidth={wide ? false : 'lg'} sx={{ py: 2, px: { xs: 2, sm: 3 } }}>
        <Outlet />
      </Container>
    </Box>
  );
}
