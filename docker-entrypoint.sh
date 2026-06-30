#!/bin/sh
set -e

mkdir -p /app/data/images /app/data/prompts
chown -R nextjs:nodejs /app/data

exec su-exec nextjs "$@"