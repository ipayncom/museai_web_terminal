#!/bin/bash
# Keep-alive for the web terminal bridge: start it if not running. Idempotent.
# Used by the background supervisor loop and by the scheduled keep-alive check.
DIR="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="$DIR/bridge.pid"
LOG="/tmp/bridge-keepalive.log"
cd "$DIR" || exit 1

# single supervisor at a time
exec 9>"$DIR/bridge.lock"
flock -n 9 || exit 0

if [ -f "$PIDFILE" ]; then
  PID=$(cat "$PIDFILE")
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    exit 0  # bridge alive, nothing to do
  fi
fi
rm -f "$PIDFILE"
touch "$LOG"
LINES=$(wc -l < "$LOG")
echo "$(date -u '+%FT%TZ') starting bridge" >> "$LOG"
nohup node "$DIR/bridge.js" >> "$LOG" 2>&1 < /dev/null &
echo $! > "$PIDFILE"
# wait up to 40s for READY (only in lines written after we started)
for i in $(seq 1 40); do
  sleep 1
  if tail -n +$((LINES+1)) "$LOG" 2>/dev/null | grep -q '^READY$'; then
    echo "$(date -u '+%FT%TZ') bridge READY (pid $(cat "$PIDFILE"))" >> "$LOG"
    exit 0
  fi
  PID=$(cat "$PIDFILE" 2>/dev/null)
  if [ -n "$PID" ] && ! kill -0 "$PID" 2>/dev/null; then
    echo "$(date -u '+%FT%TZ') bridge died during startup" >> "$LOG"
    exit 1
  fi
done
echo "$(date -u '+%FT%TZ') bridge did not become READY in 40s" >> "$LOG"
exit 1
