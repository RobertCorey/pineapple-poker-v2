#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
PIDS_DIR="$DIR/.pids"
SESSION="pineapple"
PORTS=(8080 5001 9099 4000 5000 5173)

echo "Stopping dev services..."

# ── Layer 1: Kill tmux session ───────────────────────────────────────────────

if tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux kill-session -t "$SESSION"
  echo "  Killed tmux session '$SESSION'"
fi

# ── Layer 2: Kill tracked PID files ──────────────────────────────────────────

if [ -d "$PIDS_DIR" ]; then
  for pidfile in "$PIDS_DIR"/*.pid; do
    [ -f "$pidfile" ] || continue
    name=$(basename "$pidfile" .pid)
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      # Wait up to 3s for graceful shutdown
      for i in 1 2 3; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 1
      done
      # Force kill if still running
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
        echo "  Force-killed $name (PID $pid)"
      else
        echo "  Stopped $name (PID $pid)"
      fi
    else
      echo "  $name (PID $pid) already stopped"
    fi
  done
  rm -rf "$PIDS_DIR"
fi

# ── Layer 3: Kill known process patterns (no port to sweep) ──────────────────

dealer_pids=$(pgrep -f "tsx.*dealer/src" 2>/dev/null || true)
if [ -n "$dealer_pids" ]; then
  echo "$dealer_pids" | xargs kill 2>/dev/null || true
  echo "  Killed dealer processes"
fi

# ── Layer 4: Port sweep fallback ─────────────────────────────────────────────

for port in "${PORTS[@]}"; do
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill 2>/dev/null || true
    echo "  Killed stale process on port $port"
  fi
done

echo ""
echo "Dev stack stopped."
