import { Module } from '@nestjs/common';
import { InterviewsModule } from '../interviews/interviews.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [InterviewsModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
