import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createSessionSchema,
  eventsQuerySchema,
  allowReturnSchema,
  inviteOptionsSchema,
  type AllowReturnDto,
  type CreateSessionDto,
  type EventsQuery,
  type InviteOptionsDto,
} from '@ti/shared';
import type { AuthUser } from '../../common/auth.types';
import { CurrentUser, InterviewerAuthGuard } from '../../common/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { ActivityService } from '../activity/activity.service';
import { SnapshotsService } from '../snapshots/snapshots.service';
import { SessionsService } from './sessions.service';

@Controller()
@UseGuards(InterviewerAuthGuard)
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly activity: ActivityService,
    private readonly snapshots: SnapshotsService,
  ) {}

  @Post('interviews/:interviewId/sessions')
  create(
    @CurrentUser() user: AuthUser,
    @Param('interviewId', ParseUUIDPipe) interviewId: string,
    @Body(new ZodValidationPipe(createSessionSchema)) dto: CreateSessionDto,
  ) {
    return this.sessions.create(user.id, interviewId, dto);
  }

  @Get('interviews/:interviewId/sessions')
  listForInterview(
    @CurrentUser() user: AuthUser,
    @Param('interviewId', ParseUUIDPipe) interviewId: string,
  ) {
    return this.sessions.listForInterview(user.id, interviewId);
  }

  @Get('candidates/:candidateId/sessions')
  listForCandidate(
    @CurrentUser() user: AuthUser,
    @Param('candidateId', ParseUUIDPipe) candidateId: string,
  ) {
    return this.sessions.listForCandidate(user.id, candidateId);
  }

  @Get('sessions/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.get(user.id, id);
  }

  @Post('sessions/:id/reissue-invite')
  @HttpCode(200)
  reissue(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(inviteOptionsSchema)) dto: InviteOptionsDto,
  ) {
    return this.sessions.reissueInvite(user.id, id, dto.inviteTtlHours);
  }

  @Post('sessions/:id/allow-return')
  @HttpCode(200)
  allowReturn(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(allowReturnSchema)) dto: AllowReturnDto,
  ) {
    return this.sessions.allowReturn(user.id, id, dto);
  }

  @Post('sessions/:id/end')
  @HttpCode(200)
  end(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.endByInterviewer(user.id, id);
  }

  @Get('sessions/:id/events')
  async events(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(eventsQuerySchema)) q: EventsQuery,
  ) {
    await this.sessions.assertOwner(user.id, id);
    return this.activity.list(id, q.after, q.limit);
  }

  @Get('sessions/:id/insights')
  async insights(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.sessions.assertOwner(user.id, id);
    return this.activity.insights(id);
  }

  @Get('sessions/:id/snapshots')
  async snapshotList(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    // Validated so a malformed id is a 400, not a Prisma error on the uuid column.
    @Query('taskId', new ParseUUIDPipe({ optional: true })) taskId?: string,
  ) {
    await this.sessions.assertOwner(user.id, id);
    return this.snapshots.list(id, taskId);
  }
}
