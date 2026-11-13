import { Injectable, NotFoundException } from '@nestjs/common';
import type { Interview } from '../../generated/prisma/client';
import type { CreateInterviewDto, InterviewDto, UpdateInterviewDto } from '@ti/shared';
import { PrismaService } from '../../prisma/prisma.service';

type WithCounts = Interview & { _count?: { tasks: number; sessions: number } };

export function toInterviewDto(i: WithCounts): InterviewDto {
  return {
    id: i.id,
    title: i.title,
    description: i.description,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    taskCount: i._count?.tasks,
    sessionCount: i._count?.sessions,
  };
}

@Injectable()
export class InterviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Throws 404 (not 403) so existence of foreign interviews is not revealed. */
  async getOwned(userId: string, id: string): Promise<Interview> {
    const interview = await this.prisma.interview.findFirst({ where: { id, createdById: userId } });
    if (!interview) throw new NotFoundException('Interview not found');
    return interview;
  }

  async list(userId: string): Promise<InterviewDto[]> {
    const rows = await this.prisma.interview.findMany({
      where: { createdById: userId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { tasks: true, sessions: true } } },
    });
    return rows.map(toInterviewDto);
  }

  async get(userId: string, id: string): Promise<InterviewDto> {
    await this.getOwned(userId, id);
    const row = await this.prisma.interview.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { tasks: true, sessions: true } } },
    });
    return toInterviewDto(row);
  }

  async create(userId: string, dto: CreateInterviewDto): Promise<InterviewDto> {
    const row = await this.prisma.interview.create({ data: { ...dto, createdById: userId } });
    return toInterviewDto(row);
  }

  async update(userId: string, id: string, dto: UpdateInterviewDto): Promise<InterviewDto> {
    await this.getOwned(userId, id);
    return toInterviewDto(await this.prisma.interview.update({ where: { id }, data: dto }));
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getOwned(userId, id);
    await this.prisma.interview.delete({ where: { id } });
  }
}
