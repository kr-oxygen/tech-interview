import { Global, Module } from '@nestjs/common';
import { RealtimeService } from './realtime.service';
import { SessionQueue } from './session-queue.service';

@Global()
@Module({ providers: [RealtimeService, SessionQueue], exports: [RealtimeService, SessionQueue] })
export class RealtimeModule {}
