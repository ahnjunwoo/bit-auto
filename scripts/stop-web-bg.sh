#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
PID_FILE="$ROOT_DIR/logs/web.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "No pid file found at $PID_FILE"
  exit 0
fi

PID="$(cat "$PID_FILE")"
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  echo "Web stopped (pid $PID)"
else
  echo "Process not running (pid $PID)"
fi

rm -f "$PID_FILE"
