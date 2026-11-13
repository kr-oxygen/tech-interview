# 0001 — pnpm monorepo with shared zod contracts

- Status: Accepted
- Date: 12/11/2026

## Context
The frontend (React) and the backend (NestJS) exchange many REST DTOs and about 20 WebSocket events. If the two sides drift apart, things break silently: a renamed payload field means activity is lost without an error. The spec also requires server-side validation of every incoming event.

## Decision
- A single pnpm workspace: `apps/api`, `apps/web` and `packages/shared`.
- `packages/shared` defines zod schemas and the types inferred from them for REST bodies and WS payloads. It also holds event-name constants (`C2S`, `S2C`, `I2S`), enums and the pure `applyChanges`/`applyEdits` helpers.
- The API validates with these schemas (`ZodValidationPipe`, and per-event validation in the gateway) instead of `class-validator`.
- The API consumes the compiled CommonJS `dist/`. Vite aliases the package to its TypeScript source to get HMR and avoid CJS interop in the browser.

## Consequences
- One place to change a contract, and type errors appear on both sides.
- Client and server use the same delta-application code, so the interviewer's view matches the server state exactly.
- `@ti/shared` must be built before the API compiles (handled by the root scripts).
- NestJS Swagger decorators are not available out of the box. If OpenAPI is needed later, use `zod-to-openapi`.
