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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createCandidateSchema,
  updateCandidateSchema,
  type CreateCandidateDto,
  type UpdateCandidateDto,
} from '@ti/shared';
import { CurrentUser, InterviewerAuthGuard } from '../../common/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { AuthUser } from '../../common/auth.types';
import { CandidatesService } from './candidates.service';

@Controller('candidates')
@UseGuards(InterviewerAuthGuard)
export class CandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.candidates.list(user.id, q);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.candidates.get(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCandidateSchema)) dto: CreateCandidateDto,
  ) {
    return this.candidates.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCandidateSchema)) dto: UpdateCandidateDto,
  ) {
    return this.candidates.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.candidates.remove(user.id, id);
  }
}
