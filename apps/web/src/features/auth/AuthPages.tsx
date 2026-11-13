import { Alert, Button, Link, Stack, TextField } from '@mui/material';
import { useState, type FormEvent } from 'react';
import { Navigate, Link as RouterLink, useLocation } from 'react-router-dom';
import { CenteredMessage } from '../../components/common/CenteredMessage';
import { errorMessage } from '../../services/api/client';
import { useAuthStore } from '../../stores/authStore';
import { useLogin, useRegister } from './api';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const location = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function useRedirectTarget() {
  const location = useLocation();
  return (location.state as { from?: string } | null)?.from ?? '/interviewer/interviews';
}

export function LoginPage() {
  const token = useAuthStore((s) => s.token);
  const target = useRedirectTarget();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  if (token) return <Navigate to={target} replace />;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password });
  };
  return (
    <CenteredMessage title="Sign in">
      <Stack component="form" spacing={2} onSubmit={submit} sx={{ width: '100%' }}>
        <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {login.error && <Alert severity="error">{errorMessage(login.error)}</Alert>}
        <Button type="submit" variant="contained" disabled={login.isPending}>
          Sign in
        </Button>
        <Link component={RouterLink} to="/register">
          Create an interviewer account
        </Link>
      </Stack>
    </CenteredMessage>
  );
}

export function RegisterPage() {
  const token = useAuthStore((s) => s.token);
  const register = useRegister();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  if (token) return <Navigate to="/interviewer/interviews" replace />;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    register.mutate(form);
  };
  return (
    <CenteredMessage title="Create account">
      <Stack component="form" spacing={2} onSubmit={submit} sx={{ width: '100%' }}>
        <TextField label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <TextField label="Email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          helperText="At least 8 characters"
          slotProps={{ htmlInput: { minLength: 8 } }}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {register.error && <Alert severity="error">{errorMessage(register.error)}</Alert>}
        <Button type="submit" variant="contained" disabled={register.isPending}>
          Create account
        </Button>
        <Link component={RouterLink} to="/login">
          I already have an account
        </Link>
      </Stack>
    </CenteredMessage>
  );
}
