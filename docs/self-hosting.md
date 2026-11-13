# Self-hosting

The app ships as **one Docker image**:
- the NestJS API;
- the built web app, which the API serves;
- the Prisma CLI, used for the explicit migrate step.

Web, REST (`/api`) and WebSocket (`/socket.io`) share one origin and port, so a single reverse-proxy rule or tunnel route is enough.

## Build

Build for the platform of the machine that will run the image.

```bash
docker buildx build --platform linux/arm64 -f docker/Dockerfile -t tech-interview:<tag> --load .   # e.g. a Raspberry Pi
docker buildx build --platform linux/amd64 -f docker/Dockerfile -t tech-interview:<tag> --load .   # x86 servers
```

Everything is installed and compiled **inside** the Linux build stage, including `pnpm install`, `prisma generate` and native modules. `.dockerignore` keeps the host's `node_modules` and `dist` out of the image. So building on macOS for a Linux target is safe.

To move the image to another machine without a registry:

```bash
docker save tech-interview:<tag> | gzip | ssh <host> 'gunzip | docker load'
```

## Run

On the server, put [`docker-compose.prod.yml`](../docker-compose.prod.yml) and a `.env.prod` in one directory. Make `.env.prod` from [`.env.prod.example`](../.env.prod.example) and `chmod 600` it.

```bash
export APP_TAG=<tag>
docker compose -f docker-compose.prod.yml run --rm app migrate-status   # non-zero exit: migrations pending
docker compose -f docker-compose.prod.yml run --rm app migrate          # apply them (explicit step)
docker compose -f docker-compose.prod.yml up -d
curl -s http://127.0.0.1:3001/api/health                                # {"status":"ok","activeSessions":0}
```

- The app listens on `127.0.0.1:${APP_PORT:-3001}`. Put a reverse proxy (nginx, Caddy) or a tunnel (`cloudflared`, ngrok) in front of it, with WebSockets enabled.
- Set `WEB_ORIGIN` and `PUBLIC_WEB_URL` to the public URL. Invite links use `PUBLIC_WEB_URL`.
- Behind a proxy, set `TRUST_PROXY=true`, and set `CLIENT_IP_HEADER` to the header that carries the real client IP: `cf-connecting-ip` for Cloudflare, `x-real-ip` for a typical nginx. Rate limits are per client IP, so without these every user shares one bucket. Only do this when the app port is reachable solely through the proxy; otherwise the header can be spoofed.
- Run exactly **one** app container. Document state, presence and timers are in memory (ADR-0007).
- `docker compose stop` gives the app 20 s to flush documents and snapshots.

## Migrations

- **The app never migrates on start.** Migrations are a separate deploy step: `run --rm app migrate`. A restart therefore never changes the schema.
- **A failed migration leaves the running version untouched**, because the old container keeps serving until the new one replaces it.
- **The app refuses to start when migrations are pending.** In production it compares `prisma/migrations` inside the image with the database at start-up. If they differ, it exits with an error naming the missing migrations.
- **Back up before migrating:**

  ```bash
  docker compose -f docker-compose.prod.yml exec -T db pg_dump -U interview -Fc interview > pre-<tag>.dump
  ```

- **Migrations must be backward compatible**, so the previous image keeps working on the new schema. It is still running while the migration applies, and rolling back means running it again.
  - Add columns as nullable or with a default.
  - Rename or drop in two releases: first stop using the column, then drop it.
  - Never change a column type in place.
- **Rollback** means deploying the previous tag (`APP_TAG=<previous> docker compose ... up -d`). Prisma has no down-migrations: fix a bad migration with a new forward migration. Restoring a dump is the last resort, and it loses data written since.

## Rate limits

In production (`NODE_ENV=production`):

| Endpoint | Limit |
|---|---|
| `register` | 5 per hour per IP |
| `login` | 10 per minute per IP |
| everything else | 300 per minute per IP |

Candidate endpoints have their own per-minute limits. Development and test environments use relaxed limits.

## Data

- Back up the `pgdata` volume regularly with `pg_dump`.
- The app deletes data from finished sessions after `RETENTION_DAYS`. Rotate your backups accordingly, so the retention period shown to candidates stays true.
