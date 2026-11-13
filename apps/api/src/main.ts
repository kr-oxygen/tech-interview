import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { text } from 'express';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config.service';
import { ConfiguredIoAdapter } from './modules/websocket/io.adapter';
import { assertMigrationsApplied } from './prisma/migration-check';
import { PrismaService } from './prisma/prisma.service';

/** Parses TRUST_PROXY into an Express `trust proxy` value. */
function trustProxy(raw: string): boolean | number | string {
  if (raw === 'true') return true;
  if (raw === 'false' || raw === '') return false;
  return /^\d+$/.test(raw) ? Number(raw) : raw;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true });
  const config = app.get(AppConfig);

  if (config.get('NODE_ENV') === 'production') {
    await assertMigrationsApplied(app.get(PrismaService), config.get('MIGRATIONS_DIR'));
  }
  app.set('trust proxy', trustProxy(config.get('TRUST_PROXY')));

  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.get('WEB_ORIGIN').split(','), credentials: true });
  app.useBodyParser('json', { limit: '1mb' });
  // sendBeacon payloads are sent as text/plain to avoid CORS preflight.
  app.use('/api/candidate/beacon', text({ type: 'text/plain', limit: '10kb' }));
  app.useWebSocketAdapter(new ConfiguredIoAdapter(app));
  app.enableShutdownHooks();

  await app.listen(config.get('PORT'));
  Logger.log(`API listening on :${config.get('PORT')}`, 'Bootstrap');
}
void bootstrap();
