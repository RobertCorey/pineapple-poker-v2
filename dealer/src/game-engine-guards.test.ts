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
import type { Card, PlayerState, GameState } from '../../shared/core/types';
import { GamePhase as GP } from '../../shared/core/types';
import { gameDoc, handDoc } from '../../shared/core/firestore-paths';
import { emptyBoard } from '../../shared/game-logic/board-utils';
import { parseGameState } from '../../shared/core/schemas';
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

// ---- handlePhaseTimeout guards ----

describe('handlePhaseTimeout guards', () => {
  it('does nothing when phase is scoring', async () => {
    const roomId = uniqueRoomId();
    await setGameState(roomId, {
      phase: GP.Scoring,
      street: 5,
      playerOrder: ['p1', 'p2'],
      players: {
        p1: makePlayer('p1', { currentHand: makeHand(3) }),
        p2: makePlayer('p2', { currentHand: makeHand(3) }),
      },
      phaseDeadline: Date.now() - 1000, // expired
    });

    await handlePhaseTimeout(db, roomId);
    const game = await getGame(roomId);

    // Players should NOT be fouled — wrong phase
    expect(game.players.p1.fouled).toBe(false);
    expect(game.players.p2.fouled).toBe(false);
  });

  it('does nothing when phase is complete', async () => {
    const roomId = uniqueRoomId();
    await setGameState(roomId, {
      phase: GP.Complete,
      street: 5,
      playerOrder: ['p1'],
      players: {
        p1: makePlayer('p1', { currentHand: makeHand(3) }),
      },
      phaseDeadline: Date.now() - 1000,
    });

    await handlePhaseTimeout(db, roomId);
    const game = await getGame(roomId);

    expect(game.players.p1.fouled).toBe(false);
  });

  it('does nothing when deadline has not expired', async () => {
    const roomId = uniqueRoomId();
    await setGameState(roomId, {
      phase: GP.InitialDeal,
      street: 1,
      playerOrder: ['p1', 'p2'],
      players: {
        p1: makePlayer('p1', { currentHand: makeHand(5) }),
        p2: makePlayer('p2'),
      },
      phaseDeadline: Date.now() + 30_000, // 30 seconds from now
    });

    // Set up hand docs so the function can clear them
    await db.doc(handDoc('p1', roomId)).set({ cards: makeHand(5) });

    await handlePhaseTimeout(db, roomId);
    const game = await getGame(roomId);

    // p1 should NOT be fouled — deadline hasn't passed
    expect(game.players.p1.fouled).toBe(false);
  });

  it('auto-places cards for unplaced players when deadline has expired', async () => {
    const roomId = uniqueRoomId();
    await setGameState(roomId, {
      phase: GP.InitialDeal,
      street: 1,
      playerOrder: ['p1', 'p2'],
      players: {
        p1: makePlayer('p1', { currentHand: makeHand(5) }),
        p2: makePlayer('p2'),
      },
      phaseDeadline: Date.now() - 1000, // expired
    });

    await db.doc(handDoc('p1', roomId)).set({ cards: makeHand(5) });

    await handlePhaseTimeout(db, roomId);
    const game = await getGame(roomId);

    // p1 had cards auto-placed, p2 already placed
    expect(game.players.p1.currentHand).toEqual([]);
    expect(game.players.p2.fouled).toBe(false);
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
        p1: makePlayer('p1'),
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
        p1: makePlayer('p1'),
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
        p1: makePlayer('p1'),
        p2: makePlayer('p2'),
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
        p1: makePlayer('p1', { currentHand: makeHand(5) }),
        p2: makePlayer('p2'),
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
        p1: makePlayer('p1'),
        p2: makePlayer('p2'),
      },
    });

    const result = await advanceStreet(db, roomId);
    expect(result).toBe('scoring');

    const game = await getGame(roomId);
    expect(game.phase).toBe(GP.Scoring);
  });
});
