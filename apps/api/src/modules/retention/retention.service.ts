import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppConfig } from '../../config/app-config.service';
import { SessionsService } from '../sessions/sessions.service';

/** Data retention: code, clipboard content and activity history are kept RETENTION_DAYS. */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly sessions: SessionsService,
    private readonly config: AppConfig,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purge() {
    const n = await this.sessions.purgeExpiredData(this.config.get('RETENTION_DAYS'));
    if (n) this.logger.log(`Purged activity data of ${n} session(s)`);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async expireInvites() {
    const n = await this.sessions.expireStaleInvites();
    if (n) this.logger.log(`Expired ${n} unused invite(s)`);
  }
}
