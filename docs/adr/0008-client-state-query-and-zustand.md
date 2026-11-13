# 0008 — TanStack Query for REST data, Zustand for live socket state

- Status: Accepted
- Date: 12/11/2026

## Context
The spec names Zustand for frontend state. The interviewer UI has about ten CRUD screens with lists, search, invalidation after mutations and a paged timeline, plus a live view driven by WebSocket events.

## Decision
- **TanStack Query** for everything fetched over REST: interviews, tasks, candidates (search with debounce via `useDeferredValue`), sessions, `/auth/me`, insights, and the timeline history via `useInfiniteQuery` by `after=seq`. Hooks live in `features/*/api.ts` and keys in `services/api/queryKeys.ts`. Mutations invalidate keys.
- **Zustand** for socket-driven and client state: the candidate workspace (connection, session, versions, outbox size), the monitor (docs, live events and insights, highlight) and UI preferences (persisted editor theme and timeline filters).
- The two meet in socket handlers: `session:status`/`session:ended` call `setQueryData` and `invalidateQueries`. The monitor timeline is the history from Query merged with live events from Zustand, deduplicated by `sequenceNumber`. After a monitor reconnect, the history is refetched to fill the gap.

## Consequences
- No hand-written caching or loading state for REST, and live state stays out of the query cache.
- Two state libraries to learn. The boundary rule is simple: if it comes from REST, use Query; if it is pushed over the socket, use Zustand.
