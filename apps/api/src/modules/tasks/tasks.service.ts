import { Injectable, NotFoundException } from '@nestjs/common';
import type { InterviewTask } from '../../generated/prisma/client';
import type { CreateTaskDto, TaskDto, UpdateTaskDto } from '@ti/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { InterviewsService } from '../interviews/interviews.service';

export function toTaskDto(t: InterviewTask): TaskDto {
  return {
    id: t.id,
    interviewId: t.interviewId,
    title: t.title,
    description: t.description,
    initialCode: t.initialCode,
    language: t.language,
    order: t.order,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly interviews: InterviewsService,
  ) {}

  async list(userId: string, interviewId: string): Promise<TaskDto[]> {
    await this.interviews.getOwned(userId, interviewId);
    const rows = await this.prisma.interviewTask.findMany({
      where: { interviewId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toTaskDto);
  }

  async create(userId: string, interviewId: string, dto: CreateTaskDto): Promise<TaskDto> {
    await this.interviews.getOwned(userId, interviewId);
    const order = dto.order ?? (await this.prisma.interviewTask.count({ where: { interviewId } }));
    const row = await this.prisma.interviewTask.create({ data: { ...dto, order, interviewId } });
    return toTaskDto(row);
  }

  private async getOwned(userId: string, taskId: string): Promise<InterviewTask> {
    const task = await this.prisma.interviewTask.findFirst({
      where: { id: taskId, interview: { createdById: userId } },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async update(userId: string, taskId: string, dto: UpdateTaskDto): Promise<TaskDto> {
    await this.getOwned(userId, taskId);
    return toTaskDto(await this.prisma.interviewTask.update({ where: { id: taskId }, data: dto }));
  }

  async remove(userId: string, taskId: string): Promise<void> {
    await this.getOwned(userId, taskId);
    await this.prisma.interviewTask.delete({ where: { id: taskId } });
  }
}
