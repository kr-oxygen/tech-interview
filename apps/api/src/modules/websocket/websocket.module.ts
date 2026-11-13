import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { SessionsModule } from '../sessions/sessions.module';
import { SnapshotsModule } from '../snapshots/snapshots.module';
import { PresenceService } from './presence.service';
import { SessionGateway } from './session.gateway';

@Module({
  imports: [SessionsModule, ActivityModule, SnapshotsModule],
  providers: [SessionGateway, PresenceService],
})
export class WebSocketModule {}
