/**
 * Deck mutations = run-defining permanent changes to a player's personal deck.
 *
 * Picked between rounds in run mode alongside a charm. Mutations stack:
 * each pick is applied on top of the previous round's mutated deck.
 * The deck is rebuilt from a fresh standard 52-card deck each round and
 * all owned mutations are reapplied in pick order, so the implementation
 * stays simple (no need to track diffs).
 *
 * Some mutations (e.g. "Suit Purge") need a target chosen at pick time.
 * That target is stored alongside the mutation id as a `MutationPick`.
 */
import type { Card, MutationId, MutationPick, Suit, Rank } from '../core/types';
import { Suit as S, Rank as R } from '../core/types';

export interface MutationDef {
  id: MutationId;
  name: string;
  emoji: string;
  /** Short description shown in pick UI; no target placeholders. */
  description: string;
  /**
   * Apply the mutation to a deck. Returns the modified deck.
   * `target` is whatever sub-pick metadata the mutation needs (e.g., a suit).
   */
  apply: (deck: Card[], target?: string) => Card[];
  /** If true, picking this mutation requires a sub-target (suit, rank, etc.) */
  requiresTarget?: 'suit' | 'rank';
  /** Approximate deck size after this mutation alone. Used to filter options
   *  when stacked mutations would shrink the deck below the playable minimum. */
  approxDeckSize: number;
}

// ---- Helpers ----

/** Tiny seeded PRNG (mulberry32). Used to make `cull` deterministic per pick
 *  so a player's deck composition stays the same every round. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STANDARD_DECK_SIZE = 52;

/** Cards needed to play a full round: 5 dealt + 4 streets * 3 = 17. */
export const MIN_DECK_SIZE = 17;

function cardsByRank(deck: Card[], minRank: number): Card[] {
  return deck.filter((c) => c.rank >= minRank);
}

function cardsByMaxRank(deck: Card[], maxRank: number): Card[] {
  return deck.filter((c) => c.rank <= maxRank);
}

function removeSuit(deck: Card[], suit: Suit): Card[] {
  return deck.filter((c) => c.suit !== suit);
}

function duplicateMatching(deck: Card[], pred: (c: Card) => boolean): Card[] {
  const out: Card[] = [...deck];
  for (const c of deck) if (pred(c)) out.push({ ...c });
  return out;
}

function isFaceCard(c: Card): boolean {
  return c.rank >= R.Jack;
}

// ---- Mutation catalog ----

export const MUTATIONS: Record<MutationId, MutationDef> = {
  high_court: {
    id: 'high_court',
    name: 'High Court',
    emoji: '👑',
    description: 'Remove every card below 6 from your deck. Big hands every round.',
    apply: (deck) => cardsByRank(deck, R.Six),
    approxDeckSize: 36, // 9 ranks * 4 suits
  },
  bottom_feeder: {
    id: 'bottom_feeder',
    name: 'Bottom Feeder',
    emoji: '🐟',
    description: 'Remove every card above 10. Lots of small hands, easy bottom rows.',
    apply: (deck) => cardsByMaxRank(deck, R.Ten),
    approxDeckSize: 36, // 9 ranks * 4 suits
  },
  cull: {
    id: 'cull',
    name: 'Cull',
    emoji: '✂️',
    description: 'Remove half your deck at random — locked in at pick time.',
    // The random selection is captured ONCE at pick time (server stores a
    // numeric seed in `target`) so the cull stays consistent every round.
    // Without the seed, this would re-randomize each round and break the
    // "permanent deck mutation" contract.
    apply: (deck, target) => {
      const seed = target ? Number(target) >>> 0 : 1;
      const rand = mulberry32(seed || 1);
      const shuffled = [...deck];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled.slice(0, Math.ceil(shuffled.length / 2));
    },
    approxDeckSize: 26,
  },
  royal_inflation: {
    id: 'royal_inflation',
    name: 'Royal Inflation',
    emoji: '💫',
    description: 'Duplicate every face card (J, Q, K, A) in your deck.',
    apply: (deck) => duplicateMatching(deck, isFaceCard),
    approxDeckSize: 68, // 52 + 16 face cards
  },
  ace_rush: {
    id: 'ace_rush',
    name: 'Ace Rush',
    emoji: '🅰️',
    description: 'Triple every Ace in your deck. (4 → 12 Aces)',
    apply: (deck) => {
      const out: Card[] = [];
      for (const c of deck) {
        out.push(c);
        if (c.rank === R.Ace) {
          out.push({ ...c });
          out.push({ ...c });
        }
      }
      return out;
    },
    approxDeckSize: 60,
  },
  suit_purge: {
    id: 'suit_purge',
    name: 'Suit Purge',
    emoji: '🚫',
    description: 'Remove an entire suit from your deck. Pick which one.',
    apply: (deck, target) => {
      if (!target) return deck;
      return removeSuit(deck, target as Suit);
    },
    requiresTarget: 'suit',
    approxDeckSize: 39, // 52 - 13
  },
  mono_suit: {
    id: 'mono_suit',
    name: 'Mono Suit',
    emoji: '♥️',
    description: 'Convert every card in your deck to one suit. Free flushes everywhere.',
    apply: (deck, target) => {
      if (!target) return deck;
      const t = target as Suit;
      // De-duplicate: collapsing all cards to one suit creates rank duplicates.
      // We keep them as duplicates (multiple copies of the same card) — this is
      // the desired chaos. Hand evaluation handles duplicates fine for non-suit
      // hand types; flushes will trigger trivially.
      return deck.map((c) => ({ ...c, suit: t }));
    },
    requiresTarget: 'suit',
    approxDeckSize: 52,
  },
  pair_party: {
    id: 'pair_party',
    name: 'Pair Party',
    emoji: '🎉',
    description: 'Duplicate every card in your deck. 104 cards — pairs everywhere.',
    apply: (deck) => duplicateMatching(deck, () => true),
    approxDeckSize: 104,
  },
  spike: {
    id: 'spike',
    name: 'Spike',
    emoji: '⚡',
    description: 'Add 8 Aces to your deck. Mostly Aces draws.',
    apply: (deck) => {
      const out = [...deck];
      const suits: Suit[] = [S.Spades, S.Hearts, S.Diamonds, S.Clubs];
      for (let i = 0; i < 8; i++) {
        out.push({ rank: R.Ace as Rank, suit: suits[i % 4] });
      }
      return out;
    },
    approxDeckSize: 60,
  },
};

export const MUTATION_IDS: MutationId[] = Object.keys(MUTATIONS);

/**
 * Pick `count` random mutations the player can be offered, excluding any
 * mutation ids already owned by the player and any whose application would
 * shrink the deck below the playable minimum (after the player's prior picks).
 *
 * `currentDeckSize` is the size of the player's deck after applying all of
 * their prior mutations. A mutation is excluded if either:
 *   - it's a removal-style mutation that would drop the deck below MIN_DECK_SIZE
 *   - it's already owned by the player
 */
export function rollMutationOptions(
  count: number,
  ownedByMe: Set<MutationId>,
  currentDeckSize: number,
): MutationId[] {
  const playable = MUTATION_IDS.filter((id) => {
    if (ownedByMe.has(id)) return false;
    const m = MUTATIONS[id];
    // Reject mutations that approximately shrink below the playable minimum.
    // We approximate "stacked shrink" by scaling the mutation's relative
    // shrink rate by the player's current deck size.
    if (m.approxDeckSize < STANDARD_DECK_SIZE) {
      const shrinkRatio = m.approxDeckSize / STANDARD_DECK_SIZE;
      const projected = currentDeckSize * shrinkRatio;
      if (projected < MIN_DECK_SIZE) return false;
    }
    return true;
  });

  const out: MutationId[] = [];
  const taken = new Set<number>();
  // Source falls back to MUTATION_IDS if too few playable ones remain
  const source = playable.length >= count ? playable : MUTATION_IDS;
  while (out.length < count && taken.size < source.length) {
    const i = Math.floor(Math.random() * source.length);
    if (taken.has(i)) continue;
    taken.add(i);
    out.push(source[i]);
  }
  while (out.length < count) {
    out.push(source[Math.floor(Math.random() * source.length)]);
  }
  return out;
}

/**
 * Apply all of a player's mutation picks to a fresh standard deck.
 * Mutations are applied in pick order. Returns the resulting deck.
 */
export function applyMutationsToDeck(
  freshDeck: Card[],
  picks: MutationPick[] | undefined,
): Card[] {
  if (!picks || picks.length === 0) return freshDeck;
  let deck = freshDeck;
  for (const p of picks) {
    const def = MUTATIONS[p.id];
    if (!def) continue;
    deck = def.apply(deck, p.target);
  }
  return deck;
}
