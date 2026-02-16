# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
# Three-terminal dev workflow:
# Terminal 1: firebase emulators:start
# Terminal 2: npm run dev
# Terminal 3: npm run dealer

# Frontend (workspace: frontend/)
npm run dev          # Vite dev server (connects to emulators in DEV mode)
npm run build        # tsc -b && vite build → outputs to frontend/dist/
npm run lint         # ESLint

# Cloud Functions (workspace: functions/)
npm run build -w functions        # Compile TS → functions/lib/
npm run build:watch -w functions  # Watch mode (or: npm run functions:watch)

# Dealer (workspace: dealer/)
npm run dealer:build              # Compile TS → dealer/lib/
npm run dealer                    # Run dealer process (connects to Firestore emulator)

# Firebase Emulators
firebase emulators:start          # auth=9099, functions=5001, firestore=8080, hosting=5000, UI=4000

# Install all workspaces
npm install                       # One command installs all workspace deps
```

## Testing

### Unit tests (no emulators needed)

```bash
npm run test:unit                  # Shared logic + dealer unit tests
npm run test:dealer:unit           # Dealer unit tests only (dealer/src/dealer.test.ts)
```

Dealer unit tests (`dealer/src/dealer.test.ts`) use mocked Firestore and vitest fake timers to verify:
- Timer management: deadline-aware create/reset/clear behavior
- Phase reactions: correct game-engine function called per phase
- Timeout callbacks: correct sequencing (e.g. handlePhaseTimeout before checkAndAdvance)

Shared logic tests (`shared/`) use vitest to verify scoring, hand evaluation, and board utils.

### Integration tests (requires Firestore emulator)

```bash
# Terminal 1:
firebase emulators:start

# Terminal 2:
npm run test:dealer:integration    # Game-engine guard tests (dealer/src/game-engine-guards.test.ts)
```

Integration tests run against the Firestore emulator and verify game-engine functions bail out safely in wrong phases/states.

### E2E tests (requires emulators + dealer + frontend)

```bash
# Terminal 1:
firebase emulators:start

# Terminal 2:
npm run dealer

# Terminal 3:
npm test                           # Playwright E2E tests
```

E2E tests are in `e2e/`. Each test generates a unique room code for isolation — no shared state between tests.

7 tests in the main suite (`npm test`):
- `happy-path.spec.ts` — 2-player full 3-round match, play again
- `card-placement.spec.ts` — card placement UI, auto-submit, auto-discard
- `sit-out.spec.ts` — timeout auto-foul, player active next round
- `leave-game.spec.ts` — player leaves mid-round, game continues for remaining player
- `observer.spec.ts` — late joiner observes full match, promoted via play-again, 3-player game
- `scoring.spec.ts` — foul penalty scores (+6/-6), pairwise breakdown, cumulative totals
- `dev-ui.spec.ts` — debug panel toggle, hand summary, row evaluation labels, pairwise display

### All dealer tests

```bash
npm run test:dealer                # Unit + integration (requires Firestore emulator)
```

## Architecture

**Open Face Chinese Pineapple Poker** — multiplayer human game using Firebase.

### Stack
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS
- **Backend**: Firebase Cloud Functions (Node.js/TypeScript)
- **Database**: Firestore (real-time listeners)
- **Auth**: Firebase Anonymous Auth
- **Project**: `pineapple-poker-8f3` — emulator-only for now
- **Monorepo**: npm workspaces with single lockfile

### npm Workspaces

This repo uses npm workspaces. All dependencies are managed from the root `package.json`:

```
pineapple-poker (root workspace)
├── frontend/     → React app (ESM via Vite)
├── functions/    → Cloud Functions (CommonJS)
├── dealer/       → Dealer service (CommonJS)
└── shared/       → Game logic (compiled into each workspace)
```

- Single `package-lock.json` at root — no sub-lockfiles
- `npm install` at root installs all workspace deps
- Run workspace scripts: `npm run <script> -w <workspace>`

### Four codebases share one repo

| Directory | Purpose | Module system |
|-----------|---------|---------------|
| `frontend/src/` | React frontend | ESM (Vite) |
| `functions/src/` | Cloud Functions backend (write-only endpoints) | CommonJS |
| `dealer/src/` | Dealer service (game advancement, timeouts) | CommonJS |
| `shared/` | Game logic used by all three | Compiled into each |

The `shared/` directory is imported by all three: frontend uses `@shared` alias (vite.config.ts + tsconfig paths), functions and dealer use TypeScript `paths` + `rootDirs`. When editing shared code, all three must be rebuilt.

### Firestore data model

Each game room is a document at `games/{roomId}` with subcollections:
- `games/{roomId}` — public GameState (phase, players, boards, street, roundResults)
- `games/{roomId}/hands/{uid}` — private hand (only readable by owning player)
- `games/{roomId}/decks/{uid}` — server-only remaining deck (no client access)

Room IDs are 6-char alphanumeric codes (no ambiguous chars I/O/0/1). Multiple games run concurrently in separate rooms.

### Game flow

**Cloud Functions** (write-only endpoints in `functions/src/`):
All functions require `roomId` in request data.
1. **joinGame** — creates room (if `create: true`) or adds player to existing room
2. **leaveGame** — removes player entirely
3. **placeCards** — validates & applies card placements
4. **startMatch** — host starts the match
5. **playAgain** — host restarts after match complete

**Dealer service** (`dealer/src/`) — sole authority for all game state transitions:
- Listens to entire `games` collection via `onSnapshot` (collection listener)
- Maintains per-room state Map with independent timers per room
- Starts rounds when >=2 players in Waiting
- Advances streets when all players have placed
- Handles timeouts with precise `setTimeout` (auto-fouls at exact deadline)
- Scores rounds and resets for next round
- Recovers from any state on restart (stateless — all state from Firestore)

Game engine in `dealer/src/game-engine.ts` — all functions take `(db, roomId)`:
- `maybeStartRound(db, roomId)` — shuffle decks, deal initial 5 (requires >=2 players)
- `advanceStreet(db, roomId)` — deal 3 cards per non-fouled player, advance phase
- `scoreRound(db, roomId)` — evaluate hands, pairwise scoring, fouls
- `resetForNextRound(db, roomId)` — promote observers, reset state
- `handlePhaseTimeout(db, roomId)` — auto-foul players who haven't placed
- `checkAndAdvance(db, roomId)` — check all placed and advance (recursive for all-fouled cases)

Phases: `waiting` → `initial_deal` → `street_2` → `street_3` → `street_4` → `street_5` → `scoring` → `complete`

### Timeout = Auto-Foul

When phaseDeadline passes, timed-out players get `fouled: true`, hand cleared, board cleared, game advances. Score: -6 per opponent.

### Scoring (simplified)

- +1/-1 per row won/lost
- +3 scoop bonus (sweep all 3 rows)
- -6 foul penalty per opponent (timeout or bad row ordering)
- No royalties

### Observer mode

Players who join mid-round become observers (added to `players` but NOT `playerOrder`). They watch the current match and are promoted to active players when `playAgain` starts a new match (not between rounds within the same match).

### Frontend patterns

- URL-based room routing: `/?room=ABCD12` query param, no routing library
- `RoomSelector` → Create Room / Join Room → `Lobby` → `GamePage`
- State comes from real-time Firestore listeners via hooks (`useGameState(roomId)`, `usePlayerHand(uid, roomId)`, `useAuth`)
- No global state management — hooks + component state only
- `App.tsx` manages `roomId` URL state, routes between `RoomSelector` / `Lobby` / `GamePage`
- Card placement UI state (selections, placements, discards) lives in `GamePage` component state
- Cloud Functions called via `httpsCallable` from firebase/functions SDK — all include `roomId`
- Frontend imports shared code via `@shared/` alias (e.g., `import type { Card } from '@shared/core/types'`)
- Dev-mode minimal UI: monospace font, minimal styling, raw phase/street display
- `DebugPanel` sidebar: toggleable via [DBG] button, shows game state, player statuses, phase info
- `handDescription.ts` utility: human-readable hand labels (e.g., "Pair (K)", "Flush (A-high)")
- `PlayerBoard` shows `RowEval` labels on completed rows using hand-evaluation functions

### Emulators

Emulator connections activate only when `import.meta.env.DEV` is true (in `frontend/src/firebase.ts`). Ports: auth=9099, functions=5001, firestore=8080, hosting=5000, UI=4000.

## Critical: Firestore transaction ordering

Firestore transactions require ALL reads before ANY writes. The functions in `dealer/src/game-engine.ts` (`advanceStreet`, `scoreRound`) collect all subcollection reads into a Map first, then perform all writes. Interleaving reads and writes will cause runtime errors.

## Development Workflow

### 1. Write code locally

Create a feature branch off `main`:

```bash
git checkout main && git pull
git checkout -b feature/my-feature
```

Start the dev environment (pick one):

```bash
npm run dev:up              # tmux: 4 panes (emulators, vite, dealer, functions:watch)
npm run dev:up -- --bg      # background mode (logs in .logs/, stop with npm run dev:down)
```

Or manually in 3 terminals:

```bash
firebase emulators:start    # Terminal 1
npm run dev                 # Terminal 2
npm run dealer              # Terminal 3
```

If editing Cloud Functions, also run `npm run functions:watch` in a 4th terminal.

### 2. Test locally

Run the full test suite before pushing:

```bash
npm run test:unit           # Unit tests (no emulators needed)
npm test                    # E2E tests (requires dev environment running)
```

E2E tests use unique room codes per test — no need to clear emulator state between runs.

### 3. Open a PR

Push your branch and open a PR against `main`:

```bash
git push -u origin feature/my-feature
gh pr create
```

CI runs two jobs in sequence:
1. **check** — lint, build all 3 workspaces, unit tests
2. **e2e** — starts Firebase emulators + Vite + dealer, runs full Playwright suite

Both jobs must pass before the PR can merge. Branch protection enforces this.

### 4. Merge to main

Squash-merge the PR (default). This triggers the **Deploy** workflow automatically.

### 5. Automatic deployment

The deploy workflow (`deploy.yml`) runs on every push to `main`:

1. **Change detection** — checks which files changed in the merge commit
2. **deploy-firebase** (conditional) — builds and deploys frontend + Cloud Functions to Firebase Hosting if `frontend/`, `functions/`, `shared/`, `firestore.rules`, or `firebase.json` changed
3. **deploy-dealer** (conditional) — builds and deploys dealer to GCE VM via rsync + systemd restart if `dealer/` or `shared/` changed
4. **smoke-test** — runs a subset of E2E tests against the live production URL

### 6. Verify production

The smoke test runs automatically after deploy. You can also check manually:

```bash
# Dealer health
gcloud compute ssh pineapple-dealer --zone us-central1-a --command "curl -sf http://localhost:8080/health"

# Dealer logs
gcloud compute ssh pineapple-dealer --zone us-central1-a --command "sudo journalctl -u pineapple-dealer -n 50 --no-pager"

# Run E2E against production
PRODUCTION_URL=https://pineapple-poker-8f3.web.app npx playwright test
```

### Rollback

If production breaks after deploy:

- **Firebase (frontend + functions)**: Revert the commit on `main` and push — deploy will redeploy the previous state. Or use `firebase hosting:rollback` for immediate hosting rollback.
- **Dealer**: SSH to VM and restart with previous build, or revert commit and let deploy re-run.
- **Emergency**: `firebase hosting:rollback` is instant and doesn't require CI.

### CI/CD architecture

```
PR opened/updated
  └─ ci.yml
       ├─ check (lint, build, unit tests)
       └─ e2e (emulators + Playwright) ← both required to merge

Merge to main
  └─ deploy.yml
       ├─ change detection
       ├─ deploy-firebase (if frontend/functions/shared changed)
       ├─ deploy-dealer (if dealer/shared changed)
       └─ smoke-test (E2E subset against production)
```

## Game rules reference

- **Board**: 3 rows — top (3 cards), middle (5 cards), bottom (5 cards)
- **Initial deal**: 5 cards, place all 5
- **Streets 2–5**: deal 3 cards, place 2, discard 1
- **Foul**: rows not in ascending strength (bottom ≥ middle > top) — penalty of 6 points per opponent
- **Scoring**: pairwise row comparisons + scoop bonus (3 pts for winning all 3 rows)
