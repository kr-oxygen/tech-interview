# 0012 — Single image, single origin, explicit migrations

- Status: Accepted
- Date: 13/11/2026

## Context
The app is going to be self-hosted on small machines behind a tunnel or reverse proxy, with public registration. Production needs to serve the web app and the API together, with WebSockets. It also needs migrations that cannot take down a running version, and rate limits that still work when every request comes from the proxy.

## Decision
- **One image.** It contains the API, the built web app and the Prisma CLI. The API serves the web build through `@nestjs/serve-static` when `WEB_DIST_DIR` is set:
  - `/api/*` is excluded, so unknown API routes stay JSON 404s;
  - hashed `/assets` are cached as immutable, everything else is `no-cache`.
  - Web, REST and Socket.IO therefore share one origin and port. There is no CORS, no proxy configuration, and one tunnel route.
- **The image is built inside Linux for the target platform.** For example, `buildx --platform linux/arm64` on a Mac for a Raspberry Pi. Host build artefacts are excluded by `.dockerignore`.
- **Explicit migrations.**
  - The entrypoint has `serve` (the default), `migrate` and `migrate-status` modes. A deploy runs `migrate` with the new image as a one-off container while the old version keeps serving, then switches.
  - In production the app refuses to start when the image's migrations are not all applied.
  - Migrations must be backward compatible.
- **Client IP for rate limiting.** A `ThrottlerGuard` subclass uses `CLIENT_IP_HEADER` (for example `cf-connecting-ip`) or `req.ip` with `TRUST_PROXY`. Auth limits are strict only in production: `register` is 5 per hour per IP, because registration is public.
- **`GET /api/health`** reports database reachability and only a count of in-progress sessions, so deploy scripts can avoid restarting during an interview.

## Consequences
- A restart never changes the schema, and a failed migration leaves the running version untouched.
- The previous tag can be rolled back to without a schema rollback, but schema changes take two releases when they remove something.
- `prisma` and `dotenv` are runtime dependencies of the API, which adds about 50 MB to the image.
- Trusting `CLIENT_IP_HEADER` is only safe when the app port is reachable solely through the proxy. The compose file binds to loopback for this reason.
- In tests, static serving needs an app created with `NestFactory`.
