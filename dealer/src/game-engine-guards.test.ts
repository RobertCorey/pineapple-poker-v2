/**
 * Integration tests for game-engine guard logic.
 * These run against the Firestore emulator and verify that
 * game-engine functions bail out safely in wrong states.
 *
 * REQUIRES: firebase emulators running (firebase emulators:start)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';
import { GamePhase as GP } from '../../shared/core/types';
import type { Card } from '../../shared/core/types';
import { gameDoc, handDoc } from '../../shared/core/firestore-paths';
import { emptyBoard } from '../../shared/game-logic/board-utils';
import { handlePhaseTimeout } from './game-engine';
import { advanceStreet } from './game-engine';

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

/** Generate a unique roomId per test to avoid state collisions */
function uniqueRoomId(): string {
  return `test_${Date.now()}_${testCounter++}`;
}

// ---- Helpers ----

function makeHand(n: number): Card[] {
  const suits = ['s', 'h', 'd', 'c'] as const;
  return Array.from({ length: n }, (_, i) => ({
    rank: (2 + i) as Card['rank'],
    suit: suits[i % 4],
  }));
}

async function setGameState(roomId: string, state: Record<string, unknown>) {
  await db.doc(gameDoc(roomId)).set({
    phase: GP.Lobby,
    street: 0,
    playerOrder: [],
    players: {},
    phaseDeadline: null,
    updatedAt: Date.now(),
    ...state,
  });
}

async function getGame(roomId: string) {
  const snap = await db.doc(gameDoc(roomId)).get();
  return snap.data()!;
}

// ---- handlePhaseTimeout guards ----

describe('handlePhaseTimeout guards', () => {
  it('does nothing when phase is scoring', async () => {
    const roomId = uniqueRoomId();
    await setGameState(roomId, {
      phase: GP.Scoring,
      street: 5,
      playerOrder: ['p1', 'p2'],
      players: {
        p1: { uid: 'p1', currentHand: makeHand(3), fouled: false, board: emptyBoard() },
        p2: { uid: 'p2', currentHand: makeHand(3), fouled: false, board: emptyBoard() },
      },
      phaseDeadline: Date.now() - 1000, // expired
    });

    await handlePhaseTimeout(db, roomId);
    const game = await getGame(roomId);

    // Players should NOT be fouled — wrong phase
    expect((game.players as Record<string, { fouled: boolean }>).p1.fouled).toBe(false);
    expect((game.players as Record<string, { fouled: boolean }>).p2.fouled).toBe(false);
  });

  it('does nothing when phase is complete', async () => {
    const roomId = uniqueRoomId();
    await setGameState(roomId, {
      phase: GP.Complete,
      street: 5,
      playerOrder: ['p1'],
      players: {
        p1: { uid: 'p1', currentHand: makeHand(3), fouled: false, board: emptyBoard() },
      },
      phaseDeadline: Date.now() - 1000,
    });

    await handlePhaseTimeout(db, roomId);
    const game = await getGame(roomId);

    expect((game.players as Record<string, { fouled: boolean }>).p1.fouled).toBe(false);
  });

  it('does nothing when deadline has not expired', async () => {
    const roomId = uniqueRoomId();
    await setGameState(roomId, {
      phase: GP.InitialDeal,
      street: 1,
      playerOrder: ['p1', 'p2'],
      players: {
        p1: { uid: 'p1', currentHand: makeHand(5), fouled: false, board: emptyBoard() },
        p2: { uid: 'p2', currentHand: [], fouled: false, board: emptyBoard() },
      },
      phaseDeadline: Date.now() + 30_000, // 30 seconds from now
    });

    // Set up hand docs so the function can clear them
    await db.doc(handDoc('p1', roomId)).set({ cards: makeHand(5) });

    await handlePhaseTimeout(db, roomId);
    const game = await getGame(roomId);

    // p1 should NOT be fouled — deadline hasn't passed
    expect((game.players as Record<string, { fouled: boolean }>).p1.fouled).toBe(false);
  });

  it('fouls unplaced players when deadline has expired in placement phase', async () => {
    const roomId = uniqueRoomId();
    await setGameState(roomId, {
      phase: GP.InitialDeal,
      street: 1,
      playerOrder: ['p1', 'p2'],
      players: {
        p1: { uid: 'p1', currentHand: makeHand(5), fouled: false, board: emptyBoard() },
        p2: { uid: 'p2', currentHand: [], fouled: false, board: emptyBoard() },
      },
      phaseDeadline: Date.now() - 1000, // expired
    });

    await db.doc(handDoc('p1', roomId)).set({ cards: makeHand(5) });

    await handlePhaseTimeout(db, roomId);
    const game = await getGame(roomId);

    // p1 fouled (had cards), p2 not fouled (already placed)
    const players = game.players as Record<string, { fouled: boolean; currentHand: Card[] }>;
    expect(players.p1.fouled).toBe(true);
    expect(players.p1.currentHand).toEqual([]);
    expect(players.p2.fouled).toBe(false);
    expect(game.phaseDeadline).toBeNull();
  });
});

// ---- advanceStreet guards ----

describe('advanceStreet guards', () => {
  it('returns noop when phase is scoring', async () => {
    const roomId = uniqueRoomId();
    await setGameState(roomId, {
      phase: GP.Scoring,
      street: 5,
      playerOrder: ['p1'],
      players: {
        p1: { uid: 'p1', currentHand: [], fouled: false, board: emptyBoard() },
      },
    });

    const result = await advanceStreet(db, roomId);
    expect(result).toBe('noop');
  });

  it('returns noop when phase is complete', async () => {
    const roomId = uniqueRoomId();
    await setGameState(roomId, {
      phase: GP.Complete,
      street: 5,
      playerOrder: ['p1'],
      players: {
        p1: { uid: 'p1', currentHand: [], fouled: false, board: emptyBoard() },
      },
    });

    const result = await advanceStreet(db, roomId);
    expect(result).toBe('noop');
  });

  it('returns noop when phase is lobby', async () => {
    const roomId = uniqueRoomId();
    await setGameState(roomId, {
      phase: GP.Lobby,
      street: 0,
      playerOrder: ['p1', 'p2'],
      players: {
        p1: { uid: 'p1', currentHand: [], fouled: false, board: emptyBoard() },
        p2: { uid: 'p2', currentHand: [], fouled: false, board: emptyBoard() },
      },
    });

    const result = await advanceStreet(db, roomId);
    expect(result).toBe('noop');
  });

  it('returns noop when not all players have placed', async () => {
    const roomId = uniqueRoomId();
    await setGameState(roomId, {
      phase: GP.InitialDeal,
      street: 1,
      playerOrder: ['p1', 'p2'],
      players: {
        p1: { uid: 'p1', currentHand: makeHand(5), fouled: false, board: emptyBoard() },
        p2: { uid: 'p2', currentHand: [], fouled: false, board: emptyBoard() },
      },
    });

    const result = await advanceStreet(db, roomId);
    expect(result).toBe('noop');
  });

  it('returns scoring when street >= 5 and all placed', async () => {
    const roomId = uniqueRoomId();
    await setGameState(roomId, {
      phase: GP.Street5,
      street: 5,
      playerOrder: ['p1', 'p2'],
      players: {
        p1: { uid: 'p1', currentHand: [], fouled: false, board: emptyBoard() },
        p2: { uid: 'p2', currentHand: [], fouled: false, board: emptyBoard() },
      },
    });

    const result = await advanceStreet(db, roomId);
    expect(result).toBe('scoring');

    const game = await getGame(roomId);
    expect(game.phase).toBe(GP.Scoring);
  });
});
