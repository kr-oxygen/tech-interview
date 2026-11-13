import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';

process.env.LOCK_GRACE_SECONDS = '1';

const { AppModule } = require('../src/app.module');

const { ConfiguredIoAdapter } = require('../src/modules/websocket/io.adapter');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Disconnect grace period (e2e)', () => {
  let app: INestApplication;
  let base: string;

  const http = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const connect = (token: string) =>
    new Promise<Socket>((resolve, reject) => {
      const s = io(base, { auth: { token }, transports: ['websocket'], reconnection: false });
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });

  async function startedSession() {
    const reg = await http('POST', '/auth/register', {
      email: `g-${randomUUID()}@example.com`,
      password: 'password123',
      name: 'G',
    });
    const T = reg.body.accessToken;
    const iv = await http('POST', '/interviews', { title: 'Grace' }, T);
    await http('POST', `/interviews/${iv.body.id}/tasks`, { title: 'T' }, T);
    const ses = await http(
      'POST',
      `/interviews/${iv.body.id}/sessions`,
      { newCandidate: { name: 'C' } },
      T,
    );
    const ex = await http('POST', '/candidate/sessions/exchange', {
      token: ses.body.inviteUrl.split('/').pop(),
      consent: true,
    });
    const sock = await connect(ex.body.candidateToken);
    await sock.emitWithAck('session:start', {
      clientEventId: randomUUID(),
      clientTimestamp: Date.now(),
      taskId: null,
    });
    return {
      T,
      sid: ses.body.session.id as string,
      candidateToken: ex.body.candidateToken as string,
      sock,
    };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useWebSocketAdapter(new ConfiguredIoAdapter(app));
    await app.listen(0);
    base = `http://localhost:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('locks the session when the candidate does not come back within the grace period', async () => {
    const { T, sid, candidateToken, sock } = await startedSession();
    sock.disconnect();
    await sleep(1_600);
    const s = await http('GET', `/sessions/${sid}`, undefined, T);
    expect(s.body.status).toBe('LOCKED');
    expect(s.body.lockReason).toBe('DISCONNECT_TIMEOUT');
    await expect(connect(candidateToken)).rejects.toThrow('SESSION_LOCKED');
  });

  it('does not lock when the candidate reconnects within the grace period', async () => {
    const { T, sid, candidateToken, sock } = await startedSession();
    sock.disconnect();
    await sleep(300);
    const again = await connect(candidateToken);
    await sleep(1_600);
    const s = await http('GET', `/sessions/${sid}`, undefined, T);
    expect(s.body.status).toBe('ACTIVE');
    again.disconnect();
  });
});
