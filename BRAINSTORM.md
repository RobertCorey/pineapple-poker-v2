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

### Fantasy Land

The marquee OFC Pineapple rule we haven't implemented. Standard rules:

- **Qualify**: finish a round with QQ+ on the top row *without fouling* →
  next round you're in Fantasy Land (FL).
- **In FL**: you receive all your cards at once face-down (14 in standard
  Pineapple FL), set your entire 13-card board in one go, discard 1. Opponents
  can't see your board until showdown; you don't see their streets either way.
- **Stay in FL** (re-qualify while in FL): trips on top, or quads+ on bottom.
- Common variant ("progressive FL"): QQ top = 14 cards, KK = 15, AA = 16,
  trips = 17. Worth considering — it makes top-row aggression a real decision.

**Why our architecture makes this easy** (easier than table OFC, in fact):
every player already has their *own* shuffled deck and places simultaneously
against a shared street timer. An FL player is just a player who gets their
entire allotment on the initial deal and then sits out streets 2–5. No
turn-order headaches, no information-leak problem with seeing streets — we
already hide opponents' in-progress placements? (We don't — opponent boards
are visible live. See open question #1.)

**Implementation sketch** (touchpoints):

- `shared/core/types.ts`: `PlayerState.fantasyLand?: boolean` (this round) and
  maybe `fantasyLandCards?: number` for the progressive variant.
- `shared/game-logic/scoring.ts`: after `scoreRound`, compute qualification
  (top row QQ+ and not fouled → FL next round; while in FL: trips top or
  quads+ bottom to stay). Store on the player for `resetForNextRound`.
- `dealer/src/game-engine.ts`:
  - `maybeStartRound`: deal 14 (or 14–17) to FL players instead of 5.
  - `advanceStreet`: skip dealing to FL players; treat them as "placed" for
    street-advance checks once their board is full (13 placed + 1 discarded).
  - `handlePhaseTimeout`: auto-place an FL player's full board on timeout —
    the random auto-placer already exists, just runs over 13 slots.
- Frontend `MobileGamePage` / `MobileHandArea`: the placement UI already
  handles "place N, discard the rest" — FL is place-13-discard-1 from a
  14-card hand. Needs a denser hand layout (14 cards on a phone — two rows?)
  and an "in Fantasy Land" banner. Drag-and-drop placement helps a lot here.
- Timer: FL player gets one long deadline for the whole board. Simplest:
  the same `phaseDeadline` as everyone's street 1, then they wait; better:
  give FL players until the *last* street's deadline (sum of all street
  timeouts) — they have 13 decisions to make.

**Open questions**:

1. **Visibility**: in real OFC, the FL board stays face-down until showdown.
   Today all boards are public live. Options: (a) hide the FL player's board
   from opponents until scoring (Firestore already has per-player private
   subcollections — put in-progress FL placements in the private hand doc and
   only write the board at submit); (b) ignore secrecy for v1 — friendly-game
   simplification. (b) is far less work; (a) is the "real" rule and matters
   once players are good.
2. **Scoring side**: FL players' boards are scored exactly like normal boards
   (royalties included), so `scoreRound` shouldn't need changes beyond the
   qualification check — verify.
3. **Progressive FL** (14/15/16/17) or flat 14 to start? Flat 14 first.
4. **Multiple players in FL simultaneously**: no special handling needed in
   our simultaneous model — verify the street-advance logic doesn't deadlock
   when *all* active players are in FL (round = single placement phase).
5. **UI for 14 cards on mobile**: two-row hand? Scrollable strip? This is
   probably the hardest part of the whole feature.

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
