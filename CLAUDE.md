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
firebase emulators:start          # auth=9099, functions=5001, firestore=8080, hosting=5050, UI=4000

# Install all workspaces
npm install                       # One command installs all workspace deps
```

## Testing

### Unit tests (no emulators needed)

```bash
npm run test:unit                  # Shared logic + frontend + dealer unit tests
npm run test:dealer:unit           # Dealer unit tests only (dealer/src/dealer.test.ts)
```

Dealer unit tests (`dealer/src/dealer.test.ts`) use mocked Firestore and vitest fake timers to verify:
- Timer management: deadline-aware create/reset/clear behavior
- Phase reactions: correct game-engine function called per phase
- Timeout callbacks: correct sequencing (e.g. handlePhaseTimeout before checkAndAdvance)

Shared logic tests (`shared/`) use vitest to verify scoring, hand evaluation, and board utils.

Frontend unit tests (`frontend/vitest.config.ts`, run from repo root) cover the single-player Saloon engine (`frontend/src/saloon/engine.test.ts` — shared-deck dealing, turn order, street advancement, scoring, match flow, bot-play legality) plus audio intensity.

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

`e2e/` has 12 specs. The default `npm test` suite runs 10 (`bot` + `stress` are always ignored via `playwright.config.ts`; production runs additionally ignore `scoring` + `sit-out`):
- `00-warmup.spec.ts` — absorbs the worker browser's one-time cold-start cost
- `happy-path.spec.ts` — 2-player full 3-round match, play again
- `card-placement.spec.ts` — card placement UI, auto-submit, auto-discard
- `card-placement-undo.spec.ts` — tap a placed (unsubmitted) card to take it back
- `sit-out.spec.ts` — timeout auto-places cards; player stays active next round
- `leave-game.spec.ts` — player leaves mid-round, game continues for remaining player
- `resume-game.spec.ts` — player who lost the room URL rejoins via home-screen banner
- `observer.spec.ts` — late joiner observes full match, promoted via play-again, 3-player game
- `scoring.spec.ts` — foul penalty scores (+6/-6), pairwise breakdown, cumulative totals
- `saloon.spec.ts` — single-player Saloon mode: campaign map gating, turn-based hand vs bot (client-only, no emulator state)
- `bot.spec.ts`, `stress.spec.ts` — always ignored by config (manual / load testing)


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
- **Project**: `pineapple-poker-8f3` — live at https://pineapple-poker-8f3.web.app (emulators for local dev)
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
| `functions/src/` | Cloud Functions backend (player + admin callables) | CommonJS |
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

**Cloud Functions** (`functions/src/`) — 10 callables + 1 scheduled. Player-facing ones require `roomId` in request data.

Player actions (`player-actions.ts`):
1. **joinGame** — creates room (if `create: true`) or adds player to existing room
2. **leaveGame** — removes player entirely
3. **placeCards** — validates & applies card placements
4. **startMatch** — host starts the match (optionally passing `settings`)
5. **playAgain** — host restarts after match complete
6. **addBot** / **removeBot** — manage bot players

Admin (`admin-actions.ts`): **adminDeleteRoom**, **adminKickPlayer**, **adminKillAllGames** — all gated to the admin email.

Scheduled (`cleanup.ts`): **pruneOldGames** — deletes stale games on a timer.

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

Phases: `lobby` → `initial_deal` → `street_2` → `street_3` → `street_4` → `street_5` → `scoring` → `complete` / `match_complete`

### Match Settings

Configurable per-room via `MatchSettings` (stored in game doc as `settings`):
- `turnTimeoutMs` — timeout for all placement phases (default: 30s)
- `interRoundDelayMs` — delay between rounds (default: 5s)

Host sets settings in Lobby UI before starting. In dev mode, `?timeout=5000` URL param pre-fills the dropdown.

### Game Mode

Classic OFC Pineapple only: a 3-round match (`ROUNDS_PER_MATCH`). Unlike table OFC (max 3 players, turn-based, shared deck), this game deals each player their **own** shuffled 52-card deck and everyone places **simultaneously** against a shared street timer — which is what lets a room hold up to `MAX_PLAYERS` players with no waiting. Scoring is pairwise across all active players.

A roguelike "Pineapple Run" mode existed and was removed (#64). `GameState` keeps its fields (`runMode`, `charms`, `mutations`, etc. in `shared/core/types.ts`) and `GamePhase.CharmPick` as **vestigial optional schema fields** so old prod Firestore docs still parse; `playAgain` scrubs them. Nothing writes them anymore.

### Single-player Saloon mode ("The Frontier Trail")

A separate, fully client-side single-player campaign at `/?saloon=1` (linked from the home screen). This one IS **traditional table OFC**: one shared 52-card deck, turn-based placement clockwise from the button, max 3 seats (3 × 17 = 51 cards). Old-West theme: a ladder of 5 locales (`frontend/src/saloon/campaign.ts`) with named bot characters in 3 skill tiers (greenhorn/gunslinger/outlaw — implemented as score jitter on the bot strategy), rising stakes ($/point), and a localStorage bankroll/unlock progression (`saloon_progress_v1`).

Everything lives in `frontend/src/saloon/` and touches **no Firebase**: game logic is **vendored** (copied, not imported) from `shared/` and `dealer/src/bot-strategy.ts` into `frontend/src/saloon/vendor/` so the mode stays decoupled from the multiplayer stack. The turn-based engine is `frontend/src/saloon/engine.ts` (pure state-transition functions, unit-tested). If you fix a bug in shared scoring/hand-eval, check whether the vendored copy needs the same fix.

### Timeout = Auto-Place

When phaseDeadline passes, timed-out players get cards auto-placed randomly into available board slots. Player stays active for remaining streets.

### Scoring

- +1/-1 per row won/lost
- +3 scoop bonus (sweep all 3 rows)
- -6 foul penalty per opponent (timeout or bad row ordering)
- Royalties: bonus points for strong rows, scored as a net differential (A's royalties minus B's) per pairwise comparison. Tables live in `shared/core/constants.ts` (top pair/trips, middle, bottom). Neither player's royalties count when either fouls.

### Observer mode

Players who join mid-round become observers (added to `players` but NOT `playerOrder`). They watch the current match and are promoted to active players when `playAgain` starts a new match (not between rounds within the same match).

### Frontend patterns

- URL-based room routing: `/?room=ABCD12` query param, no routing library
- `RoomSelector` → Create Room / Join Room → `Lobby` → `MobileGamePage`
- State comes from real-time Firestore listeners via hooks (`useGameState(roomId)`, `usePlayerHand(uid, roomId)`, `useAuth`)
- No global state management — hooks + component state only
- `App.tsx` manages `roomId` URL state, routes between `RoomSelector` / `Lobby` / `MobileGamePage`
- Seat recovery: while seated, the room code persists to localStorage (`useResumableGame`); the home screen offers a "Rejoin" banner if the saved game still exists and the uid still has a seat
- Card placement UI state (selections, placements, discards) lives in `MobileGamePage` component state
- Cloud Functions called via `httpsCallable` from firebase/functions SDK — all include `roomId`
- Frontend imports shared code via `@shared/` alias (e.g., `import type { Card } from '@shared/core/types'`)

- `PlayerBoard` shows `RowEval` labels on completed rows using hand-evaluation functions

### Emulators

Emulator connections activate only when `import.meta.env.DEV` is true (in `frontend/src/firebase.ts`). Ports: auth=9099, functions=5001, firestore=8080, hosting=5050, UI=4000.

The Firebase emulators require a **JDK 21+**. `scripts/dev-up.sh` auto-detects a Homebrew `openjdk` if `java` isn't on PATH. In DEV, Firestore is initialized with `experimentalForceLongPolling` because the emulator's WebChannel streaming is flaky (intermittently drops the first listener snapshot); production keeps the default streaming transport.

### E2E reliability

All e2e specs share one dealer + one emulator, so Playwright runs **serially** (`workers: 1` in `playwright.config.ts`) — parallel workers starved the shared backend and flaked the heavy specs. `e2e/00-warmup.spec.ts` runs first to absorb the worker browser's one-time cold-start cost.

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
- **Scoring**: pairwise row comparisons + scoop bonus (3 pts for winning all 3 rows) + royalties (net differential per comparison; void when either player fouls)

## CI/CD & Deployment

### Continuous Integration (CI)
Runs on every PR and push to `main` (`.github/workflows/ci.yml`).
- **Check**: Lint, build all workspaces, unit tests.
- **E2E**: Runs Playwright tests against **Firebase Emulators**. ensuring no regression before merge.

### Deployment
Automatic deployment on merge to `main` (`.github/workflows/deploy.yml`).
- **Selective Deploy**: Checks changed files to determine if Frontend/Functions (Firebase) or Dealer (VM) needs deployment.
- **Firebase**: Deploys Hosting & Functions to `pineapple-poker-8f3`.
- **Dealer**: Deploys to GCE VM via SSH + rsync, restarts systemd service.
- **Smoke Test**: Runs Playwright E2E tests against **Production** URL after deployment to verify live system health.
