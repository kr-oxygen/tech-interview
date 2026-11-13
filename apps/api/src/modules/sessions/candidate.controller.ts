import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  beaconSchema,
  exchangeInviteSchema,
  inviteInfoQuerySchema,
  type ExchangeInviteDto,
} from '@ti/shared';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { SessionsService } from './sessions.service';

/** Public endpoints used by the candidate (no interviewer auth). */
@Controller('candidate')
export class CandidateController {
  constructor(private readonly sessions: SessionsService) {}

  @Get('invite')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  invite(@Query(new ZodValidationPipe(inviteInfoQuerySchema)) q: { token: string }) {
    return this.sessions.inviteInfo(q.token);
  }

  @Post('sessions/exchange')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  exchange(@Body(new ZodValidationPipe(exchangeInviteSchema)) dto: ExchangeInviteDto) {
    return this.sessions.exchange(dto);
  }

  /**
   * navigator.sendBeacon target. Sent as text/plain (CORS-safelisted, no preflight),
   * so the JSON body is parsed here.
   */
  @Post('beacon')
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async beacon(@Body() body: unknown) {
    let raw = body;
    if (typeof body === 'string') {
      try {
        raw = JSON.parse(body);
      } catch {
        throw new BadRequestException();
      }
    }
    const parsed = beaconSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException();
    await this.sessions.handleBeacon(parsed.data.token, parsed.data.clientTimestamp);
  }
}
