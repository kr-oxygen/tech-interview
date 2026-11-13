import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';

const { AppModule } = require('../src/app.module');

const { ConfiguredIoAdapter } = require('../src/modules/websocket/io.adapter');

/**
 * Cross-interviewer isolation: interviewer B must never read or change interviewer A's data.
 * Foreign resources answer 404 (never 403), so their existence is not revealed.
 */
describe('Interviewer data isolation (e2e)', () => {
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
  const register = async (label: string) => {
    const r = await http('POST', '/auth/register', {
      email: `own-${label}-${randomUUID()}@example.com`,
      password: 'password123',
      name: label,
    });
    expect(r.status).toBe(201);
    return r.body.accessToken as string;
  };
  const env = (taskId: string | null) => ({
    clientEventId: randomUUID(),
    clientTimestamp: Date.now(),
    taskId,
  });

  /** Interviewer A's world. */
  const A = {} as {
    token: string;
    interviewId: string;
    taskId: string;
    candidateId: string;
    candidateName: string;
    sessionId: string;
    candidateSocket: Socket;
  };
  /** Interviewer B's own interview, used for cross-linking attempts. */
  const B = {} as { token: string; interviewId: string; taskId: string };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useWebSocketAdapter(new ConfiguredIoAdapter(app));
    await app.listen(0);
    base = `http://localhost:${(app.getHttpServer().address() as AddressInfo).port}`;

    // --- A: interview, task, candidate, session; the candidate joins and types.
    A.token = await register('a');
    A.interviewId = (await http('POST', '/interviews', { title: 'A interview' }, A.token)).body.id;
    A.taskId = (
      await http('POST', `/interviews/${A.interviewId}/tasks`, { title: 'A task' }, A.token)
    ).body.id;
    A.candidateName = `Alice ${randomUUID()}`;
    A.candidateId = (await http('POST', '/candidates', { name: A.candidateName }, A.token)).body.id;
    const ses = await http(
      'POST',
      `/interviews/${A.interviewId}/sessions`,
      { candidateId: A.candidateId },
      A.token,
    );
    expect(ses.status).toBe(201);
    A.sessionId = ses.body.session.id;
    const ex = await http('POST', '/candidate/sessions/exchange', {
      token: ses.body.inviteUrl.split('/').pop(),
      consent: true,
    });
    A.candidateSocket = await connect(ex.body.candidateToken);
    expect((await A.candidateSocket.emitWithAck('session:start', env(null))).ok).toBe(true);
    const change = await A.candidateSocket.emitWithAck('editor:change', {
      ...env(A.taskId),
      fromVersion: 0,
      toVersion: 1,
      edits: [
        {
          changes: [
            {
              range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
              rangeOffset: 0,
              rangeLength: 0,
              text: 'secret',
            },
          ],
          source: 'input',
          at: Date.now(),
        },
      ],
    });
    expect(change.ok).toBe(true);

    // --- B: a separate interviewer with their own interview and task.
    B.token = await register('b');
    B.interviewId = (await http('POST', '/interviews', { title: 'B interview' }, B.token)).body.id;
    B.taskId = (
      await http('POST', `/interviews/${B.interviewId}/tasks`, { title: 'B task' }, B.token)
    ).body.id;
  });

  afterAll(async () => {
    // Ending the session clears the grace timer the candidate socket would otherwise arm.
    // Wait for the server-side disconnect (deferred ~250 ms) and its handler's DB work, so
    // nothing touches the pool after the app is closed.
    const gone = new Promise((r) => A.candidateSocket.once('disconnect', r));
    await http('POST', `/sessions/${A.sessionId}/end`, {}, A.token);
    await gone;
    await new Promise((r) => setTimeout(r, 200));
    await app.close();
  });

  // Every interviewer route that addresses one of A's resources. Bodies are valid so the
  // 404 comes from the ownership check, not from validation.
  const foreignRoutes: [string, () => string, unknown?][] = [
    ['GET', () => `/interviews/${A.interviewId}`],
    ['PATCH', () => `/interviews/${A.interviewId}`, { title: 'hijacked' }],
    ['DELETE', () => `/interviews/${A.interviewId}`],
    ['GET', () => `/interviews/${A.interviewId}/tasks`],
    ['POST', () => `/interviews/${A.interviewId}/tasks`, { title: 'planted' }],
    ['PATCH', () => `/tasks/${A.taskId}`, { title: 'hijacked' }],
    ['DELETE', () => `/tasks/${A.taskId}`],
    ['GET', () => `/interviews/${A.interviewId}/sessions`],
    ['POST', () => `/interviews/${A.interviewId}/sessions`, { newCandidate: { name: 'X' } }],
    ['GET', () => `/candidates/${A.candidateId}`],
    ['PATCH', () => `/candidates/${A.candidateId}`, { name: 'hijacked' }],
    ['DELETE', () => `/candidates/${A.candidateId}`],
    ['GET', () => `/candidates/${A.candidateId}/sessions`],
    ['GET', () => `/sessions/${A.sessionId}`],
    ['POST', () => `/sessions/${A.sessionId}/reissue-invite`, {}],
    ['POST', () => `/sessions/${A.sessionId}/allow-return`, { newLink: true }],
    ['POST', () => `/sessions/${A.sessionId}/end`, {}],
    ['GET', () => `/sessions/${A.sessionId}/events`],
    ['GET', () => `/sessions/${A.sessionId}/insights`],
    ['GET', () => `/sessions/${A.sessionId}/snapshots`],
    ['GET', () => `/sessions/${A.sessionId}/snapshots?taskId=${A.taskId}`],
  ];

  describe("B cannot reach A's resources", () => {
    // Readable test titles: "PATCH /tasks/${A.taskId}" → "PATCH /tasks/:A.taskId".
    const label = (p: () => string) =>
      p
        .toString()
        .replace(/^.*?`|`.*$/gs, '')
        .replace(/\$\{(.*?)\}/g, ':$1');
    it.each(foreignRoutes.map(([m, p, b]) => ({ m, p, b, route: `${m} ${label(p)}` })))(
      '$route → 404',
      async ({ m, p, b }) => {
        const r = await http(m, p(), b, B.token);
        expect(r.status).toBe(404);
      },
    );

    it("rejects a session in B's interview that links A's candidate", async () => {
      const r = await http(
        'POST',
        `/interviews/${B.interviewId}/sessions`,
        { candidateId: A.candidateId },
        B.token,
      );
      expect(r.status).toBe(404);
      const own = await http('GET', `/interviews/${B.interviewId}/sessions`, undefined, B.token);
      expect(own.body).toEqual([]);
    });

    it("does not list A's items in B's list endpoints", async () => {
      const interviews = await http('GET', '/interviews', undefined, B.token);
      expect(interviews.body.map((i: { id: string }) => i.id)).toEqual([B.interviewId]);
      const candidates = await http('GET', '/candidates', undefined, B.token);
      expect(candidates.body).toEqual([]);
      const search = await http(
        'GET',
        `/candidates?q=${encodeURIComponent(A.candidateName)}`,
        undefined,
        B.token,
      );
      expect(search.body).toEqual([]);
      const tasks = await http('GET', `/interviews/${B.interviewId}/tasks`, undefined, B.token);
      expect(tasks.body.map((t: { id: string }) => t.id)).toEqual([B.taskId]);
    });

    it("rejects monitor:join for A's session", async () => {
      const sock = await connect(B.token);
      try {
        const ack = await sock.emitWithAck('monitor:join', { sessionId: A.sessionId });
        expect(ack).toEqual({ ok: false, error: 'NOT_FOUND' });
      } finally {
        sock.disconnect();
      }
    });

    it('rejects a candidate token on interviewer routes', async () => {
      // A candidate JWT is session-bound and must not double as an interviewer token.
      const ses = await http(
        'POST',
        `/interviews/${B.interviewId}/sessions`,
        { newCandidate: { name: 'Bob' } },
        B.token,
      );
      const ex = await http('POST', '/candidate/sessions/exchange', {
        token: ses.body.inviteUrl.split('/').pop(),
        consent: true,
      });
      const r = await http('GET', `/sessions/${A.sessionId}`, undefined, ex.body.candidateToken);
      expect(r.status).toBe(401);
      await http('POST', `/sessions/${ses.body.session.id}/end`, {}, B.token);
    });
  });

  describe('A still owns everything, untouched (sanity)', () => {
    it('A can read every resource', async () => {
      const reads = foreignRoutes.filter(([m]) => m === 'GET');
      for (const [m, p] of reads) {
        const r = await http(m, p(), undefined, A.token);
        expect({ route: `${m} ${p()}`, status: r.status }).toEqual({
          route: `${m} ${p()}`,
          status: 200,
        });
      }
    });

    it("B's attempts changed nothing", async () => {
      const iv = await http('GET', `/interviews/${A.interviewId}`, undefined, A.token);
      expect(iv.body).toMatchObject({ title: 'A interview', taskCount: 1, sessionCount: 1 });
      const tasks = await http('GET', `/interviews/${A.interviewId}/tasks`, undefined, A.token);
      expect(tasks.body).toEqual([expect.objectContaining({ id: A.taskId, title: 'A task' })]);
      const cand = await http('GET', `/candidates/${A.candidateId}`, undefined, A.token);
      expect(cand.body).toMatchObject({ name: A.candidateName, sessionCount: 1 });
      const s = await http('GET', `/sessions/${A.sessionId}`, undefined, A.token);
      expect(s.body.status).toBe('ACTIVE');
      const events = await http('GET', `/sessions/${A.sessionId}/events`, undefined, A.token);
      const types = events.body.items.map((e: { eventType: string }) => e.eventType);
      expect(types).toEqual(expect.arrayContaining(['SESSION_STARTED', 'TEXT_INSERT']));
      expect(types).not.toContain('RETURN_ALLOWED');
      expect(types).not.toContain('SESSION_ENDED');
      const snaps = await http('GET', `/sessions/${A.sessionId}/snapshots`, undefined, A.token);
      expect(snaps.body.length).toBeGreaterThan(0);
    });

    it("A's monitor:join succeeds and shows the candidate's code", async () => {
      const sock = await connect(A.token);
      try {
        const ack = await sock.emitWithAck('monitor:join', { sessionId: A.sessionId });
        expect(ack.ok).toBe(true);
        expect(ack.data.session.id).toBe(A.sessionId);
        expect(ack.data.taskStates).toEqual([
          expect.objectContaining({ taskId: A.taskId, content: 'secret' }),
        ]);
      } finally {
        sock.disconnect();
      }
    });

    it('rejects a malformed snapshot taskId with 400', async () => {
      const r = await http(
        'GET',
        `/sessions/${A.sessionId}/snapshots?taskId=not-a-uuid`,
        undefined,
        A.token,
      );
      expect(r.status).toBe(400);
    });
  });
});
