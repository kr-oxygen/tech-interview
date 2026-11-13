import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';
import { AppConfig } from '../../config/app-config.service';

/** Socket.IO adapter with CORS taken from validated config and bounded message size. */
export class ConfiguredIoAdapter extends IoAdapter {
  constructor(private readonly ctx: INestApplicationContext) {
    super(ctx);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const config = this.ctx.get(AppConfig);
    return <Server>super.createIOServer(port, {
      ...options,
      cors: { origin: config.get('WEB_ORIGIN').split(','), credentials: true },
      maxHttpBufferSize: 2e6,
      pingInterval: 10_000,
      pingTimeout: 10_000,
    });
  }
}
