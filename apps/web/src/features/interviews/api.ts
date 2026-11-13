import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateInterviewDto,
  CreateSessionDto,
  CreateTaskDto,
  InterviewDto,
  SessionCreatedResponse,
  SessionDto,
  TaskDto,
  UpdateInterviewDto,
  UpdateTaskDto,
} from '@ti/shared';
import { api } from '../../services/api/client';
import { qk } from '../../services/api/queryKeys';

export const useInterviews = () =>
  useQuery({ queryKey: qk.interviews, queryFn: () => api<InterviewDto[]>('GET', '/interviews') });

export const useInterview = (id: string) =>
  useQuery({ queryKey: qk.interview(id), queryFn: () => api<InterviewDto>('GET', `/interviews/${id}`) });

export function useCreateInterview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateInterviewDto) => api<InterviewDto>('POST', '/interviews', { body: dto }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.interviews }),
  });
}

export function useUpdateInterview(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateInterviewDto) => api<InterviewDto>('PATCH', `/interviews/${id}`, { body: dto }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.interviews }),
  });
}

export function useDeleteInterview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/interviews/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.interviews }),
  });
}

export const useTasks = (interviewId: string) =>
  useQuery({
    queryKey: qk.tasks(interviewId),
    queryFn: () => api<TaskDto[]>('GET', `/interviews/${interviewId}/tasks`),
  });

export function useSaveTask(interviewId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id?: string; dto: CreateTaskDto | UpdateTaskDto }) =>
      id
        ? api<TaskDto>('PATCH', `/tasks/${id}`, { body: dto })
        : api<TaskDto>('POST', `/interviews/${interviewId}/tasks`, { body: dto }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.tasks(interviewId) });
      qc.invalidateQueries({ queryKey: qk.interviews });
    },
  });
}

export function useDeleteTask(interviewId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tasks(interviewId) }),
  });
}

export const useInterviewSessions = (interviewId: string) =>
  useQuery({
    queryKey: qk.interviewSessions(interviewId),
    queryFn: () => api<SessionDto[]>('GET', `/interviews/${interviewId}/sessions`),
    refetchInterval: 15_000,
  });

export function useCreateSession(interviewId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateSessionDto) =>
      api<SessionCreatedResponse>('POST', `/interviews/${interviewId}/sessions`, { body: dto }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.interviewSessions(interviewId) });
      qc.invalidateQueries({ queryKey: qk.candidatesAll });
    },
  });
}
