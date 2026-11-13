import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  createTaskSchema,
  updateTaskSchema,
  type CreateTaskDto,
  type UpdateTaskDto,
} from '@ti/shared';
import { CurrentUser, InterviewerAuthGuard } from '../../common/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { AuthUser } from '../../common/auth.types';
import { TasksService } from './tasks.service';

@Controller()
@UseGuards(InterviewerAuthGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('interviews/:interviewId/tasks')
  list(@CurrentUser() user: AuthUser, @Param('interviewId', ParseUUIDPipe) interviewId: string) {
    return this.tasks.list(user.id, interviewId);
  }

  @Post('interviews/:interviewId/tasks')
  create(
    @CurrentUser() user: AuthUser,
    @Param('interviewId', ParseUUIDPipe) interviewId: string,
    @Body(new ZodValidationPipe(createTaskSchema)) dto: CreateTaskDto,
  ) {
    return this.tasks.create(user.id, interviewId, dto);
  }

  @Patch('tasks/:taskId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) dto: UpdateTaskDto,
  ) {
    return this.tasks.update(user.id, taskId, dto);
  }

  @Delete('tasks/:taskId')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.tasks.remove(user.id, taskId);
  }
}
