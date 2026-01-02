#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
LOG_FILE="$LOG_DIR/api.log"

mkdir -p "$LOG_DIR"

nohup pnpm -C "$ROOT_DIR/apps/api" dev >"$LOG_FILE" 2>&1 &
echo $! >"$LOG_DIR/api.pid"
echo "API started in background (pid $(cat "$LOG_DIR/api.pid")). Logs: $LOG_FILE"
