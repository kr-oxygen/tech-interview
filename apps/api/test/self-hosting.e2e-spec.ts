import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { io } from 'socket.io-client';

// A fake web build, served the way production serves apps/web/dist.
const webDir = realpathSync(mkdtempSync(join(tmpdir(), 'ti-web-')));
mkdirSync(join(webDir, 'assets'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>ti</title>');
writeFileSync(join(webDir, 'assets', 'app-abc123.js'), 'console.log(1)');
process.env.WEB_DIST_DIR = webDir;

const { AppModule } = require('../src/app.module');

const { ConfiguredIoAdapter } = require('../src/modules/websocket/io.adapter');

describe('Single-origin serving and health (e2e)', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    // NestFactory, not Test.createTestingModule: ServeStaticModule picks its loader from the
    // HTTP adapter at compile time, and a testing module has none yet (it would serve nothing).
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useWebSocketAdapter(new ConfiguredIoAdapter(app));
    await app.listen(0);
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app.close();
    rmSync(webDir, { recursive: true, force: true });
    delete process.env.WEB_DIST_DIR;
  });

  it('serves index.html at the root and for client-side routes, revalidated on every load', async () => {
    for (const path of ['/', '/interviewer/interviews', '/candidate/session/some-token']) {
      const res = await fetch(base + path);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(res.headers.get('cache-control')).toBe('no-cache');
      expect(await res.text()).toContain('<title>ti</title>');
    }
  });

  it('serves hashed assets with a long immutable cache', async () => {
    const res = await fetch(`${base}/assets/app-abc123.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('keeps unknown API routes as JSON 404s', async () => {
    const res = await fetch(`${base}/api/does-not-exist`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('still answers real API routes', async () => {
    expect((await fetch(`${base}/api/auth/me`)).status).toBe(401);
  });

  it('reports health with only a session count', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok', activeSessions: expect.any(Number) });
  });

  it('still accepts Socket.IO connections on the same port', async () => {
    const err = await new Promise<Error>((resolve) => {
      const s = io(base, {
        auth: { token: 'invalid' },
        transports: ['websocket'],
        reconnection: false,
      });
      s.on('connect_error', (e) => {
        s.close();
        resolve(e);
      });
    });
    // Reaching the auth middleware proves the request went to Socket.IO, not the SPA fallback.
    expect(err.message).not.toMatch(/websocket error|xhr poll error/i);
  });
});
