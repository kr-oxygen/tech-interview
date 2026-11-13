import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { loginSchema, registerSchema, type LoginDto, type RegisterDto } from '@ti/shared';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CurrentUser, InterviewerAuthGuard } from '../../common/jwt-auth.guard';
import type { AuthUser } from '../../common/auth.types';
import { LOGIN_THROTTLE, REGISTER_THROTTLE } from '../../common/auth-throttles';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Throttle(REGISTER_THROTTLE)
  register(@Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle(LOGIN_THROTTLE)
  login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  @UseGuards(InterviewerAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
