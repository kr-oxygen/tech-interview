import { useAuthStore } from '../../stores/authStore';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body: unknown;

  constructor(status: number, message: string, code?: string, body?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

interface RequestOptions {
  body?: unknown;
  /** Bearer token override; defaults to the interviewer token. Pass null for anonymous. */
  token?: string | null;
  signal?: AbortSignal;
}

export async function api<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const token = opts.token === undefined ? useAuthStore.getState().token : opts.token;
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    if (res.status === 401 && token && opts.token === undefined) useAuthStore.getState().logout();
    const message =
      (typeof data?.message === 'string' && data.message) ||
      (typeof data?.message?.message === 'string' && data.message.message) ||
      res.statusText;
    throw new ApiError(res.status, message, data?.code ?? data?.message?.code, data);
  }
  return data as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Unexpected error');
