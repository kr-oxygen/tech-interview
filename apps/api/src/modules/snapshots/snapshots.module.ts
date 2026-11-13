import { Module } from '@nestjs/common';
import { DocumentStateService } from './document-state.service';
import { SnapshotsService } from './snapshots.service';

@Module({
  providers: [DocumentStateService, SnapshotsService],
  exports: [DocumentStateService, SnapshotsService],
})
export class SnapshotsModule {}
