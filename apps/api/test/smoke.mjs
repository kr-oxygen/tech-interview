// Manual end-to-end smoke test against a running API: node test/smoke.mjs
import { io } from 'socket.io-client';
import { randomUUID } from 'node:crypto';

const BASE = process.env.API ?? 'http://localhost:3001';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function http(method, path, body, token) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const check = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } console.log('ok -', msg); };
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false });
  s.on('connect', () => resolve(s));
  s.on('connect_error', (e) => reject(e));
});
const emit = (s, ev, data) => s.timeout(5000).emitWithAck(ev, data);
const env = (taskId) => ({ clientEventId: randomUUID(), clientTimestamp: Date.now(), taskId });

const email = `smoke-${Date.now()}@example.com`;
const reg = await http('POST', '/auth/register', { email, password: 'password123', name: 'Smoke' });
check(reg.status === 201, 'register');
const T = reg.body.accessToken;
const iv = await http('POST', '/interviews', { title: 'Smoke interview' }, T);
const t1 = await http('POST', `/interviews/${iv.body.id}/tasks`, { title: 'Task 1', initialCode: 'const a = 1;\n' }, T);
const t2 = await http('POST', `/interviews/${iv.body.id}/tasks`, { title: 'Task 2', language: 'javascript' }, T);
check(t1.status === 201 && t2.status === 201, 'tasks created');
const ses = await http('POST', `/interviews/${iv.body.id}/sessions`, { newCandidate: { name: 'Jane Doe' } }, T);
check(ses.status === 201, 'session created');
const token = ses.body.inviteUrl.split('/').pop();
const sid = ses.body.session.id;

const info = await http('GET', `/candidate/invite?token=${token}`);
check(info.body.linkState === 'valid' && info.body.candidateName === 'Jane Doe', 'invite info');
const ex = await http('POST', '/candidate/sessions/exchange', { token, consent: true });
check(ex.status === 200, 'exchange');
const ex2 = await http('POST', '/candidate/sessions/exchange', { token, consent: true });
check(ex2.status === 410 && ex2.body.code === 'LINK_USED', 'second exchange rejected (410)');

const interviewer = await connect(T);
const received = [];
for (const ev of ['activity:recorded', 'editor:updated', 'insight:detected', 'session:status', 'session:connected', 'session:disconnected'])
  interviewer.on(ev, (d) => received.push([ev, d]));
const mj = await emit(interviewer, 'monitor:join', { sessionId: sid });
check(mj.ok && mj.data.taskStates.length === 2, 'monitor:join returns task states');

const cand = await connect(ex.body.candidateToken);
const join = await emit(cand, 'session:join', {});
check(join.ok && join.data.session.status === 'CREATED', 'candidate join');
const early = await emit(cand, 'editor:focus', env(t1.body.id));
check(!early.ok && early.error === 'SESSION_NOT_ACTIVE', 'events rejected before start');
const st = await emit(cand, 'session:start', env(null));
check(st.ok && st.data.status === 'ACTIVE' && st.data.activeTaskId === t1.body.id, 'session started');

const change = {
  ...env(t1.body.id), fromVersion: 0, toVersion: 2,
  edits: [
    { source: 'input', at: Date.now(), changes: [{ range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 }, rangeOffset: 13, rangeLength: 0, text: 'let b' }] },
    { source: 'input', at: Date.now(), changes: [{ range: { startLineNumber: 1, startColumn: 7, endLineNumber: 1, endColumn: 8 }, rangeOffset: 6, rangeLength: 1, text: 'x' }] },
  ],
};
const c1 = await emit(cand, 'editor:change', change);
check(c1.ok && typeof c1.seq === 'number', 'editor:change applied');
const c1dup = await emit(cand, 'editor:change', change);
check(c1dup.ok && c1dup.seq === c1.seq, 'duplicate change deduplicated (same seq)');
const stale = await emit(cand, 'editor:change', { ...change, clientEventId: randomUUID() });
check(!stale.ok && stale.error === 'RESYNC' && stale.serverVersion === 2, 'stale version → RESYNC');

const copied = 'function solve(input) {\n  return input.split(",").map(Number).reduce((a, b) => a + b, 0);\n}\n';
const sel = { startLineNumber: 1, startColumn: 1, endLineNumber: 3, endColumn: 2 };
check((await emit(cand, 'editor:copy', { ...env(t1.body.id), text: copied, length: copied.length, selection: sel, docVersion: 2 })).ok, 'copy recorded');
check((await emit(cand, 'editor:paste', { ...env(t1.body.id), text: copied, length: copied.length, range: sel, docVersion: 3 })).ok, 'paste recorded');
const external = 'x'.repeat(450);
check((await emit(cand, 'editor:paste', { ...env(t1.body.id), text: external, length: 450, range: null, docVersion: 3 })).ok, 'external paste recorded');
for (const visible of [false, true]) await emit(cand, 'browser:visibility', { ...env(t1.body.id), visible });
const bad = await emit(cand, 'editor:copy', { ...env(t1.body.id), text: 1 });
check(!bad.ok && bad.error === 'VALIDATION', 'invalid payload rejected');
const sw = await emit(cand, 'task:switch', { ...env(t1.body.id), toTaskId: t2.body.id });
check(sw.ok && sw.data.activeTaskId === t2.body.id, 'task switched');

await sleep(400);
const kinds = received.map(([e, d]) => (e === 'activity:recorded' ? d.eventType : e === 'insight:detected' ? `insight:${d.type}` : e));
console.log('   interviewer received:', kinds.join(', '));
check(kinds.includes('editor:updated') && kinds.includes('PASTE') && kinds.includes('TAB_HIDDEN'), 'interviewer receives live updates');
check(kinds.includes('insight:COPY_PASTE_MATCH') && kinds.includes('insight:LARGE_EXTERNAL_PASTE'), 'live insights detected');

const events = await http('GET', `/sessions/${sid}/events?after=0`, null, T);
const seqs = events.body.items.map((e) => e.sequenceNumber);
check(seqs.every((s, i) => s === i + 1), `events persisted in order (${seqs.length})`);
const textEv = events.body.items.find((e) => e.eventType === 'TEXT_CHANGE');
check(textEv?.payload.edits[1].changes[0].deletedText === 'a', 'server captured deleted text');
const ins = await http('GET', `/sessions/${sid}/insights`, null, T);
check(ins.body.length >= 2, `insights endpoint (${ins.body.map((i) => i.type).join(', ')})`);
const snaps = await http('GET', `/sessions/${sid}/snapshots?taskId=${t1.body.id}`, null, T);
check(snaps.body.at(-1).content === 'const x = 1;\nlet b' && snaps.body.at(-1).reason === 'TASK_SWITCH', 'snapshot on task switch has final code');

// Foreign interviewer cannot access
const other = await http('POST', '/auth/register', { email: `o-${email}`, password: 'password123', name: 'Other' });
check((await http('GET', `/sessions/${sid}`, null, other.body.accessToken)).status === 404, 'foreign interviewer gets 404');
const otherSock = await connect(other.body.accessToken);
check(!(await emit(otherSock, 'monitor:join', { sessionId: sid })).ok, 'foreign interviewer cannot monitor');
otherSock.close();

// Leaving the page → beacon → LOCKED
await fetch(`${BASE}/api/candidate/beacon`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ token: ex.body.candidateToken, type: 'PAGE_UNLOAD', clientTimestamp: Date.now() }) });
await sleep(600);
check(!cand.connected, 'candidate socket disconnected after lock');
const locked = await http('GET', `/sessions/${sid}`, null, T);
check(locked.body.status === 'LOCKED' && locked.body.lockReason === 'PAGE_UNLOAD', 'session LOCKED');
await connect(ex.body.candidateToken).then(() => check(false, 'old token must fail'), (e) => check(e.message === 'SESSION_LOCKED', 'old candidate token rejected (SESSION_LOCKED)'));
const info2 = await http('GET', `/candidate/invite?token=${token}`);
check(info2.body.status === 'LOCKED' && info2.body.linkState === 'used', 'old link shows paused');

check((await http('POST', '/candidate/sessions/exchange', { token, consent: true })).status === 423, 'paused link cannot be exchanged before return is allowed');
const ar = await http('POST', `/sessions/${sid}/allow-return`, {}, T);
check(ar.status === 200 && ar.body.session.status === 'LOCKED' && ar.body.inviteUrl === null, 'allow-return re-arms the original link (session stays paused)');
const info3 = await http('GET', `/candidate/invite?token=${token}`);
check(info3.body.status === 'LOCKED' && info3.body.linkState === 'valid', 'original link valid again');
const ex3 = await http('POST', '/candidate/sessions/exchange', { token, consent: true });
check(ex3.status === 201 || ex3.status === 200, 'candidate returns through the original link');
check((await http('GET', `/sessions/${sid}`, null, T)).body.status === 'ACTIVE', 'session resumed on return');
check((await http('POST', '/candidate/sessions/exchange', { token, consent: true })).status === 410, 're-armed link is still one-time');
await connect(ex.body.candidateToken).then(() => check(false, 'pre-lock token must fail'), () => check(true, 'pre-lock candidate token still rejected'));
const cand2 = await connect(ex3.body.candidateToken);
const join2 = await emit(cand2, 'session:join', {});
check(join2.data.taskStates.find((s) => s.taskId === t1.body.id).content === 'const x = 1;\nlet b', 'code restored after return');

// Disconnect without beacon → lock after grace period is covered by e2e tests (needs short grace).
const end = await emit(cand2, 'session:end', env(t2.body.id));
check(end.ok && end.data.status === 'ENDED', 'candidate ended session');
const final = await http('GET', `/sessions/${sid}/events?after=0&limit=500`, null, T);
console.log('   event log:', final.body.items.map((e) => e.eventType).join(' → '));
interviewer.close();
console.log('\nSMOKE PASSED');
process.exit(0);
