#!/usr/bin/env bash
set -e

# Prepare shared volume directories and symlinks
mkdir -p /app/data/output /app/data/cookies
[ -L /app/output ] || ln -s /app/data/output /app/output
[ -L /app/cookies ] || ln -s /app/data/cookies /app/cookies

exec node dist/server.js
