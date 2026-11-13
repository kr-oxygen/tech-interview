import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CandidateDto, CreateCandidateDto, SessionDto, UpdateCandidateDto } from '@ti/shared';
import { api } from '../../services/api/client';
import { qk } from '../../services/api/queryKeys';

export const useCandidates = (q = '') =>
  useQuery({
    queryKey: qk.candidates(q),
    queryFn: () => api<CandidateDto[]>('GET', `/candidates?q=${encodeURIComponent(q)}`),
    placeholderData: keepPreviousData,
  });

export const useCandidate = (id: string) =>
  useQuery({ queryKey: qk.candidate(id), queryFn: () => api<CandidateDto>('GET', `/candidates/${id}`) });

export const useCandidateSessions = (id: string) =>
  useQuery({
    queryKey: qk.candidateSessions(id),
    queryFn: () => api<SessionDto[]>('GET', `/candidates/${id}/sessions`),
  });

export function useSaveCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id?: string; dto: CreateCandidateDto | UpdateCandidateDto }) =>
      id
        ? api<CandidateDto>('PATCH', `/candidates/${id}`, { body: dto })
        : api<CandidateDto>('POST', '/candidates', { body: dto }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.candidatesAll }),
  });
}

export function useDeleteCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/candidates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.candidatesAll }),
  });
}
