#!/usr/bin/env bash
set -euo pipefail

SESSION="pineapple"
DIR="$(cd "$(dirname "$0")/.." && pwd)"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Session '$SESSION' already running. Attach with: tmux attach -t $SESSION"
  exit 0
fi

# Create tmux session with 4 windows
tmux new-session -d -s "$SESSION" -n emulators -c "$DIR"
tmux send-keys -t "$SESSION:emulators" "firebase emulators:start" Enter

tmux new-window -t "$SESSION" -n vite -c "$DIR"
tmux send-keys -t "$SESSION:vite" "npm run dev" Enter

tmux new-window -t "$SESSION" -n dealer -c "$DIR"
tmux send-keys -t "$SESSION:dealer" "npm run dealer" Enter

tmux new-window -t "$SESSION" -n functions -c "$DIR"
tmux send-keys -t "$SESSION:functions" "npm run functions:watch" Enter

# Select the vite window by default
tmux select-window -t "$SESSION:vite"

echo "Dev stack started in tmux session '$SESSION'"
echo "  Attach:  tmux attach -t $SESSION"
echo "  Windows: emulators | vite | dealer | functions"
