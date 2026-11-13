import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type ActivityEvent } from '../../generated/prisma/client';
import { randomUUID } from 'node:crypto';
import {
  S2C,
  type ActivityEventDto,
  type ActivityEventType,
  type EventsPage,
  type InsightDto,
} from '@ti/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  INSIGHT_HISTORY_TYPES,
  INSIGHT_HISTORY_WINDOW_MS,
  computeAllInsights,
  detectInsights,
  type InsightEvent,
} from './insights';

export interface RecordInput {
  sessionId: string;
  taskId: string | null;
  type: ActivityEventType;
  payload: Record<string, unknown>;
  /** Absent for server-generated events. */
  clientEventId?: string;
  clientTimestamp?: number;
}

export interface RecordResult {
  event: ActivityEventDto;
  duplicate: boolean;
}

const INSIGHT_TRIGGERS = new Set([
  'PASTE',
  'TEXT_INSERT',
  'TEXT_CHANGE',
  'TAB_HIDDEN',
  'IDLE',
  'SESSION_LOCKED',
]);

export function toEventDto(e: ActivityEvent): ActivityEventDto {
  return {
    id: e.id,
    sessionId: e.sessionId,
    taskId: e.taskId,
    eventType: e.eventType as ActivityEventType,
    payload: e.payload as Record<string, unknown>,
    timestamp: e.timestamp.toISOString(),
    clientTimestamp: e.clientTimestamp?.toISOString() ?? null,
    sequenceNumber: e.sequenceNumber,
  };
}

const toInsightEvent = (
  e: Pick<ActivityEvent, 'sequenceNumber' | 'eventType' | 'timestamp' | 'payload'>,
): InsightEvent => ({
  seq: e.sequenceNumber,
  type: e.eventType,
  at: e.timestamp.getTime(),
  payload: e.payload as Record<string, unknown>,
});

/**
 * Append-only activity log. Guarantees per-session ordering (sequenceNumber assigned under a
 * row lock on the session) and idempotency (unique sessionId+clientEventId).
 */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async record(input: RecordInput): Promise<RecordResult> {
    const clientEventId = input.clientEventId ?? `srv:${randomUUID()}`;
    if (input.clientEventId) {
      const existing = await this.findByClientId(input.sessionId, clientEventId);
      if (existing) return { event: toEventDto(existing), duplicate: true };
    }

    let row: ActivityEvent;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const { lastSequenceNumber } = await tx.interviewSession.update({
          where: { id: input.sessionId },
          data: { lastSequenceNumber: { increment: 1 } },
          select: { lastSequenceNumber: true },
        });
        return tx.activityEvent.create({
          data: {
            sessionId: input.sessionId,
            taskId: input.taskId,
            eventType: input.type,
            payload: input.payload as Prisma.InputJsonValue,
            clientEventId,
            clientTimestamp: input.clientTimestamp ? new Date(input.clientTimestamp) : null,
            sequenceNumber: lastSequenceNumber,
          },
        });
      });
    } catch (err) {
      // Concurrent duplicate delivery of the same client event.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.findByClientId(input.sessionId, clientEventId);
        if (existing) return { event: toEventDto(existing), duplicate: true };
      }
      throw err;
    }

    const event = toEventDto(row);
    this.realtime.toObservers(input.sessionId, S2C.ACTIVITY_RECORDED, event);
    if (INSIGHT_TRIGGERS.has(row.eventType)) {
      this.detectLive(row).catch((e) => this.logger.error('Insight detection failed', e));
    }
    return { event, duplicate: false };
  }

  /** Already-processed client event (lost ack → retry), or null. */
  async findDuplicate(sessionId: string, clientEventId: string): Promise<ActivityEventDto | null> {
    const row = await this.findByClientId(sessionId, clientEventId);
    return row ? toEventDto(row) : null;
  }

  private findByClientId(sessionId: string, clientEventId: string) {
    return this.prisma.activityEvent.findUnique({
      where: { sessionId_clientEventId: { sessionId, clientEventId } },
    });
  }

  private async detectLive(row: ActivityEvent) {
    const history = await this.prisma.activityEvent.findMany({
      where: {
        sessionId: row.sessionId,
        eventType: { in: INSIGHT_HISTORY_TYPES },
        sequenceNumber: { lt: row.sequenceNumber },
        timestamp: { gte: new Date(row.timestamp.getTime() - INSIGHT_HISTORY_WINDOW_MS) },
      },
      orderBy: { sequenceNumber: 'asc' },
      take: 2000,
      select: { sequenceNumber: true, eventType: true, timestamp: true, payload: true },
    });
    for (const insight of detectInsights(toInsightEvent(row), history.map(toInsightEvent))) {
      this.realtime.toObservers(row.sessionId, S2C.INSIGHT_DETECTED, insight);
    }
  }

  async list(sessionId: string, after: number, limit: number): Promise<EventsPage> {
    const rows = await this.prisma.activityEvent.findMany({
      where: { sessionId, sequenceNumber: { gt: after } },
      orderBy: { sequenceNumber: 'asc' },
      take: limit,
    });
    return {
      items: rows.map(toEventDto),
      nextAfter: rows.length === limit ? rows[rows.length - 1].sequenceNumber : null,
    };
  }

  async insights(sessionId: string): Promise<InsightDto[]> {
    const rows = await this.prisma.activityEvent.findMany({
      where: { sessionId },
      orderBy: { sequenceNumber: 'asc' },
      select: { sequenceNumber: true, eventType: true, timestamp: true, payload: true },
    });
    return computeAllInsights(rows.map(toInsightEvent));
  }
}
