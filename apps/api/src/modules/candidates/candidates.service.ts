import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Candidate } from '../../generated/prisma/client';
import type { CandidateDto, CreateCandidateDto, UpdateCandidateDto } from '@ti/shared';
import { PrismaService } from '../../prisma/prisma.service';

export function toCandidateDto(c: Candidate & { _count?: { sessions: number } }): CandidateDto {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    notes: c.notes,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    sessionCount: c._count?.sessions,
  };
}

@Injectable()
export class CandidatesService {
  constructor(private readonly prisma: PrismaService) {}

  async getOwned(userId: string, id: string): Promise<Candidate> {
    const c = await this.prisma.candidate.findFirst({ where: { id, ownerId: userId } });
    if (!c) throw new NotFoundException('Candidate not found');
    return c;
  }

  async list(userId: string, q?: string): Promise<CandidateDto[]> {
    const term = q?.trim();
    const rows = await this.prisma.candidate.findMany({
      where: {
        ownerId: userId,
        ...(term
          ? {
              OR: [
                { name: { contains: term, mode: 'insensitive' } },
                { email: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: { _count: { select: { sessions: true } } },
    });
    return rows.map(toCandidateDto);
  }

  async get(userId: string, id: string): Promise<CandidateDto> {
    await this.getOwned(userId, id);
    return toCandidateDto(
      await this.prisma.candidate.findUniqueOrThrow({
        where: { id },
        include: { _count: { select: { sessions: true } } },
      }),
    );
  }

  async create(userId: string, dto: CreateCandidateDto): Promise<CandidateDto> {
    const row = await this.prisma.candidate.create({
      data: {
        ownerId: userId,
        name: dto.name,
        email: dto.email?.toLowerCase() ?? null,
        notes: dto.notes ?? null,
      },
    });
    return toCandidateDto(row);
  }

  async update(userId: string, id: string, dto: UpdateCandidateDto): Promise<CandidateDto> {
    await this.getOwned(userId, id);
    const row = await this.prisma.candidate.update({
      where: { id },
      data: {
        ...dto,
        email: dto.email === undefined ? undefined : (dto.email?.toLowerCase() ?? null),
      },
    });
    return toCandidateDto(row);
  }

  /** Candidates with sessions cannot be deleted (history must stay consistent). */
  async remove(userId: string, id: string): Promise<void> {
    await this.getOwned(userId, id);
    const sessions = await this.prisma.interviewSession.count({ where: { candidateId: id } });
    if (sessions > 0) {
      throw new ConflictException('Candidate has sessions and cannot be deleted');
    }
    await this.prisma.candidate.delete({ where: { id } });
  }
}
