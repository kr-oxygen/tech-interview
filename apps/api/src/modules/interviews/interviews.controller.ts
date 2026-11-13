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
  createInterviewSchema,
  updateInterviewSchema,
  type CreateInterviewDto,
  type UpdateInterviewDto,
} from '@ti/shared';
import { CurrentUser, InterviewerAuthGuard } from '../../common/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { AuthUser } from '../../common/auth.types';
import { InterviewsService } from './interviews.service';

@Controller('interviews')
@UseGuards(InterviewerAuthGuard)
export class InterviewsController {
  constructor(private readonly interviews: InterviewsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.interviews.list(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.interviews.get(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createInterviewSchema)) dto: CreateInterviewDto,
  ) {
    return this.interviews.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateInterviewSchema)) dto: UpdateInterviewDto,
  ) {
    return this.interviews.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.interviews.remove(user.id, id);
  }
}
