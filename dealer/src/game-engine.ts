import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type {
  Card,
  Board,
  PlayerState,
} from '../../shared/core/types';
import { GamePhase as GP } from '../../shared/core/types';
import {
  INITIAL_DEAL_COUNT,
  STREET_DEAL_COUNT,
  TOTAL_STREETS,
  INITIAL_DEAL_TIMEOUT_MS,
  STREET_TIMEOUT_MS,
  INTER_ROUND_DELAY_MS,
  TOP_ROW_SIZE,
  FIVE_CARD_ROW_SIZE,
} from '../../shared/core/constants';
import { createShuffledDeck, dealCards } from '../../shared/game-logic/deck';
import { scoreAllPlayers, isFoul } from '../../shared/game-logic/scoring';
import { gameDoc, handDoc, deckDoc } from '../../shared/core/firestore-paths';
import { emptyBoard, phaseForStreet } from '../../shared/game-logic/board-utils';
import { parseGameState, parseDeckDoc, parseHandDoc } from '../../shared/core/schemas';

// ---- Helper: all active (non-fouled) players have placed their cards ----
function allActivePlaced(
  players: Record<string, PlayerState>,
  playerOrder: string[],
): boolean {
  return playerOrder.every((uid) => {
    const p = players[uid];
    return !p || p.fouled || p.hasPlaced;
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

    const game = parseGameState(snap.data());

    if (game.phase !== GP.Lobby) return false;
    if (game.round < 1) return false;
    if (game.playerOrder.length < 2) return false;

    const now = Date.now();
    const phaseDeadline = now + INITIAL_DEAL_TIMEOUT_MS;

    // Field-path updates — only touch the fields we need, observers stay untouched
    const updates: Record<string, any> = {
      phase: GP.InitialDeal,
      street: 1,
      phaseDeadline,
      updatedAt: now,
    };

    for (const uid of game.playerOrder) {
      const deck = createShuffledDeck();
      const { dealt, remaining } = dealCards(deck, INITIAL_DEAL_COUNT);

      updates[`players.${uid}.board`] = emptyBoard();
      updates[`players.${uid}.hasPlaced`] = false;
      updates[`players.${uid}.fouled`] = false;

      tx.set(db.doc(deckDoc(uid, roomId)), { cards: remaining });
      tx.set(db.doc(handDoc(uid, roomId)), { cards: dealt });
    }

    // Reset observer boards (they aren't in playerOrder)
    for (const uid of Object.keys(game.players)) {
      if (!game.playerOrder.includes(uid)) {
        updates[`players.${uid}.board`] = emptyBoard();
        updates[`players.${uid}.hasPlaced`] = true;
        updates[`players.${uid}.fouled`] = false;
      }
    }

    tx.update(gameRef, updates);
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

    const game = parseGameState(snap.data());

    // Only advance during placement phases
    if (
      game.phase !== GP.InitialDeal &&
      game.phase !== GP.Street2 &&
      game.phase !== GP.Street3 &&
      game.phase !== GP.Street4 &&
      game.phase !== GP.Street5
    ) {
      return 'noop';
    }

    if (!allActivePlaced(game.players, game.playerOrder)) {
      return 'noop';
    }

    if (game.street >= TOTAL_STREETS) {
      tx.update(gameRef, {
        phase: GP.Scoring,
        updatedAt: Date.now(),
      });
      return 'scoring';
    }

    // Read ALL deck docs first (Firestore requires all reads before writes)
    const deckSnaps = new Map<string, Card[]>();
    for (const uid of game.playerOrder) {
      if (game.players[uid].fouled) continue;
      const deckSnap = await tx.get(db.doc(deckDoc(uid, roomId)));
      deckSnaps.set(uid, parseDeckDoc(deckSnap.data()).cards);
    }

    // Field-path updates — observers untouched
    const nextStreet = game.street + 1;
    const nextPhase = phaseForStreet(nextStreet);
    const phaseDeadline = Date.now() + STREET_TIMEOUT_MS;
    const updates: Record<string, any> = {
      phase: nextPhase,
      street: nextStreet,
      phaseDeadline,
      updatedAt: Date.now(),
    };

    for (const uid of game.playerOrder) {
      if (game.players[uid].fouled) continue;

      const deckCards = deckSnaps.get(uid)!;
      const { dealt, remaining } = dealCards(deckCards, STREET_DEAL_COUNT);

      updates[`players.${uid}.hasPlaced`] = false;

      tx.set(db.doc(deckDoc(uid, roomId)), { cards: remaining });
      tx.set(db.doc(handDoc(uid, roomId)), { cards: dealt });
    }

    tx.update(gameRef, updates);
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

    const game = parseGameState(snap.data());
    if (game.phase !== GP.Scoring) return;

    const boards = new Map<string, Board>();
    const fouls = new Map<string, boolean>();
    for (const uid of game.playerOrder) {
      const player = game.players[uid];
      boards.set(uid, player.board);
      fouls.set(uid, player.fouled || isFoul(player.board));
    }

    const result = scoreAllPlayers(boards, fouls);

    const roundResults: Record<string, { netScore: number; fouled: boolean }> = {};
    for (const ps of result.players) {
      roundResults[ps.uid] = { netScore: ps.netScore, fouled: ps.fouled };
    }

    // Field-path updates — only update scores for active players
    const isFinalRound = game.round >= game.totalRounds;
    const updates: Record<string, any> = {
      phase: isFinalRound ? GP.MatchComplete : GP.Complete,
      roundResults,
      phaseDeadline: isFinalRound ? null : Date.now() + INTER_ROUND_DELAY_MS,
      updatedAt: Date.now(),
    };

    for (const uid of game.playerOrder) {
      const roundScore = roundResults[uid]?.netScore ?? 0;
      updates[`players.${uid}.score`] = game.players[uid].score + roundScore;
    }

    tx.update(gameRef, updates);
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

    const game = parseGameState(snap.data());
    if (game.phase !== GP.Complete) return;

    // Field-path updates — reset all players uniformly
    const updates: Record<string, any> = {
      phase: GP.Lobby,
      street: 0,
      round: game.round + 1,
      phaseDeadline: null,
      roundResults: FieldValue.delete(),
      updatedAt: Date.now(),
    };

    for (const uid of Object.keys(game.players)) {
      updates[`players.${uid}.board`] = emptyBoard();
      updates[`players.${uid}.hasPlaced`] = true;
      updates[`players.${uid}.fouled`] = false;
    }

    tx.update(gameRef, updates);
  });
}

/**
 * Auto-place cards randomly for players who haven't placed before the deadline.
 * Cards are distributed into available board slots instead of fouling.
 */
export async function handlePhaseTimeout(db: Firestore, roomId: string): Promise<void> {
  const gameRef = db.doc(gameDoc(roomId));

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) return;

    const game = parseGameState(snap.data());

    if (
      game.phase !== GP.InitialDeal &&
      game.phase !== GP.Street2 &&
      game.phase !== GP.Street3 &&
      game.phase !== GP.Street4 &&
      game.phase !== GP.Street5
    ) return;
    if (game.phaseDeadline !== null && game.phaseDeadline > Date.now()) return;

    // Collect unplaced player UIDs
    const unplacedUids: string[] = [];
    for (const uid of game.playerOrder) {
      const player = game.players[uid];
      if (!player.hasPlaced && !player.fouled) {
        unplacedUids.push(uid);
      }
    }
    if (unplacedUids.length === 0) return;

    // Read all hand docs FIRST (Firestore requires all reads before writes)
    const handSnaps = new Map<string, Card[]>();
    for (const uid of unplacedUids) {
      const handSnap = await tx.get(db.doc(handDoc(uid, roomId)));
      handSnaps.set(uid, parseHandDoc(handSnap.data()).cards);
    }

    // Now do all writes via field-path updates
    const updates: Record<string, any> = {
      phaseDeadline: null,
      updatedAt: Date.now(),
    };

    for (const uid of unplacedUids) {
      const player = game.players[uid];
      const hand = handSnaps.get(uid)!;
      if (hand.length === 0) continue;

      const newBoard: Board = {
        top: [...player.board.top],
        middle: [...player.board.middle],
        bottom: [...player.board.bottom],
      };

      // Shuffle hand for random placement
      const shuffled = [...hand];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      if (game.street === 1) {
        autoPlaceCards(shuffled, newBoard, 5);
      } else {
        autoPlaceCards(shuffled, newBoard, 2);
      }

      updates[`players.${uid}.board`] = newBoard;
      updates[`players.${uid}.hasPlaced`] = true;
      tx.set(db.doc(handDoc(uid, roomId)), { cards: [] });
      console.log(`[Dealer] [${roomId}] Auto-placed cards for ${player.displayName || uid}`);
    }

    tx.update(gameRef, updates);
  });
}

/** Place N cards from hand into available board slots (bottom → middle → top). */
function autoPlaceCards(cards: Card[], board: Board, count: number): void {
  let placed = 0;
  const rows: Array<{ name: keyof Board; max: number }> = [
    { name: 'bottom', max: FIVE_CARD_ROW_SIZE },
    { name: 'middle', max: FIVE_CARD_ROW_SIZE },
    { name: 'top', max: TOP_ROW_SIZE },
  ];

  for (const { name, max } of rows) {
    while (placed < count && board[name].length < max) {
      board[name].push(cards[placed]);
      placed++;
    }
  }
}

/**
 * Check if all active players have placed and advance the game.
 * Loops to handle the case where all remaining players are fouled.
 */
export async function checkAndAdvance(db: Firestore, roomId: string): Promise<void> {
  const MAX_ITERATIONS = TOTAL_STREETS + 1;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const result = await advanceStreet(db, roomId);

    if (result === 'scoring') {
      await scoreRound(db, roomId);
      return;
    }

    if (result === 'noop') {
      return;
    }
  }
}
