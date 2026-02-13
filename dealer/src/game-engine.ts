import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type {
  Card,
  Board,
} from '../../shared/core/types';
import { GamePhase as GP } from '../../shared/core/types';
import {
  INITIAL_DEAL_COUNT,
  STREET_DEAL_COUNT,
  TOTAL_STREETS,
  INITIAL_DEAL_TIMEOUT_MS,
  STREET_TIMEOUT_MS,
  INTER_ROUND_DELAY_MS,
} from '../../shared/core/constants';
import { createShuffledDeck, dealCards } from '../../shared/game-logic/deck';
import { scoreAllPlayers, isFoul } from '../../shared/game-logic/scoring';
import { gameDoc, handDoc, deckDoc } from '../../shared/core/firestore-paths';
import { emptyBoard, phaseForStreet } from '../../shared/game-logic/board-utils';

// ---- Helper: all active (non-fouled) players have placed their cards ----
function allActivePlaced(
  players: Record<string, { currentHand: Card[]; fouled: boolean }>,
  playerOrder: string[],
): boolean {
  return playerOrder.every((uid) => {
    const p = players[uid];
    return !p || p.fouled || p.currentHand.length === 0;
  });
}

// ---- Public API ----

/**
 * Start a new round if >=2 players in playerOrder.
 * Deal initial 5 cards to each player.
 */
export async function maybeStartRound(db: Firestore, roomId: string): Promise<boolean> {
  const gameRef = db.doc(gameDoc(roomId));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) return false;

    const game = snap.data()!;

    // Can only start from Lobby phase
    if (game.phase !== GP.Lobby) return false;

    // Host must have pressed Start (round >= 1)
    if ((game.round as number) < 1) return false;

    const players = game.players as Record<string, unknown>;
    const uids = game.playerOrder as string[];

    // Need at least 2 players to start
    if (uids.length < 2) return false;

    // Deal cards to all players in playerOrder
    const now = Date.now();
    const phaseDeadline = now + INITIAL_DEAL_TIMEOUT_MS;
    const updatedPlayers: Record<string, unknown> = {};

    for (const uid of uids) {
      const deck = createShuffledDeck();
      const { dealt, remaining } = dealCards(deck, INITIAL_DEAL_COUNT);

      const p = players[uid] as Record<string, unknown>;
      updatedPlayers[uid] = {
        ...p,
        board: emptyBoard(),
        currentHand: dealt,
        fouled: false,
      };

      tx.set(db.doc(deckDoc(uid, roomId)), { cards: remaining });
      tx.set(db.doc(handDoc(uid, roomId)), { cards: dealt });
    }

    // Preserve observers (in players but not in playerOrder)
    for (const uid of Object.keys(players)) {
      if (!updatedPlayers[uid]) {
        const p = players[uid] as Record<string, unknown>;
        updatedPlayers[uid] = {
          ...p,
          board: emptyBoard(),
          currentHand: [],
          fouled: false,
        };
      }
    }

    tx.update(gameRef, {
      phase: GP.InitialDeal,
      street: 1,
      players: updatedPlayers,
      phaseDeadline,
      updatedAt: now,
    });

    return true;
  });
}

/**
 * After all players have placed cards for the current street,
 * deal the next 3 cards from each player's personal deck.
 * Skip dealing to fouled players.
 * If this was the last street, transition to scoring.
 */
export async function advanceStreet(db: Firestore, roomId: string): Promise<'scoring' | 'advanced' | 'noop'> {
  const gameRef = db.doc(gameDoc(roomId));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) return 'noop';

    const game = snap.data()!;
    const phase = game.phase as string;

    // Only advance during placement phases
    if (
      phase !== GP.InitialDeal &&
      phase !== GP.Street2 &&
      phase !== GP.Street3 &&
      phase !== GP.Street4 &&
      phase !== GP.Street5
    ) {
      return 'noop';
    }

    const currentStreet = game.street as number;
    const players = game.players as Record<string, Record<string, unknown>>;
    const uids = game.playerOrder as string[];

    // Verify all active players have placed
    if (!allActivePlaced(players as Record<string, { currentHand: Card[]; fouled: boolean }>, uids)) {
      return 'noop';
    }

    if (currentStreet >= TOTAL_STREETS) {
      // All streets done - go to scoring
      tx.update(gameRef, {
        phase: GP.Scoring,
        updatedAt: Date.now(),
      });
      return 'scoring';
    }

    // Read ALL deck docs first (Firestore requires all reads before writes)
    // Only read decks for non-fouled players
    const deckSnaps = new Map<string, Card[]>();
    for (const uid of uids) {
      const p = players[uid] as { fouled: boolean };
      if (p.fouled) continue;
      const deckSnap = await tx.get(db.doc(deckDoc(uid, roomId)));
      deckSnaps.set(uid, (deckSnap.data()?.cards ?? []) as Card[]);
    }

    // Now do all writes
    const nextStreet = currentStreet + 1;
    const nextPhase = phaseForStreet(nextStreet);
    const phaseDeadline = Date.now() + STREET_TIMEOUT_MS;
    const updatedPlayers: Record<string, unknown> = {};

    for (const uid of uids) {
      const p = players[uid] as { fouled: boolean };
      if (p.fouled) {
        // Fouled players get no cards
        updatedPlayers[uid] = { ...players[uid], currentHand: [] };
        continue;
      }

      const deckCards = deckSnaps.get(uid)!;
      const { dealt, remaining } = dealCards(deckCards, STREET_DEAL_COUNT);

      updatedPlayers[uid] = {
        ...players[uid],
        currentHand: dealt,
      };

      tx.set(db.doc(deckDoc(uid, roomId)), { cards: remaining });
      tx.set(db.doc(handDoc(uid, roomId)), { cards: dealt });
    }

    // Preserve observers (in players but not in playerOrder)
    for (const uid of Object.keys(players)) {
      if (!updatedPlayers[uid]) {
        updatedPlayers[uid] = players[uid];
      }
    }

    tx.update(gameRef, {
      phase: nextPhase,
      street: nextStreet,
      players: updatedPlayers,
      phaseDeadline,
      updatedAt: Date.now(),
    });

    return 'advanced';
  });
}

/**
 * Score the round after all 13 cards have been placed.
 * Build fouls map from auto-fouled players + natural fouls.
 */
export async function scoreRound(db: Firestore, roomId: string): Promise<void> {
  const gameRef = db.doc(gameDoc(roomId));

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) return;

    const game = snap.data()!;
    if (game.phase !== GP.Scoring) return;

    const players = game.players as Record<string, { board: Board; uid: string; fouled: boolean; score: number }>;
    const uids = game.playerOrder as string[];

    // Build boards map and fouls map
    const boards = new Map<string, Board>();
    const fouls = new Map<string, boolean>();
    for (const uid of uids) {
      boards.set(uid, players[uid].board);
      // Fouled if auto-fouled (timeout) OR natural foul (bad row ordering)
      fouls.set(uid, players[uid].fouled || isFoul(players[uid].board));
    }

    const result = scoreAllPlayers(boards, fouls);

    // Build results map and accumulate scores
    const roundResults: Record<string, { netScore: number; fouled: boolean }> = {};
    for (const ps of result.players) {
      roundResults[ps.uid] = {
        netScore: ps.netScore,
        fouled: ps.fouled,
      };
    }

    // Update game state
    const updatedPlayers: Record<string, unknown> = {};
    for (const uid of uids) {
      const p = players[uid] as { score: number };
      const roundScore = roundResults[uid]?.netScore ?? 0;
      updatedPlayers[uid] = {
        ...players[uid],
        currentHand: [],
        score: p.score + roundScore,
      };
    }

    // Preserve observers (in players but not in playerOrder)
    for (const uid of Object.keys(players)) {
      if (!updatedPlayers[uid]) {
        updatedPlayers[uid] = players[uid];
      }
    }

    const currentRound = game.round as number;
    const totalRounds = game.totalRounds as number;
    const isFinalRound = currentRound >= totalRounds;

    tx.update(gameRef, {
      phase: isFinalRound ? GP.MatchComplete : GP.Complete,
      roundResults,
      players: updatedPlayers,
      phaseDeadline: isFinalRound ? null : Date.now() + INTER_ROUND_DELAY_MS,
      updatedAt: Date.now(),
    });
  });
}

/**
 * Transition from Complete back to Lobby for next round.
 * playerOrder stays fixed during a match (no observer promotion).
 * Scores are preserved (cumulative). Round is incremented.
 */
export async function resetForNextRound(db: Firestore, roomId: string): Promise<void> {
  const gameRef = db.doc(gameDoc(roomId));

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) return;

    const game = snap.data()!;
    if (game.phase !== GP.Complete) return;

    const players = game.players as Record<string, Record<string, unknown>>;
    const uids = game.playerOrder as string[];
    const currentRound = game.round as number;

    const updatedPlayers: Record<string, unknown> = {};

    // Reset active players' boards/hands but keep scores
    for (const uid of uids) {
      updatedPlayers[uid] = {
        ...players[uid],
        board: emptyBoard(),
        currentHand: [],
        fouled: false,
      };
    }

    // Preserve observers (in players but not in playerOrder)
    for (const uid of Object.keys(players)) {
      if (!uids.includes(uid)) {
        updatedPlayers[uid] = {
          ...players[uid],
          board: emptyBoard(),
          currentHand: [],
          fouled: false,
        };
      }
    }

    tx.update(gameRef, {
      phase: GP.Lobby,
      street: 0,
      players: updatedPlayers,
      round: currentRound + 1,
      phaseDeadline: null,
      roundResults: FieldValue.delete(),
      updatedAt: Date.now(),
    });
  });
}

/**
 * Handle phase timeout: mark unplaced players as fouled, clear their hands,
 * then the dealer will detect the state change and advance.
 */
export async function handlePhaseTimeout(db: Firestore, roomId: string): Promise<void> {
  const gameRef = db.doc(gameDoc(roomId));

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) return;

    const game = snap.data()!;
    const phase = game.phase as string;
    const phaseDeadline = game.phaseDeadline as number | null;

    // Only foul during placement phases when deadline has actually passed
    if (
      phase !== GP.InitialDeal &&
      phase !== GP.Street2 &&
      phase !== GP.Street3 &&
      phase !== GP.Street4 &&
      phase !== GP.Street5
    ) return;
    if (phaseDeadline !== null && phaseDeadline > Date.now()) return;

    const players = game.players as Record<string, Record<string, unknown>>;
    const playerOrder = game.playerOrder as string[];

    let changed = false;

    for (const uid of playerOrder) {
      const player = players[uid];
      const hand = player.currentHand as Card[];

      // Skip if already placed or already fouled
      if (hand.length === 0) continue;
      if (player.fouled) continue;

      // Mark as fouled, clear hand and board
      players[uid] = {
        ...player,
        fouled: true,
        currentHand: [],
        board: emptyBoard(),
      };
      tx.set(db.doc(handDoc(uid, roomId)), { cards: [] });
      changed = true;
    }

    if (changed) {
      // Clear deadline to prevent re-processing
      tx.update(gameRef, {
        players,
        phaseDeadline: null,
        updatedAt: Date.now(),
      });
    }
  });
}

/**
 * Check if all active players have placed and advance the game.
 * Called by the dealer after detecting state changes.
 *
 * Delegates to advanceStreet() which handles all logic inside a transaction.
 * Loops (instead of recursing) to handle the case where all remaining
 * players are fouled after advancing — each iteration is a new transaction.
 */
export async function checkAndAdvance(db: Firestore, roomId: string): Promise<void> {
  const MAX_ITERATIONS = TOTAL_STREETS + 1; // safety bound

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const result = await advanceStreet(db, roomId);

    if (result === 'scoring') {
      await scoreRound(db, roomId);
      return;
    }

    if (result === 'noop') {
      return;
    }

    // result === 'advanced' — loop to check if the next street also needs advancing
    // (e.g., all remaining players are fouled)
  }
}
