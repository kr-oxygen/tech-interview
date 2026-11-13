import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Edit } from '@ti/shared';

type Handler = (...args: unknown[]) => void;

/** Minimal fake of a socket.io client socket with scripted acks. */
class FakeSocket {
  connected = false;
  handlers = new Map<string, Handler[]>();
  sent: Array<{ event: string; payload: Record<string, unknown> }> = [];
  respond: (event: string, payload: Record<string, unknown>) => unknown = () => ({ ok: true });
  on(ev: string, h: Handler) {
    this.handlers.set(ev, [...(this.handlers.get(ev) ?? []), h]);
    return this;
  }
  fire(ev: string, ...args: unknown[]) {
    this.handlers.get(ev)?.forEach((h) => h(...args));
  }
  timeout() {
    return this;
  }
  async emitWithAck(event: string, payload: Record<string, unknown>) {
    if (event !== 'session:join') this.sent.push({ event, payload });
    return this.respond(event, payload);
  }
  disconnect() {}
}

let fake: FakeSocket;
vi.mock('socket.io-client', () => ({ io: () => fake }));

const { CandidateConnection } = await import('./candidateConnection');

const TASK = '11111111-1111-4111-8111-111111111111';
const edit = (text: string): Edit => ({
  source: 'input',
  at: 0,
  changes: [{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, rangeOffset: 0, rangeLength: 0, text }],
});
const flush = () => new Promise((r) => setTimeout(r, 0));

async function connected() {
  const conn = new CandidateConnection('token', {
    onStatus: vi.fn(),
    onJoin: vi.fn(),
    onSession: vi.fn(),
  });
  fake.respond = (event) =>
    event === 'session:join'
      ? { ok: true, data: { session: { status: 'ACTIVE' }, taskStates: [{ taskId: TASK, docVersion: 5, content: '' }], serverTime: new Date().toISOString() } }
      : { ok: true };
  conn.connect();
  fake.connected = true;
  fake.fire('connect');
  await flush();
  return conn;
}

describe('CandidateConnection outbox', () => {
  beforeEach(() => {
    fake = new FakeSocket();
  });
  afterEach(() => vi.useRealTimers());

  it('sends edits in order with continuous versions starting from the server version', async () => {
    const conn = await connected();
    conn.sendEdits(TASK, [edit('a')]);
    conn.sendEdits(TASK, [edit('b'), edit('c')]);
    await flush();
    await flush();
    const changes = fake.sent.filter((s) => s.event === 'editor:change').map((s) => [s.payload.fromVersion, s.payload.toVersion]);
    expect(changes).toEqual([
      [5, 6],
      [6, 8],
    ]);
    expect(conn.pendingCount).toBe(0);
  });

  it('keeps unacknowledged events and resends them with the same clientEventId after reconnect', async () => {
    const conn = await connected();
    fake.respond = () => Promise.reject(new Error('timeout'));
    conn.send('editor:copy', TASK, { text: 'x' });
    await flush();
    const firstId = fake.sent[0].payload.clientEventId;
    expect(conn.pendingCount).toBe(1);

    fake.respond = (event) =>
      event === 'session:join'
        ? { ok: true, data: { session: { status: 'ACTIVE' }, taskStates: [], serverTime: new Date().toISOString() } }
        : { ok: true };
    fake.fire('connect');
    await flush();
    await flush();
    expect(fake.sent.at(-1)!.payload.clientEventId).toBe(firstId);
    expect(conn.pendingCount).toBe(0);
  });

  it('replaces queued changes with one full resync on RESYNC', async () => {
    const conn = await connected();
    let content = 'live document';
    conn.setDocumentProvider({ getContent: () => content, discardPending: vi.fn() });
    let first = true;
    fake.respond = (event) => {
      if (event === 'editor:change' && first) {
        first = false;
        return { ok: false, error: 'RESYNC', serverVersion: 9 };
      }
      return { ok: true };
    };
    conn.sendEdits(TASK, [edit('a')]); // v5→6, rejected
    conn.sendEdits(TASK, [edit('b')]); // v6→7, must be dropped
    content = 'live document!';
    await flush();
    await flush();
    await flush();
    const events = fake.sent.map((s) => s.event);
    expect(events).toEqual(['editor:change', 'editor:resync']);
    const resync = fake.sent[1].payload;
    expect(resync.content).toBe('live document!');
    expect(resync.docVersion).toBe(10); // max(local 7, server 9 + 1)

    conn.sendEdits(TASK, [edit('c')]);
    await flush();
    expect(fake.sent.at(-1)!.payload).toMatchObject({ fromVersion: 10, toVersion: 11 });
  });
});
