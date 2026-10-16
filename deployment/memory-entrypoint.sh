#!/bin/sh
set -eu
cd /app
mkdir -p /app/data /app/config
chown nextjs:nodejs /app/data /app/config
# Migrations must succeed or the service must not start against a partial schema.
# No embedded default administrator, no tag rebuild on package version changes.
su-exec nextjs:nodejs node /app/migration-tools/node_modules/prisma/build/index.js migrate deploy --schema=/app/prisma/schema.prisma
exec su-exec nextjs:nodejs "$@"
