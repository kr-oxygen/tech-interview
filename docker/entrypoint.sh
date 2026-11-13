#!/bin/sh
# Modes:
#   serve           start the app (default). Never migrates: a restart must not change the schema.
#   migrate         apply pending migrations (`prisma migrate deploy`) and exit.
#   migrate-status  report migration status; exits non-zero when migrations are pending.
# Anything else is executed as-is (e.g. `sh` for debugging).
set -e
cd /app
case "${1:-serve}" in
  serve)          exec node dist/main.js ;;
  migrate)        exec node_modules/.bin/prisma migrate deploy ;;
  migrate-status) exec node_modules/.bin/prisma migrate status ;;
  *)              exec "$@" ;;
esac
