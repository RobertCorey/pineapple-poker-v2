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

E2E tests are in `e2e/`. They automatically clear emulator data between runs.

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

Single game at `games/current` with subcollections:
- `games/current` — public GameState (phase, players, boards, street, roundResults)
- `games/current/hands/{uid}` — private hand (only readable by owning player)
- `games/current/decks/{uid}` — server-only remaining deck (no client access)

### Game flow

**Cloud Functions** (write-only endpoints in `functions/src/`):
1. **joinGame** — creates game or adds player
2. **leaveGame** — removes player entirely
3. **placeCards** — validates & applies card placements

**Dealer service** (`dealer/src/`) — sole authority for all game state transitions:
- Listens to `games/current` via `onSnapshot`
- Starts rounds when >=2 players in Waiting
- Advances streets when all players have placed
- Handles timeouts with precise `setTimeout` (auto-fouls at exact deadline)
- Scores rounds and resets for next round
- Recovers from any state on restart (stateless — all state from Firestore)

Game engine in `dealer/src/game-engine.ts`:
- `maybeStartRound()` — shuffle decks, deal initial 5 (requires >=2 players)
- `advanceStreet()` — deal 3 cards per non-fouled player, advance phase
- `scoreRound()` — evaluate hands, pairwise scoring, fouls
- `resetForNextRound()` — promote observers, reset state
- `handlePhaseTimeout()` — auto-foul players who haven't placed
- `checkAndAdvance()` — check all placed and advance (recursive for all-fouled cases)

Phases: `waiting` → `initial_deal` → `street_2` → `street_3` → `street_4` → `street_5` → `scoring` → `complete`

### Timeout = Auto-Foul

When phaseDeadline passes, timed-out players get `fouled: true`, hand cleared, board cleared, game advances. Score: -6 per opponent.

### Scoring (simplified)

- +1/-1 per row won/lost
- +3 scoop bonus (sweep all 3 rows)
- -6 foul penalty per opponent (timeout or bad row ordering)
- No royalties

### Observer mode

Players who join mid-round become observers (added to `players` but NOT `playerOrder`). They watch the current round and are promoted to active players when the next round starts.

### Frontend patterns

- State comes from real-time Firestore listeners via hooks (`useGameState`, `usePlayerHand`, `useAuth`)
- No global state management — hooks + component state only
- `App.tsx` routes between `Lobby` (not joined) and `GamePage` (in game)
- Card placement UI state (selections, placements, discards) lives in `GamePage` component state
- Cloud Functions called via `httpsCallable` from firebase/functions SDK
- Frontend imports shared code via `@shared/` alias (e.g., `import type { Card } from '@shared/core/types'`)
- Dev-mode minimal UI: monospace font, minimal styling, raw phase/street display

### Emulators

Emulator connections activate only when `import.meta.env.DEV` is true (in `frontend/src/firebase.ts`). Ports: auth=9099, functions=5001, firestore=8080, hosting=5000, UI=4000.

## Critical: Firestore transaction ordering

Firestore transactions require ALL reads before ANY writes. The functions in `dealer/src/game-engine.ts` (`advanceStreet`, `scoreRound`) collect all subcollection reads into a Map first, then perform all writes. Interleaving reads and writes will cause runtime errors.

## Game rules reference

- **Board**: 3 rows — top (3 cards), middle (5 cards), bottom (5 cards)
- **Initial deal**: 5 cards, place all 5
- **Streets 2–5**: deal 3 cards, place 2, discard 1
- **Foul**: rows not in ascending strength (bottom ≥ middle > top) — penalty of 6 points per opponent
- **Scoring**: pairwise row comparisons + scoop bonus (3 pts for winning all 3 rows)
