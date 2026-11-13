# 0010 — Snapshot strategy and data retention

- Status: Accepted
- Date: 12/11/2026

## Context
The spec asks for periodic snapshots rather than storing the whole document after every keystroke. It also asks for document versions for later reconstruction, and a defined retention policy for code, clipboard content and activity.

## Decision
- `CodeSnapshot` is written with these `reason`s:
  - `INITIAL`: version 0, when task states are created;
  - `PERIODIC`: every 30 s if changed;
  - `LARGE_CHANGE`: ≥200 characters touched in one message;
  - `TASK_SWITCH`;
  - `SESSION_END`;
  - `RESYNC`.

  `SessionTaskState` holds the current document per task (debounced ~2 s).
- Text events store full deltas plus the deleted text, so any version can be rebuilt from the nearest snapshot plus deltas (Phase 3).
- Retention: `RETENTION_DAYS` (default 90). A daily cron deletes events, snapshots and task states of sessions that are `ENDED`/`EXPIRED` and older than the cutoff. Session and candidate rows are kept. An hourly cron marks unused, expired invites as `EXPIRED`. The consent screen states the retention period.

## Consequences
- Storage grows with the number of edits (JSONB deltas). Snapshot compression (spec §8) is deferred until long interviews need it.
- Deleting an interview cascades to all of its data immediately.
