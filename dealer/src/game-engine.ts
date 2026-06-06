import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type {
  Card,
  Board,
  PlayerState,
  CharmId,
  MutationPick,
  Suit,
} from '../../shared/core/types';
import { GamePhase as GP, Suit as S } from '../../shared/core/types';
import {
  INITIAL_DEAL_COUNT,
  STREET_DEAL_COUNT,
  TOTAL_STREETS,
  TOP_ROW_SIZE,
  FIVE_CARD_ROW_SIZE,
} from '../../shared/core/constants';
import { createShuffledDeck, createDeck, dealCards, shuffleDeck, topUpDeck } from '../../shared/game-logic/deck';
import { scoreAllPlayers, isFoul } from '../../shared/game-logic/scoring';
import { rollCharmOptions } from '../../shared/game-logic/charms';
import { scoreRunPlayers } from '../../shared/game-logic/run-scoring';
import {
  applyMutationsToDeck,
  rollMutationOptions,
  MIN_DECK_SIZE,
  MUTATIONS,
} from '../../shared/game-logic/mutations';
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
      // In run mode, apply each player's owned mutations to a fresh standard
      // deck before shuffling. Mutations stack across rounds.
      let deck = createShuffledDeck();
      if (game.runMode) {
        const ownedMutations = game.mutations?.[uid];
        if (ownedMutations && ownedMutations.length > 0) {
          // Reshuffle after mutation (mutations may append cards or change order).
          deck = shuffleDeck(applyMutationsToDeck(deck, ownedMutations));
        }
        // Safety net: shrink mutations (and their stacks) can starve a round.
        // Top the deck back up so dealing can never throw and soft-lock the room.
        deck = topUpDeck(deck, MIN_DECK_SIZE);
      }
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

    // Build boards map. Track declared (timeout) fouls separately so run-mode
    // scoring can apply its own run-aware foul detection (five-of-a-kind etc).
    const boards = new Map<string, Board>();
    const declaredFouls = new Map<string, boolean>();
    for (const uid of game.playerOrder) {
      const player = game.players[uid];
      boards.set(uid, player.board);
      declaredFouls.set(uid, player.fouled);
    }

    const roundResults: Record<string, { netScore: number; fouled: boolean }> = {};
    let charmBonuses: Record<string, number> = {};

    if (game.runMode) {
      // Forked run-mode scorer: run-aware evaluation (five-of-a-kind) + charm
      // bonuses + capped foul shield. Kept entirely out of the classic path.
      const charmsByUid: Record<string, CharmId[] | undefined> = {};
      for (const uid of game.playerOrder) charmsByUid[uid] = game.charms?.[uid];
      const run = scoreRunPlayers(boards, declaredFouls, charmsByUid);
      for (const uid of game.playerOrder) {
        roundResults[uid] = {
          netScore: run.netScores[uid] ?? 0,
          fouled: run.fouled[uid] ?? false,
        };
      }
      charmBonuses = run.charmBonuses;
    } else {
      const fouls = new Map<string, boolean>();
      for (const uid of game.playerOrder) {
        const player = game.players[uid];
        // Fouled if auto-fouled (timeout) OR natural foul (bad row ordering)
        fouls.set(uid, player.fouled || isFoul(player.board));
      }
      const result = scoreAllPlayers(boards, fouls);
      for (const ps of result.players) {
        roundResults[ps.uid] = { netScore: ps.netScore, fouled: ps.fouled };
      }
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

    // ---- Phase transition: in run mode, go to CharmPick between rounds ----
    if (game.runMode && !isFinalRound) {
      // Roll 3 charm options. Players will pick from the same shared options.
      // Exclude charms ANY player already owns to keep variety.
      const allOwnedCharms = new Set<CharmId>();
      if (game.charms) {
        for (const ids of Object.values(game.charms)) {
          for (const id of ids) allOwnedCharms.add(id);
        }
      }
      const charmOptions = rollCharmOptions(3, allOwnedCharms);

      // Roll 3 mutation options against the most-constrained (smallest actual
      // deck) player's picks, using EXACT resulting sizes. Per-player safety is
      // additionally enforced at pick time (pickMutation) and by the deck
      // top-up in maybeStartRound, so a shared option can never brick anyone.
      let refPicks: MutationPick[] = [];
      let refSize = Infinity;
      for (const uid of game.playerOrder) {
        const picks = game.mutations?.[uid] ?? [];
        const size = applyMutationsToDeck(createDeck(), picks).length;
        if (size < refSize) {
          refSize = size;
          refPicks = picks;
        }
      }
      const mutationOptions = rollMutationOptions(3, refPicks);

      tx.update(gameRef, {
        phase: GP.CharmPick,
        roundResults,
        players: updatedPlayers,
        charmBonuses,
        charmOptions,
        charmPicks: {},
        mutationOptions,
        mutationPicks: {},
        // Deadline so an idle/disconnected human can't soft-lock the run; the
        // dealer auto-picks for anyone who hasn't chosen when this fires.
        phaseDeadline: Date.now() + game.settings.turnTimeoutMs,
        updatedAt: Date.now(),
      });
      return;
    }

    tx.update(gameRef, {
      phase: isFinalRound ? GP.MatchComplete : GP.Complete,
      roundResults,
      players: updatedPlayers,
      charmBonuses: game.runMode ? charmBonuses : FieldValue.delete(),
      phaseDeadline: isFinalRound ? null : Date.now() + game.settings.interRoundDelayMs,
      updatedAt: Date.now(),
    });
  });
}

/**
 * Auto-pick a charm + mutation for a bot. Each bot picks a random option from
 * each set of available options. Returns true if anything was written.
 */
export async function botPickCharm(db: Firestore, roomId: string, botUid: string): Promise<boolean> {
  const gameRef = db.doc(gameDoc(roomId));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) return false;

    const game = parseGameState(snap.data());
    if (game.phase !== GP.CharmPick) return false;
    if (!game.runMode) return false;

    const player = game.players[botUid];
    if (!player?.isBot) return false;

    const charmOptions = game.charmOptions ?? [];
    const mutationOptions = game.mutationOptions ?? [];

    const charmPicks = { ...(game.charmPicks ?? {}) };
    const mutationPicks = { ...(game.mutationPicks ?? {}) };

    let changed = false;

    if (!charmPicks[botUid] && charmOptions.length > 0) {
      charmPicks[botUid] = charmOptions[Math.floor(Math.random() * charmOptions.length)];
      changed = true;
    }

    if (!mutationPicks[botUid] && mutationOptions.length > 0) {
      const id = mutationOptions[Math.floor(Math.random() * mutationOptions.length)];
      const def = MUTATIONS[id];
      const pick: MutationPick = { id };
      // Suit-targeted mutations: bot picks a random suit
      if (def?.requiresTarget === 'suit') {
        const suits: Suit[] = [S.Spades, S.Hearts, S.Diamonds, S.Clubs];
        pick.target = suits[Math.floor(Math.random() * suits.length)];
      }
      mutationPicks[botUid] = pick;
      changed = true;
    }

    if (!changed) return false;

    tx.update(gameRef, {
      charmPicks,
      mutationPicks,
      updatedAt: Date.now(),
    });
    return true;
  });
}

/**
 * Auto-pick a charm + mutation for EVERY active player who hasn't chosen yet.
 * Used when the charm_pick deadline fires, so an idle/disconnected human can't
 * soft-lock the run. Picks random offered options; the deck top-up in
 * maybeStartRound guarantees the result is still dealable.
 */
export async function autoFillCharmPicks(db: Firestore, roomId: string): Promise<boolean> {
  const gameRef = db.doc(gameDoc(roomId));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) return false;

    const game = parseGameState(snap.data());
    if (game.phase !== GP.CharmPick) return false;
    if (!game.runMode) return false;

    const charmOptions = game.charmOptions ?? [];
    const mutationOptions = game.mutationOptions ?? [];
    const charmPicks = { ...(game.charmPicks ?? {}) };
    const mutationPicks = { ...(game.mutationPicks ?? {}) };

    let changed = false;
    for (const uid of game.playerOrder) {
      if (!charmPicks[uid] && charmOptions.length > 0) {
        charmPicks[uid] = charmOptions[Math.floor(Math.random() * charmOptions.length)];
        changed = true;
      }
      if (!mutationPicks[uid] && mutationOptions.length > 0) {
        const id = mutationOptions[Math.floor(Math.random() * mutationOptions.length)];
        const def = MUTATIONS[id];
        const pick: MutationPick = { id };
        if (def?.requiresTarget === 'suit') {
          const suits: Suit[] = [S.Spades, S.Hearts, S.Diamonds, S.Clubs];
          pick.target = suits[Math.floor(Math.random() * suits.length)];
        } else if (id === 'cull') {
          pick.target = String(Math.floor(Math.random() * 0xFFFFFFFF) || 1);
        }
        mutationPicks[uid] = pick;
        changed = true;
      }
    }

    if (!changed) return false;

    tx.update(gameRef, {
      charmPicks,
      mutationPicks,
      updatedAt: Date.now(),
    });
    return true;
  });
}

/**
 * After all active players have picked a charm, apply picks and advance to
 * the next round (Lobby → InitialDeal via maybeStartRound).
 */
export async function processCharmPicks(db: Firestore, roomId: string): Promise<boolean> {
  const gameRef = db.doc(gameDoc(roomId));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) return false;

    const game = parseGameState(snap.data());
    if (game.phase !== GP.CharmPick) return false;
    if (!game.runMode) return false;

    // A player left mid-run: a run needs >=2 players, so end it rather than
    // stranding the survivor in an unstartable next round.
    if (game.playerOrder.length < 2) {
      tx.update(gameRef, {
        phase: GP.MatchComplete,
        phaseDeadline: null,
        updatedAt: Date.now(),
      });
      return true;
    }

    // Wait until ALL active players have picked a charm (and a mutation, unless
    // no safe mutation could be offered this round). Bots/idle humans are
    // auto-picked by botPickCharm / autoFillCharmPicks.
    const charmPicks = game.charmPicks ?? {};
    const mutationPicks = game.mutationPicks ?? {};
    const mutationOptions = game.mutationOptions ?? [];
    const allPicked = game.playerOrder.every(
      (uid) =>
        charmPicks[uid] != null &&
        (mutationPicks[uid] != null || mutationOptions.length === 0),
    );
    if (!allPicked) return false;

    // Apply charm picks → add charm to each player's owned charm list
    const charms: Record<string, CharmId[]> = { ...(game.charms ?? {}) };
    for (const uid of game.playerOrder) {
      const picked = charmPicks[uid];
      if (!picked) continue;
      const owned = charms[uid] ? [...charms[uid]] : [];
      owned.push(picked);
      charms[uid] = owned;
    }

    // Apply mutation picks → append to each player's owned mutations list
    const mutations: Record<string, MutationPick[]> = { ...(game.mutations ?? {}) };
    for (const uid of game.playerOrder) {
      const picked = mutationPicks[uid];
      if (!picked) continue;
      const owned = mutations[uid] ? [...mutations[uid]] : [];
      owned.push(picked);
      mutations[uid] = owned;
    }

    // Reset boards/hands for next round (mirrors resetForNextRound logic)
    const updatedPlayers: Record<string, PlayerState> = {};
    for (const uid of game.playerOrder) {
      updatedPlayers[uid] = {
        ...game.players[uid],
        board: emptyBoard(),
        currentHand: [],
        fouled: false,
      };
    }
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
      charms,
      charmOptions: null,
      charmPicks: FieldValue.delete(),
      charmBonuses: FieldValue.delete(),
      mutations,
      mutationOptions: null,
      mutationPicks: FieldValue.delete(),
      roundResults: FieldValue.delete(),
      phaseDeadline: null,
      updatedAt: Date.now(),
    });

    return true;
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
