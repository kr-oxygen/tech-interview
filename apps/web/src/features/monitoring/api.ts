import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AllowReturnDto,
  AllowReturnResponse,
  EventsPage,
  InsightDto,
  SessionCreatedResponse,
  SessionDto,
} from '@ti/shared';
import { api } from '../../services/api/client';
import { qk } from '../../services/api/queryKeys';

export const useSession = (id: string) =>
  useQuery({ queryKey: qk.session(id), queryFn: () => api<SessionDto>('GET', `/sessions/${id}`) });

/** Persisted timeline history, paged by sequence number. */
export const useSessionEvents = (id: string) =>
  useInfiniteQuery({
    queryKey: qk.sessionEvents(id),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api<EventsPage>('GET', `/sessions/${id}/events?after=${pageParam}&limit=500`),
    getNextPageParam: (last) => last.nextAfter ?? undefined,
    staleTime: Infinity,
  });

export const useSessionInsights = (id: string) =>
  useQuery({
    queryKey: qk.sessionInsights(id),
    queryFn: () => api<InsightDto[]>('GET', `/sessions/${id}/insights`),
  });

function useSessionAction<TBody extends object = object, TResult = SessionCreatedResponse | SessionDto>(
  id: string,
  path: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body?: TBody) => api<TResult>('POST', `/sessions/${id}/${path}`, { body: body ?? {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.session(id) });
      qc.invalidateQueries({ queryKey: ['interviews'] });
    },
  });
}

export const useEndSession = (id: string) => useSessionAction(id, 'end');
export const useAllowReturn = (id: string) =>
  useSessionAction<AllowReturnDto, AllowReturnResponse>(id, 'allow-return');
export const useReissueInvite = (id: string) => useSessionAction(id, 'reissue-invite');
