import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import type { Card, Board, Row, GamePhase } from '../../shared/types';
import { GamePhase as GP } from '../../shared/types';
import {
  INITIAL_DEAL_COUNT,
  STREET_PLACE_COUNT,
  TOP_ROW_SIZE,
  FIVE_CARD_ROW_SIZE,
} from '../../shared/constants';

const db = () => admin.firestore();
const GAME_DOC = 'games/current';

function emptyBoard(): Board {
  return { top: [], middle: [], bottom: [] };
}

// ---- removePlayer (inlined from former game-manager.ts) ----

async function removePlayer(uid: string): Promise<void> {
  const gameRef = db().doc(GAME_DOC);

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) return;

    const game = snap.data()!;
    const players = game.players as Record<string, Record<string, unknown>>;
    const playerOrder = game.playerOrder as string[];

    if (!players[uid]) return;

    // Remove from players map
    delete players[uid];

    // Remove from playerOrder
    const newPlayerOrder = playerOrder.filter((u) => u !== uid);

    // Clean up subcollection docs
    tx.delete(db().doc(`games/current/hands/${uid}`));
    tx.delete(db().doc(`games/current/decks/${uid}`));

    // If no players remain, delete the game
    if (Object.keys(players).length === 0) {
      tx.delete(gameRef);
      return;
    }

    tx.update(gameRef, {
      players,
      playerOrder: newPlayerOrder,
      updatedAt: Date.now(),
    });
  });
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
      // Create fresh game document with just this player
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
        gameId: 'current',
        phase: GP.Waiting,
        players,
        playerOrder: [uid],
        street: 0,
        createdAt: now,
        updatedAt: now,
        phaseDeadline: null,
      });
    } else {
      const game = snap.data()!;
      const players = game.players as Record<string, Record<string, unknown>>;
      const playerOrder = game.playerOrder as string[];
      const isWaiting = game.phase === GP.Waiting;

      // Already in game — handle rejoin from sitting out
      if (players[uid]) {
        const player = players[uid];
        if (player.sittingOut) {
          // Clear sitting out, reset state
          players[uid] = {
            ...player,
            sittingOut: false,
            board: emptyBoard(),
            currentHand: [],
            fouled: false,
            score: 0,
          };

          if (isWaiting) {
            // Add back to playerOrder immediately
            playerOrder.push(uid);
            tx.update(gameRef, {
              players,
              playerOrder,
              updatedAt: now,
            });
          } else {
            // Mid-round: stay as observer, auto-promoted next round
            tx.update(gameRef, {
              players,
              updatedAt: now,
            });
          }
        }
        return;
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

      if (isWaiting) {
        // Join as active player
        playerOrder.push(uid);
        tx.update(gameRef, {
          players,
          playerOrder,
          updatedAt: now,
        });
      } else {
        // Join as observer (not added to playerOrder)
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

export const leaveGame = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  await removePlayer(uid);

  // Dealer will detect the state change via onSnapshot and advance if needed

  return { success: true };
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
    tx.set(db().doc(`games/current/hands/${uid}`), { cards: [] });
  });

  // Dealer will detect the state change via onSnapshot and advance if all have placed

  return { success: true };
});
