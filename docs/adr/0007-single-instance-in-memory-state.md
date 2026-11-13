# 0007 — Single API instance with in-memory realtime state

- Status: Accepted
- Date: 12/11/2026

## Context
The spec targets a single-instance deployment without Redis and asks to avoid premature complexity.

## Decision
The following live in API process memory:
- current documents (`DocumentStateService`);
- candidate presence and lock grace timers (`PresenceService`);
- per-session work serialisation (`SessionQueue`);
- Socket.IO rooms.

PostgreSQL holds everything durable: task states (debounced), snapshots and the event log.

## Consequences
- Simple and fast. After a restart, documents reload from `SessionTaskState`, so at most ~2 s of edits since the last persist are lost. Clients resend unacknowledged messages, and a version mismatch triggers resync.
- Grace timers do not survive a restart. A candidate who left during a restart is not auto-locked, but is still recorded as disconnected.
- Scaling out needs:
  - the Socket.IO Redis adapter;
  - sticky sessions or a shared document store;
  - a distributed per-session lock instead of `SessionQueue`;
  - distributed timers.

  Revisit this ADR before running more than one instance.
