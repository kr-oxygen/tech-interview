# 0005 — Leaving the page locks the session; interviewer-controlled return

- Status: Accepted
- Date: 12/11/2026

## Context
The product owner wants it to be visible when a candidate closes the tab or navigates back, and wants the candidate unable to simply come back on their own. Browser crashes and network drops must not end an interview by accident, and browsers do not guarantee that unload events fire.

## Decision
- Client, best-effort:
  - `beforeunload` shows the native confirmation.
  - `pagehide` sends a `navigator.sendBeacon` (`text/plain`, so there is no CORS preflight) carrying the candidate JWT.
  - A sentinel `history.pushState` turns Back into a recorded `NAVIGATION_BACK` plus a warning, without navigating.
- The server locks the session (status `LOCKED`, `tv++`, `SESSION_LOCKED` event) when:
  - a `PAGE_UNLOAD` beacon arrives, or
  - the candidate's socket stays gone longer than `LOCK_GRACE_SECONDS` (default 30 s) without `session:end`. Socket.IO reconnects within the grace period don't lock.
- A locked candidate (or one reopening the old link) sees “Session paused”. The interviewer can **Allow return**, which issues a new one-time link. The code is restored from `SessionTaskState`. Or the interviewer can end the session.
- A reload counts as leaving. The consent screen states this explicitly.

## Consequences
- Every departure is visible in the timeline and as an observation, and is counted in `lockCount`.
- An accidental reload or crash needs the interviewer to act, which is the intended trade-off for control.
- Vite HMR full reloads during development also lock candidate sessions.

## Amendment (12/11/2026): returning through the same link

Issuing a fresh link on every return forced the interviewer to send a new URL each time. `allow-return` now re-arms the original invite token by default:

- The token stays one-time: it is cleared again on exchange, so a replayed link gets 410.
- It is valid only for a short window (`RETURN_LINK_TTL_MINUTES`, default 15), and only after an explicit action by the interviewer.
- All previously issued candidate JWTs stay revoked: `tv` was incremented when the session was locked.
- The session remains `LOCKED` until the exchange, so the interviewer can extend an expired window. The monitor shows "Return allowed until HH:MM".

Trade-off: the original URL is a longer-lived secret. It may sit in the candidate's mail, chat or browser history, and anyone holding it could use the re-armed window first. The interviewer would then see a resumed session that the real candidate cannot join. For that case `{ newLink: true }` rotates the token, and the old URL stops working.
