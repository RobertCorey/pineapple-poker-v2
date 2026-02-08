#!/usr/bin/env bash
# Check that all 3 services required for E2E tests are running.
# Usage: ./scripts/check-services.sh

OK=true

# Firebase Emulator UI
if curl -sf http://localhost:4000 > /dev/null 2>&1; then
  echo "  Emulator UI (4000)    ✓"
else
  echo "  Emulator UI (4000)    ✗  → firebase emulators:start"
  OK=false
fi

# Firestore emulator
if curl -sf http://localhost:8080 > /dev/null 2>&1; then
  echo "  Firestore   (8080)    ✓"
else
  echo "  Firestore   (8080)    ✗  → firebase emulators:start"
  OK=false
fi

# Functions emulator (returns 404 at root, so just check for any HTTP response)
if curl -s -o /dev/null -w "%{http_code}" http://localhost:5001 2>/dev/null | grep -qE '^[0-9]+$'; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5001 2>/dev/null)
  if [ "$STATUS" != "000" ]; then
    echo "  Functions   (5001)    ✓"
  else
    echo "  Functions   (5001)    ✗  → firebase emulators:start"
    OK=false
  fi
else
  echo "  Functions   (5001)    ✗  → firebase emulators:start"
  OK=false
fi

# Vite dev server
if curl -sf http://localhost:5173 > /dev/null 2>&1; then
  echo "  Vite dev    (5173)    ✓"
else
  echo "  Vite dev    (5173)    ✗  → npm run dev"
  OK=false
fi

# Dealer — no HTTP endpoint, check if process is running
if pgrep -f "dealer" > /dev/null 2>&1; then
  echo "  Dealer                ✓"
else
  echo "  Dealer                ?  → npm run dealer (no HTTP port to check)"
fi

echo ""
if $OK; then
  echo "All services ready for E2E tests."
  exit 0
else
  echo "Some services are not running. Start them before running tests."
  exit 1
fi
