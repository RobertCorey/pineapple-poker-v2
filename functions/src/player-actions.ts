import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { Card, Board, Row, GamePhase } from '../../shared/core/types';
import { GamePhase as GP } from '../../shared/core/types';
import {
  INITIAL_DEAL_COUNT,
  STREET_PLACE_COUNT,
  TOP_ROW_SIZE,
  FIVE_CARD_ROW_SIZE,
  ROUNDS_PER_MATCH,
  MAX_PLAYERS,
} from '../../shared/core/constants';
import { gameDoc, handDoc, deckDoc } from '../../shared/core/firestore-paths';
import { emptyBoard } from '../../shared/game-logic/board-utils';

const db = () => admin.firestore();

function extractRoomId(data: Record<string, unknown> | undefined): string {
  const roomId = data?.roomId as string;
  if (!roomId) {
    throw new HttpsError('invalid-argument', 'Must provide roomId.');
  }
  return roomId;
}

// ---- removePlayer (inlined from former game-manager.ts) ----

async function removePlayer(uid: string, roomId: string): Promise<void> {
  const gameRef = db().doc(gameDoc(roomId));

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) return;

    const game = snap.data()!;
    const players = game.players as Record<string, Record<string, unknown>>;
    const playerOrder = game.playerOrder as string[];
    const hostUid = game.hostUid as string;

    if (!players[uid]) return;

    // Remove from players map
    delete players[uid];

    // Remove from playerOrder
    const newPlayerOrder = playerOrder.filter((u) => u !== uid);

    // Clean up subcollection docs
    tx.delete(db().doc(handDoc(uid, roomId)));
    tx.delete(db().doc(deckDoc(uid, roomId)));

    // If no players remain, delete the game
    if (Object.keys(players).length === 0) {
      tx.delete(gameRef);
      return;
    }

    // If leaving player is host, promote next player in playerOrder
    const updates: { players: typeof players; playerOrder: string[]; updatedAt: number; hostUid?: string } = {
      players,
      playerOrder: newPlayerOrder,
      updatedAt: Date.now(),
    };
    if (uid === hostUid && newPlayerOrder.length > 0) {
      updates.hostUid = newPlayerOrder[0];
    }

    tx.update(gameRef, updates);
  });
}

// ---- joinGame ----

export const joinGame = onCall({ maxInstances: 10 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in to join.');
  }

  const roomId = extractRoomId(request.data as Record<string, unknown>);
  const displayName = (request.data?.displayName as string) || `Player_${uid.slice(0, 6)}`;
  const create = !!(request.data as Record<string, unknown>)?.create;
  const gameRef = db().doc(gameDoc(roomId));

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    const now = Date.now();

    if (!snap.exists) {
      if (!create) {
        throw new HttpsError('not-found', 'Room not found.');
      }

      // Create fresh game document — this player becomes host
      const players: Record<string, unknown> = {};
      players[uid] = {
        uid,
        displayName,
        board: emptyBoard(),
        currentHand: [],
        disconnected: false,
        fouled: false,
        score: 0,
      };

      tx.set(gameRef, {
        gameId: roomId,
        phase: GP.Lobby,
        players,
        playerOrder: [uid],
        street: 0,
        round: 0,
        totalRounds: ROUNDS_PER_MATCH,
        hostUid: uid,
        createdAt: now,
        updatedAt: now,
        phaseDeadline: null,
      });
    } else {
      const game = snap.data()!;
      const players = game.players as Record<string, Record<string, unknown>>;
      const playerOrder = game.playerOrder as string[];
      const phase = game.phase as string;

      // Already in game — no-op
      if (players[uid]) return;

      if (Object.keys(players).length >= MAX_PLAYERS) {
        throw new HttpsError('resource-exhausted', `Room is full (max ${MAX_PLAYERS} players).`);
      }

      (players as Record<string, unknown>)[uid] = {
        uid,
        displayName,
        board: emptyBoard(),
        currentHand: [],
        disconnected: false,
        fouled: false,
        score: 0,
      };

      if (phase === GP.Lobby || phase === GP.MatchComplete) {
        // Join as active player
        playerOrder.push(uid);
        tx.update(gameRef, {
          players,
          playerOrder,
          updatedAt: now,
        });
      } else {
        // Match in progress — join as observer only
        tx.update(gameRef, {
          players,
          updatedAt: now,
        });
      }
    }
  });

  // Dealer will detect the state change via onSnapshot and start the round if needed

  return { success: true };
});

// ---- leaveGame ----

export const leaveGame = onCall({ maxInstances: 10 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const roomId = extractRoomId(request.data as Record<string, unknown>);
  await removePlayer(uid, roomId);

  // Dealer will detect the state change via onSnapshot and advance if needed

  return { success: true };
});

// ---- placeCards ----

interface PlaceCardsData {
  roomId: string;
  placements: Array<{ card: Card; row: Row }>;
  discard?: Card;
}

export const placeCards = onCall({ maxInstances: 10 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const data = request.data as PlaceCardsData;
  const roomId = extractRoomId(data as unknown as Record<string, unknown>);

  if (!data?.placements || !Array.isArray(data.placements)) {
    throw new HttpsError('invalid-argument', 'Must provide placements array.');
  }

  const gameRef = db().doc(gameDoc(roomId));

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'No game exists.');
    }

    const game = snap.data()!;
    const phase = game.phase as GamePhase;
    const street = game.street as number;

    // Must be in a placement phase
    if (
      phase !== GP.InitialDeal &&
      phase !== GP.Street2 &&
      phase !== GP.Street3 &&
      phase !== GP.Street4 &&
      phase !== GP.Street5
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Not in a placement phase.',
      );
    }

    const players = game.players as Record<string, Record<string, unknown>>;
    const player = players[uid];
    if (!player) {
      throw new HttpsError('not-found', 'You are not in this game.');
    }

    const playerOrder = game.playerOrder as string[];
    if (!playerOrder.includes(uid)) {
      throw new HttpsError('failed-precondition', 'Observers cannot place cards.');
    }

    const hand = player.currentHand as Card[];
    if (hand.length === 0) {
      throw new HttpsError(
        'failed-precondition',
        'You have already placed your cards this street.',
      );
    }

    // Validate placement count
    if (street === 1) {
      if (data.placements.length !== INITIAL_DEAL_COUNT) {
        throw new HttpsError(
          'invalid-argument',
          `Must place exactly ${INITIAL_DEAL_COUNT} cards on initial street.`,
        );
      }
    } else {
      if (data.placements.length !== STREET_PLACE_COUNT) {
        throw new HttpsError(
          'invalid-argument',
          `Must place exactly ${STREET_PLACE_COUNT} cards on this street.`,
        );
      }
      if (!data.discard) {
        throw new HttpsError('invalid-argument', 'Must discard 1 card.');
      }
    }

    // Validate all placed/discarded cards are in hand
    const allCards = [...data.placements.map((p) => p.card)];
    if (data.discard) allCards.push(data.discard);

    for (const card of allCards) {
      const inHand = hand.some(
        (h) => h.suit === card.suit && h.rank === card.rank,
      );
      if (!inHand) {
        throw new HttpsError(
          'invalid-argument',
          `Card ${card.rank}${card.suit} is not in your hand.`,
        );
      }
    }

    // Validate row capacities
    const board = player.board as Board;
    const newBoard: Board = {
      top: [...board.top],
      middle: [...board.middle],
      bottom: [...board.bottom],
    };

    for (const placement of data.placements) {
      const row = placement.row;
      const maxSize = row === 'top' ? TOP_ROW_SIZE : FIVE_CARD_ROW_SIZE;
      if (newBoard[row].length >= maxSize) {
        throw new HttpsError(
          'invalid-argument',
          `Row ${row} is already full.`,
        );
      }
      newBoard[row] = [...newBoard[row], placement.card];
    }

    // Apply changes
    players[uid] = {
      ...player,
      board: newBoard,
      currentHand: [],
    };

    tx.update(gameRef, {
      players,
      updatedAt: Date.now(),
    });

    // Clear hand doc
    tx.set(db().doc(handDoc(uid, roomId)), { cards: [] });
  });

  // Dealer will detect the state change via onSnapshot and advance if all have placed

  return { success: true };
});

// ---- startMatch ----

export const startMatch = onCall({ maxInstances: 10 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const roomId = extractRoomId(request.data as Record<string, unknown>);
  const gameRef = db().doc(gameDoc(roomId));

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'No game exists.');
    }

    const game = snap.data()!;

    if (game.hostUid !== uid) {
      throw new HttpsError('permission-denied', 'Only the host can start the match.');
    }
    if (game.phase !== GP.Lobby) {
      throw new HttpsError('failed-precondition', 'Game is not in lobby phase.');
    }
    if ((game.round as number) !== 0) {
      throw new HttpsError('failed-precondition', 'Match has already been started.');
    }

    const playerOrder = game.playerOrder as string[];
    if (playerOrder.length < 2) {
      throw new HttpsError('failed-precondition', 'Need at least 2 players to start.');
    }

    // Set round to 1 — dealer will pick up the snapshot and call maybeStartRound
    tx.update(gameRef, {
      round: 1,
      updatedAt: Date.now(),
    });
  });

  return { success: true };
});

// ---- playAgain ----

export const playAgain = onCall({ maxInstances: 10 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const roomId = extractRoomId(request.data as Record<string, unknown>);
  const gameRef = db().doc(gameDoc(roomId));

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'No game exists.');
    }

    const game = snap.data()!;

    if (game.hostUid !== uid) {
      throw new HttpsError('permission-denied', 'Only the host can restart.');
    }
    if (game.phase !== GP.MatchComplete) {
      throw new HttpsError('failed-precondition', 'Match is not complete.');
    }

    const players = game.players as Record<string, Record<string, unknown>>;

    // Reset all players: scores to 0, boards/hands cleared
    const updatedPlayers: Record<string, unknown> = {};
    const updatedPlayerOrder: string[] = [];

    for (const pUid of Object.keys(players)) {
      updatedPlayers[pUid] = {
        ...players[pUid],
        board: emptyBoard(),
        currentHand: [],
        fouled: false,
        score: 0,
      };
      updatedPlayerOrder.push(pUid);
    }

    tx.update(gameRef, {
      phase: GP.Lobby,
      round: 0,
      street: 0,
      players: updatedPlayers,
      playerOrder: updatedPlayerOrder,
      roundResults: FieldValue.delete(),
      phaseDeadline: null,
      updatedAt: Date.now(),
    });
  });

  return { success: true };
});
