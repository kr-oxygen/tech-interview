import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { Prisma } from '../../generated/prisma/client';
import {
  S2C,
  type AllowReturnDto,
  type AllowReturnResponse,
  type CandidateTokenResponse,
  type CreateSessionDto,
  type Envelope,
  type ExchangeInviteDto,
  type InviteInfoDto,
  type LockReason,
  type SessionCreatedResponse,
  type SessionDto,
} from '@ti/shared';
import type { CandidateJwtPayload, JwtPayload } from '../../common/auth.types';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { CandidatesService } from '../candidates/candidates.service';
import { InterviewsService } from '../interviews/interviews.service';
import { RealtimeService } from '../realtime/realtime.service';
import { SessionQueue } from '../realtime/session-queue.service';
import { DocumentStateService } from '../snapshots/document-state.service';
import { generateInviteToken, hashInviteToken } from './invite-token';
import { sessionInclude, toSessionDto, type SessionWithRelations } from './session.mapper';

const HOUR = 3_600_000;

/** Statuses in which the candidate may still be (or become) connected. */
const OPEN_STATUSES = ['CREATED', 'ACTIVE'] as const;

export class CandidateAuthError extends Error {
  constructor(
    readonly code: 'INVALID_TOKEN' | 'SESSION_LOCKED' | 'SESSION_ENDED',
    message = code,
  ) {
    super(message);
  }
}

function gone(code: string, message: string) {
  return new HttpException({ code, message }, HttpStatus.GONE);
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    private readonly interviews: InterviewsService,
    private readonly candidates: CandidatesService,
    private readonly activity: ActivityService,
    private readonly docs: DocumentStateService,
    private readonly realtime: RealtimeService,
    private readonly queue: SessionQueue,
  ) {}

  // ---------------------------------------------------------------- queries

  private async load(id: string): Promise<SessionWithRelations> {
    const s = await this.prisma.interviewSession.findUnique({
      where: { id },
      include: sessionInclude,
    });
    if (!s) throw new NotFoundException('Session not found');
    return s;
  }

  async getDto(id: string): Promise<SessionDto> {
    return toSessionDto(await this.load(id));
  }

  /** 404 unless the session belongs to an interview created by the user. */
  async assertOwner(userId: string, sessionId: string): Promise<void> {
    const n = await this.prisma.interviewSession.count({
      where: { id: sessionId, interview: { createdById: userId } },
    });
    if (n === 0) throw new NotFoundException('Session not found');
  }

  async get(userId: string, id: string): Promise<SessionDto> {
    await this.assertOwner(userId, id);
    return this.getDto(id);
  }

  async listForInterview(userId: string, interviewId: string): Promise<SessionDto[]> {
    await this.interviews.getOwned(userId, interviewId);
    const rows = await this.prisma.interviewSession.findMany({
      where: { interviewId },
      include: sessionInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toSessionDto);
  }

  async listForCandidate(userId: string, candidateId: string): Promise<SessionDto[]> {
    await this.candidates.getOwned(userId, candidateId);
    const rows = await this.prisma.interviewSession.findMany({
      where: { candidateId, interview: { createdById: userId } },
      include: sessionInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toSessionDto);
  }

  // ------------------------------------------------------ interviewer actions

  private inviteUrl(token: string) {
    const base = this.config.get('PUBLIC_WEB_URL') ?? this.config.get('WEB_ORIGIN').split(',')[0];
    return `${base.trim().replace(/\/$/, '')}/candidate/session/${token}`;
  }

  async create(
    userId: string,
    interviewId: string,
    dto: CreateSessionDto,
  ): Promise<SessionCreatedResponse> {
    await this.interviews.getOwned(userId, interviewId);
    const taskCount = await this.prisma.interviewTask.count({ where: { interviewId } });
    if (taskCount === 0)
      throw new BadRequestException('Add at least one task before creating a session');

    const candidateId = dto.candidateId
      ? (await this.candidates.getOwned(userId, dto.candidateId)).id
      : (await this.candidates.create(userId, dto.newCandidate!)).id;

    const { token, hash } = generateInviteToken();
    const session = await this.prisma.interviewSession.create({
      data: {
        interviewId,
        candidateId,
        durationMinutes: dto.durationMinutes,
        inviteTokenHash: hash,
        inviteExpiresAt: new Date(Date.now() + dto.inviteTtlHours * HOUR),
      },
      include: sessionInclude,
    });
    // Initial code is visible to the interviewer before the candidate opens the link.
    await this.docs.ensureTaskStates(session.id, interviewId);
    return { session: toSessionDto(session), inviteUrl: this.inviteUrl(token) };
  }

  /** New link for a session whose link has not been used yet (e.g. lost or expired). */
  async reissueInvite(
    userId: string,
    id: string,
    ttlHours: number,
  ): Promise<SessionCreatedResponse> {
    await this.assertOwner(userId, id);
    const { token, hash } = generateInviteToken();
    const updated = await this.prisma.interviewSession.updateMany({
      where: { id, inviteConsumedAt: null, status: { in: ['CREATED', 'EXPIRED'] } },
      data: {
        inviteTokenHash: hash,
        inviteExpiresAt: new Date(Date.now() + ttlHours * HOUR),
        status: 'CREATED',
      },
    });
    if (updated.count === 0) {
      throw new ConflictException('Link was already used; use "allow return" for a paused session');
    }
    return { session: await this.getDto(id), inviteUrl: this.inviteUrl(token) };
  }

  /** Lets a candidate back into a LOCKED session via a fresh one-time link. */
  /**
   * Lets a paused candidate back in. The session stays LOCKED until the candidate actually
   * exchanges the link (see `exchange`), so the interviewer can re-arm it if the window lapses.
   * Default: the original link is re-armed for RETURN_LINK_TTL_MINUTES (same URL, still one-time).
   * `newLink`: the token is rotated and the old link stops working (use when it may have leaked).
   */
  async allowReturn(userId: string, id: string, dto: AllowReturnDto): Promise<AllowReturnResponse> {
    await this.assertOwner(userId, id);
    const rotated = dto.newLink ? generateInviteToken() : null;
    const linkExpiresAt = new Date(
      Date.now() + this.config.get('RETURN_LINK_TTL_MINUTES') * 60_000,
    );
    const session = await this.queue.run(id, async () => {
      const s = await this.prisma.interviewSession.findUniqueOrThrow({ where: { id } });
      if (s.status !== 'LOCKED') throw new ConflictException('Session is not paused');
      await this.prisma.interviewSession.update({
        where: { id },
        data: {
          ...(rotated ? { inviteTokenHash: rotated.hash } : {}),
          inviteExpiresAt: linkExpiresAt,
          inviteConsumedAt: null,
        },
      });
      await this.activity.record({
        sessionId: id,
        taskId: s.activeTaskId,
        type: 'RETURN_ALLOWED',
        payload: { newLink: Boolean(rotated), linkExpiresAt: linkExpiresAt.toISOString() },
      });
      return this.getDto(id);
    });
    this.realtime.toObservers(id, S2C.SESSION_STATUS, session);
    return {
      session,
      inviteUrl: rotated ? this.inviteUrl(rotated.token) : null,
      linkExpiresAt: linkExpiresAt.toISOString(),
    };
  }

  // -------------------------------------------------------- candidate access

  async inviteInfo(token: string): Promise<InviteInfoDto> {
    const s = await this.prisma.interviewSession.findUnique({
      where: { inviteTokenHash: hashInviteToken(token) },
      include: { interview: true, candidate: true },
    });
    if (!s) throw new NotFoundException({ code: 'INVALID_LINK', message: 'Invalid link' });
    const linkState = s.inviteConsumedAt
      ? 'used'
      : s.inviteExpiresAt < new Date()
        ? 'expired'
        : 'valid';
    return {
      candidateName: s.candidate.name,
      interviewTitle: s.interview.title,
      interviewDescription: s.interview.description,
      durationMinutes: s.durationMinutes,
      status: s.status,
      linkState,
      retentionDays: this.config.get('RETENTION_DAYS'),
    };
  }

  /** One-time exchange of the invite token for a session-bound candidate JWT. */
  async exchange(dto: ExchangeInviteDto): Promise<CandidateTokenResponse> {
    const s = await this.prisma.interviewSession.findUnique({
      where: { inviteTokenHash: hashInviteToken(dto.token) },
    });
    if (!s) throw new NotFoundException({ code: 'INVALID_LINK', message: 'Invalid link' });
    if (s.status === 'ENDED') throw gone('SESSION_ENDED', 'This interview has ended');
    const now = new Date();
    // A paused session can be entered only through a link the interviewer re-armed.
    if (s.status === 'LOCKED' && (s.inviteConsumedAt || s.inviteExpiresAt < now)) {
      throw new HttpException(
        { code: 'SESSION_LOCKED', message: 'Session is paused' },
        HttpStatus.LOCKED,
      );
    }
    if (s.inviteConsumedAt) throw gone('LINK_USED', 'This link has already been used');
    if (s.inviteExpiresAt < new Date()) {
      await this.prisma.interviewSession.updateMany({
        where: { id: s.id, status: 'CREATED', startedAt: null },
        data: { status: 'EXPIRED' },
      });
      throw gone('LINK_EXPIRED', 'This link has expired');
    }

    // Conditional update makes concurrent exchanges of the same token race-safe.
    const claim = () =>
      this.prisma.interviewSession.updateMany({
        where: {
          id: s.id,
          inviteConsumedAt: null,
          inviteTokenHash: s.inviteTokenHash,
          status: s.status === 'LOCKED' ? 'LOCKED' : { in: [...OPEN_STATUSES] },
        },
        data: {
          inviteConsumedAt: now,
          consentAcceptedAt: s.consentAcceptedAt ?? now,
          // Returning after a pause resumes the session.
          ...(s.status === 'LOCKED'
            ? { status: s.startedAt ? 'ACTIVE' : 'CREATED', lockedAt: null, lockReason: null }
            : {}),
        },
      });
    const claimed =
      s.status === 'LOCKED'
        ? await this.queue.run(s.id, async () => {
            const r = await claim();
            if (r.count > 0) {
              await this.activity.record({
                sessionId: s.id,
                taskId: s.activeTaskId,
                type: 'SESSION_RESUMED',
                payload: {},
              });
              this.realtime.toObservers(s.id, S2C.SESSION_STATUS, await this.getDto(s.id));
            }
            return r;
          })
        : await claim();
    if (claimed.count === 0) throw gone('LINK_USED', 'This link has already been used');

    await this.docs.ensureTaskStates(s.id, s.interviewId);
    const payload: CandidateJwtPayload = {
      sub: s.id,
      role: 'candidate',
      tv: s.candidateTokenVersion,
    };
    const candidateToken = await this.jwt.signAsync(payload, {
      expiresIn: this.config.get('CANDIDATE_JWT_EXPIRES_IN') as JwtSignOptions['expiresIn'],
    });
    return { candidateToken, sessionId: s.id };
  }

  /** Validates a candidate JWT against the current session state. */
  async verifyCandidateToken(token: string) {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new CandidateAuthError('INVALID_TOKEN');
    }
    if (payload.role !== 'candidate') throw new CandidateAuthError('INVALID_TOKEN');
    const s = await this.prisma.interviewSession.findUnique({ where: { id: payload.sub } });
    if (!s) throw new CandidateAuthError('INVALID_TOKEN');
    if (s.status === 'ENDED' || s.status === 'EXPIRED')
      throw new CandidateAuthError('SESSION_ENDED');
    if (s.status === 'LOCKED') throw new CandidateAuthError('SESSION_LOCKED');
    // Version bump on lock/end invalidates every previously issued token.
    if (payload.tv !== s.candidateTokenVersion) throw new CandidateAuthError('SESSION_LOCKED');
    return s;
  }

  /** sendBeacon from `pagehide`: the candidate is leaving the page → lock immediately. */
  async handleBeacon(token: string, clientTimestamp: number): Promise<void> {
    let session;
    try {
      session = await this.verifyCandidateToken(token);
    } catch {
      return; // Already locked/ended or invalid: nothing to do, never reveal details.
    }
    await this.queue.run(session.id, () =>
      this.activity.record({
        sessionId: session.id,
        taskId: session.activeTaskId,
        type: 'PAGE_UNLOAD',
        payload: {},
        clientTimestamp,
      }),
    );
    await this.lock(session.id, 'PAGE_UNLOAD');
  }

  // ---------------------------------------------------------------- lifecycle

  async start(sessionId: string, env: Envelope): Promise<SessionDto> {
    return this.queue.run(sessionId, async () => {
      const s = await this.load(sessionId);
      if (s.status !== 'CREATED') return toSessionDto(s); // idempotent
      const firstTask = s.interview.tasks[0]?.id ?? null;
      await this.prisma.interviewSession.update({
        where: { id: sessionId },
        data: {
          status: 'ACTIVE',
          startedAt: new Date(),
          activeTaskId: s.activeTaskId ?? firstTask,
        },
      });
      await this.activity.record({
        sessionId,
        taskId: s.activeTaskId ?? firstTask,
        type: 'SESSION_STARTED',
        payload: {},
        clientEventId: env.clientEventId,
        clientTimestamp: env.clientTimestamp,
      });
      const dto = await this.getDto(sessionId);
      this.realtime.toAll(sessionId, S2C.SESSION_STATUS, dto);
      return dto;
    });
  }

  async switchTask(sessionId: string, toTaskId: string, env: Envelope): Promise<SessionDto> {
    const s = await this.load(sessionId);
    if (!s.interview.tasks.some((t) => t.id === toTaskId))
      throw new NotFoundException('Task not found');
    if (s.activeTaskId === toTaskId) return toSessionDto(s);
    if (s.activeTaskId) await this.docs.flush(sessionId, 'TASK_SWITCH', s.activeTaskId);
    await this.docs.ensureTaskStates(sessionId, s.interviewId);
    await this.prisma.interviewSession.update({
      where: { id: sessionId },
      data: { activeTaskId: toTaskId },
    });
    await this.activity.record({
      sessionId,
      taskId: toTaskId,
      type: 'TASK_SWITCH',
      payload: { fromTaskId: s.activeTaskId, toTaskId },
      clientEventId: env.clientEventId,
      clientTimestamp: env.clientTimestamp,
    });
    this.realtime.toObservers(sessionId, S2C.TASK_SWITCHED, { taskId: toTaskId });
    return this.getDto(sessionId);
  }

  async end(
    sessionId: string,
    by: 'candidate' | 'interviewer',
    env?: Envelope,
  ): Promise<SessionDto> {
    const dto = await this.queue.run(sessionId, async () => {
      const s = await this.prisma.interviewSession.findUniqueOrThrow({ where: { id: sessionId } });
      if (s.status === 'ENDED') return this.getDto(sessionId);
      await this.docs.flush(sessionId, 'SESSION_END');
      await this.prisma.interviewSession.update({
        where: { id: sessionId },
        data: {
          status: 'ENDED',
          endedAt: new Date(),
          lockedAt: null,
          candidateTokenVersion: { increment: 1 },
        },
      });
      await this.activity.record({
        sessionId,
        taskId: s.activeTaskId,
        type: 'SESSION_ENDED',
        payload: { by },
        clientEventId: env?.clientEventId,
        clientTimestamp: env?.clientTimestamp,
      });
      return this.getDto(sessionId);
    });
    this.realtime.toAll(sessionId, S2C.SESSION_ENDED, dto);
    this.realtime.toAll(sessionId, S2C.SESSION_STATUS, dto);
    this.realtime.disconnectCandidate(sessionId);
    this.docs.evict(sessionId);
    return dto;
  }

  async endByInterviewer(userId: string, sessionId: string): Promise<SessionDto> {
    await this.assertOwner(userId, sessionId);
    return this.end(sessionId, 'interviewer');
  }

  /**
   * Pauses an open session after the candidate left the page. All candidate tokens are
   * invalidated; only the interviewer can let the candidate back in (allowReturn).
   */
  async lock(sessionId: string, reason: LockReason): Promise<boolean> {
    const dto = await this.queue.run(sessionId, async () => {
      const s = await this.prisma.interviewSession.findUniqueOrThrow({ where: { id: sessionId } });
      if (!(OPEN_STATUSES as readonly string[]).includes(s.status) || !s.inviteConsumedAt)
        return null;
      await this.docs.flush(sessionId, 'PERIODIC');
      const updated = await this.prisma.interviewSession.update({
        where: { id: sessionId },
        data: {
          status: 'LOCKED',
          lockedAt: new Date(),
          lockReason: reason,
          lockCount: { increment: 1 },
          candidateTokenVersion: { increment: 1 },
        },
      });
      await this.activity.record({
        sessionId,
        taskId: s.activeTaskId,
        type: 'SESSION_LOCKED',
        payload: { reason, lockCount: updated.lockCount },
      });
      return this.getDto(sessionId);
    });
    if (!dto) return false;
    this.logger.log(`Session ${sessionId} locked (${reason})`);
    this.realtime.toAll(sessionId, S2C.SESSION_STATUS, dto);
    this.realtime.disconnectCandidate(sessionId);
    return true;
  }

  // ---------------------------------------------------------------- retention

  async purgeExpiredData(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * HOUR);
    const where: Prisma.InterviewSessionWhereInput = {
      OR: [
        { status: 'ENDED', endedAt: { lt: cutoff } },
        { status: 'EXPIRED', createdAt: { lt: cutoff } },
      ],
    };
    const ids = (await this.prisma.interviewSession.findMany({ where, select: { id: true } })).map(
      (s) => s.id,
    );
    if (ids.length === 0) return 0;
    await this.prisma.$transaction([
      this.prisma.activityEvent.deleteMany({ where: { sessionId: { in: ids } } }),
      this.prisma.codeSnapshot.deleteMany({ where: { sessionId: { in: ids } } }),
      this.prisma.sessionTaskState.deleteMany({ where: { sessionId: { in: ids } } }),
    ]);
    return ids.length;
  }

  async expireStaleInvites(): Promise<number> {
    const r = await this.prisma.interviewSession.updateMany({
      where: { status: 'CREATED', inviteConsumedAt: null, inviteExpiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });
    return r.count;
  }
}
