import { Injectable } from '@nestjs/common';
import type { SnapshotDto } from '@ti/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SnapshotsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(sessionId: string, taskId?: string): Promise<SnapshotDto[]> {
    const rows = await this.prisma.codeSnapshot.findMany({
      where: { sessionId, ...(taskId ? { taskId } : {}) },
      orderBy: [{ taskId: 'asc' }, { documentVersion: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      documentVersion: r.documentVersion,
      content: r.content,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
