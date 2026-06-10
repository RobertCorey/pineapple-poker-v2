/**
 * Integration tests for Fantasy Land engine behavior.
 * These run against the Firestore emulator.
 *
 * REQUIRES: firebase emulators running (firebase emulators:start)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';
import type { Card, PlayerState, GameState, Board } from '../../shared/core/types';
import { GamePhase as GP, Rank, Suit } from '../../shared/core/types';
import { FL_DEAL_COUNT, INITIAL_DEAL_COUNT, TOTAL_STREETS } from '../../shared/core/constants';
import { gameDoc } from '../../shared/core/firestore-paths';
import { emptyBoard } from '../../shared/game-logic/board-utils';
import { parseGameState } from '../../shared/core/schemas';
import { maybeStartRound, advanceStreet, scoreRound, resetForNextRound, handlePhaseTimeout } from './game-engine';

// ---- Setup ----

let db: Firestore;
let testCounter = 0;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  const app = admin.apps.length
    ? admin.app()
    : admin.initializeApp({ projectId: 'pineapple-poker-8f3' });
  db = app.firestore();
});

function uniqueRoomId(): string {
  return `test_fl_${Date.now()}_${testCounter++}`;
}

// ---- Helpers ----

function card(rank: Rank, suit: Suit = Suit.Spades): Card {
  return { rank, suit };
}

function makeHand(n: number): Card[] {
  const suits = ['s', 'h', 'd', 'c'] as const;
  return Array.from({ length: n }, (_, i) => ({
    rank: ((i % 13) + 2) as Card['rank'],
    suit: suits[i % 4],
  }));
}

function makePlayer(uid: string, overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    uid,
    displayName: uid,
    board: emptyBoard(),
    currentHand: [],
    disconnected: false,
    fouled: false,
    score: 0,
    ...overrides,
  };
}

/** Complete valid board with QQ on top (Fantasy Land entry). */
function qqTopBoard(): Board {
  return {
    top: [card(Rank.Queen, Suit.Spades), card(Rank.Queen, Suit.Hearts), card(Rank.Two, Suit.Diamonds)],
    middle: [
      card(Rank.Nine, Suit.Spades), card(Rank.Nine, Suit.Hearts), card(Rank.Nine, Suit.Diamonds),
      card(Rank.Four, Suit.Clubs), card(Rank.Four, Suit.Spades),
    ],
    bottom: [
      card(Rank.King, Suit.Spades), card(Rank.King, Suit.Hearts),
      card(Rank.King, Suit.Diamonds), card(Rank.King, Suit.Clubs),
      card(Rank.Three, Suit.Spades),
    ],
  };
}

/** Complete valid board, nothing special on top. */
function plainBoard(): Board {
  return {
    top: [card(Rank.Two, Suit.Spades), card(Rank.Five, Suit.Hearts), card(Rank.Seven, Suit.Diamonds)],
    middle: [
      card(Rank.Ten, Suit.Spades), card(Rank.Ten, Suit.Hearts),
      card(Rank.Six, Suit.Diamonds), card(Rank.Seven, Suit.Clubs), card(Rank.Two, Suit.Hearts),
    ],
    bottom: [
      card(Rank.Ace, Suit.Spades), card(Rank.Ace, Suit.Hearts), card(Rank.Ace, Suit.Diamonds),
      card(Rank.Four, Suit.Clubs), card(Rank.Four, Suit.Spades),
    ],
  };
}

async function setGameState(roomId: string, state: Partial<GameState>) {
  await db.doc(gameDoc(roomId)).set({
    gameId: roomId,
    phase: GP.Lobby,
    street: 0,
    round: 1,
    totalRounds: 3,
    hostUid: 'p1',
    playerOrder: [],
    players: {},
    settings: { turnTimeoutMs: 30_000, interRoundDelayMs: 5_000 },
    phaseDeadline: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...state,
  });
}

async function getGame(roomId: string): Promise<GameState> {
  const snap = await db.doc(gameDoc(roomId)).get();
  return parseGameState(snap.data());
}

// ---- Tests ----

describe('maybeStartRound with a Fantasy Land player', () => {
  it('deals 14 to the FL player, 5 to others, and sets flDeadline', async () => {
    const roomId = uniqueRoomId();
    await setGameState(roomId, {
      phase: GP.Lobby,
      round: 2,
      playerOrder: ['p1', 'p2'],
      players: {
        p1: makePlayer('p1', { fantasyLand: true }),
        p2: makePlayer('p2'),
      },
    });

    const started = await maybeStartRound(db, roomId);
    expect(started).toBe(true);

    const game = await getGame(roomId);
    expect(game.players['p1'].currentHand).toHaveLength(FL_DEAL_COUNT);
    expect(game.players['p2'].currentHand).toHaveLength(INITIAL_DEAL_COUNT);
    expect(game.flDeadline).not.toBeNull();
    expect(game.flDeadline!).toBeGreaterThan(Date.now() + (TOTAL_STREETS - 1) * 30_000);
  });

  it('leaves flDeadline null when nobody is in FL', async () => {
    const roomId = uniqueRoomId();
    await setGameState(roomId, {
      phase: GP.Lobby,
      round: 1,
      playerOrder: ['p1', 'p2'],
      players: { p1: makePlayer('p1'), p2: makePlayer('p2') },
    });

    await maybeStartRound(db, roomId);
    const game = await getGame(roomId);
    expect(game.flDeadline ?? null).toBeNull();
  });
});

describe('street advancement around a Fantasy Land player', () => {
  it('advances the street while the FL player still holds 14 cards', async () => {
    const roomId = uniqueRoomId();
    await setGameState(roomId, {
      phase: GP.Lobby,
      round: 2,
      playerOrder: ['p1', 'p2'],
      players: {
        p1: makePlayer('p1', { fantasyLand: true }),
        p2: makePlayer('p2'),
      },
    });
    await maybeStartRound(db, roomId);

    // p2 places their 5 (simulate: empty hand); p1 (FL) untouched
    const game = await getGame(roomId);
    await db.doc(gameDoc(roomId)).update({
      players: {
        ...game.players,
        p2: { ...game.players['p2'], currentHand: [] },
      },
    });

    const result = await advanceStreet(db, roomId);
    expect(result).toBe('advanced');

    const after = await getGame(roomId);
    expect(after.street).toBe(2);
    // FL player keeps their full hand across the street
    expect(after.players['p1'].currentHand).toHaveLength(FL_DEAL_COUNT);
    // Non-FL player got the street deal
    expect(after.players['p2'].currentHand).toHaveLength(3);
  });

  it('holds street_5 (noop) while the FL board is unfinished', async () => {
    const roomId = uniqueRoomId();
    await setGameState(roomId, {
      phase: GP.Street5,
      street: 5,
      playerOrder: ['p1', 'p2'],
      players: {
        p1: makePlayer('p1', { fantasyLand: true, currentHand: makeHand(14) }),
        p2: makePlayer('p2', { board: plainBoard(), currentHand: [] }),
      },
      phaseDeadline: Date.now() + 30_000,
    });

    const result = await advanceStreet(db, roomId);
    expect(result).toBe('noop');
    expect((await getGame(roomId)).phase).toBe(GP.Street5);
  });
});

describe('Fantasy Land timeout handling', () => {
  it('does not auto-place the FL player before flDeadline, and re-arms the timer to it', async () => {
    const roomId = uniqueRoomId();
    const flDeadline = Date.now() + 60_000;
    await setGameState(roomId, {
      phase: GP.Street5,
      street: 5,
      playerOrder: ['p1', 'p2'],
      players: {
        p1: makePlayer('p1', { fantasyLand: true, currentHand: makeHand(14) }),
        p2: makePlayer('p2', { board: plainBoard(), currentHand: [] }),
      },
      phaseDeadline: Date.now() - 1_000, // street deadline already passed
      flDeadline,
    });

    await handlePhaseTimeout(db, roomId);

    const game = await getGame(roomId);
    expect(game.players['p1'].currentHand).toHaveLength(FL_DEAL_COUNT); // untouched
    expect(game.phaseDeadline).toBe(flDeadline); // re-armed to the FL deadline
  });

  it('auto-places the full FL board once flDeadline has passed', async () => {
    const roomId = uniqueRoomId();
    await setGameState(roomId, {
      phase: GP.Street5,
      street: 5,
      playerOrder: ['p1', 'p2'],
      players: {
        p1: makePlayer('p1', { fantasyLand: true, currentHand: makeHand(14) }),
        p2: makePlayer('p2', { board: plainBoard(), currentHand: [] }),
      },
      phaseDeadline: Date.now() - 1_000,
      flDeadline: Date.now() - 1_000,
    });

    await handlePhaseTimeout(db, roomId);

    const game = await getGame(roomId);
    const b = game.players['p1'].board;
    expect(game.players['p1'].currentHand).toHaveLength(0);
    expect(b.top.length + b.middle.length + b.bottom.length).toBe(13);
    expect(game.phaseDeadline).toBeNull();
  });
});

describe('Fantasy Land qualification at scoring', () => {
  it('QQ-top board earns nextFantasyLand; plain board does not', async () => {
    const roomId = uniqueRoomId();
    await setGameState(roomId, {
      phase: GP.Scoring,
      street: 5,
      round: 1,
      playerOrder: ['p1', 'p2'],
      players: {
        p1: makePlayer('p1', { board: qqTopBoard() }),
        p2: makePlayer('p2', { board: plainBoard() }),
      },
    });

    await scoreRound(db, roomId);

    const game = await getGame(roomId);
    expect(game.players['p1'].nextFantasyLand).toBe(true);
    expect(game.players['p2'].nextFantasyLand).toBe(false);
    expect(game.phase).toBe(GP.Complete);
  });

  it('resetForNextRound promotes nextFantasyLand to fantasyLand', async () => {
    const roomId = uniqueRoomId();
    await setGameState(roomId, {
      phase: GP.Complete,
      round: 1,
      playerOrder: ['p1', 'p2'],
      players: {
        p1: makePlayer('p1', { nextFantasyLand: true }),
        p2: makePlayer('p2', { nextFantasyLand: false }),
      },
    });

    await resetForNextRound(db, roomId);

    const game = await getGame(roomId);
    expect(game.players['p1'].fantasyLand).toBe(true);
    expect(game.players['p1'].nextFantasyLand).toBe(false);
    expect(game.players['p2'].fantasyLand).toBe(false);
    expect(game.flDeadline ?? null).toBeNull();
  });
});
