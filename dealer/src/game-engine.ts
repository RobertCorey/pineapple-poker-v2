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
  TOP_ROW_SIZE,
  FIVE_CARD_ROW_SIZE,
} from '../../shared/core/constants';
import { createShuffledDeck, dealCards } from '../../shared/game-logic/deck';
import { scoreAllPlayers, isFoul } from '../../shared/game-logic/scoring';
import { gameDoc, handDoc, deckDoc } from '../../shared/core/firestore-paths';
import { emptyBoard, phaseForStreet } from '../../shared/game-logic/board-utils';
import { parseGameState, parseDeckDoc } from '../../shared/core/schemas';
import { botPlaceInitialDeal, botPlaceStreet } from './bot-strategy';

// ---- Helper: all active (non-fouled) players have placed their cards ----
function allActivePlaced(
  players: Record<string, PlayerState>,
  playerOrder: string[],
): boolean {
  return playerOrder.every((uid) => {
    const p = players[uid];
    return !p || p.fouled || p.currentHand.length === 0;
  });
}

/** Copy all players NOT in updatedPlayers from source (preserves observers). */
function preserveObservers(
  allPlayers: Record<string, PlayerState>,
  updatedPlayers: Record<string, PlayerState>,
): void {
  for (const uid of Object.keys(allPlayers)) {
    if (!updatedPlayers[uid]) {
      updatedPlayers[uid] = allPlayers[uid];
    }
  }
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

    // Can only start from Lobby phase
    if (game.phase !== GP.Lobby) return false;

    // Host must have pressed Start (round >= 1)
    if (game.round < 1) return false;

    // Need at least 2 players to start
    if (game.playerOrder.length < 2) return false;

    // Deal cards to all players in playerOrder
    const now = Date.now();
    const phaseDeadline = now + game.settings.turnTimeoutMs;
    const updatedPlayers: Record<string, PlayerState> = {};

    for (const uid of game.playerOrder) {
      const deck = createShuffledDeck();
      const { dealt, remaining } = dealCards(deck, INITIAL_DEAL_COUNT);

      updatedPlayers[uid] = {
        ...game.players[uid],
        board: emptyBoard(),
        currentHand: dealt,
        fouled: false,
      };

      tx.set(db.doc(deckDoc(uid, roomId)), { cards: remaining });
      tx.set(db.doc(handDoc(uid, roomId)), { cards: dealt });
    }

    // Preserve observers (in players but not in playerOrder)
    for (const uid of Object.keys(game.players)) {
      if (!updatedPlayers[uid]) {
        updatedPlayers[uid] = {
          ...game.players[uid],
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

    // Verify all active players have placed
    if (!allActivePlaced(game.players, game.playerOrder)) {
      return 'noop';
    }

    if (game.street >= TOTAL_STREETS) {
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
    for (const uid of game.playerOrder) {
      if (game.players[uid].fouled) continue;
      const deckSnap = await tx.get(db.doc(deckDoc(uid, roomId)));
      const deckData = parseDeckDoc(deckSnap.data());
      deckSnaps.set(uid, deckData.cards);
    }

    // Now do all writes
    const nextStreet = game.street + 1;
    const nextPhase = phaseForStreet(nextStreet);
    const phaseDeadline = Date.now() + game.settings.turnTimeoutMs;
    const updatedPlayers: Record<string, PlayerState> = {};

    for (const uid of game.playerOrder) {
      if (game.players[uid].fouled) {
        // Fouled players get no cards
        updatedPlayers[uid] = { ...game.players[uid], currentHand: [] };
        continue;
      }

      const deckCards = deckSnaps.get(uid)!;
      const { dealt, remaining } = dealCards(deckCards, STREET_DEAL_COUNT);

      updatedPlayers[uid] = {
        ...game.players[uid],
        currentHand: dealt,
      };

      tx.set(db.doc(deckDoc(uid, roomId)), { cards: remaining });
      tx.set(db.doc(handDoc(uid, roomId)), { cards: dealt });
    }

    // Preserve observers
    preserveObservers(game.players, updatedPlayers);

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

    const game = parseGameState(snap.data());
    if (game.phase !== GP.Scoring) return;

    // Build boards map and fouls map
    const boards = new Map<string, Board>();
    const fouls = new Map<string, boolean>();
    for (const uid of game.playerOrder) {
      const player = game.players[uid];
      boards.set(uid, player.board);
      // Fouled if auto-fouled (timeout) OR natural foul (bad row ordering)
      fouls.set(uid, player.fouled || isFoul(player.board));
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
    const updatedPlayers: Record<string, PlayerState> = {};
    for (const uid of game.playerOrder) {
      const player = game.players[uid];
      const roundScore = roundResults[uid]?.netScore ?? 0;
      updatedPlayers[uid] = {
        ...player,
        currentHand: [],
        score: player.score + roundScore,
      };
    }

    // Preserve observers
    preserveObservers(game.players, updatedPlayers);

    const isFinalRound = game.round >= game.totalRounds;

    tx.update(gameRef, {
      phase: isFinalRound ? GP.MatchComplete : GP.Complete,
      roundResults,
      players: updatedPlayers,
      phaseDeadline: isFinalRound ? null : Date.now() + game.settings.interRoundDelayMs,
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

    const game = parseGameState(snap.data());
    if (game.phase !== GP.Complete) return;

    const updatedPlayers: Record<string, PlayerState> = {};

    // Reset active players' boards/hands but keep scores
    for (const uid of game.playerOrder) {
      updatedPlayers[uid] = {
        ...game.players[uid],
        board: emptyBoard(),
        currentHand: [],
        fouled: false,
      };
    }

    // Preserve observers (in players but not in playerOrder)
    for (const uid of Object.keys(game.players)) {
      if (!game.playerOrder.includes(uid)) {
        updatedPlayers[uid] = {
          ...game.players[uid],
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
      round: game.round + 1,
      phaseDeadline: null,
      roundResults: FieldValue.delete(),
      updatedAt: Date.now(),
    });
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

    // Only act during placement phases when deadline has actually passed
    if (
      game.phase !== GP.InitialDeal &&
      game.phase !== GP.Street2 &&
      game.phase !== GP.Street3 &&
      game.phase !== GP.Street4 &&
      game.phase !== GP.Street5
    ) return;
    if (game.phaseDeadline !== null && game.phaseDeadline > Date.now()) return;

    const updatedPlayers: Record<string, PlayerState> = { ...game.players };
    let changed = false;

    for (const uid of game.playerOrder) {
      const player = game.players[uid];

      // Skip if already placed or already fouled
      if (player.currentHand.length === 0) continue;
      if (player.fouled) continue;

      const newBoard: Board = {
        top: [...player.board.top],
        middle: [...player.board.middle],
        bottom: [...player.board.bottom],
      };

      // Shuffle hand for random placement
      const shuffled = [...player.currentHand];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      if (game.street === 1) {
        // Initial deal: place all 5 cards into free slots
        autoPlaceCards(shuffled, newBoard, 5);
      } else {
        // Streets 2-5: place 2, discard 1
        autoPlaceCards(shuffled, newBoard, 2);
        // 3rd card is discarded (just don't place it)
      }

      updatedPlayers[uid] = {
        ...player,
        board: newBoard,
        currentHand: [],
      };
      tx.set(db.doc(handDoc(uid, roomId)), { cards: [] });
      changed = true;
      console.log(`[Dealer] [${roomId}] Auto-placed cards for ${player.displayName || uid}`);
    }

    if (changed) {
      // Clear deadline to prevent re-processing
      tx.update(gameRef, {
        players: updatedPlayers,
        phaseDeadline: null,
        updatedAt: Date.now(),
      });
    }
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
 * Auto-place cards for a single bot player.
 * Uses the bot strategy to make intelligent placement decisions.
 * Returns true if the bot placed cards (triggers checkAndAdvance).
 */
export async function placeSingleBotCards(db: Firestore, roomId: string, botUid: string): Promise<boolean> {
  const gameRef = db.doc(gameDoc(roomId));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) return false;

    const game = parseGameState(snap.data());

    // Only act during placement phases
    if (
      game.phase !== GP.InitialDeal &&
      game.phase !== GP.Street2 &&
      game.phase !== GP.Street3 &&
      game.phase !== GP.Street4 &&
      game.phase !== GP.Street5
    ) return false;

    const player = game.players[botUid];
    if (!player?.isBot || player.fouled || player.currentHand.length === 0) return false;

    let decision;
    if (game.street === 1) {
      decision = botPlaceInitialDeal(player.currentHand, player.board);
    } else {
      decision = botPlaceStreet(player.currentHand, player.board);
    }

    // Apply placements
    const newBoard: Board = {
      top: [...player.board.top],
      middle: [...player.board.middle],
      bottom: [...player.board.bottom],
    };

    for (const p of decision.placements) {
      newBoard[p.row] = [...newBoard[p.row], p.card];
    }

    const updatedPlayers: Record<string, PlayerState> = {
      ...game.players,
      [botUid]: {
        ...player,
        board: newBoard,
        currentHand: [],
      },
    };

    tx.set(db.doc(handDoc(botUid, roomId)), { cards: [] });
    tx.update(gameRef, {
      players: updatedPlayers,
      updatedAt: Date.now(),
    });

    console.log(`[Dealer] [${roomId}] Bot ${player.displayName} placed cards`);
    return true;
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
