# Brainstorm

Ideas and future directions for Pineapple Poker.

## Sound & Haptics

- Card interaction sounds: tap to select, place on row, discard
- Tile/chip sounds on score tallying
- Subtle haptic feedback on mobile (if PWA supports it)

## Animations & Visual Polish

### Between-Rounds Score Screen
- Slot machine mechanic for revealing scores — numbers spin/roll into place
- Build suspense before showing final round delta
- More detail on this concept exists elsewhere (TODO: link or inline)

### End-of-Match Screen
- Same slot machine energy but bigger/more dramatic
- Cumulative score reveal with fanfare

### Royalties (Visual)
- Visual indicator when a player hits a royalty hand (flush, full house, quads, etc.)
- Glow, shimmer, or badge on the row that qualifies
- Ties into scoring once royalty rules are implemented

### Opponent Interaction Visualization
- "Sending troops" concept: when pairwise comparisons happen, animate something flowing between player boards (arrows, chips, sparks?)
- Makes the head-to-head scoring feel visceral instead of just numbers

### Opponent Sorting & Ranking
- Sort opponent boards by current standing (leader at top/left)
- Crown or highlight for the player in first place
- Maybe podium-style layout on score screens

## Gameplay Features

### Royalties (Rules)
- Implement royalty scoring bonuses (e.g., flush in top = X points)
- Need to decide on which royalty table to use (American vs Fantasy variant)

## Release & Growth

### Scale-Up Testing
- Load test with many concurrent rooms
- Stress test dealer with 6-player games across multiple rooms
- Measure Firestore read/write costs at scale

### Marketing Strategy
- Target poker communities, OFC fans
- Short-form video demos (the UI is visually distinctive)
- Beta invite / waitlist?

### Mobile Releases
- Explore PWA install prompt (already mobile-first)
- Native wrapper (Capacitor / TWA) for App Store / Play Store?
- Push notifications for "your turn" or "friend started a game"

### Monetization
- Cosmetics (card backs, board themes, avatars)?
- Premium features (longer match history, stats dashboard)?
- Tournament mode (entry fee / prize pool — legal considerations)
- Ad-supported free tier?
