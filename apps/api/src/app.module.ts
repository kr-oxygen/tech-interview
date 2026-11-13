import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClientIpThrottlerGuard } from './common/client-ip-throttler.guard';
import { webStaticOptions } from './common/web-static';
import { AppConfig } from './config/app-config.service';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { CandidatesModule } from './modules/candidates/candidates.module';
import { InterviewsModule } from './modules/interviews/interviews.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { RetentionModule } from './modules/retention/retention.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { WebSocketModule } from './modules/websocket/websocket.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRootAsync({ inject: [AppConfig], useFactory: webStaticOptions }),
    HealthModule,
    RealtimeModule,
    AuthModule,
    InterviewsModule,
    TasksModule,
    CandidatesModule,
    SessionsModule,
    WebSocketModule,
    RetentionModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ClientIpThrottlerGuard }],
})
export class AppModule {}
