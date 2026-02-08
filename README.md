# Pineapple Poker

Open Face Chinese Pineapple Poker — a multiplayer card game built with Firebase.

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

Emulator ports: Auth 9099, Functions 5001, Firestore 8080, Hosting 5000, UI 4000.

## Testing

E2E tests require the emulators and dealer to be running:

```bash
npm test
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
- **Foul**: Rows not in ascending strength (bottom >= middle > top) — penalty of 6 points per opponent
- **Scoring**: Pairwise row comparisons (+1/-1 per row), scoop bonus (+3 for winning all 3 rows)
