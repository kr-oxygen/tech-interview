import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { text } from 'express';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config.service';
import { ConfiguredIoAdapter } from './modules/websocket/io.adapter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true });
  const config = app.get(AppConfig);

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
