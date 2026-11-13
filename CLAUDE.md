# Tech Interview Platform

A browser-based platform for technical interviews. The interviewer creates interviews and tasks and sends the candidate a one-time link. The interviewer then watches the candidate's Monaco editor live: code, clipboard, selection, focus and tab visibility. Afterwards, the interviewer can review the recorded activity timeline. The source spec is `initial_spec.md`; architecture decisions are recorded in `docs/adr/`.

Scope implemented: spec Phase 1 + Phase 2 (MVP acceptance criteria, §13). Replay (Phase 3) is not built, but the data needed for it is recorded: full deltas in `ActivityEvent.payload.edits`, versioned `CodeSnapshot`s.

## Commands

```bash
pnpm install                    # also runs `prisma generate` (apps/api postinstall)
pnpm db:up                      # PostgreSQL 16 in Docker (localhost:5432)
cp .env.example apps/api/.env   # then set JWT_SECRET (≥32 chars)
pnpm --filter @ti/api exec prisma migrate dev
pnpm dev                        # shared (watch) + api :3001 + web :5173 (Vite proxies /api and /socket.io)

pnpm typecheck
pnpm lint
pnpm test                       # api unit (jest) + web unit (vitest)
pnpm test:api:e2e               # in-process Nest app against the dev DB (grace-period locking)
pnpm smoke                      # scripted REST+WS end-to-end against a running API
pnpm e2e                        # Playwright: interviewer + candidate browsers, full flow
```

Prisma 7 (ADR-0011): the CLI reads `apps/api/prisma.config.ts` (loads `apps/api/.env`, holds the datasource URL); the client is generated into `apps/api/src/generated/prisma` (gitignored, regenerated on install and `build`) and talks to PostgreSQL through `@prisma/adapter-pg`. Import models, enums and `Prisma` from `src/generated/prisma/client`, not `@prisma/client`.

`@ti/shared` must be built (`pnpm --filter @ti/shared build`) before the API compiles or runs; the API consumes `dist/`. The web app aliases it to `src/` (see `apps/web/vite.config.ts`, `tsconfig.app.json`).

## Layout

```
packages/shared   zod schemas + TS types: REST DTOs, WS event names/payloads, enums, applyEdits()
apps/api          NestJS modular monolith, Prisma (apps/api/prisma/schema.prisma), Socket.IO gateway
  src/modules/    auth, interviews, tasks, candidates, sessions, activity, snapshots, websocket,
                  realtime (broadcast facade + per-session queue), retention (cron)
apps/web          React + MUI + Monaco + TanStack Query (REST) + Zustand (live socket state)
  src/features/   auth, interviews, candidates, candidate (consent + workspace), monitoring, activity
e2e/              Playwright specs
docs/adr/         Architecture Decision Records
```

## Invariants — read before changing realtime code

- **Contracts live in `packages/shared`.** Change a WS payload or DTO there first; the API validates incoming data with those same zod schemas (`ZodValidationPipe`, `SessionGateway.on`).
- **Document versions:** each Monaco content-change event adds +1. `editor:change` carries `fromVersion`/`toVersion` and `toVersion = fromVersion + edits.length`. If `fromVersion` doesn't match the server's version, the server returns `RESYNC`, and the client replaces its queued changes with a single `editor:resync` (`candidateConnection.ts`). Versions never go backwards. Don't use Monaco's `versionId`.
- **Edits are applied in descending `rangeOffset` order** against the pre-edit text (`applyChanges` in shared). Documents are LF-only: `initialCode` is normalised in the zod schema and the candidate's models are forced to LF.
- **Activity log is append-only.** `sequenceNumber` is assigned under a row lock on the session (`ActivityService.record`). `(sessionId, clientEventId)` is unique, so retries are idempotent. Check `findDuplicate` before applying a change.
- **All per-session work is serialised** via `SessionQueue.run(sessionId, …)`. `start`, `end`, `lock` and `allowReturn` queue internally. The gateway queues editor, activity and task-switch handlers. **Never call a self-queuing service method from inside `queue.run`** for the same session: that deadlocks.
- **Candidate auth:** the invite token is stored only as a sha256 hash and exchanged once (conditional `updateMany`). The candidate JWT carries `tv` = `candidateTokenVersion`. Lock and end increment `tv`, which invalidates every issued token.
- **Leaving the page locks the session:** a `pagehide` beacon, or a socket gone longer than `LOCK_GRACE_SECONDS`. Only `POST /sessions/:id/allow-return` lets the candidate back in. By default it re-arms the *original* link for `RETURN_LINK_TTL_MINUTES` (still one-time); `{ newLink: true }` rotates the token instead. The session stays `LOCKED` until the candidate exchanges the link, and `exchange` then resumes it (`SESSION_RESUMED`). The paused candidate page polls and shows "Continue interview" once allowed. A reload also locks; this is intentional.
- **Single instance:** document state, presence, grace timers and session queues are in-memory. Running more than one API instance needs ADR-0007 to be revisited first.
- **Observations (insights) are derived**, not stored: `detectInsights`/`computeAllInsights` in `activity/insights.ts`, thresholds in `insights.config.ts`. Wording must stay neutral ("observation", never "cheating").
- **Task states exist from session creation** (`DocumentStateService.ensureTaskStates`, also called on exchange and monitor join; race-safe through the unique `(sessionId, taskId)`), so the monitor shows the starter code before the candidate opens the link.
- **Editor models are `.tsx`/`.jsx`/`.go`** (`modelPath` in `components/CodeEditor/languages.ts`, re-exported from `monacoSetup.ts`). JS/TS use `jsx: react-jsx` and the React typings from `@types/react` + `csstype`, loaded as extra libs. Go (`LANGUAGES` in shared) has Monaco syntax highlighting only: no diagnostics or IntelliSense, no formatter (`canFormat`), and tab indentation. Use `modelPath` for every Monaco model path; adding a language means updating the Prisma enum (migration), `LANGUAGES`/`LANGUAGE_LABELS` and `languages.ts`.
- Server-only `RealtimeService.disconnectCandidate` is deferred ~250 ms so the final ack/status reaches the client.

## Sharing over the internet (tunnel)

```bash
# apps/api/.env: PUBLIC_WEB_URL=https://<name>.ngrok-free.app  (used in invite links)
pnpm share                      # builds everything; API on :3001 + `vite preview` on :4173 (same /api + /socket.io proxy)
ngrok http 4173                 # or: cloudflared tunnel --url http://localhost:4173
```

One tunnel is enough because the web server proxies the API and WebSocket. Allowed tunnel hosts are listed in `apps/web/vite.config.ts` (`allowedHosts`).

## Production (Docker)

One image (`docker/Dockerfile`) holds the API, the built web app and the Prisma CLI. The API serves `apps/web/dist` when `WEB_DIST_DIR` is set (`common/web-static.ts`), so web, `/api` and `/socket.io` share one origin. Full guide: `docs/self-hosting.md`; decision: ADR-0012.

- **Migrations are an explicit step** (`docker/entrypoint.sh migrate`), never run on start. In production the app refuses to start with pending migrations (`prisma/migration-check.ts`).
- **Migrations must be backward compatible**: the previous image must run on the new schema. Add nullable or defaulted columns; rename or drop across two releases; never change a type in place.
- **Rate limits** are per client IP (`ClientIpThrottlerGuard`: `CLIENT_IP_HEADER`, else `req.ip` with `TRUST_PROXY`). Auth limits are strict only when `NODE_ENV=production` (`common/auth-throttles.ts`).
- `GET /api/health` is public and returns only `{ status, activeSessions }`.
- In e2e tests that need static serving, create the app with `NestFactory`. `Test.createTestingModule` has no HTTP adapter when serve-static picks its loader, so it would serve nothing.

## Conventions

- British English in docs, comments and UI copy. Dates in the UI use DD/MM/YYYY (`lib/format.ts`).
- Interviewer-facing REST endpoints use `InterviewerAuthGuard` and return 404 (not 403) for resources the interviewer doesn't own.
- Web: server data → TanStack Query hooks in `features/*/api.ts` with keys from `services/api/queryKeys.ts`. Socket-driven state → Zustand stores. Socket handlers invalidate query keys rather than duplicating REST data.
- Browser storage is wrapped in `lib/storage.ts` (it can throw). The candidate JWT lives in `sessionStorage` (per tab); the interviewer token lives in `localStorage`.
- `erasableSyntaxOnly` is on in the web app: no TS enums or constructor parameter properties.
- Prisma schema changes: `pnpm --filter @ti/api exec prisma migrate dev --name <change>`, then `pnpm --filter @ti/api exec prisma generate` (Prisma 7 no longer generates on migrate). Unique violations are still `P2002` with the pg adapter, but `error.meta.target` is no longer populated.

## Known gaps / next steps

- Phase 3 replay UI (data is already recorded). Timeline highlights currently point at the *current* code.
- The outbox is in memory only: events that were not yet acknowledged when the page closes are lost.
- No auto-end when the timer runs out (it shows overtime); the interviewer ends the session.
- The web bundle includes all of Monaco (~4 MB); route-level code splitting would help.
- Snapshot compression for long interviews (spec §8) is not implemented.
