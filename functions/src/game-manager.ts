import * as admin from 'firebase-admin';
import type {
  Card,
  Board,
  GamePhase,
} from '../../shared/types';
import { GamePhase as GP } from '../../shared/types';
import {
  INITIAL_DEAL_COUNT,
  STREET_DEAL_COUNT,
  TOTAL_STREETS,
} from '../../shared/constants';
import { createShuffledDeck, dealCards } from '../../shared/deck';
import { scoreAllPlayers } from '../../shared/scoring';
import { botPlaceInitial, botPlaceStreet } from './bot-logic';

const db = () => admin.firestore();

// ---- Firestore paths ----
const GAME_DOC = 'games/current';
const handDoc = (uid: string) => `games/current/hands/${uid}`;
const deckDoc = (uid: string) => `games/current/decks/${uid}`;

// ---- Helper: empty board ----
function emptyBoard(): Board {
  return { top: [], middle: [], bottom: [] };
}

// ---- Helper: next phase for a given street ----
function phaseForStreet(street: number): GamePhase {
  switch (street) {
    case 1: return GP.InitialDeal;
    case 2: return GP.Street2;
    case 3: return GP.Street3;
    case 4: return GP.Street4;
    case 5: return GP.Street5;
    default: return GP.Scoring;
  }
}

// ---- Helper: all players have placed their cards ----
function allPlayersPlaced(
  players: Record<string, { currentHand: Card[] }>,
): boolean {
  return Object.values(players).every((p) => p.currentHand.length === 0);
}

// ---- Public API ----

/**
 * Check if all players are ready. If so, start a new round:
 * - Create a personal 52-card deck per player
 * - Deal initial 5 cards to each player
 * - Store hands in private subcollection, decks in server-only subcollection
 * - Transition phase to INITIAL_DEAL
 */
export async function maybeStartRound(): Promise<boolean> {
  const gameRef = db().doc(GAME_DOC);

  return db().runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) return false;

    const game = snap.data()!;
    if (game.phase !== GP.Waiting) return false;

    const players = game.players as Record<string, unknown>;
    const uids = game.playerOrder as string[];

    // Check all players are ready
    for (const uid of uids) {
      const p = players[uid] as { ready: boolean };
      if (!p.ready) return false;
    }

    if (uids.length < 2) return false;

    // Deal initial cards to each player
    const now = Date.now();
    const updatedPlayers: Record<string, unknown> = {};

    for (const uid of uids) {
      const deck = createShuffledDeck();
      const { dealt, remaining } = dealCards(deck, INITIAL_DEAL_COUNT);

      const p = players[uid] as Record<string, unknown>;
      updatedPlayers[uid] = {
        ...p,
        board: emptyBoard(),
        currentHand: dealt,
        ready: false,
        score: 0,
      };

      // Store remaining deck (server-only)
      tx.set(db().doc(deckDoc(uid)), { cards: remaining });
      // Store hand (private to player)
      tx.set(db().doc(handDoc(uid)), { cards: dealt });
    }

    tx.update(gameRef, {
      phase: GP.InitialDeal,
      street: 1,
      players: updatedPlayers,
      updatedAt: now,
    });

    return true;
  });
}

/**
 * After all players have placed cards for the current street,
 * deal the next 3 cards from each player's personal deck.
 * If this was the last street, transition to scoring.
 */
export async function advanceStreet(): Promise<void> {
  const gameRef = db().doc(GAME_DOC);

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) return;

    const game = snap.data()!;
    const currentStreet = game.street as number;
    const players = game.players as Record<string, Record<string, unknown>>;
    const uids = game.playerOrder as string[];

    // Verify all players have placed
    if (!allPlayersPlaced(players as Record<string, { currentHand: Card[] }>)) {
      return;
    }

    if (currentStreet >= TOTAL_STREETS) {
      // All streets done - go to scoring
      tx.update(gameRef, {
        phase: GP.Scoring,
        updatedAt: Date.now(),
      });
      return;
    }

    // Read ALL deck docs first (Firestore requires all reads before writes)
    const deckSnaps = new Map<string, Card[]>();
    for (const uid of uids) {
      const deckSnap = await tx.get(db().doc(deckDoc(uid)));
      deckSnaps.set(uid, (deckSnap.data()?.cards ?? []) as Card[]);
    }

    // Now do all writes
    const nextStreet = currentStreet + 1;
    const updatedPlayers: Record<string, unknown> = {};

    for (const uid of uids) {
      const deckCards = deckSnaps.get(uid)!;
      const { dealt, remaining } = dealCards(deckCards, STREET_DEAL_COUNT);

      updatedPlayers[uid] = {
        ...players[uid],
        currentHand: dealt,
      };

      tx.set(db().doc(deckDoc(uid)), { cards: remaining });
      tx.set(db().doc(handDoc(uid)), { cards: dealt });
    }

    tx.update(gameRef, {
      phase: phaseForStreet(nextStreet),
      street: nextStreet,
      players: updatedPlayers,
      updatedAt: Date.now(),
    });
  });
}

/**
 * Score the round after all 13 cards have been placed.
 * Uses pairwise scoring from shared/scoring.ts.
 * Updates the scoreboard collection.
 */
export async function scoreRound(): Promise<void> {
  const gameRef = db().doc(GAME_DOC);

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) return;

    const game = snap.data()!;
    if (game.phase !== GP.Scoring) return;

    const players = game.players as Record<string, { board: Board; uid: string }>;
    const uids = game.playerOrder as string[];

    // Build boards map for scoring
    const boards = new Map<string, Board>();
    for (const uid of uids) {
      boards.set(uid, players[uid].board);
    }

    const result = scoreAllPlayers(boards);

    // Build results map for game document
    const roundResults: Record<string, { netScore: number; fouled: boolean; royalties: unknown }> = {};
    for (const ps of result.players) {
      roundResults[ps.uid] = {
        netScore: ps.netScore,
        fouled: ps.fouled,
        royalties: ps.royalties,
      };
    }

    // Read all scoreboard docs first (Firestore requires all reads before writes)
    const scoreSnaps = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    for (const ps of result.players) {
      const scoreRef = db().doc(`scoreboard/${ps.uid}`);
      scoreSnaps.set(ps.uid, await tx.get(scoreRef));
    }

    // Now write all scoreboard updates
    for (const ps of result.players) {
      const scoreRef = db().doc(`scoreboard/${ps.uid}`);
      const scoreSnap = scoreSnaps.get(ps.uid)!;
      const existing = scoreSnap.exists ? scoreSnap.data()! : { totalScore: 0, rounds: 0, wins: 0 };

      tx.set(scoreRef, {
        ...existing,
        totalScore: (existing.totalScore ?? 0) + ps.netScore,
        rounds: (existing.rounds ?? 0) + 1,
        lastUpdated: Date.now(),
      }, { merge: true });
    }

    // Update game state: mark players as not ready, transition to Complete
    const updatedPlayers: Record<string, unknown> = {};
    for (const uid of uids) {
      updatedPlayers[uid] = {
        ...players[uid],
        ready: false,
        currentHand: [],
      };
    }

    tx.update(gameRef, {
      phase: GP.Complete,
      roundResults,
      players: updatedPlayers,
      updatedAt: Date.now(),
    });
  });
}

/**
 * Execute bot moves for all bot players in the current street.
 * Bots are identified by uid starting with "bot_".
 */
export async function executeBotMoves(): Promise<void> {
  const gameRef = db().doc(GAME_DOC);

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) return;

    const game = snap.data()!;
    const phase = game.phase as GamePhase;
    const street = game.street as number;
    const players = game.players as Record<string, Record<string, unknown>>;
    const uids = game.playerOrder as string[];

    // Only run during placement phases
    if (
      phase !== GP.InitialDeal &&
      phase !== GP.Street2 &&
      phase !== GP.Street3 &&
      phase !== GP.Street4 &&
      phase !== GP.Street5
    ) {
      return;
    }

    const updatedPlayers = { ...players };
    let anyBotMoved = false;

    for (const uid of uids) {
      if (!uid.startsWith('bot_')) continue;

      const player = players[uid];
      const hand = player.currentHand as Card[];
      if (!hand || hand.length === 0) continue;

      const board = player.board as Board;

      if (street === 1) {
        // Initial street: place all 5
        const placements = botPlaceInitial(hand, board);
        const newBoard = { ...board, top: [...board.top], middle: [...board.middle], bottom: [...board.bottom] };
        for (const p of placements) {
          newBoard[p.row] = [...newBoard[p.row], p.card];
        }
        updatedPlayers[uid] = {
          ...player,
          board: newBoard,
          currentHand: [],
        };
      } else {
        // Streets 2-5: place 2, discard 1
        const { placements } = botPlaceStreet(hand, board);
        const newBoard = { ...board, top: [...board.top], middle: [...board.middle], bottom: [...board.bottom] };
        for (const p of placements) {
          newBoard[p.row] = [...newBoard[p.row], p.card];
        }
        updatedPlayers[uid] = {
          ...player,
          board: newBoard,
          currentHand: [],
        };
      }

      // Clear the bot's hand doc
      tx.set(db().doc(handDoc(uid)), { cards: [] });
      anyBotMoved = true;
    }

    if (anyBotMoved) {
      tx.update(gameRef, {
        players: updatedPlayers,
        updatedAt: Date.now(),
      });
    }
  });
}

/**
 * Transition from Complete back to Waiting for next round.
 * Called when all players ready up again.
 */
export async function resetForNextRound(): Promise<void> {
  const gameRef = db().doc(GAME_DOC);

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) return;

    const game = snap.data()!;
    if (game.phase !== GP.Complete) return;

    const players = game.players as Record<string, Record<string, unknown>>;
    const uids = game.playerOrder as string[];

    const updatedPlayers: Record<string, unknown> = {};
    for (const uid of uids) {
      updatedPlayers[uid] = {
        ...players[uid],
        board: emptyBoard(),
        currentHand: [],
        ready: false,
        score: 0,
      };
    }

    tx.update(gameRef, {
      phase: GP.Waiting,
      street: 0,
      players: updatedPlayers,
      roundResults: admin.firestore.FieldValue.delete(),
      updatedAt: Date.now(),
    });
  });
}
