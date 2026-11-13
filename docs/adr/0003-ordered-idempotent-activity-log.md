# 0003 — Ordered, idempotent, append-only activity log

- Status: Accepted
- Date: 12/11/2026

## Context
The spec requires event acknowledgements, duplicate prevention, ordering and recovery after disconnection. The timeline is the main review artefact, so a lost, duplicated or reordered event misleads the interviewer.

## Decision
- Every candidate message carries an envelope `{clientEventId (uuid), clientTimestamp, taskId}` and is acknowledged.
- The client keeps an **ordered outbox**: one message in flight, kept until acknowledged, and retried after a timeout or reconnect with the same `clientEventId`.
- `ActivityEvent` has a unique key `(sessionId, clientEventId)`. A retry returns the original `sequenceNumber`; for `editor:change`, duplicates are checked *before* the delta is applied.
- `sequenceNumber` is assigned inside a transaction that increments `InterviewSession.lastSequenceNumber` (row lock), plus a unique key `(sessionId, sequenceNumber)`.
- All work for one session runs through `SessionQueue` (an in-process promise chain), so document state and sequence numbers follow arrival order even when handlers are async.
- Server timestamps are authoritative; the client timestamp is kept for reference.
- The table is append-only: the code never updates events, and they are deleted only by retention.

## Consequences
- The timeline is total and gap-free per session, and retries are safe.
- One message in flight per candidate limits throughput. Typing batches keep this well below the per-socket rate limit (token bucket: 100 burst, 50/s).
- The outbox is in memory. Events not yet acknowledged when the page closes are lost (see ADR-0005: closing the page locks the session anyway).
