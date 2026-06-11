/**
 * Single-player Saloon engine — TRADITIONAL table OFC Pineapple.
 *
 * Unlike the multiplayer mode (per-player decks, simultaneous placement),
 * this is the classic table game:
 *  - ONE shared 52-card deck per hand
 *  - Max 3 players at the table (3 × 17 cards dealt = 51 ≤ 52)
 *  - TURN-BASED: play proceeds clockwise from the seat left of the button;
 *    each player sees everything placed before them (discards stay hidden)
 *  - Initial street: 5 cards, place all 5. Streets 2-5: 3 cards, place 2,
 *    discard 1 face-down.
 *  - After street 5 the hand is scored pairwise (rows, scoop, royalties,
 *    fouls) and the button rotates.
 *
 * Pure state-transition functions — no timers, no IO. The UI (or a test)
 * drives it by calling applyPlacement for whoever `currentSeat` points at.
 */
import type { Board, Card, Row, ScoringResult } from './vendor/types.ts';
import {
  FIVE_CARD_ROW_SIZE,
  INITIAL_DEAL_COUNT,
  MAX_TABLE_PLAYERS,
  STREET_DEAL_COUNT,
  STREET_PLACE_COUNT,
  TOP_ROW_SIZE,
  TOTAL_STREETS,
} from './vendor/constants.ts';
import { createShuffledDeck, dealCards } from './vendor/deck.ts';
import { isFoul, scoreAllPlayers } from './vendor/scoring.ts';

export type BotSkill = 'greenhorn' | 'gunslinger' | 'outlaw';

export interface TableSeat {
  id: string;
  name: string;
  isHero: boolean;
  /** Bot skill tier; undefined for the hero. */
  skill?: BotSkill;
  board: Board;
  /** Cards dealt to this seat, awaiting placement (only while it's their turn). */
  hand: Card[];
  /** Cumulative points across the match so far. */
  matchPoints: number;
  /** Whether this seat fouled the last scored hand. */
  fouled: boolean;
}

export type TablePhase = 'acting' | 'hand_scored' | 'match_over';

export interface TableState {
  seats: TableSeat[];
  deck: Card[];
  /** Dealer button seat index; first to act is the seat to its left. */
  buttonIdx: number;
  /** Seat index whose turn it is to place (valid while phase === 'acting'). */
  turnIdx: number;
  /** 1 = initial five-card street, 2-5 = pineapple streets. */
  street: number;
  /** 1-based hand counter within the match. */
  handNumber: number;
  handsPerMatch: number;
  phase: TablePhase;
  /** Pairwise scoring of the last completed hand (set while 'hand_scored' / 'match_over'). */
  lastResult: ScoringResult | null;
}

export interface SeatPlacement {
  card: Card;
  row: Row;
}

function emptyBoard(): Board {
  return { top: [], middle: [], bottom: [] };
}

function cloneSeat(seat: TableSeat): TableSeat {
  return {
    ...seat,
    board: {
      top: [...seat.board.top],
      middle: [...seat.board.middle],
      bottom: [...seat.board.bottom],
    },
    hand: [...seat.hand],
  };
}

function cloneState(state: TableState): TableState {
  return {
    ...state,
    seats: state.seats.map(cloneSeat),
    deck: [...state.deck],
  };
}

export function currentSeat(state: TableState): TableSeat {
  return state.seats[state.turnIdx];
}

/** Cards a seat must place this street (5 on the initial deal, 2 after). */
export function placementsRequired(street: number): number {
  return street === 1 ? INITIAL_DEAL_COUNT : STREET_PLACE_COUNT;
}

/**
 * Create a fresh table. Hero always sits at seat 0; the button starts on the
 * last seat so the hero acts first on hand 1.
 */
export function createTable(
  heroName: string,
  opponents: { id: string; name: string; skill: BotSkill }[],
  handsPerMatch: number,
): TableState {
  if (opponents.length < 1 || opponents.length + 1 > MAX_TABLE_PLAYERS) {
    throw new Error(`Table seats 2-${MAX_TABLE_PLAYERS} players`);
  }
  const seats: TableSeat[] = [
    {
      id: 'hero',
      name: heroName,
      isHero: true,
      board: emptyBoard(),
      hand: [],
      matchPoints: 0,
      fouled: false,
    },
    ...opponents.map((o) => ({
      id: o.id,
      name: o.name,
      isHero: false,
      skill: o.skill,
      board: emptyBoard(),
      hand: [],
      matchPoints: 0,
      fouled: false,
    })),
  ];

  const state: TableState = {
    seats,
    deck: [],
    buttonIdx: seats.length - 1,
    turnIdx: 0,
    street: 1,
    handNumber: 1,
    handsPerMatch,
    phase: 'acting',
    lastResult: null,
  };
  return startHand(state);
}

/**
 * Start (or restart) the current hand: fresh shuffled shared deck, clear
 * boards, street 1, and deal 5 cards to the seat left of the button.
 * Pass `deck` to rig the shuffle in tests.
 */
export function startHand(state: TableState, deck?: Card[]): TableState {
  const next = cloneState(state);
  next.deck = deck ? [...deck] : createShuffledDeck();
  for (const seat of next.seats) {
    seat.board = emptyBoard();
    seat.hand = [];
    seat.fouled = false;
  }
  next.street = 1;
  next.phase = 'acting';
  next.lastResult = null;
  next.turnIdx = (next.buttonIdx + 1) % next.seats.length;

  const { dealt, remaining } = dealCards(next.deck, INITIAL_DEAL_COUNT);
  next.seats[next.turnIdx].hand = dealt;
  next.deck = remaining;
  return next;
}

const ROW_MAX: Record<Row, number> = {
  top: TOP_ROW_SIZE,
  middle: FIVE_CARD_ROW_SIZE,
  bottom: FIVE_CARD_ROW_SIZE,
};

function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

/**
 * Apply the acting seat's placements (and discard, on streets 2-5), then
 * advance the table: deal to the next seat, or advance the street, or score
 * the hand after street 5.
 */
export function applyPlacement(
  state: TableState,
  placements: SeatPlacement[],
  discard: Card | null,
): TableState {
  if (state.phase !== 'acting') {
    throw new Error(`Cannot place in phase ${state.phase}`);
  }
  const required = placementsRequired(state.street);
  if (placements.length !== required) {
    throw new Error(`Street ${state.street} requires ${required} placements`);
  }
  if (state.street === 1 && discard !== null) {
    throw new Error('No discard on the initial street');
  }
  if (state.street > 1 && discard === null) {
    throw new Error('Streets 2-5 require a discard');
  }

  const next = cloneState(state);
  const seat = next.seats[next.turnIdx];

  // Every placed/discarded card must come from the dealt hand, each used once.
  const handPool = [...seat.hand];
  const takeFromHand = (card: Card) => {
    const idx = handPool.findIndex((c) => sameCard(c, card));
    if (idx === -1) {
      throw new Error('Card not in dealt hand');
    }
    handPool.splice(idx, 1);
  };
  for (const p of placements) takeFromHand(p.card);
  if (discard) takeFromHand(discard);
  if (handPool.length !== 0) {
    throw new Error('All dealt cards must be placed or discarded');
  }

  for (const p of placements) {
    if (seat.board[p.row].length >= ROW_MAX[p.row]) {
      throw new Error(`Row ${p.row} is full`);
    }
    seat.board[p.row].push(p.card);
  }
  seat.hand = [];

  // Advance: next seat clockwise; when action returns to the first seat
  // (left of the button), the street is over.
  const firstToAct = (next.buttonIdx + 1) % next.seats.length;
  const nextIdx = (next.turnIdx + 1) % next.seats.length;

  if (nextIdx === firstToAct) {
    // Street complete
    if (next.street >= TOTAL_STREETS) {
      return scoreHand(next);
    }
    next.street += 1;
  }

  next.turnIdx = nextIdx;
  const { dealt, remaining } = dealCards(
    next.deck,
    next.street === 1 ? INITIAL_DEAL_COUNT : STREET_DEAL_COUNT,
  );
  next.seats[next.turnIdx].hand = dealt;
  next.deck = remaining;
  return next;
}

/** Score the completed hand pairwise and move to 'hand_scored'. */
function scoreHand(state: TableState): TableState {
  const boards = new Map<string, Board>();
  const fouls = new Map<string, boolean>();
  for (const seat of state.seats) {
    boards.set(seat.id, seat.board);
    fouls.set(seat.id, isFoul(seat.board));
  }
  const result = scoreAllPlayers(boards, fouls);
  for (const score of result.players) {
    const seat = state.seats.find((s) => s.id === score.uid)!;
    seat.fouled = score.fouled;
    seat.matchPoints += score.netScore;
  }
  state.lastResult = result;
  state.phase = 'hand_scored';
  return state;
}

/**
 * Move on from a scored hand: rotate the button and deal the next hand, or
 * end the match when all hands have been played.
 * Pass `deck` to rig the next hand's shuffle in tests.
 */
export function nextHand(state: TableState, deck?: Card[]): TableState {
  if (state.phase !== 'hand_scored') {
    throw new Error(`Cannot advance from phase ${state.phase}`);
  }
  if (state.handNumber >= state.handsPerMatch) {
    const next = cloneState(state);
    next.phase = 'match_over';
    return next;
  }
  const next = cloneState(state);
  next.handNumber += 1;
  next.buttonIdx = (next.buttonIdx + 1) % next.seats.length;
  return startHand(next, deck);
}

/** The hero wins the match by finishing with strictly more points than every opponent. */
export function heroWonMatch(state: TableState): boolean {
  const hero = state.seats.find((s) => s.isHero)!;
  return state.seats.every((s) => s.isHero || s.matchPoints < hero.matchPoints);
}
