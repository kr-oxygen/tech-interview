import type { UserDto } from '@ti/shared';
import { create } from 'zustand';
import { safeGet, safeSet } from '../lib/storage';

const KEY = 'ti.auth';

interface AuthState {
  token: string | null;
  user: UserDto | null;
  setAuth: (token: string, user: UserDto) => void;
  logout: () => void;
}

function load(): Pick<AuthState, 'token' | 'user'> {
  try {
    const raw = safeGet('local', KEY);
    return raw ? JSON.parse(raw) : { token: null, user: null };
  } catch {
    return { token: null, user: null };
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  ...load(),
  setAuth: (token, user) => {
    safeSet('local', KEY, JSON.stringify({ token, user }));
    set({ token, user });
  },
  logout: () => {
    safeSet('local', KEY, null);
    set({ token: null, user: null });
  },
}));
