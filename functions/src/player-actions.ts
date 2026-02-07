import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import type { Card, Board, Row, GamePhase } from '../../shared/types';
import { GamePhase as GP } from '../../shared/types';
import {
  INITIAL_DEAL_COUNT,
  STREET_PLACE_COUNT,
  TOP_ROW_SIZE,
  FIVE_CARD_ROW_SIZE,
} from '../../shared/constants';
import {
  maybeStartRound,
  advanceStreet,
  scoreRound,
  executeBotMoves,
  resetForNextRound,
} from './game-manager';

const db = () => admin.firestore();
const GAME_DOC = 'games/current';
const MIN_PLAYERS = 4;
const PLACE_TIMEOUT_MS = 60_000;

// ---- Bot helpers ----

function makeBotUid(index: number): string {
  return `bot_${index}`;
}

function makeBotName(index: number): string {
  const names = ['AlphaBot', 'BetaBot', 'GammaBot', 'DeltaBot', 'EpsilonBot'];
  return names[index % names.length];
}

function emptyBoard(): Board {
  return { top: [], middle: [], bottom: [] };
}

// ---- joinGame ----

export const joinGame = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in to join.');
  }

  const displayName = (request.data?.displayName as string) || `Player_${uid.slice(0, 6)}`;
  const gameRef = db().doc(GAME_DOC);

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    const now = Date.now();

    if (!snap.exists) {
      // Create fresh game document
      const players: Record<string, unknown> = {};
      players[uid] = {
        uid,
        displayName,
        board: emptyBoard(),
        currentHand: [],
        ready: false,
        disconnected: false,
        fantasyland: false,
        score: 0,
      };

      const playerOrder = [uid];

      // Add bots to fill to MIN_PLAYERS
      for (let i = 0; i < MIN_PLAYERS - 1; i++) {
        const botUid = makeBotUid(i);
        players[botUid] = {
          uid: botUid,
          displayName: makeBotName(i),
          board: emptyBoard(),
          currentHand: [],
          ready: false,
          disconnected: false,
          fantasyland: false,
          score: 0,
        };
        playerOrder.push(botUid);
      }

      tx.set(gameRef, {
        gameId: 'current',
        phase: GP.Waiting,
        players,
        playerOrder,
        street: 0,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const game = snap.data()!;
      const players = game.players as Record<string, unknown>;

      // Already joined
      if (players[uid]) {
        return;
      }

      if (game.phase !== GP.Waiting) {
        throw new HttpsError(
          'failed-precondition',
          'Cannot join while a round is in progress.',
        );
      }

      const playerOrder = game.playerOrder as string[];

      players[uid] = {
        uid,
        displayName,
        board: emptyBoard(),
        currentHand: [],
        ready: false,
        disconnected: false,
        fantasyland: false,
        score: 0,
      };
      playerOrder.push(uid);

      // Ensure minimum players with bots
      const totalPlayers = playerOrder.length;
      if (totalPlayers < MIN_PLAYERS) {
        const botsNeeded = MIN_PLAYERS - totalPlayers;
        const existingBotCount = playerOrder.filter((u) => u.startsWith('bot_')).length;
        for (let i = 0; i < botsNeeded; i++) {
          const botUid = makeBotUid(existingBotCount + i);
          players[botUid] = {
            uid: botUid,
            displayName: makeBotName(existingBotCount + i),
            board: emptyBoard(),
            currentHand: [],
            ready: false,
            disconnected: false,
            fantasyland: false,
            score: 0,
          };
          playerOrder.push(botUid);
        }
      }

      tx.update(gameRef, {
        players,
        playerOrder,
        updatedAt: now,
      });
    }

    // Create/update scoreboard entry
    const scoreRef = db().doc(`scoreboard/${uid}`);
    tx.set(scoreRef, {
      uid,
      displayName,
      totalScore: 0,
      rounds: 0,
      wins: 0,
      lastUpdated: now,
    }, { merge: true });
  });

  return { success: true };
});

// ---- readyUp ----

export const readyUp = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const gameRef = db().doc(GAME_DOC);

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'No game exists. Join first.');
    }

    const game = snap.data()!;
    const phase = game.phase as GamePhase;
    if (phase !== GP.Waiting && phase !== GP.Complete) {
      throw new HttpsError(
        'failed-precondition',
        'Cannot ready up during an active round.',
      );
    }

    const players = game.players as Record<string, Record<string, unknown>>;
    if (!players[uid]) {
      throw new HttpsError('not-found', 'You are not in this game.');
    }

    players[uid].ready = true;

    // Mark all bots as ready when a human readies up
    const playerOrder = game.playerOrder as string[];
    for (const pUid of playerOrder) {
      if (pUid.startsWith('bot_')) {
        players[pUid].ready = true;
      }
    }

    tx.update(gameRef, {
      players,
      updatedAt: Date.now(),
    });
  });

  // If game was complete, reset for next round first
  const snap = await gameRef.get();
  if (snap.exists && snap.data()?.phase === GP.Complete) {
    await resetForNextRound();

    // Re-set ready flags after reset (resetForNextRound clears them)
    await db().runTransaction(async (tx) => {
      const freshSnap = await tx.get(gameRef);
      if (!freshSnap.exists) return;
      const game = freshSnap.data()!;
      if (game.phase !== GP.Waiting) return;
      const players = game.players as Record<string, Record<string, unknown>>;
      const playerOrder = game.playerOrder as string[];
      players[uid].ready = true;
      for (const pUid of playerOrder) {
        if (pUid.startsWith('bot_')) {
          players[pUid].ready = true;
        }
      }
      tx.update(gameRef, { players, updatedAt: Date.now() });
    });
  }

  // Try to start the round
  const started = await maybeStartRound();

  if (started) {
    // Execute bot moves for initial deal
    await executeBotMoves();

    // Check if all placements are done (bots might have filled it)
    await checkAdvance();
  }

  return { success: true, started };
});

// ---- placeCards ----

interface PlaceCardsData {
  placements: Array<{ card: Card; row: Row }>;
  discard?: Card;
}

export const placeCards = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const data = request.data as PlaceCardsData;
  if (!data?.placements || !Array.isArray(data.placements)) {
    throw new HttpsError('invalid-argument', 'Must provide placements array.');
  }

  const gameRef = db().doc(GAME_DOC);

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

    const hand = player.currentHand as Card[];
    if (hand.length === 0) {
      throw new HttpsError(
        'failed-precondition',
        'You have already placed your cards this street.',
      );
    }

    // Validate placement count
    if (street === 1) {
      // Initial: place all 5
      if (data.placements.length !== INITIAL_DEAL_COUNT) {
        throw new HttpsError(
          'invalid-argument',
          `Must place exactly ${INITIAL_DEAL_COUNT} cards on initial street.`,
        );
      }
    } else {
      // Streets 2-5: place 2, discard 1
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
    tx.set(db().doc(`games/current/hands/${uid}`), { cards: [] });
  });

  // Check if we can advance
  await checkAdvance();

  return { success: true };
});

// ---- Internal: check if all players placed and advance ----

async function checkAdvance(): Promise<void> {
  const gameRef = db().doc(GAME_DOC);
  const snap = await gameRef.get();
  if (!snap.exists) return;

  const game = snap.data()!;
  const players = game.players as Record<string, { currentHand: Card[] }>;

  const allPlaced = Object.values(players).every((p) => p.currentHand.length === 0);
  if (!allPlaced) return;

  const street = game.street as number;

  if (street >= 5) {
    // Move to scoring
    await db().doc(GAME_DOC).update({ phase: GP.Scoring, updatedAt: Date.now() });
    await scoreRound();
  } else {
    await advanceStreet();
    // After advancing, bots need to play the new street
    await executeBotMoves();
    // Recursively check if bots completing triggers another advance
    await checkAdvance();
  }
}

// ---- autoPlayRounds (scheduled) ----

export const autoPlayRounds = onSchedule('every 1 minutes', async () => {
  const gameRef = db().doc(GAME_DOC);
  const snap = await gameRef.get();
  if (!snap.exists) return;

  const game = snap.data()!;
  const phase = game.phase as GamePhase;
  const updatedAt = game.updatedAt as number;

  // Auto-place for stalled players
  if (
    (phase === GP.InitialDeal ||
      phase === GP.Street2 ||
      phase === GP.Street3 ||
      phase === GP.Street4 ||
      phase === GP.Street5) &&
    Date.now() - updatedAt > PLACE_TIMEOUT_MS
  ) {
    // Force-place for any human who hasn't placed yet
    const players = game.players as Record<string, Record<string, unknown>>;
    const playerOrder = game.playerOrder as string[];

    let changed = false;
    for (const uid of playerOrder) {
      if (uid.startsWith('bot_')) continue;
      const player = players[uid];
      const hand = player.currentHand as Card[];
      if (hand.length === 0) continue;

      // Auto-place using bot logic
      const board = player.board as Board;
      const street = game.street as number;

      if (street === 1) {
        const botPlacements = (await import('./bot-logic')).botPlaceInitial(hand, board);
        const newBoard: Board = { top: [...board.top], middle: [...board.middle], bottom: [...board.bottom] };
        for (const p of botPlacements) {
          newBoard[p.row] = [...newBoard[p.row], p.card];
        }
        players[uid] = { ...player, board: newBoard, currentHand: [] };
      } else {
        const { placements } = (await import('./bot-logic')).botPlaceStreet(hand, board);
        const newBoard: Board = { top: [...board.top], middle: [...board.middle], bottom: [...board.bottom] };
        for (const p of placements) {
          newBoard[p.row] = [...newBoard[p.row], p.card];
        }
        players[uid] = { ...player, board: newBoard, currentHand: [] };
      }

      changed = true;
    }

    if (changed) {
      await gameRef.update({ players, updatedAt: Date.now() });
      await checkAdvance();
    }
  }
});
