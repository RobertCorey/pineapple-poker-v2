import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { Card, Board, Row, PlayerState, MutationPick } from '../../shared/core/types';
import { GamePhase as GP } from '../../shared/core/types';
import {
  INITIAL_DEAL_COUNT,
  STREET_PLACE_COUNT,
  TOP_ROW_SIZE,
  FIVE_CARD_ROW_SIZE,
  ROUNDS_PER_MATCH,
  ROUNDS_PER_RUN,
  MAX_PLAYERS,
  DEFAULT_MATCH_SETTINGS,
} from '../../shared/core/constants';
import { CHARMS } from '../../shared/game-logic/charms';
import { MUTATIONS, applyMutationsToDeck, MIN_DECK_SIZE } from '../../shared/game-logic/mutations';
import { createDeck } from '../../shared/game-logic/deck';
import { gameDoc, handDoc, deckDoc } from '../../shared/core/firestore-paths';
import { emptyBoard } from '../../shared/game-logic/board-utils';
import { parseGameState, CardSchema, MatchSettingsSchema } from '../../shared/core/schemas';
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

export async function removePlayer(uid: string, roomId: string): Promise<void> {
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
        settings: DEFAULT_MATCH_SETTINGS,
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

    // Validate all placed/discarded cards are in hand. Use multiset semantics
    // because run-mode mutations (Pair Party, Spike, Mono Suit, etc.) can
    // produce hands with duplicate (rank, suit) pairs — a simple `some()`
    // check would let a client claim to play more copies than were dealt.
    const allCards: Card[] = [...placements.map((p) => p.card)];
    if (discard) allCards.push(discard);

    const handCounts = new Map<string, number>();
    for (const h of player.currentHand) {
      const k = `${h.rank}-${h.suit}`;
      handCounts.set(k, (handCounts.get(k) ?? 0) + 1);
    }
    for (const card of allCards) {
      const k = `${card.rank}-${card.suit}`;
      const remaining = handCounts.get(k) ?? 0;
      if (remaining <= 0) {
        throw new HttpsError(
          'invalid-argument',
          `Card ${card.rank}${card.suit} is not in your hand (or already used).`,
        );
      }
      handCounts.set(k, remaining - 1);
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

const StartMatchSchema = RoomIdSchema.extend({
  settings: MatchSettingsSchema.optional(),
  runMode: z.boolean().optional(),
});

export const startMatch = onCall({ maxInstances: 10 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const parsed = StartMatchSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid request data.');
  }
  const { roomId, settings, runMode } = parsed.data;
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

    // Use `any` here because Firestore's update typing is strict about
    // FieldValue | Partial<T>; we're constructing a heterogeneous patch.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const baseUpdate: Record<string, any> = {
      round: 1,
      updatedAt: Date.now(),
    };
    if (settings) baseUpdate.settings = settings;

    if (runMode) {
      baseUpdate.runMode = true;
      baseUpdate.totalRounds = ROUNDS_PER_RUN;
      // Initialise empty charm + mutation collections for each active player
      const charms: Record<string, string[]> = {};
      const mutations: Record<string, unknown[]> = {};
      for (const u of game.playerOrder) {
        charms[u] = [];
        mutations[u] = [];
      }
      baseUpdate.charms = charms;
      baseUpdate.mutations = mutations;
    }

    tx.update(gameRef, baseUpdate);
  });

  return { success: true };
});

// ---- pickCharm ----

const PickCharmSchema = RoomIdSchema.extend({
  charmId: z.string().min(1),
});

export const pickCharm = onCall({ maxInstances: 10 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const parsed = PickCharmSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid request data.');
  }
  const { roomId, charmId } = parsed.data;

  if (!CHARMS[charmId]) {
    throw new HttpsError('invalid-argument', 'Unknown charm.');
  }

  const gameRef = db().doc(gameDoc(roomId));

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) throw new HttpsError('not-found', 'No game exists.');

    const game = parseGameState(snap.data());
    if (!game.runMode) throw new HttpsError('failed-precondition', 'Not in a run.');
    if (game.phase !== GP.CharmPick) {
      throw new HttpsError('failed-precondition', 'Not in charm pick phase.');
    }
    if (!game.playerOrder.includes(uid)) {
      throw new HttpsError('failed-precondition', 'Observers cannot pick charms.');
    }
    if (!(game.charmOptions ?? []).includes(charmId)) {
      throw new HttpsError('invalid-argument', 'Charm is not on offer this pick.');
    }

    const picks = { ...(game.charmPicks ?? {}) };
    if (picks[uid]) {
      throw new HttpsError('failed-precondition', 'You already picked a charm this round.');
    }
    picks[uid] = charmId;

    tx.update(gameRef, {
      charmPicks: picks,
      updatedAt: Date.now(),
    });
  });

  return { success: true };
});

// ---- pickMutation ----

const PickMutationSchema = RoomIdSchema.extend({
  mutationId: z.string().min(1),
  target: z.enum(['c', 'd', 'h', 's']).optional(),
});

export const pickMutation = onCall({ maxInstances: 10 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const parsed = PickMutationSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid request data.');
  }
  const { roomId, mutationId, target } = parsed.data;

  const def = MUTATIONS[mutationId];
  if (!def) throw new HttpsError('invalid-argument', 'Unknown mutation.');
  if (def.requiresTarget === 'suit' && !target) {
    throw new HttpsError('invalid-argument', 'This mutation requires a suit target.');
  }

  const gameRef = db().doc(gameDoc(roomId));

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) throw new HttpsError('not-found', 'No game exists.');

    const game = parseGameState(snap.data());
    if (!game.runMode) throw new HttpsError('failed-precondition', 'Not in a run.');
    if (game.phase !== GP.CharmPick) {
      throw new HttpsError('failed-precondition', 'Not in pick phase.');
    }
    if (!game.playerOrder.includes(uid)) {
      throw new HttpsError('failed-precondition', 'Observers cannot pick mutations.');
    }
    if (!(game.mutationOptions ?? []).includes(mutationId)) {
      throw new HttpsError('invalid-argument', 'Mutation is not on offer this pick.');
    }

    const picks = { ...(game.mutationPicks ?? {}) };
    if (picks[uid]) {
      throw new HttpsError('failed-precondition', 'You already picked a mutation this round.');
    }
    const pick: { id: string; target?: string } = { id: mutationId };
    if (target) {
      pick.target = target;
    } else if (mutationId === 'cull') {
      // Cull: capture random seed at pick time so the cull is the same every
      // round (otherwise the deck would re-randomize between rounds).
      pick.target = String(Math.floor(Math.random() * 0xFFFFFFFF) || 1);
    }

    // Hard floor: never let a pick shrink this player's deck below a playable
    // round (MIN_DECK_SIZE). Guards against stacked shrinks and stale/forged
    // mutationOptions that the option roller would otherwise have excluded.
    const ownedPicks = game.mutations?.[uid] ?? [];
    const resultingDeck = applyMutationsToDeck(createDeck(), [...ownedPicks, pick] as MutationPick[]);
    if (resultingDeck.length < MIN_DECK_SIZE) {
      throw new HttpsError(
        'failed-precondition',
        'That mutation would shrink your deck too far to play a round.',
      );
    }

    picks[uid] = pick;

    tx.update(gameRef, {
      mutationPicks: picks,
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
      // Clear all run-mode state — host must opt back in via Start
      runMode: FieldValue.delete(),
      totalRounds: ROUNDS_PER_MATCH,
      charms: FieldValue.delete(),
      charmOptions: FieldValue.delete(),
      charmPicks: FieldValue.delete(),
      charmBonuses: FieldValue.delete(),
      mutations: FieldValue.delete(),
      mutationOptions: FieldValue.delete(),
      mutationPicks: FieldValue.delete(),
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
