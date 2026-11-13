export const qk = {
  me: ['me'] as const,
  interviews: ['interviews'] as const,
  interview: (id: string) => ['interviews', id] as const,
  tasks: (interviewId: string) => ['interviews', interviewId, 'tasks'] as const,
  interviewSessions: (interviewId: string) => ['interviews', interviewId, 'sessions'] as const,
  candidates: (q = '') => ['candidates', 'list', q] as const,
  candidatesAll: ['candidates'] as const,
  candidate: (id: string) => ['candidates', id] as const,
  candidateSessions: (id: string) => ['candidates', id, 'sessions'] as const,
  session: (id: string) => ['session', id] as const,
  sessionEvents: (id: string) => ['session', id, 'events'] as const,
  sessionInsights: (id: string) => ['session', id, 'insights'] as const,
};
