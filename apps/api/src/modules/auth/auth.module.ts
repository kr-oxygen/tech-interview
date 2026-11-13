import { Global, Module } from '@nestjs/common';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { AppConfig } from '../../config/app-config.service';
import { InterviewerAuthGuard } from '../../common/jwt-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.get('JWT_SECRET'),

        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN') as JwtSignOptions['expiresIn'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, InterviewerAuthGuard],
  exports: [JwtModule, InterviewerAuthGuard],
})
export class AuthModule {}
