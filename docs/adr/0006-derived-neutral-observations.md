# 0006 — Observations are derived on demand and worded neutrally

- Status: Accepted
- Date: 12/11/2026

## Context
The spec asks for correlation and analysis: large pastes, rapid insertion, copy→paste matches, frequent tab switching and long inactivity. These must be shown as observations, never as evidence of cheating. The browser cannot tell where external text came from.

## Decision
- Rules are pure functions (`activity/insights.ts`), and every threshold lives in `insights.config.ts`.
- Live: after recording a relevant event, the rules run against a bounded history window and push `insight:detected`.
- Review: `GET /sessions/:id/insights` recomputes everything from the log using the same code.
- Observations are not persisted. Their IDs are deterministic (`type:seq`).
- Copy→paste similarity: exact = 100, whitespace-only differences = 99, otherwise bigram Sørensen–Dice.
- Typed and pasted text are told apart by the per-edit `source`, so pastes don't inflate “rapid insertion”.
- Messages describe what happened (“no matching copy recorded inside the editor; the source is unknown”). The UI states that observations are context, not evidence.

## Consequences
- Thresholds can be tuned and past sessions are re-evaluated automatically.
- Recomputing on every review is O(events) and fine at interview scale. Cache it if logs grow large.
