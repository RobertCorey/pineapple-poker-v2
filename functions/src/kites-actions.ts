import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import type {
  KitesCard,
  KitesGameState,
  KitesPlayedCard,
  KitesPlayer,
  KitesTimer,
  KitesColor,
} from '../../shared/kites/types';
import { KitesPhase } from '../../shared/kites/types';
import {
  KITES_MAX_PLAYERS,
  KITES_MIN_PLAYERS,
  KITES_RECENT_PLAYS_CAP,
  emptyTimers,
  kitesHandSize,
} from '../../shared/kites/constants';
import {
  kitesGameDoc,
  kitesHandDoc,
  kitesDeckDoc,
} from '../../shared/kites/firestore-paths';
import {
  parseKitesGameState,
  parseKitesHandDoc,
  parseKitesDeckDoc,
  KitesCardSchema,
} from '../../shared/kites/schemas';
import {
  createKitesDeck,
  dealKitesCards,
  shuffleKitesDeck,
} from '../../shared/kites/deck';
import {
  cardsRemaining,
  nextTimerToExpire,
  validateFlipChoice,
} from '../../shared/kites/game-logic';

const db = () => admin.firestore();

// ---- Schemas ----

const RoomIdSchema = z.object({
  roomId: z.string().min(1),
});

const JoinSchema = RoomIdSchema.extend({
  displayName: z.string().optional(),
  create: z.boolean().optional(),
});

const PlayCardSchema = RoomIdSchema.extend({
  card: KitesCardSchema,
  flipColors: z
    .array(z.enum(['red', 'orange', 'yellow', 'white', 'blue', 'purple']))
    .min(1)
    .max(2),
});

function newPlayer(uid: string, displayName: string): KitesPlayer {
  return {
    uid,
    displayName,
    handSize: 0,
    disconnected: false,
  };
}

function emptyKitesGame(uid: string, roomId: string, displayName: string): KitesGameState {
  const now = Date.now();
  return {
    gameId: roomId,
    gameType: 'kites',
    phase: KitesPhase.Lobby,
    hostUid: uid,
    players: { [uid]: newPlayer(uid, displayName) },
    playerOrder: [uid],
    timers: emptyTimers(),
    drawPileSize: 0,
    recentPlays: [],
    totalPlayed: 0,
    endedAt: null,
    finalScore: null,
    endReason: null,
    expiredTimerColor: null,
    createdAt: now,
    updatedAt: now,
  };
}

// ---- kitesJoinGame ----

export const kitesJoinGame = onCall({ maxInstances: 10 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in.');

  const parsed = JoinSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid request.');
  }
  const { roomId, create } = parsed.data;
  const displayName = parsed.data.displayName || `Player_${uid.slice(0, 6)}`;
  const ref = db().doc(kitesGameDoc(roomId));

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      if (!create) throw new HttpsError('not-found', 'Room not found.');
      tx.set(ref, emptyKitesGame(uid, roomId, displayName));
      return;
    }
    const game = parseKitesGameState(snap.data());
    if (game.players[uid]) return;
    if (Object.keys(game.players).length >= KITES_MAX_PLAYERS) {
      throw new HttpsError('resource-exhausted', `Room is full (max ${KITES_MAX_PLAYERS}).`);
    }
    if (game.phase !== KitesPhase.Lobby) {
      throw new HttpsError('failed-precondition', 'Game already started — cannot join.');
    }
    const players = { ...game.players, [uid]: newPlayer(uid, displayName) };
    const playerOrder = [...game.playerOrder, uid];
    tx.update(ref, {
      players,
      playerOrder,
      updatedAt: Date.now(),
    });
  });

  return { success: true };
});

// ---- kitesLeaveGame ----

export const kitesLeaveGame = onCall({ maxInstances: 10 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in.');

  const parsed = RoomIdSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid request.');
  const { roomId } = parsed.data;
  const ref = db().doc(kitesGameDoc(roomId));

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const game = parseKitesGameState(snap.data());
    if (!game.players[uid]) return;

    const players = { ...game.players };
    delete players[uid];
    const playerOrder = game.playerOrder.filter((u) => u !== uid);

    tx.delete(db().doc(kitesHandDoc(uid, roomId)));

    if (Object.keys(players).length === 0) {
      tx.delete(ref);
      tx.delete(db().doc(kitesDeckDoc(roomId)));
      return;
    }

    const update: Partial<KitesGameState> = {
      players,
      playerOrder,
      updatedAt: Date.now(),
    };
    if (uid === game.hostUid && playerOrder.length > 0) {
      update.hostUid = playerOrder[0];
    }
    tx.update(ref, update);
  });

  return { success: true };
});

// ---- kitesStartGame ----

export const kitesStartGame = onCall({ maxInstances: 10 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in.');

  const parsed = RoomIdSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid request.');
  const { roomId } = parsed.data;
  const ref = db().doc(kitesGameDoc(roomId));

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Room not found.');

    const game = parseKitesGameState(snap.data());
    if (game.hostUid !== uid) {
      throw new HttpsError('permission-denied', 'Only the host can start the game.');
    }
    if (game.phase !== KitesPhase.Lobby) {
      throw new HttpsError('failed-precondition', 'Game already in progress.');
    }
    if (game.playerOrder.length < KITES_MIN_PLAYERS) {
      throw new HttpsError('failed-precondition', `Need at least ${KITES_MIN_PLAYERS} players.`);
    }

    const playerCount = game.playerOrder.length;
    const handSize = kitesHandSize(playerCount);
    const deck = shuffleKitesDeck(createKitesDeck());

    let cursor = deck;
    const players = { ...game.players };
    for (const pUid of game.playerOrder) {
      const { dealt, remaining } = dealKitesCards(cursor, handSize);
      cursor = remaining;
      tx.set(db().doc(kitesHandDoc(pUid, roomId)), { cards: dealt });
      players[pUid] = { ...players[pUid], handSize: dealt.length };
    }

    // White timer is stood up at the start — the others stay on their sides
    // until a matching card is played.
    const now = Date.now();
    const timers = emptyTimers().map((t) =>
      t.color === 'white' ? { ...t, flippedAt: now } : t,
    );

    tx.set(db().doc(kitesDeckDoc(roomId)), { cards: cursor });

    tx.update(ref, {
      phase: KitesPhase.Playing,
      players,
      timers,
      drawPileSize: cursor.length,
      recentPlays: [],
      totalPlayed: 0,
      endedAt: null,
      finalScore: null,
      endReason: null,
      expiredTimerColor: null,
      updatedAt: now,
    });
  });

  return { success: true };
});

// ---- kitesPlayCard ----

interface PlayCardRequest {
  roomId: string;
  card: KitesCard;
  flipColors: KitesColor[];
}

export const kitesPlayCard = onCall({ maxInstances: 20 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in.');

  const parsed = PlayCardSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid request.');
  const { roomId, card, flipColors } = parsed.data as unknown as PlayCardRequest;

  const gameRef = db().doc(kitesGameDoc(roomId));
  const handRef = db().doc(kitesHandDoc(uid, roomId));
  const deckRef = db().doc(kitesDeckDoc(roomId));

  await db().runTransaction(async (tx) => {
    // ---- All reads first ----
    const [gameSnap, handSnap, deckSnap] = await Promise.all([
      tx.get(gameRef),
      tx.get(handRef),
      tx.get(deckRef),
    ]);

    if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found.');
    const game = parseKitesGameState(gameSnap.data());

    if (game.phase !== KitesPhase.Playing) {
      throw new HttpsError('failed-precondition', 'Game not in progress.');
    }
    if (!game.players[uid]) {
      throw new HttpsError('not-found', 'You are not in this game.');
    }

    // Check if any timer already expired — end the game now if so.
    const now = Date.now();
    const expired = game.timers.find(
      (t) => t.flippedAt !== null && now >= t.flippedAt + t.durationMs,
    );
    if (expired) {
      const finalScore = cardsRemaining(game);
      tx.update(gameRef, {
        phase: KitesPhase.Lost,
        endedAt: now,
        endReason: 'timer_expired',
        expiredTimerColor: expired.color,
        finalScore,
        updatedAt: now,
      });
      throw new HttpsError(
        'failed-precondition',
        `${expired.color} timer ran out — game over.`,
      );
    }

    if (!handSnap.exists) throw new HttpsError('not-found', 'No hand for player.');
    const hand = parseKitesHandDoc(handSnap.data());

    // Validate the played card is in the player's hand.
    const cardIdx = hand.cards.findIndex((c) => c.id === card.id);
    if (cardIdx < 0) {
      throw new HttpsError('failed-precondition', 'Card not in hand.');
    }
    const playedCard = hand.cards[cardIdx];

    // Validate flip choice matches card symbols.
    const err = validateFlipChoice(playedCard.symbols, flipColors);
    if (err) throw new HttpsError('invalid-argument', err);

    // ---- All writes ----

    // 1. Update timers: flip selected ones to now.
    const flipSet = new Set(flipColors);
    const updatedTimers: KitesTimer[] = game.timers.map((t) =>
      flipSet.has(t.color) ? { ...t, flippedAt: now } : t,
    );

    // 2. Remove card from hand, draw replacement if deck has cards.
    const newHand = [...hand.cards];
    newHand.splice(cardIdx, 1);

    let drawPileSize = game.drawPileSize;
    if (deckSnap.exists) {
      const deck = parseKitesDeckDoc(deckSnap.data());
      if (deck.cards.length > 0) {
        const drawn = deck.cards[0];
        newHand.push(drawn);
        const remaining = deck.cards.slice(1);
        tx.update(deckRef, { cards: remaining });
        drawPileSize = remaining.length;
      }
    }

    tx.update(handRef, { cards: newHand });

    // 3. Update player hand size, recentPlays, totalPlayed.
    const newSeq = game.totalPlayed + 1;
    const playedEntry: KitesPlayedCard = {
      id: playedCard.id,
      uid,
      symbols: playedCard.symbols,
      seq: newSeq,
    };
    const recent = [...game.recentPlays, playedEntry];
    while (recent.length > KITES_RECENT_PLAYS_CAP) recent.shift();

    const players = {
      ...game.players,
      [uid]: { ...game.players[uid], handSize: newHand.length },
    };

    // 4. Determine next phase (win when no cards anywhere remain).
    let phase: typeof KitesPhase[keyof typeof KitesPhase] = game.phase;
    let endedAt: number | null = null;
    let finalScore: number | null = null;
    let endReason: 'win' | 'timer_expired' | null = null;
    const totalRemaining =
      drawPileSize +
      Object.values(players).reduce((acc, p) => acc + p.handSize, 0);
    if (totalRemaining === 0) {
      phase = KitesPhase.Won;
      endedAt = now;
      finalScore = 0;
      endReason = 'win';
    }

    tx.update(gameRef, {
      timers: updatedTimers,
      players,
      recentPlays: recent,
      totalPlayed: newSeq,
      drawPileSize,
      phase,
      endedAt,
      finalScore,
      endReason,
      updatedAt: now,
    });
  });

  return { success: true };
});

// ---- kitesPlayAgain ----

export const kitesPlayAgain = onCall({ maxInstances: 10 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in.');

  const parsed = RoomIdSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid request.');
  const { roomId } = parsed.data;
  const ref = db().doc(kitesGameDoc(roomId));

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Room not found.');
    const game = parseKitesGameState(snap.data());

    if (game.hostUid !== uid) {
      throw new HttpsError('permission-denied', 'Only the host can restart.');
    }
    if (game.phase !== KitesPhase.Won && game.phase !== KitesPhase.Lost) {
      throw new HttpsError('failed-precondition', 'Game not finished.');
    }

    // Clear hands.
    for (const pUid of Object.keys(game.players)) {
      tx.delete(db().doc(kitesHandDoc(pUid, roomId)));
    }
    tx.delete(db().doc(kitesDeckDoc(roomId)));

    const players: Record<string, KitesPlayer> = {};
    for (const pUid of Object.keys(game.players)) {
      players[pUid] = { ...game.players[pUid], handSize: 0 };
    }

    tx.update(ref, {
      phase: KitesPhase.Lobby,
      players,
      timers: emptyTimers(),
      drawPileSize: 0,
      recentPlays: [],
      totalPlayed: 0,
      endedAt: null,
      finalScore: null,
      endReason: null,
      expiredTimerColor: null,
      updatedAt: Date.now(),
    });
  });

  return { success: true };
});

// ---- Internal helper: end the game when a timer expires ----
// Called by the dealer when a setTimeout fires for the soonest-expiring timer.
export async function endGameOnTimerExpiry(roomId: string): Promise<void> {
  const ref = db().doc(kitesGameDoc(roomId));
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const game = parseKitesGameState(snap.data());
    if (game.phase !== KitesPhase.Playing) return;
    const now = Date.now();
    const next = nextTimerToExpire(game);
    if (!next || next.expiresAt > now) return;
    const finalScore = cardsRemaining(game);
    tx.update(ref, {
      phase: KitesPhase.Lost,
      endedAt: now,
      endReason: 'timer_expired',
      expiredTimerColor: next.timer.color,
      finalScore,
      updatedAt: now,
    });
  });
}
