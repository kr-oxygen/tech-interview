import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Liveness/readiness for container healthchecks and deploy scripts. Unauthenticated, so it
 * exposes only a count: `activeSessions` = sessions in progress (ACTIVE or paused), which a
 * deploy script can use to avoid restarting during an interview.
 */
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const activeSessions = await this.prisma.interviewSession.count({
        where: { status: { in: ['ACTIVE', 'LOCKED'] } },
      });
      return { status: 'ok', activeSessions };
    } catch {
      throw new ServiceUnavailableException({ status: 'error' });
    }
  }
}
