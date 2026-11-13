import { Logger, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import {
  ACTIVITY_MESSAGES,
  C2S,
  I2S,
  S2C,
  editorChangeSchema,
  editorResyncSchema,
  editStats,
  envelopeSchema,
  monitorJoinSchema,
  taskSwitchSchema,
  type Ack,
  type ActivityEventType,
  type CandidateJoinData,
  type EditorChangeMsg,
  type EditorResyncMsg,
  type EditorUpdatedPayload,
  type Envelope,
  type MonitorJoinData,
} from '@ti/shared';
import type { Server, Socket } from 'socket.io';
import type { ZodTypeAny, z } from 'zod';
import type { JwtPayload } from '../../common/auth.types';
import { AppConfig } from '../../config/app-config.service';
import { ActivityService } from '../activity/activity.service';
import { INSIGHTS_CONFIG } from '../activity/insights.config';
import { RealtimeService } from '../realtime/realtime.service';
import { candidateRoom, observersRoom } from '../realtime/rooms';
import { SessionQueue } from '../realtime/session-queue.service';
import { CandidateAuthError, SessionsService } from '../sessions/sessions.service';
import {
  DocumentStateService,
  DocumentValidationError,
  ResyncRequiredError,
} from '../snapshots/document-state.service';
import { PresenceService } from './presence.service';
import { TokenBucket } from './token-bucket';

type SocketData =
  | { role: 'interviewer'; userId: string; watching?: string }
  | { role: 'candidate'; sessionId: string; status: string; bucket: TokenBucket };

type AppSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  SocketData
>;

type AckFn = (ack: Ack<unknown>) => void;

const stripEnvelope = <T extends Envelope>(msg: T) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { clientEventId, clientTimestamp, taskId, ...rest } = msg;
  return rest;
};

@WebSocketGateway()
export class SessionGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SessionGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    private readonly sessions: SessionsService,
    private readonly activity: ActivityService,
    private readonly docs: DocumentStateService,
    private readonly realtime: RealtimeService,
    private readonly presence: PresenceService,
    private readonly queue: SessionQueue,
  ) {}

  // ------------------------------------------------------------- handshake

  afterInit(server: Server) {
    this.realtime.attach(server);
    server.use((socket, next) => {
      this.authenticate(socket as AppSocket)
        .then(() => next())
        .catch((err: Error) =>
          next(new Error(err instanceof CandidateAuthError ? err.code : 'UNAUTHORIZED')),
        );
    });
  }

  private async authenticate(socket: AppSocket) {
    const token = (socket.handshake.auth as { token?: unknown })?.token;
    if (typeof token !== 'string') throw new Error('UNAUTHORIZED');
    const payload = await this.jwt.verifyAsync<JwtPayload>(token).catch(() => {
      throw new CandidateAuthError('INVALID_TOKEN');
    });
    if (payload.role === 'interviewer') {
      socket.data = { role: 'interviewer', userId: payload.sub };
      return;
    }
    const session = await this.sessions.verifyCandidateToken(token);
    socket.data = {
      role: 'candidate',
      sessionId: session.id,
      status: session.status,
      // ~50 events/s sustained, bursts up to 100.
      bucket: new TokenBucket(100, 50),
    };
  }

  // ------------------------------------------------------------ connection

  async handleConnection(socket: AppSocket) {
    if (socket.data.role === 'interviewer') return this.registerInterviewerHandlers(socket);

    const { sessionId } = socket.data;
    const replaced = this.presence.add(sessionId, socket);
    for (const old of replaced) {
      // Newest connection wins (e.g. a duplicated tab).
      old.disconnect(true);
    }
    await socket.join(candidateRoom(sessionId));
    this.registerCandidateHandlers(socket);

    const at = new Date().toISOString();
    await this.queue.run(sessionId, () =>
      this.activity.record({
        sessionId,
        taskId: null,
        type: 'CANDIDATE_CONNECTED',
        payload: { userAgent: socket.handshake.headers['user-agent'] ?? null },
      }),
    );
    this.realtime.toObservers(sessionId, S2C.SESSION_CONNECTED, { at, connected: true });
  }

  async handleDisconnect(socket: AppSocket) {
    if (socket.data?.role !== 'candidate') return;
    const { sessionId } = socket.data;
    const empty = this.presence.remove(sessionId, socket);
    if (!empty) return;

    const session = await this.sessions.getDto(sessionId).catch(() => null);
    if (!session || session.status === 'ENDED') return;

    await this.queue.run(sessionId, () =>
      this.activity.record({
        sessionId,
        taskId: session.activeTaskId,
        type: 'CANDIDATE_DISCONNECTED',
        payload: {},
      }),
    );
    this.realtime.toObservers(sessionId, S2C.SESSION_DISCONNECTED, {
      at: new Date().toISOString(),
      connected: false,
    });

    if (session.status === 'CREATED' || session.status === 'ACTIVE') {
      // Network blips reconnect within the grace period; a closed page does not.
      const graceMs = this.config.get('LOCK_GRACE_SECONDS') * 1000;
      this.presence.scheduleLock(sessionId, graceMs, () => {
        this.sessions
          .lock(sessionId, 'DISCONNECT_TIMEOUT')
          .catch((e) => this.logger.error(`Lock failed for ${sessionId}`, e));
      });
    }
  }

  // ------------------------------------------------------ handler plumbing

  /** Validates, rate-limits and maps errors to acks for one socket event. */
  private on<S extends ZodTypeAny>(
    socket: AppSocket,
    event: string,
    schema: S,
    fn: (msg: z.infer<S>) => Promise<Ack<unknown>>,
  ) {
    (socket as Socket).on(event, async (raw: unknown, maybeAck?: unknown) => {
      const ack: AckFn = typeof maybeAck === 'function' ? (maybeAck as AckFn) : () => undefined;
      if (socket.data.role === 'candidate' && !socket.data.bucket.take()) {
        return ack({ ok: false, error: 'RATE_LIMITED' });
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        return ack({ ok: false, error: 'VALIDATION', message: parsed.error.issues[0]?.message });
      }
      try {
        ack(await fn(parsed.data));
      } catch (err) {
        if (err instanceof ResyncRequiredError) {
          return ack({ ok: false, error: 'RESYNC', serverVersion: err.serverVersion });
        }
        if (err instanceof DocumentValidationError) {
          return ack({ ok: false, error: 'VALIDATION', message: err.message });
        }
        if (err instanceof NotFoundException) return ack({ ok: false, error: 'NOT_FOUND' });
        this.logger.error(`Handler ${event} failed`, err as Error);
        ack({ ok: false, error: 'INTERNAL' });
      }
    });
  }

  // ------------------------------------------------------------- candidate

  private registerCandidateHandlers(socket: AppSocket) {
    if (socket.data.role !== 'candidate') return;
    const data = socket.data;
    const sessionId = data.sessionId;
    const requireActive = (): Ack<unknown> | null =>
      data.status === 'ACTIVE' ? null : { ok: false, error: 'SESSION_NOT_ACTIVE' };

    this.on(socket, C2S.SESSION_JOIN, envelopeSchema.partial(), async () => {
      const session = await this.sessions.getDto(sessionId);
      const result: CandidateJoinData = {
        session,
        taskStates: await this.docs.listStates(sessionId),
        serverTime: new Date().toISOString(),
      };
      return { ok: true, data: result };
    });

    this.on(socket, C2S.SESSION_START, envelopeSchema, async (env) => {
      const session = await this.sessions.start(sessionId, env);
      data.status = session.status;
      return { ok: true, data: session };
    });

    this.on(socket, C2S.SESSION_END, envelopeSchema, async (env) => {
      const session = await this.sessions.end(sessionId, 'candidate', env);
      return { ok: true, data: session };
    });

    this.on(socket, C2S.TASK_SWITCH, taskSwitchSchema, (msg) =>
      this.queue.run(sessionId, async () => {
        const blocked = requireActive();
        if (blocked) return blocked;
        const dup = await this.activity.findDuplicate(sessionId, msg.clientEventId);
        if (dup) return { ok: true, seq: dup.sequenceNumber };
        const session = await this.sessions.switchTask(sessionId, msg.toTaskId, msg);
        return { ok: true, data: session };
      }),
    );

    this.on(socket, C2S.EDITOR_CHANGE, editorChangeSchema, (msg) =>
      this.queue.run(sessionId, async () => requireActive() ?? this.handleChange(sessionId, msg)),
    );

    this.on(socket, C2S.EDITOR_RESYNC, editorResyncSchema, (msg) =>
      this.queue.run(sessionId, async () => requireActive() ?? this.handleResync(sessionId, msg)),
    );

    for (const [event, def] of Object.entries(ACTIVITY_MESSAGES)) {
      this.on(socket, event, def.schema, (msg: Envelope & Record<string, unknown>) =>
        this.queue.run(sessionId, async () => {
          const blocked = requireActive();
          if (blocked) return blocked;
          const { event: recorded } = await this.activity.record({
            sessionId,
            taskId: msg.taskId,
            type: (def.type as (m: unknown) => ActivityEventType)(msg),
            payload: stripEnvelope(msg),
            clientEventId: msg.clientEventId,
            clientTimestamp: msg.clientTimestamp,
          });
          return { ok: true, seq: recorded.sequenceNumber };
        }),
      );
    }
  }

  private async handleChange(sessionId: string, msg: EditorChangeMsg): Promise<Ack<unknown>> {
    // A retried message whose ack was lost: already applied, just re-ack.
    const dup = await this.activity.findDuplicate(sessionId, msg.clientEventId);
    if (dup) return { ok: true, seq: dup.sequenceNumber };

    const result = await this.docs.apply(
      sessionId,
      msg.taskId,
      msg.fromVersion,
      msg.toVersion,
      msg.edits,
    );
    const stats = editStats(msg.edits);
    const typedInserted = msg.edits
      .filter((e) => e.source === 'input')
      .reduce((n, e) => n + e.changes.reduce((m, c) => m + c.text.length, 0), 0);
    const type: ActivityEventType =
      stats.deleted === 0 ? 'TEXT_INSERT' : stats.inserted === 0 ? 'TEXT_DELETE' : 'TEXT_CHANGE';

    const { event } = await this.activity.record({
      sessionId,
      taskId: msg.taskId,
      type,
      payload: {
        fromVersion: msg.fromVersion,
        toVersion: msg.toVersion,
        inserted: stats.inserted,
        deleted: stats.deleted,
        typedInserted,
        maxInsert: stats.maxInsert,
        isLarge: stats.maxInsert >= INSIGHTS_CONFIG.largeEditChars,
        sources: [...new Set(msg.edits.map((e) => e.source))],
        edits: result.applied,
        snapshotId: result.snapshotId,
      },
      clientEventId: msg.clientEventId,
      clientTimestamp: msg.clientTimestamp,
    });

    const update: EditorUpdatedPayload = {
      kind: 'delta',
      taskId: msg.taskId,
      fromVersion: msg.fromVersion,
      toVersion: msg.toVersion,
      edits: msg.edits,
    };
    this.realtime.toObservers(sessionId, S2C.EDITOR_UPDATED, update);
    return { ok: true, seq: event.sequenceNumber };
  }

  private async handleResync(sessionId: string, msg: EditorResyncMsg): Promise<Ack<unknown>> {
    const dup = await this.activity.findDuplicate(sessionId, msg.clientEventId);
    if (dup)
      return { ok: true, seq: dup.sequenceNumber, data: { docVersion: dup.payload.docVersion } };

    const r = await this.docs.resync(sessionId, msg.taskId, msg.docVersion, msg.content);
    const { event } = await this.activity.record({
      sessionId,
      taskId: msg.taskId,
      type: 'DOCUMENT_RESYNC',
      payload: {
        docVersion: r.version,
        previousVersion: r.previousVersion,
        length: msg.content.length,
        snapshotId: r.snapshotId,
      },
      clientEventId: msg.clientEventId,
      clientTimestamp: msg.clientTimestamp,
    });
    const update: EditorUpdatedPayload = {
      kind: 'full',
      taskId: msg.taskId,
      docVersion: r.version,
      content: msg.content,
    };
    this.realtime.toObservers(sessionId, S2C.EDITOR_UPDATED, update);
    return { ok: true, seq: event.sequenceNumber, data: { docVersion: r.version } };
  }

  // ----------------------------------------------------------- interviewer

  private registerInterviewerHandlers(socket: AppSocket) {
    if (socket.data.role !== 'interviewer') return;
    const data = socket.data;

    this.on(socket, I2S.MONITOR_JOIN, monitorJoinSchema, async ({ sessionId }) => {
      await this.sessions.assertOwner(data.userId, sessionId);
      if (data.watching && data.watching !== sessionId)
        await socket.leave(observersRoom(data.watching));
      data.watching = sessionId;
      await socket.join(observersRoom(sessionId));
      const session = await this.sessions.getDto(sessionId);
      // Sessions created before tasks were added (or legacy ones) may lack task states.
      if (
        session.status === 'CREATED' ||
        session.status === 'ACTIVE' ||
        session.status === 'LOCKED'
      )
        await this.docs.ensureTaskStates(sessionId, session.interviewId);
      const result: MonitorJoinData = {
        session,
        taskStates: await this.docs.listStates(sessionId),
        candidateConnected: this.presence.isConnected(sessionId),
        serverTime: new Date().toISOString(),
      };
      return { ok: true, data: result };
    });
  }
}
