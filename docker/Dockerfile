# syntax=docker/dockerfile:1
# Single image for the whole app: NestJS API + built web app (served by the API) + Prisma CLI
# for the explicit migrate step. Build for the target platform, e.g.:
#   docker buildx build --platform linux/arm64 -f docker/Dockerfile -t tech-interview:<tag> --load .
# Everything (pnpm install, prisma generate, native modules) runs inside the Linux build stage,
# so nothing built on the host (macOS binaries) ends up in the image; see .dockerignore.

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm CI=true
RUN corepack enable
WORKDIR /repo

# Manifests first, so dependency layers are cached across code-only changes. The API's
# postinstall runs `prisma generate`, which needs the schema and config.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Self-contained production node_modules for the API (includes @ti/shared, prisma CLI + engines).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @ti/api deploy --prod --legacy /out


FROM ${NODE_IMAGE} AS runtime
# openssl: Prisma schema engine (migrations). wget: container healthcheck.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates wget \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    WEB_DIST_DIR=/app/web \
    MIGRATIONS_DIR=/app/prisma/migrations

COPY --from=build --chown=node:node /out/package.json ./
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
COPY --from=build --chown=node:node /repo/apps/api/prisma ./prisma
COPY --from=build --chown=node:node /repo/apps/api/prisma.config.ts ./
COPY --from=build --chown=node:node /repo/apps/web/dist ./web
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh

USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health > /dev/null || exit 1
ENTRYPOINT ["entrypoint.sh"]
CMD ["serve"]
