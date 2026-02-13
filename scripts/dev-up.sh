#!/usr/bin/env bash
set -euo pipefail

SESSION="pineapple"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
PIDS_DIR="$DIR/.pids"
LOGS_DIR="$DIR/.logs"

MODE="tmux"
SKIP_FUNCTIONS=false

# Parse args
for arg in "$@"; do
  case "$arg" in
    --bg) MODE="bg" ;;
    --no-functions) SKIP_FUNCTIONS=true ;;
    *) echo "Usage: $0 [--bg] [--no-functions]"; exit 1 ;;
  esac
done

PORTS=(8080 5001 9099 4000 5000 5173)

# ── Helpers ───────────────────────────────────────────────────────────────────

kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "  Killing stale process on port $port (PIDs: $pids)"
    echo "$pids" | xargs kill 2>/dev/null || true
  fi
}

wait_for_url() {
  local name=$1 url=$2 timeout=$3
  local elapsed=0
  while ! curl -sf "$url" > /dev/null 2>&1; do
    if [ "$elapsed" -ge "$timeout" ]; then
      echo "  TIMEOUT waiting for $name ($url) after ${timeout}s"
      return 1
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  echo "  $name ready (${elapsed}s)"
  return 0
}

wait_for_http_any() {
  # Like wait_for_url but accepts any HTTP response (including 404)
  local name=$1 url=$2 timeout=$3
  local elapsed=0
  while true; do
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
    if [ "$code" != "000" ] && [ -n "$code" ]; then
      echo "  $name ready (${elapsed}s)"
      return 0
    fi
    if [ "$elapsed" -ge "$timeout" ]; then
      echo "  TIMEOUT waiting for $name ($url) after ${timeout}s"
      return 1
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
}

wait_for_dealer() {
  local timeout=$1
  local elapsed=0
  while true; do
    if [ -f "$PIDS_DIR/dealer.pid" ] && kill -0 "$(cat "$PIDS_DIR/dealer.pid")" 2>/dev/null; then
      echo "  Dealer ready (${elapsed}s)"
      return 0
    elif pgrep -f "tsx.*dealer/src" > /dev/null 2>&1; then
      echo "  Dealer ready (${elapsed}s)"
      return 0
    fi
    if [ "$elapsed" -ge "$timeout" ]; then
      echo "  TIMEOUT waiting for Dealer after ${timeout}s"
      return 1
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
}

# ── Step 1: Kill stale processes on known ports ──────────────────────────────

echo "Cleaning stale processes..."
for port in "${PORTS[@]}"; do
  kill_port "$port"
done
# Kill stale dealer processes (no port to detect)
dealer_pids=$(pgrep -f "tsx.*dealer/src" 2>/dev/null || true)
if [ -n "$dealer_pids" ]; then
  echo "  Killing stale dealer processes"
  echo "$dealer_pids" | xargs kill 2>/dev/null || true
fi

# ── Step 2: Clean old PID files ──────────────────────────────────────────────

rm -rf "$PIDS_DIR"
mkdir -p "$PIDS_DIR"
mkdir -p "$LOGS_DIR"

# ── Start services ───────────────────────────────────────────────────────────

if [ "$MODE" = "bg" ]; then
  echo ""
  echo "Starting services in background mode..."

  # Emulators
  echo "  Starting Firebase emulators..."
  cd "$DIR" && firebase emulators:start > "$LOGS_DIR/emulators.log" 2>&1 &
  echo $! > "$PIDS_DIR/emulators.pid"

  # Wait for Firestore emulator before starting dealer (it needs Firestore)
  echo ""
  echo "Waiting for Firestore emulator..."
  if ! wait_for_url "Firestore emulator" "http://localhost:8080" 30; then
    echo "ERROR: Firestore emulator did not start. Check $LOGS_DIR/emulators.log"
    exit 1
  fi

  # Vite
  echo "  Starting Vite dev server..."
  cd "$DIR" && npm run dev > "$LOGS_DIR/vite.log" 2>&1 &
  echo $! > "$PIDS_DIR/vite.pid"

  # Dealer
  echo "  Starting Dealer..."
  cd "$DIR" && npm run dealer > "$LOGS_DIR/dealer.log" 2>&1 &
  echo $! > "$PIDS_DIR/dealer.pid"

  # Functions watch (optional)
  if [ "$SKIP_FUNCTIONS" = false ]; then
    echo "  Starting functions:watch..."
    cd "$DIR" && npm run functions:watch > "$LOGS_DIR/functions.log" 2>&1 &
    echo $! > "$PIDS_DIR/functions.pid"
  fi

else
  # ── tmux mode ────────────────────────────────────────────────────────────

  if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "Session '$SESSION' already running. Attach with: tmux attach -t $SESSION"
    exit 0
  fi

  echo ""
  echo "Starting services in tmux mode..."

  tmux new-session -d -s "$SESSION" -n emulators -c "$DIR"
  tmux send-keys -t "$SESSION:emulators" "firebase emulators:start" Enter

  tmux new-window -t "$SESSION" -n vite -c "$DIR"
  tmux send-keys -t "$SESSION:vite" "npm run dev" Enter

  tmux new-window -t "$SESSION" -n dealer -c "$DIR"
  tmux send-keys -t "$SESSION:dealer" "npm run dealer" Enter

  if [ "$SKIP_FUNCTIONS" = false ]; then
    tmux new-window -t "$SESSION" -n functions -c "$DIR"
    tmux send-keys -t "$SESSION:functions" "npm run functions:watch" Enter
  fi

  tmux select-window -t "$SESSION:vite"
fi

# ── Wait for all services to be healthy ──────────────────────────────────────

echo ""
echo "Waiting for all services..."

HEALTHY=true

wait_for_url "Firestore emulator" "http://localhost:8080" 30 || HEALTHY=false
wait_for_http_any "Functions emulator" "http://localhost:5001" 30 || HEALTHY=false
wait_for_url "Emulator UI" "http://localhost:4000" 30 || HEALTHY=false
wait_for_url "Vite dev server" "http://localhost:5173" 30 || HEALTHY=false
wait_for_dealer 15 || HEALTHY=false

echo ""
if $HEALTHY; then
  echo "All services ready."
  if [ "$MODE" = "tmux" ]; then
    echo "  Attach:  tmux attach -t $SESSION"
    if [ "$SKIP_FUNCTIONS" = false ]; then
      echo "  Windows: emulators | vite | dealer | functions"
    else
      echo "  Windows: emulators | vite | dealer"
    fi
  else
    echo "  Logs:    .logs/"
    echo "  PIDs:    .pids/"
    echo "  Stop:    npm run dev:down"
  fi
else
  echo "WARNING: Some services failed to start. Check logs."
  if [ "$MODE" = "bg" ]; then
    echo "  Logs: $LOGS_DIR/"
  fi
  exit 1
fi
