# Architecture Decision Records

Format: short [Nygard-style](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) records. Each ADR has a status, context, decision and consequences. Supersede an ADR with a new one rather than rewriting it.

| # | Title | Status |
|---|-------|--------|
| [0001](0001-monorepo-with-shared-contracts.md) | pnpm monorepo with shared zod contracts | Accepted |
| [0002](0002-server-authoritative-document-sync.md) | Server-authoritative document sync via Monaco deltas (no CRDT) | Accepted |
| [0003](0003-ordered-idempotent-activity-log.md) | Ordered, idempotent, append-only activity log | Accepted |
| [0004](0004-candidate-access-tokens.md) | One-time invite token exchanged for a session-bound candidate JWT | Accepted |
| [0005](0005-leaving-the-page-locks-the-session.md) | Leaving the page locks the session; interviewer-controlled return | Accepted |
| [0006](0006-derived-neutral-observations.md) | Observations are derived on demand and worded neutrally | Accepted |
| [0007](0007-single-instance-in-memory-state.md) | Single API instance with in-memory realtime state | Accepted |
| [0008](0008-client-state-query-and-zustand.md) | TanStack Query for REST data, Zustand for live socket state | Accepted |
| [0009](0009-candidate-as-entity.md) | Candidate as a first-class entity without an account | Accepted |
| [0010](0010-snapshots-and-retention.md) | Snapshot strategy and data retention | Accepted |
| [0011](0011-prisma-7-driver-adapter.md) | Prisma 7 with the PostgreSQL driver adapter | Accepted |
