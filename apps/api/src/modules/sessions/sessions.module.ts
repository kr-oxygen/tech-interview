import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { CandidatesModule } from '../candidates/candidates.module';
import { InterviewsModule } from '../interviews/interviews.module';
import { SnapshotsModule } from '../snapshots/snapshots.module';
import { CandidateController } from './candidate.controller';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [InterviewsModule, CandidatesModule, ActivityModule, SnapshotsModule],
  controllers: [SessionsController, CandidateController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
