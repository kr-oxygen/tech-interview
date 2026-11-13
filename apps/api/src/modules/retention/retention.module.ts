import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { RetentionService } from './retention.service';

@Module({ imports: [SessionsModule], providers: [RetentionService] })
export class RetentionModule {}
