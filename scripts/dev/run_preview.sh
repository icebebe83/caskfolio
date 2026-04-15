#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${PREVIEW_PORT:-3008}"

existing_pids="$(lsof -tiTCP:${PORT} -sTCP:LISTEN -n -P 2>/dev/null || true)"
if [ -n "${existing_pids}" ]; then
  echo "Stopping existing preview server on port ${PORT}: ${existing_pids}"
  kill ${existing_pids} || true
  sleep 1
fi

cd "${ROOT_DIR}"
exec python3 scripts/dev/preview_server.py
