import {
  C2S,
  S2C,
  type Ack,
  type CandidateJoinData,
  type Edit,
  type SessionDto,
} from '@ti/shared';
import { io, type Socket } from 'socket.io-client';

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'locked'
  | 'ended'
  | 'replaced'
  | 'invalid';

/** Supplies live editor state when a full resync has to be built. */
export interface DocumentProvider {
  getContent(taskId: string): string | null;
  /** Drop not-yet-flushed edits: their effect is contained in getContent(). */
  discardPending(taskId: string): void;
}

export interface ConnectionHandlers {
  onStatus(status: ConnectionStatus): void;
  onJoin(data: CandidateJoinData, firstJoin: boolean): void;
  onSession(session: SessionDto): void;
  onQueueSize?(size: number): void;
}

interface OutboxEntry {
  event: string;
  kind: 'change' | 'resync' | 'other';
  taskId: string | null;
  clientEventId: string;
  payload?: Record<string, unknown>;
  build?: () => Record<string, unknown>;
  attempts: number;
}

const ACK_TIMEOUT_MS = 10_000;
const MAX_INTERNAL_RETRIES = 5;

/**
 * Candidate realtime client. All activity goes through an ordered outbox: one message in
 * flight, kept until acknowledged and retried after reconnection (the server deduplicates by
 * clientEventId). Owns per-task document versions and handles RESYNC.
 */
export class CandidateConnection {
  private socket: Socket | null = null;
  private readonly queue: OutboxEntry[] = [];
  private inFlight = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private joinedOnce = false;
  private lastSessionStatus: string | null = null;
  private status: ConnectionStatus = 'connecting';
  private readonly versions = new Map<string, number>();
  private provider: DocumentProvider | null = null;
  private readonly token: string;
  private readonly handlers: ConnectionHandlers;

  constructor(token: string, handlers: ConnectionHandlers) {
    this.token = token;
    this.handlers = handlers;
  }

  setDocumentProvider(p: DocumentProvider) {
    this.provider = p;
  }

  connect() {
    const socket = io({ auth: { token: this.token }, transports: ['websocket'], reconnectionDelayMax: 5_000 });
    this.socket = socket;

    socket.on('connect', () => {
      this.request<CandidateJoinData>(C2S.SESSION_JOIN, {}).then((ack) => {
        if (!ack.ok || !ack.data) return;
        const first = !this.joinedOnce;
        if (first) {
          for (const s of ack.data.taskStates) this.versions.set(s.taskId, s.docVersion);
          this.joinedOnce = true;
        }
        this.lastSessionStatus = ack.data.session.status;
        this.setStatus('connected');
        this.handlers.onJoin(ack.data, first);
        this.pump();
      });
    });

    socket.on('connect_error', (err) => {
      // Middleware rejections are final (socket.io does not retry them).
      if (err.message === 'SESSION_LOCKED') this.setStatus('locked');
      else if (err.message === 'SESSION_ENDED') this.setStatus('ended');
      else if (err.message === 'INVALID_TOKEN' || err.message === 'UNAUTHORIZED') this.setStatus('invalid');
      else this.setStatus('reconnecting');
    });

    socket.on('disconnect', (reason) => {
      this.inFlight = false;
      if (reason === 'io server disconnect') {
        // Kicked by the server: lock, end, or a newer tab took over.
        if (this.lastSessionStatus === 'LOCKED') this.setStatus('locked');
        else if (this.lastSessionStatus === 'ENDED') this.setStatus('ended');
        else this.setStatus('replaced');
      } else if (reason !== 'io client disconnect') {
        this.setStatus('reconnecting');
      }
    });

    const onSession = (s: SessionDto) => {
      this.lastSessionStatus = s.status;
      this.handlers.onSession(s);
    };
    socket.on(S2C.SESSION_STATUS, onSession);
    socket.on(S2C.SESSION_ENDED, onSession);
  }

  disconnect() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.socket?.disconnect();
    this.socket = null;
  }

  get pendingCount() {
    return this.queue.length;
  }

  // ---------------------------------------------------------------- versions

  initVersion(taskId: string, version: number) {
    if (!this.versions.has(taskId)) this.versions.set(taskId, version);
  }

  version(taskId: string): number {
    return this.versions.get(taskId) ?? 0;
  }

  // ---------------------------------------------------------------- sending

  /** Direct request/ack (lifecycle calls), not queued. */
  async request<T>(event: string, payload: Record<string, unknown>): Promise<Ack<T>> {
    if (!this.socket) return { ok: false, error: 'INTERNAL', message: 'Not connected' };
    try {
      return (await this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck(event, payload)) as Ack<T>;
    } catch {
      return { ok: false, error: 'INTERNAL', message: 'Timed out' };
    }
  }

  /** Queues an activity event (copy, paste, focus, …). */
  send(event: string, taskId: string | null, data: Record<string, unknown> = {}) {
    const clientEventId = crypto.randomUUID();
    this.push({
      event,
      kind: 'other',
      taskId,
      clientEventId,
      payload: { ...data, clientEventId, clientTimestamp: Date.now(), taskId },
      attempts: 0,
    });
  }

  /** Queues a batch of Monaco edits for a task, advancing its version. */
  sendEdits(taskId: string, edits: Edit[]) {
    if (edits.length === 0) return;
    const fromVersion = this.version(taskId);
    const toVersion = fromVersion + edits.length;
    this.versions.set(taskId, toVersion);
    const clientEventId = crypto.randomUUID();
    this.push({
      event: C2S.EDITOR_CHANGE,
      kind: 'change',
      taskId,
      clientEventId,
      payload: { clientEventId, clientTimestamp: Date.now(), taskId, fromVersion, toVersion, edits },
      attempts: 0,
    });
  }

  private push(entry: OutboxEntry) {
    this.queue.push(entry);
    this.handlers.onQueueSize?.(this.queue.length);
    this.pump();
  }

  private setStatus(s: ConnectionStatus) {
    if (this.status === s) return;
    this.status = s;
    this.handlers.onStatus(s);
  }

  private scheduleRetry(ms: number) {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.pump();
    }, ms);
  }

  private pump(): void {
    if (this.inFlight || !this.socket?.connected || this.status !== 'connected') return;
    const head = this.queue[0];
    if (!head) return;
    // Payload is frozen on first send so retries keep the same clientEventId and versions.
    if (!head.payload && head.build) head.payload = head.build();
    if (!head.payload) {
      this.queue.shift();
      return this.pump();
    }
    this.inFlight = true;
    head.attempts++;
    this.socket
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck(head.event, head.payload)
      .then((ack: Ack) => this.onAck(head, ack))
      .catch(() => {
        // Timeout or disconnect: keep the entry, retry when possible.
        this.inFlight = false;
        this.scheduleRetry(1_000);
      });
  }

  private done(entry: OutboxEntry) {
    const i = this.queue.indexOf(entry);
    if (i >= 0) this.queue.splice(i, 1);
    this.handlers.onQueueSize?.(this.queue.length);
  }

  private onAck(entry: OutboxEntry, ack: Ack) {
    this.inFlight = false;
    if (ack.ok) {
      this.done(entry);
    } else {
      switch (ack.error) {
        case 'RESYNC':
          this.beginResync(entry.taskId!, ack.serverVersion ?? 0);
          break;
        case 'RATE_LIMITED':
          return this.scheduleRetry(1_000);
        case 'INTERNAL':
          if (entry.attempts < MAX_INTERNAL_RETRIES) return this.scheduleRetry(1_000 * entry.attempts);
          this.done(entry);
          break;
        default:
          // VALIDATION / NOT_FOUND / SESSION_NOT_ACTIVE: not retryable.
          console.warn(`Event ${entry.event} rejected: ${ack.error}`, ack.message);
          this.done(entry);
      }
    }
    this.pump();
  }

  /**
   * Server and client documents diverged. Replace every queued change for the task with one
   * full-document resync, built at send time from the live editor content.
   */
  private beginResync(taskId: string, serverVersion: number) {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const e = this.queue[i];
      if (e.taskId === taskId && (e.kind === 'change' || e.kind === 'resync')) this.queue.splice(i, 1);
    }
    const clientEventId = crypto.randomUUID();
    this.queue.unshift({
      event: C2S.EDITOR_RESYNC,
      kind: 'resync',
      taskId,
      clientEventId,
      attempts: 0,
      build: () => {
        // Changes queued since the RESYNC are contained in the live content as well.
        for (let i = this.queue.length - 1; i >= 1; i--) {
          const e = this.queue[i];
          if (e.taskId === taskId && e.kind === 'change') this.queue.splice(i, 1);
        }
        this.provider?.discardPending(taskId);
        const content = this.provider?.getContent(taskId);
        if (content == null) return undefined as unknown as Record<string, unknown>;
        const docVersion = Math.max(this.version(taskId), serverVersion + 1);
        this.versions.set(taskId, docVersion);
        return { clientEventId, clientTimestamp: Date.now(), taskId, docVersion, content };
      },
    });
    this.handlers.onQueueSize?.(this.queue.length);
  }
}
