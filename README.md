# Tech Interview Platform

A browser-based platform for live technical interviews. The interviewer prepares tasks and sends the candidate a one-time link. While the candidate writes code in the browser, the interviewer watches the code change live and sees how it is being written.

## Features

- **Interviews and tasks.** JavaScript, TypeScript or Go tasks, each with starter code and a Markdown description. Candidates can be reused across sessions.
- **One-time invite links.** Only a hash of each token is stored. The candidate sees a consent screen that lists exactly what is recorded.
- **Live monitoring.** The interviewer has a read-only Monaco editor that follows the candidate's cursor, live connection and tab-visibility status, and a timer.
- **Activity timeline.** It records:
  - text changes;
  - copy, cut and paste, with the exact text;
  - selections;
  - copying from the task description or elsewhere on the page;
  - editor focus, tab visibility and idle periods.

  Clicking an event highlights the matching code.
- **Observations.** Neutral, rule-based notes, for example "pasted text matches an earlier copy", a large paste from outside the page, rapid insertion without a paste, frequent tab switching and long idle periods. They are observations, not verdicts.
- **Leaving the page pauses the session.** Closing or reloading the tab locks the session. The interviewer can let the candidate back in through the same link, and the code is kept.
- **Reliable sync.** Edits are versioned deltas with server-side resync. Events go through an outbox with acknowledgements and are deduplicated. Snapshots are stored periodically and on large changes.
- **React-ready editor.** TSX/JSX support with React typings.
- **Go support.** Go tasks get syntax highlighting and tab indentation. There are no diagnostics, IntelliSense or formatter for Go (Monaco ships none).

The full event history and code snapshots are stored, so a replay view can be built later.

## Stack

pnpm monorepo, TypeScript throughout.

| Package | Tech |
|---|---|
| `apps/api` | NestJS 11, Prisma 7 (PostgreSQL, `pg` driver adapter), Socket.IO |
| `apps/web` | React, Vite, MUI, Monaco, TanStack Query, Zustand |
| `packages/shared` | zod schemas and types shared by API and web: REST DTOs, WebSocket events, edit application |

## Quick start

Requirements: Node 22+, pnpm 10, Docker (for PostgreSQL).

```bash
pnpm install
pnpm db:up                                   # PostgreSQL 16 on localhost:5432
cp .env.example apps/api/.env                # then set JWT_SECRET (at least 32 characters)
pnpm --filter @ti/api exec prisma migrate dev
pnpm dev                                     # API on :3001, web on :5173
```

Open http://localhost:5173, register as an interviewer, create an interview with a task, start a session, and open the invite link in another browser (or a private window) as the candidate.

To run it on a server, see [`docs/self-hosting.md`](docs/self-hosting.md): one Docker image, an explicit migrate step, and a compose file for PostgreSQL.

To show a local instance to someone over the internet, use a tunnel such as ngrok or cloudflared. See "Sharing over the internet" in [`CLAUDE.md`](CLAUDE.md).

## Tests

```bash
pnpm typecheck
pnpm lint
pnpm test           # API unit tests (Jest) and web unit tests (Vitest)
pnpm test:api:e2e   # API end-to-end tests against the dev database
pnpm smoke          # scripted REST and WebSocket run against a running API
pnpm e2e            # Playwright: interviewer and candidate browsers, full flow
```

## Documentation

- [`CLAUDE.md`](CLAUDE.md): commands, layout, and the invariants to read before changing realtime code.
- [`docs/adr/`](docs/adr/): Architecture Decision Records.
- [`initial_spec.md`](initial_spec.md): the original product specification.

## Privacy

The platform records only what happens on the interview page, and the candidate is told exactly what before starting. It cannot see other applications or other browser tabs. Recorded data is deleted after `RETENTION_DAYS` (90 by default). If you run it for real candidates, you are responsible for your own legal basis and notice.

## Licence

[MIT](LICENSE)
