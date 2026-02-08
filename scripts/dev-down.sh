#!/usr/bin/env bash
set -euo pipefail

SESSION="pineapple"

if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "No '$SESSION' session running."
  exit 0
fi

tmux kill-session -t "$SESSION"
echo "Dev stack stopped."
