# 0011 — Prisma 7 with the PostgreSQL driver adapter

- Status: Accepted
- Date: 13/11/2026

## Context
The API used Prisma 6.4 with the Rust query engine, which ships as a platform-specific native library. Self-hosting on linux-arm64 (for example single-board computers) makes native engines and `binaryTargets` a recurring source of friction. Prisma 7 drops the Rust query engine: queries are planned by a WebAssembly compiler and executed through a JavaScript driver adapter. It also moves the connection URL out of `schema.prisma` into `prisma.config.ts` and stops loading `.env` automatically.

## Decision
- Prisma 7.10.1 (latest stable 7.x; the `latest` npm tag currently points to an 8.0 release candidate) with `@prisma/adapter-pg` over `pg`.
- `PrismaService` builds a `PrismaPg` adapter from the validated `DATABASE_URL` (`AppConfig`).
- Generator: the new `prisma-client` generator with `output = "../src/generated/prisma"` and `moduleFormat = "cjs"`. It emits TypeScript that `nest build` compiles with the rest of `src`, so it follows our CommonJS build without extra steps, and the client lives with the code instead of inside `node_modules`. `prisma-client-js` is deprecated in v7. Code imports models, enums and the `Prisma` namespace from `src/generated/prisma/client`, never from `@prisma/client`.
- The generated directory is gitignored. `prisma generate` runs on `postinstall` and in `build`.
- `apps/api/prisma.config.ts` (the CLI's default location) loads `.env` via `dotenv/config` and passes `process.env.DATABASE_URL` rather than `env()`, so `prisma generate` also works without a database URL (for example while building an image). `prisma migrate deploy` needs no extra flags.
- Jest: the generated client loads the query-compiler WebAssembly with a dynamic `import()`, which Jest's VM rejects without `--experimental-vm-modules`. ts-jest therefore compiles with `module: commonjs` (dynamic imports become `require`), and `moduleNameMapper` strips the `.js` suffix from the generated relative imports.

## Consequences
- No native query engine at runtime; the API image needs only Node and `node_modules`. The Prisma CLI still downloads a native schema engine for migrations, so the image that runs `prisma migrate deploy` needs OpenSSL.
- Unique violations still surface as `PrismaClientKnownRequestError` with code `P2002`, for single queries, batch and interactive transactions (verified against PostgreSQL 16). `error.meta` now carries `driverAdapterError` details instead of `target`; nothing in the code reads it.
- A fresh checkout must run `prisma generate` (done by `pnpm install`) before typechecking or testing the API.
