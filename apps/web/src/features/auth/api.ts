import { useMutation, useQuery } from '@tanstack/react-query';
import type { AuthResponse, LoginDto, RegisterDto, UserDto } from '@ti/shared';
import { api } from '../../services/api/client';
import { qk } from '../../services/api/queryKeys';
import { useAuthStore } from '../../stores/authStore';

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: (dto: LoginDto) => api<AuthResponse>('POST', '/auth/login', { body: dto, token: null }),
    onSuccess: (r) => setAuth(r.accessToken, r.user),
  });
}

export function useRegister() {
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: (dto: RegisterDto) => api<AuthResponse>('POST', '/auth/register', { body: dto, token: null }),
    onSuccess: (r) => setAuth(r.accessToken, r.user),
  });
}

export function useMe() {
  const token = useAuthStore((s) => s.token);
  return useQuery({ queryKey: qk.me, queryFn: () => api<UserDto>('GET', '/auth/me'), enabled: !!token });
}
