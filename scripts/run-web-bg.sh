#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
LOG_FILE="$LOG_DIR/web.log"

mkdir -p "$LOG_DIR"

nohup pnpm -C "$ROOT_DIR/apps/web" dev >"$LOG_FILE" 2>&1 &
echo $! >"$LOG_DIR/web.pid"
echo "Web started in background (pid $(cat "$LOG_DIR/web.pid")). Logs: $LOG_FILE"
