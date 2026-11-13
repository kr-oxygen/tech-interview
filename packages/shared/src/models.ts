import type {
  ActivityEventType,
  InsightType,
  Language,
  LockReason,
  SessionStatus,
  SnapshotReason,
} from './enums';

export interface UserDto {
  id: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  accessToken: string;
  user: UserDto;
}

export interface InterviewDto {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  taskCount?: number;
  sessionCount?: number;
}

export interface TaskDto {
  id: string;
  interviewId: string;
  title: string;
  description: string;
  initialCode: string;
  language: Language;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateDto {
  id: string;
  name: string;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  sessionCount?: number;
}

export interface SessionDto {
  id: string;
  interviewId: string;
  interviewTitle: string;
  candidate: Pick<CandidateDto, 'id' | 'name' | 'email'>;
  status: SessionStatus;
  durationMinutes: number;
  inviteExpiresAt: string;
  inviteConsumed: boolean;
  consentAcceptedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  lockedAt: string | null;
  lockReason: LockReason | null;
  lockCount: number;
  activeTaskId: string | null;
  createdAt: string;
  tasks: Array<Pick<TaskDto, 'id' | 'title' | 'description' | 'language' | 'order'>>;
}

export interface SessionCreatedResponse {
  session: SessionDto;
  inviteUrl: string;
}

export interface AllowReturnResponse {
  session: SessionDto;
  /** Only when a new link was issued; otherwise the candidate reuses their original link. */
  inviteUrl: string | null;
  linkExpiresAt: string;
}

export interface InviteInfoDto {
  candidateName: string;
  interviewTitle: string;
  interviewDescription: string;
  durationMinutes: number;
  status: SessionStatus;
  /** valid: can be exchanged; used: already exchanged; expired: past expiry */
  linkState: 'valid' | 'used' | 'expired';
  retentionDays: number;
}

export interface CandidateTokenResponse {
  candidateToken: string;
  sessionId: string;
}

export interface TaskStateDto {
  taskId: string;
  content: string;
  docVersion: number;
  updatedAt: string;
}

export interface ActivityEventDto {
  id: string;
  sessionId: string;
  taskId: string | null;
  eventType: ActivityEventType;
  payload: Record<string, unknown>;
  timestamp: string;
  clientTimestamp: string | null;
  sequenceNumber: number;
}

export interface EventsPage {
  items: ActivityEventDto[];
  nextAfter: number | null;
}

export interface SnapshotDto {
  id: string;
  taskId: string;
  documentVersion: number;
  content: string;
  reason: SnapshotReason;
  createdAt: string;
}

export type InsightSeverity = 'info' | 'notice';

export interface InsightDto {
  id: string;
  type: InsightType;
  severity: InsightSeverity;
  /** Neutral, human-readable observation (never an accusation). */
  message: string;
  at: string;
  relatedSeq: number[];
  details: Record<string, unknown>;
}
