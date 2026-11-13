# 0002 — Server-authoritative document sync via Monaco deltas (no CRDT)

- Status: Accepted
- Date: 12/11/2026

## Context
Only the candidate edits; the interviewer only observes. The spec rules out CRDT/Yjs. The interviewer must see changes almost instantly, the backend is the source of truth, and the system must recover after reconnects without losing or duplicating edits.

## Decision
- The client sends Monaco `IModelContentChange` deltas, batched for about 150 ms (and flushed at once before copy, cut and paste), as `editor:change {fromVersion, toVersion, edits[]}`. Each Monaco event becomes one edit with a `source` (`input | paste | undo | redo`).
- The application keeps its own version counter per (session, task): +1 per Monaco event, continuing from the server's version after a reconnect. Monaco's `versionId` is not used because it resets when the page reloads.
- The server (`DocumentStateService`) keeps documents in memory and applies each delta only if `fromVersion` equals the current version. It records the deleted text, persists `SessionTaskState` with a ~2 s debounce, and broadcasts the delta to observers.
- On a version mismatch, the server answers `RESYNC` with its version. The client drops queued changes for that task and sends `editor:resync` with the full live content and `docVersion = max(local, server + 1)`. Versions never decrease.
- The monitor applies deltas with the shared `applyEdits`. If the delta doesn't fit, it re-joins to get the full state.
- Documents are LF-only.

## Consequences
- Bandwidth is small and the interviewer sees changes in under 200 ms. The stored deltas are enough for a future replay feature.
- Simpler than a CRDT, but it relies on a single writer. Collaborative editing would need a different design.
- The client outbox sends one message at a time (with ack) so that order is preserved. Throughput is bounded by round-trip time, which is fine because of batching.
