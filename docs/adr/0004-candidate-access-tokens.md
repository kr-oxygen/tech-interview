# 0004 — One-time invite token exchanged for a session-bound candidate JWT

- Status: Accepted
- Date: 12/11/2026

## Context
Candidates have no accounts. The spec asks for unique, expiring links, protection against token reuse, secure WebSocket authentication, and candidates being unable to reach other sessions. Reconnection must still work.

## Decision
- The invite token is 32 random bytes (base64url). Only its SHA-256 hash is stored (`inviteTokenHash`), together with `inviteExpiresAt`. The link is shown to the interviewer once and can be reissued while it is unused.
- The candidate first sees a consent screen. `POST /candidate/sessions/exchange {token, consent: true}` then atomically sets `inviteConsumedAt` (conditional update) and returns a candidate JWT `{sub: sessionId, role: 'candidate', tv: candidateTokenVersion}`. A second exchange returns 410 `LINK_USED`.
- The JWT is kept in `sessionStorage` (per tab). It is used for the WS handshake and reconnects. The WS middleware checks role, session status and `tv`.
- Locking or ending a session increments `candidateTokenVersion`, which invalidates every issued token immediately.
- The interviewer logs in with email and password (argon2) and gets a JWT. Every interviewer resource is scoped by owner, and foreign IDs return 404.

## Consequences
- A leaked link is useless once it has been used. A leaked candidate JWT stops working after a lock or end.
- A duplicated browser tab copies `sessionStorage`. The newest socket wins and the older tab sees “Opened in another tab”.
- HTTPS/WSS is terminated at the reverse proxy in deployment, not in the app.
