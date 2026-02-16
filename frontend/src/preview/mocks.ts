import type { Card, GameState, PlayerState, Board, RoundResult } from '@shared/core/types';
import { Suit, Rank, GamePhase } from '@shared/core/types';
import { ROUNDS_PER_MATCH, DEFAULT_MATCH_SETTINGS } from '@shared/core/constants';

// --- Seeded RNG for deterministic card generation ---

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function createDeck(): Card[] {
  const suits: Suit[] = [Suit.Clubs, Suit.Diamonds, Suit.Hearts, Suit.Spades];
  const ranks: Rank[] = [
    Rank.Two, Rank.Three, Rank.Four, Rank.Five, Rank.Six, Rank.Seven,
    Rank.Eight, Rank.Nine, Rank.Ten, Rank.Jack, Rank.Queen, Rank.King, Rank.Ace,
  ];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function shuffleWithRng(deck: Card[], rng: () => number): Card[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// --- Card counts per street ---

/** Total cards on board after each street is fully placed */
const CARDS_ON_BOARD_AFTER_STREET: Record<number, number> = {
  1: 5,   // initial deal: place 5
  2: 7,   // +2
  3: 9,   // +2
  4: 11,  // +2
  5: 13,  // +2 = full board (3+5+5)
};

/** Cards in hand for each street (before placing) */
const CARDS_IN_HAND: Record<number, number> = {
  1: 5,
  2: 3,
  3: 3,
  4: 3,
  5: 3,
};

// --- Fill board with N cards ---

function fillBoard(cards: Card[], count: number): Board {
  const board: Board = { top: [], middle: [], bottom: [] };
  const toPlace = cards.slice(0, count);
  for (const card of toPlace) {
    // Fill bottom first, then middle, then top (like a real game)
    if (board.bottom.length < 5) {
      board.bottom.push(card);
    } else if (board.middle.length < 5) {
      board.middle.push(card);
    } else if (board.top.length < 3) {
      board.top.push(card);
    }
  }
  return board;
}

// --- Options ---

export type CardsFill = 'empty' | 'partial' | 'full' | 'random';
export type OverlayMode = 'none' | 'round' | 'match';

export interface MockOptions {
  players: number;
  street: number;
  phase: string;
  cards: CardsFill;
  round: number;
  fouled: boolean;
  overlay: OverlayMode;
}

const PLAYER_NAMES = [
  'You', 'Alice', 'Bob', 'Carol', 'Dave', 'Eve',
  'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy', 'Karl',
  'Liam', 'Mallory', 'Nina', 'Oscar',
];

// --- Phase from street ---

function phaseFromStreet(street: number): string {
  switch (street) {
    case 1: return GamePhase.InitialDeal;
    case 2: return GamePhase.Street2;
    case 3: return GamePhase.Street3;
    case 4: return GamePhase.Street4;
    case 5: return GamePhase.Street5;
    default: return GamePhase.InitialDeal;
  }
}

// --- Generators ---

export function generateMockGameState(opts: MockOptions): GameState {
  const numPlayers = Math.max(2, Math.min(16, opts.players));

  // Determine effective phase
  let phase: string;
  if (opts.overlay === 'round') {
    phase = GamePhase.Complete;
  } else if (opts.overlay === 'match') {
    phase = GamePhase.MatchComplete;
  } else if (opts.phase === 'auto') {
    phase = phaseFromStreet(opts.street);
  } else {
    phase = opts.phase;
  }

  // Generate player UIDs and states
  const uids: string[] = [];
  const players: Record<string, PlayerState> = {};
  for (let i = 0; i < numPlayers; i++) {
    const uid = `player_${i}`;
    uids.push(uid);

    // Each player gets cards from a separate shuffled deck
    const playerDeck = shuffleWithRng(createDeck(), seededRng(100 + i));

    // Calculate how many cards should be on board
    // Overlays require full boards for scoring/pairwise comparison
    let boardCardCount: number;
    if (opts.overlay !== 'none') {
      boardCardCount = 13;
    } else if (opts.cards === 'empty') {
      boardCardCount = 0;
    } else if (opts.cards === 'full') {
      boardCardCount = CARDS_ON_BOARD_AFTER_STREET[opts.street] ?? 0;
    } else if (opts.cards === 'partial') {
      // Previous street fully placed
      const prevStreet = Math.max(1, opts.street - 1);
      boardCardCount = opts.street === 1 ? 0 : (CARDS_ON_BOARD_AFTER_STREET[prevStreet] ?? 0);
    } else {
      // random: use seeded random fill
      const maxCards = CARDS_ON_BOARD_AFTER_STREET[opts.street] ?? 5;
      boardCardCount = Math.floor(seededRng(200 + i)() * (maxCards + 1));
    }

    const board = fillBoard(playerDeck, boardCardCount);
    const isFouled = i === 0 ? opts.fouled : false;

    // Generate scores for overlays
    const score = opts.overlay !== 'none' ? Math.floor(seededRng(300 + i)() * 20 - 10) : 0;

    players[uid] = {
      uid,
      displayName: PLAYER_NAMES[i] ?? `Player ${i + 1}`,
      board,
      currentHand: [],
      disconnected: false,
      fouled: isFouled,
      score,
    };
  }

  // Generate round results for overlays
  let roundResults: Record<string, RoundResult> | undefined;
  if (opts.overlay !== 'none') {
    roundResults = {};
    for (const uid of uids) {
      const player = players[uid];
      roundResults[uid] = {
        netScore: player.score,
        fouled: player.fouled,
      };
    }
  }

  return {
    gameId: 'PREV1W',
    phase: phase as GameState['phase'],
    players,
    playerOrder: uids,
    street: opts.street,
    round: opts.round,
    totalRounds: ROUNDS_PER_MATCH,
    hostUid: uids[0],
    settings: DEFAULT_MATCH_SETTINGS,
    roundResults,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    phaseDeadline: Date.now() + 25_000,
  };
}

export function generateMockHand(opts: MockOptions): Card[] {
  // If board is fully placed for this street, no cards in hand
  if (opts.cards === 'full' || opts.overlay !== 'none') return [];

  const rng = seededRng(999);
  const deck = shuffleWithRng(createDeck(), rng);

  // Return appropriate number of cards for the phase
  const count = CARDS_IN_HAND[opts.street] ?? 3;
  return deck.slice(0, count);
}

/** All valid GamePhase values for the dropdown */
export const ALL_PHASES = [
  { value: 'auto', label: 'Auto (from street)' },
  { value: GamePhase.Lobby, label: 'Lobby' },
  { value: GamePhase.InitialDeal, label: 'Initial Deal' },
  { value: GamePhase.Street2, label: 'Street 2' },
  { value: GamePhase.Street3, label: 'Street 3' },
  { value: GamePhase.Street4, label: 'Street 4' },
  { value: GamePhase.Street5, label: 'Street 5' },
  { value: GamePhase.Scoring, label: 'Scoring' },
  { value: GamePhase.Complete, label: 'Complete' },
  { value: GamePhase.MatchComplete, label: 'Match Complete' },
];
