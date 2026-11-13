import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  MAX_DOCUMENT_SIZE,
  applyChanges,
  type Edit,
  type SnapshotReason,
  type TaskStateDto,
} from '@ti/shared';
import { PrismaService } from '../../prisma/prisma.service';

export const PERSIST_DEBOUNCE_MS = 2_000;
export const PERIODIC_SNAPSHOT_MS = 30_000;
export const LARGE_CHANGE_CHARS = 200;

interface DocState {
  sessionId: string;
  taskId: string;
  content: string;
  version: number;
  lastSnapshotVersion: number;
  persistedVersion: number;
  updatedAt: Date;
  persistTimer?: NodeJS.Timeout;
}

export class ResyncRequiredError extends Error {
  constructor(readonly serverVersion: number) {
    super('Document version mismatch');
  }
}

export class DocumentValidationError extends Error {}

export interface AppliedChange {
  rangeOffset: number;
  rangeLength: number;
  text: string;
  /** Text removed by this change, computed from the server-side document. */
  deletedText: string;
}

export interface ApplyResult {
  version: number;
  applied: Array<{ source: Edit['source']; at: number; changes: AppliedChange[] }>;
  snapshotId: string | null;
}

const key = (sessionId: string, taskId: string) => `${sessionId}:${taskId}`;

/**
 * Server-side source of truth for the candidate's code per (session, task).
 * Keeps documents in memory, applies Monaco deltas, persists SessionTaskState with a debounce
 * and writes CodeSnapshots periodically, on large changes and on lifecycle events.
 * Single-instance by design (see spec: no Redis initially).
 */
@Injectable()
export class DocumentStateService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentStateService.name);
  private readonly docs = new Map<string, DocState>();
  private readonly loading = new Map<string, Promise<DocState>>();
  private periodicTimer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.periodicTimer = setInterval(() => {
      this.periodicSnapshots().catch((e) => this.logger.error('Periodic snapshot failed', e));
    }, PERIODIC_SNAPSHOT_MS);
    this.periodicTimer.unref();
  }

  async onModuleDestroy() {
    clearInterval(this.periodicTimer);
    await Promise.all([...this.docs.values()].map((d) => this.persist(d)));
  }

  /** Creates missing task states (initial code, version 0) for every task of the interview. */
  async ensureTaskStates(sessionId: string, interviewId: string): Promise<void> {
    const tasks = await this.prisma.interviewTask.findMany({ where: { interviewId } });
    const existing = await this.prisma.sessionTaskState.findMany({
      where: { sessionId },
      select: { taskId: true },
    });
    const have = new Set(existing.map((e) => e.taskId));
    const missing = tasks.filter((t) => !have.has(t.id));
    for (const t of missing) {
      // Concurrent callers (monitor join, invite exchange) may race: the unique
      // (sessionId, taskId) decides who creates the state and its INITIAL snapshot.
      try {
        await this.prisma.$transaction([
          this.prisma.sessionTaskState.create({
            data: { sessionId, taskId: t.id, currentContent: t.initialCode, documentVersion: 0 },
          }),
          this.prisma.codeSnapshot.create({
            data: {
              sessionId,
              taskId: t.id,
              documentVersion: 0,
              content: t.initialCode,
              reason: 'INITIAL',
            },
          }),
        ]);
      } catch (e) {
        if ((e as { code?: string }).code !== 'P2002') throw e;
      }
    }
  }

  private async get(sessionId: string, taskId: string): Promise<DocState> {
    const k = key(sessionId, taskId);
    const cached = this.docs.get(k);
    if (cached) return cached;
    let pending = this.loading.get(k);
    if (!pending) {
      pending = (async () => {
        const row = await this.prisma.sessionTaskState.findUnique({
          where: { sessionId_taskId: { sessionId, taskId } },
        });
        if (!row) throw new DocumentValidationError('Unknown task for this session');
        const state: DocState = {
          sessionId,
          taskId,
          content: row.currentContent,
          version: row.documentVersion,
          lastSnapshotVersion: row.documentVersion,
          persistedVersion: row.documentVersion,
          updatedAt: row.updatedAt,
        };
        this.docs.set(k, state);
        return state;
      })().finally(() => this.loading.delete(k));
      this.loading.set(k, pending);
    }
    return pending;
  }

  async getState(sessionId: string, taskId: string): Promise<TaskStateDto> {
    const s = await this.get(sessionId, taskId);
    return {
      taskId,
      content: s.content,
      docVersion: s.version,
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  async listStates(sessionId: string): Promise<TaskStateDto[]> {
    const rows = await this.prisma.sessionTaskState.findMany({ where: { sessionId } });
    return rows.map((r) => {
      const live = this.docs.get(key(sessionId, r.taskId));
      return {
        taskId: r.taskId,
        content: live?.content ?? r.currentContent,
        docVersion: live?.version ?? r.documentVersion,
        updatedAt: (live?.updatedAt ?? r.updatedAt).toISOString(),
      };
    });
  }

  /**
   * Applies a batch of Monaco edits. `fromVersion` must equal the server version;
   * every edit increments the version by one.
   */
  async apply(
    sessionId: string,
    taskId: string,
    fromVersion: number,
    toVersion: number,
    edits: Edit[],
  ): Promise<ApplyResult> {
    const s = await this.get(sessionId, taskId);
    if (fromVersion !== s.version) throw new ResyncRequiredError(s.version);
    if (toVersion !== fromVersion + edits.length) {
      throw new DocumentValidationError('toVersion must equal fromVersion + edits.length');
    }

    let content = s.content;
    let touched = 0;
    const applied: ApplyResult['applied'] = [];
    try {
      for (const edit of edits) {
        const changes: AppliedChange[] = edit.changes.map((c) => ({
          rangeOffset: c.rangeOffset,
          rangeLength: c.rangeLength,
          text: c.text,
          deletedText: content.slice(c.rangeOffset, c.rangeOffset + c.rangeLength),
        }));
        content = applyChanges(content, edit.changes);
        touched += changes.reduce((n, c) => n + c.text.length + c.rangeLength, 0);
        applied.push({ source: edit.source, at: edit.at, changes });
      }
    } catch {
      // Offsets don't fit our document → client and server diverged.
      throw new ResyncRequiredError(s.version);
    }
    if (content.length > MAX_DOCUMENT_SIZE) {
      throw new DocumentValidationError('Document too large');
    }

    s.content = content;
    s.version = toVersion;
    s.updatedAt = new Date();
    this.schedulePersist(s);

    const snapshotId =
      touched >= LARGE_CHANGE_CHARS ? await this.snapshot(s, 'LARGE_CHANGE') : null;
    return { version: s.version, applied, snapshotId };
  }

  /** Accepts the client's full document (after divergence or reconnect). */
  async resync(sessionId: string, taskId: string, docVersion: number, content: string) {
    const s = await this.get(sessionId, taskId);
    const previousVersion = s.version;
    s.content = content;
    // Versions never go backwards, so later deltas cannot collide with old ones.
    s.version = Math.max(docVersion, s.version + 1);
    s.updatedAt = new Date();
    await this.persist(s);
    const snapshotId = await this.snapshot(s, 'RESYNC');
    return { version: s.version, previousVersion, snapshotId };
  }

  /** Persists and snapshots (if changed) all or one task of a session. */
  async flush(sessionId: string, reason: SnapshotReason, taskId?: string): Promise<void> {
    const states = [...this.docs.values()].filter(
      (d) => d.sessionId === sessionId && (!taskId || d.taskId === taskId),
    );
    for (const s of states) {
      await this.persist(s);
      if (s.version > s.lastSnapshotVersion) await this.snapshot(s, reason);
    }
  }

  /** Drops in-memory state of a finished session (after flush). */
  evict(sessionId: string) {
    for (const [k, d] of this.docs) {
      if (d.sessionId === sessionId) {
        clearTimeout(d.persistTimer);
        this.docs.delete(k);
      }
    }
  }

  private schedulePersist(s: DocState) {
    if (s.persistTimer) return;
    s.persistTimer = setTimeout(() => {
      s.persistTimer = undefined;
      this.persist(s).catch((e) => this.logger.error('Persist failed', e));
    }, PERSIST_DEBOUNCE_MS);
    s.persistTimer.unref();
  }

  private async persist(s: DocState) {
    clearTimeout(s.persistTimer);
    s.persistTimer = undefined;
    if (s.persistedVersion === s.version) return;
    const version = s.version;
    await this.prisma.sessionTaskState.update({
      where: { sessionId_taskId: { sessionId: s.sessionId, taskId: s.taskId } },
      data: { currentContent: s.content, documentVersion: version },
    });
    s.persistedVersion = version;
  }

  private async snapshot(s: DocState, reason: SnapshotReason): Promise<string> {
    const row = await this.prisma.codeSnapshot.create({
      data: {
        sessionId: s.sessionId,
        taskId: s.taskId,
        documentVersion: s.version,
        content: s.content,
        reason: reason,
      },
      select: { id: true },
    });
    s.lastSnapshotVersion = s.version;
    return row.id;
  }

  private async periodicSnapshots() {
    for (const s of this.docs.values()) {
      if (s.version > s.lastSnapshotVersion) await this.snapshot(s, 'PERIODIC');
    }
  }
}
