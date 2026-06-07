# Pineapple Poker

Open Face Chinese Pineapple Poker — a real-time, multiplayer card game built with React + Firebase.

[![CI](https://github.com/RobertCorey/pineapple-poker-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/RobertCorey/pineapple-poker-v2/actions/workflows/ci.yml)
[![Deploy](https://github.com/RobertCorey/pineapple-poker-v2/actions/workflows/deploy.yml/badge.svg)](https://github.com/RobertCorey/pineapple-poker-v2/actions/workflows/deploy.yml)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore_+_Functions-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com)
[![Play](https://img.shields.io/badge/play-pineapple--poker--8f3.web.app-22c55e?logo=googlechrome&logoColor=white)](https://pineapple-poker-8f3.web.app)

**[▶ Play](https://pineapple-poker-8f3.web.app)** · **[Roadmap](https://github.com/RobertCorey/pineapple-poker-v2/projects)** · **[Releases](https://github.com/RobertCorey/pineapple-poker-v2/releases)** · **[Issues](https://github.com/RobertCorey/pineapple-poker-v2/issues)**

## Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS
- **Backend**: Firebase Cloud Functions (Node.js/TypeScript)
- **Game Engine**: Dealer service (persistent Node.js process)
- **Database**: Firestore (real-time listeners)
- **Auth**: Firebase Anonymous Auth

## Project Structure

```
pineapple-poker/
├── frontend/     React app (ESM via Vite)
├── functions/    Cloud Functions (write-only endpoints)
├── dealer/       Dealer service (game state management)
├── shared/       Shared game logic (compiled into each workspace)
│   ├── core/     Types, constants, Firestore paths
│   └── game-logic/  Scoring, hand evaluation, deck, board utils
├── e2e/          Playwright E2E tests
└── scripts/      Dev workflow scripts
```

Uses npm workspaces with a single root lockfile.

## Development

Requires three terminals:

```bash
# Install all workspace dependencies
npm install

# Terminal 1: Firebase emulators
firebase emulators:start

# Terminal 2: Vite dev server
npm run dev

# Terminal 3: Dealer service
npm run dealer
```

Emulator ports: Auth 9099, Functions 5001, Firestore 8080, Hosting 5050, UI 4000.

## Testing

```bash
npm run test:unit   # shared game logic + dealer unit tests (no emulators)
npm test            # full Playwright E2E suite (needs emulators + dealer running)
```

## Building

```bash
npm run build              # Frontend
npm run build -w functions # Cloud Functions
npm run dealer:build       # Dealer
```

## Game Rules

- **Board**: 3 rows — top (3 cards), middle (5 cards), bottom (5 cards)
- **Initial deal**: 5 cards, place all 5
- **Streets 2-5**: Deal 3 cards, place 2, discard 1
- **Match**: 3 rounds; highest cumulative score wins
- **Foul**: Rows not in ascending strength (bottom >= middle > top) — penalty of 6 points per opponent
- **Scoring**: Pairwise row comparisons (+1/-1 per row), scoop bonus (+3 for winning all 3 rows), plus royalty bonuses for strong rows (scored as a net differential between the two players; void when either fouls)

## Project & contributing

This repo is set up to stay tidy and easy to follow:

- **CI** runs lint, builds, unit tests, and the Playwright E2E suite on every PR (see the badges above).
- **Roadmap** — what's planned / in progress lives on the [project board](https://github.com/RobertCorey/pineapple-poker-v2/projects).
- **Releases** — [release notes](https://github.com/RobertCorey/pineapple-poker-v2/releases) are drafted automatically from merged PRs by [Release Drafter](.github/release-drafter.yml).
- **Issues & PRs** use [templates](.github/ISSUE_TEMPLATE); PRs are auto-labeled by area, and **Conventional Commit** titles (`feat:`, `fix:`, `perf:`, `docs:`, `chore:`) drive the release notes and version bump.
- **Dependencies** are kept current by [Dependabot](.github/dependabot.yml).

See [`CLAUDE.md`](CLAUDE.md) for the full architecture, dev workflow, and CI/CD details.
