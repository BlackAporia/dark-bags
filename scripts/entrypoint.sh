#!/bin/sh
# Container entrypoint: give the data volume to the node user, then run as node (never root).
# Hosts mount volumes owned by root (Railway, Fly), which the node user could not write to.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p /data
  chown -R node:node /data 2>/dev/null || true
  exec su node -s /bin/sh -c 'exec "$0" "$@"' -- "$@"
fi
exec "$@"
