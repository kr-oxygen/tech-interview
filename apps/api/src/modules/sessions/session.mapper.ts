import { Prisma } from '../../generated/prisma/client';
import type { SessionDto } from '@ti/shared';

export const sessionInclude = {
  interview: {
    select: {
      title: true,
      tasks: {
        select: { id: true, title: true, description: true, language: true, order: true },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      },
    },
  },
  candidate: { select: { id: true, name: true, email: true } },
} satisfies Prisma.InterviewSessionInclude;

export type SessionWithRelations = Prisma.InterviewSessionGetPayload<{
  include: typeof sessionInclude;
}>;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toSessionDto(s: SessionWithRelations): SessionDto {
  return {
    id: s.id,
    interviewId: s.interviewId,
    interviewTitle: s.interview.title,
    candidate: s.candidate,
    status: s.status,
    durationMinutes: s.durationMinutes,
    inviteExpiresAt: s.inviteExpiresAt.toISOString(),
    inviteConsumed: s.inviteConsumedAt !== null,
    consentAcceptedAt: iso(s.consentAcceptedAt),
    startedAt: iso(s.startedAt),
    endedAt: iso(s.endedAt),
    lockedAt: iso(s.lockedAt),
    lockReason: s.lockReason ?? null,
    lockCount: s.lockCount,
    activeTaskId: s.activeTaskId,
    createdAt: s.createdAt.toISOString(),
    tasks: s.interview.tasks,
  };
}
