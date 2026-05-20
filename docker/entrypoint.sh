#!/bin/sh
set -e

BACKEND_DIR=/app/backend
DASHBOARD_DIR=/app/dashboard
DATA_DIR="${BACKEND_DIR}/data"

mkdir -p "${DATA_DIR}"
chown -R app:app "${DATA_DIR}"

cleanup() {
  if [ -n "${BACKEND_PID:-}" ]; then
    kill -TERM "${BACKEND_PID}" 2>/dev/null || true
  fi
  if [ -n "${DASHBOARD_PID:-}" ]; then
    kill -TERM "${DASHBOARD_PID}" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}
trap cleanup TERM INT

echo "[entrypoint] starting backend on :${BACKEND_PORT:-8085}"
cd "${BACKEND_DIR}"
su-exec app:app ./kiro-go &
BACKEND_PID=$!

echo "[entrypoint] starting dashboard on :${DASHBOARD_PORT:-8084}"
cd "${DASHBOARD_DIR}"
PORT="${DASHBOARD_PORT:-8084}" HOSTNAME=0.0.0.0 su-exec app:app node server.js &
DASHBOARD_PID=$!

wait -n "${BACKEND_PID}" "${DASHBOARD_PID}"
EXIT_CODE=$?
cleanup
exit "${EXIT_CODE}"
