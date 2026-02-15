import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { Card, Board, Row, PlayerState } from '../../shared/core/types';
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
import { parseGameState, CardSchema } from '../../shared/core/schemas';
import { pickBotName } from '../../shared/core/bot-names';

const db = () => admin.firestore();

// ---- Request validation schemas ----

const RoomIdSchema = z.object({
  roomId: z.string().min(1, 'Must provide roomId.'),
});

const JoinGameSchema = RoomIdSchema.extend({
  displayName: z.string().optional(),
  create: z.boolean().optional(),
});

const PlaceCardsSchema = RoomIdSchema.extend({
  placements: z.array(z.object({
    card: CardSchema,
    row: z.enum(['top', 'middle', 'bottom']),
  })),
  discard: CardSchema.nullish(),
});

interface PlaceCardsRequest {
  roomId: string;
  placements: Array<{ card: Card; row: Row }>;
  discard?: Card;
}

function extractRoomId(data: unknown): string {
  const result = RoomIdSchema.safeParse(data);
  if (!result.success) {
    throw new HttpsError('invalid-argument', 'Must provide roomId.');
  }
  return result.data.roomId;
}

/** Validate and parse placeCards request. Safe cast: zod has validated shapes. */
function parsePlaceCardsRequest(data: unknown): PlaceCardsRequest {
  const result = PlaceCardsSchema.safeParse(data);
  if (!result.success) {
    throw new HttpsError('invalid-argument', 'Invalid request: must provide roomId and placements array.');
  }
  return result.data as unknown as PlaceCardsRequest;
}

function newPlayerState(uid: string, displayName: string): PlayerState {
  return {
    uid,
    displayName,
    board: emptyBoard(),
    currentHand: [],
    disconnected: false,
    fouled: false,
    score: 0,
  };
}

// ---- removePlayer (inlined from former game-manager.ts) ----

async function removePlayer(uid: string, roomId: string): Promise<void> {
  const gameRef = db().doc(gameDoc(roomId));

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) return;

    const game = parseGameState(snap.data());

    if (!game.players[uid]) return;

    // Remove from players map
    const players = { ...game.players };
    delete players[uid];

    // Remove from playerOrder
    const newPlayerOrder = game.playerOrder.filter((u) => u !== uid);

    // Clean up subcollection docs
    tx.delete(db().doc(handDoc(uid, roomId)));
    tx.delete(db().doc(deckDoc(uid, roomId)));

    // If no players remain, delete the game
    if (Object.keys(players).length === 0) {
      tx.delete(gameRef);
      return;
    }

    // If leaving player is host, promote next player in playerOrder
    const updates: { players: Record<string, PlayerState>; playerOrder: string[]; updatedAt: number; hostUid?: string } = {
      players,
      playerOrder: newPlayerOrder,
      updatedAt: Date.now(),
    };
    if (uid === game.hostUid && newPlayerOrder.length > 0) {
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

  const parsed = JoinGameSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid request data.');
  }
  const { roomId, create } = parsed.data;
  const displayName = parsed.data.displayName || `Player_${uid.slice(0, 6)}`;
  const gameRef = db().doc(gameDoc(roomId));

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    const now = Date.now();

    if (!snap.exists) {
      if (!create) {
        throw new HttpsError('not-found', 'Room not found.');
      }

      // Create fresh game document — this player becomes host
      const players: Record<string, PlayerState> = {};
      players[uid] = newPlayerState(uid, displayName);

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
      const game = parseGameState(snap.data());

      // Already in game — no-op
      if (game.players[uid]) return;

      if (Object.keys(game.players).length >= MAX_PLAYERS) {
        throw new HttpsError('resource-exhausted', `Room is full (max ${MAX_PLAYERS} players).`);
      }

      const players = { ...game.players };
      players[uid] = newPlayerState(uid, displayName);

      if (game.phase === GP.Lobby || game.phase === GP.MatchComplete) {
        // Join as active player
        const playerOrder = [...game.playerOrder, uid];
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

  const roomId = extractRoomId(request.data);
  await removePlayer(uid, roomId);

  // Dealer will detect the state change via onSnapshot and advance if needed

  return { success: true };
});

// ---- placeCards ----

export const placeCards = onCall({ maxInstances: 10 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const { roomId, placements, discard } = parsePlaceCardsRequest(request.data);

  const gameRef = db().doc(gameDoc(roomId));

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'No game exists.');
    }

    const game = parseGameState(snap.data());

    // Must be in a placement phase
    if (
      game.phase !== GP.InitialDeal &&
      game.phase !== GP.Street2 &&
      game.phase !== GP.Street3 &&
      game.phase !== GP.Street4 &&
      game.phase !== GP.Street5
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Not in a placement phase.',
      );
    }

    const player = game.players[uid];
    if (!player) {
      throw new HttpsError('not-found', 'You are not in this game.');
    }

    if (!game.playerOrder.includes(uid)) {
      throw new HttpsError('failed-precondition', 'Observers cannot place cards.');
    }

    if (player.currentHand.length === 0) {
      throw new HttpsError(
        'failed-precondition',
        'You have already placed your cards this street.',
      );
    }

    // Validate placement count
    if (game.street === 1) {
      if (placements.length !== INITIAL_DEAL_COUNT) {
        throw new HttpsError(
          'invalid-argument',
          `Must place exactly ${INITIAL_DEAL_COUNT} cards on initial street.`,
        );
      }
    } else {
      if (placements.length !== STREET_PLACE_COUNT) {
        throw new HttpsError(
          'invalid-argument',
          `Must place exactly ${STREET_PLACE_COUNT} cards on this street.`,
        );
      }
      if (!discard) {
        throw new HttpsError('invalid-argument', 'Must discard 1 card.');
      }
    }

    // Validate all placed/discarded cards are in hand
    const allCards: Card[] = [...placements.map((p) => p.card)];
    if (discard) allCards.push(discard);

    for (const card of allCards) {
      const inHand = player.currentHand.some(
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
    const newBoard: Board = {
      top: [...player.board.top],
      middle: [...player.board.middle],
      bottom: [...player.board.bottom],
    };

    for (const placement of placements) {
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
    const updatedPlayers = { ...game.players };
    updatedPlayers[uid] = {
      ...player,
      board: newBoard,
      currentHand: [],
    };

    tx.update(gameRef, {
      players: updatedPlayers,
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

  const roomId = extractRoomId(request.data);
  const gameRef = db().doc(gameDoc(roomId));

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'No game exists.');
    }

    const game = parseGameState(snap.data());

    if (game.hostUid !== uid) {
      throw new HttpsError('permission-denied', 'Only the host can start the match.');
    }
    if (game.phase !== GP.Lobby) {
      throw new HttpsError('failed-precondition', 'Game is not in lobby phase.');
    }
    if (game.round !== 0) {
      throw new HttpsError('failed-precondition', 'Match has already been started.');
    }

    if (game.playerOrder.length < 2) {
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

  const roomId = extractRoomId(request.data);
  const gameRef = db().doc(gameDoc(roomId));

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'No game exists.');
    }

    const game = parseGameState(snap.data());

    if (game.hostUid !== uid) {
      throw new HttpsError('permission-denied', 'Only the host can restart.');
    }
    if (game.phase !== GP.MatchComplete) {
      throw new HttpsError('failed-precondition', 'Match is not complete.');
    }

    // Reset all players: scores to 0, boards/hands cleared
    const updatedPlayers: Record<string, PlayerState> = {};
    const updatedPlayerOrder: string[] = [];

    for (const pUid of Object.keys(game.players)) {
      updatedPlayers[pUid] = {
        ...game.players[pUid],
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

// ---- addBot ----

export const addBot = onCall({ maxInstances: 10 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const roomId = extractRoomId(request.data);
  const gameRef = db().doc(gameDoc(roomId));

  let botDisplayName = '';

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Room not found.');
    }

    const game = parseGameState(snap.data());

    if (game.hostUid !== uid) {
      throw new HttpsError('permission-denied', 'Only the host can add bots.');
    }
    if (game.phase !== GP.Lobby) {
      throw new HttpsError('failed-precondition', 'Can only add bots in lobby.');
    }

    if (Object.keys(game.players).length >= MAX_PLAYERS) {
      throw new HttpsError('resource-exhausted', `Room is full (max ${MAX_PLAYERS} players).`);
    }

    // Collect names already used by bots
    const usedNames = new Set<string>();
    for (const p of Object.values(game.players)) {
      if (p.isBot) usedNames.add(p.displayName);
    }

    const { nickname, fullName } = pickBotName(usedNames);
    botDisplayName = `${nickname} ${fullName}`;

    // Generate a unique bot uid
    const botUid = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const players = { ...game.players };
    players[botUid] = {
      uid: botUid,
      displayName: botDisplayName,
      board: emptyBoard(),
      currentHand: [],
      disconnected: false,
      fouled: false,
      score: 0,
      isBot: true,
    };

    const playerOrder = [...game.playerOrder, botUid];

    tx.update(gameRef, {
      players,
      playerOrder,
      updatedAt: Date.now(),
    });
  });

  return { success: true, displayName: botDisplayName };
});

// ---- removeBot ----

const RemoveBotSchema = RoomIdSchema.extend({
  botUid: z.string().min(1, 'Must provide botUid.'),
});

export const removeBot = onCall({ maxInstances: 10 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const parsed = RemoveBotSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Must provide roomId and botUid.');
  }
  const { roomId, botUid } = parsed.data;

  const gameRef = db().doc(gameDoc(roomId));

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Room not found.');
    }

    const game = parseGameState(snap.data());

    if (game.hostUid !== uid) {
      throw new HttpsError('permission-denied', 'Only the host can remove bots.');
    }

    const bot = game.players[botUid];
    if (!bot || !bot.isBot) {
      throw new HttpsError('not-found', 'Bot not found.');
    }

    const players = { ...game.players };
    delete players[botUid];

    const playerOrder = game.playerOrder.filter((u) => u !== botUid);

    // Clean up subcollection docs
    tx.delete(db().doc(handDoc(botUid, roomId)));
    tx.delete(db().doc(deckDoc(botUid, roomId)));

    tx.update(gameRef, {
      players,
      playerOrder,
      updatedAt: Date.now(),
    });
  });

  return { success: true };
});
