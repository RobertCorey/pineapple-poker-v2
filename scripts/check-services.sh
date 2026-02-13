#!/usr/bin/env bash
# Check that all services required for E2E tests are running.
# Usage: ./scripts/check-services.sh [--wait [TIMEOUT]]

WAIT_MODE=false
TIMEOUT=60

# Parse args
while [ $# -gt 0 ]; do
  case "$1" in
    --wait)
      WAIT_MODE=true
      if [ "${2:-}" ] && [[ "$2" =~ ^[0-9]+$ ]]; then
        TIMEOUT=$2
        shift
      fi
      ;;
    *) echo "Usage: $0 [--wait [TIMEOUT]]"; exit 1 ;;
  esac
  shift
done

check_url() {
  curl -sf "$1" > /dev/null 2>&1
}

check_http_any() {
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$1" 2>/dev/null)
  [ "$code" != "000" ] && [ -n "$code" ]
}

run_checks() {
  local all_ok=true

  if check_url "http://localhost:8080"; then
    echo "  Firestore   (8080)    ✓"
  else
    echo "  Firestore   (8080)    ✗  → firebase emulators:start"
    all_ok=false
  fi

  if check_http_any "http://localhost:5001"; then
    echo "  Functions   (5001)    ✓"
  else
    echo "  Functions   (5001)    ✗  → firebase emulators:start"
    all_ok=false
  fi

  if check_url "http://localhost:4000"; then
    echo "  Emulator UI (4000)    ✓"
  else
    echo "  Emulator UI (4000)    ✗  → firebase emulators:start"
    all_ok=false
  fi

  if check_url "http://localhost:5173"; then
    echo "  Vite dev    (5173)    ✓"
  else
    echo "  Vite dev    (5173)    ✗  → npm run dev"
    all_ok=false
  fi

  if check_url "http://localhost:5555/health"; then
    echo "  Dealer      (5555)    ✓"
  else
    echo "  Dealer      (5555)    ✗  → npm run dealer"
    all_ok=false
  fi

  $all_ok
}

if [ "$WAIT_MODE" = true ]; then
  echo "Waiting for services (timeout: ${TIMEOUT}s)..."
  elapsed=0
  while true; do
    if run_checks 2>/dev/null; then
      echo ""
      echo "All services ready for E2E tests."
      exit 0
    fi
    if [ "$elapsed" -ge "$TIMEOUT" ]; then
      echo ""
      echo "TIMEOUT: Not all services started within ${TIMEOUT}s."
      echo "Run: npm run dev:up"
      exit 1
    fi
    sleep 2
    elapsed=$((elapsed + 2))
    echo "  ... retrying (${elapsed}s/${TIMEOUT}s)"
  done
else
  if run_checks; then
    echo ""
    echo "All services ready for E2E tests."
    exit 0
  else
    echo ""
    echo "Some services are not running. Run: npm run dev:up"
    exit 1
  fi
fi
