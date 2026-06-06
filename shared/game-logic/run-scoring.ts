/**
 * Pineapple Run scoring — FORKED from core scoring.ts.
 *
 * Run mode differs from Classic in three ways, all isolated here so the core
 * scorer (shared with Classic) stays untouched:
 *   1. Rows are evaluated with the run evaluator (knows five-of-a-kind).
 *   2. Non-fouled players gain charm bonuses.
 *   3. Fouled players with Foul Shield get a refund — capped at the penalty so
 *      fouling is at worst neutral, and only refunded per opponent that actually
 *      penalized them (i.e. wasn't itself fouled).
 *
 * IMPORTANT: run-mode only. Classic-mode code must never import this.
 */
import type { Board, CharmId } from '../core/types';
import { HandRank, ThreeCardHandRank } from '../core/types';
import {
  FOUL_PENALTY,
  SCOOP_BONUS,
  TOP_PAIR_ROYALTIES,
  TOP_TRIPS_ROYALTIES,
} from '../core/constants';
import { compare3CardHands, evaluate3CardHand } from './hand-evaluation';
import {
  RUN_BOTTOM_ROYALTIES,
  RUN_MIDDLE_ROYALTIES,
  compareRunRows5,
  evaluateRunRow,
} from './run-evaluation';
import { foulShieldReduction, rawCharmBonus } from './charms';

/** Map a 3-card top-row rank onto the 5-card scale for middle-vs-top comparison. */
function topRankOn5Scale(rank: ThreeCardHandRank): number {
  if (rank === ThreeCardHandRank.ThreeOfAKind) return HandRank.ThreeOfAKind;
  if (rank === ThreeCardHandRank.Pair) return HandRank.Pair;
  return HandRank.HighCard;
}

/** Foul detection using run-aware evaluation (so a five-of-a-kind bottom counts). */
export function isRunFoul(board: Board): boolean {
  if (board.top.length < 3 || board.middle.length < 5 || board.bottom.length < 5) {
    return false;
  }
  // bottom must be >= middle
  if (compareRunRows5(board.bottom, board.middle) < 0) return true;

  // middle must be strictly > top
  const mid = evaluateRunRow(board.middle);
  const top = evaluate3CardHand(board.top);
  const topMapped = topRankOn5Scale(top.handRank);
  if (mid.handRank > topMapped) return false;
  if (mid.handRank < topMapped) return true;
  const len = Math.min(mid.kickers.length, top.kickers.length);
  for (let i = 0; i < len; i++) {
    if (mid.kickers[i] > top.kickers[i]) return false;
    if (mid.kickers[i] < top.kickers[i]) return true;
  }
  return true; // equal => foul (middle must be strictly greater)
}

/** Run-aware royalties (five-of-a-kind in middle/bottom). */
export function runRoyalties(board: Board): { top: number; middle: number; bottom: number; total: number } {
  let top = 0;
  let middle = 0;
  let bottom = 0;
  if (board.top.length === 3) {
    const e = evaluate3CardHand(board.top);
    if (e.handRank === ThreeCardHandRank.ThreeOfAKind) top = TOP_TRIPS_ROYALTIES[e.kickers[0]] ?? 0;
    else if (e.handRank === ThreeCardHandRank.Pair) top = TOP_PAIR_ROYALTIES[e.kickers[0]] ?? 0;
  }
  if (board.middle.length === 5) middle = RUN_MIDDLE_ROYALTIES[evaluateRunRow(board.middle).handRank] ?? 0;
  if (board.bottom.length === 5) bottom = RUN_BOTTOM_ROYALTIES[evaluateRunRow(board.bottom).handRank] ?? 0;
  return { top, middle, bottom, total: top + middle + bottom };
}

/** Net points to A from a single A-vs-B comparison (run-aware). */
function runPairwiseNet(aFouled: boolean, aBoard: Board, bFouled: boolean, bBoard: Board): number {
  if (aFouled && bFouled) return 0;
  if (aFouled) return -FOUL_PENALTY;
  if (bFouled) return FOUL_PENALTY;

  const top = compare3CardHands(aBoard.top, bBoard.top);
  const mid = compareRunRows5(aBoard.middle, bBoard.middle);
  const bot = compareRunRows5(aBoard.bottom, bBoard.bottom);
  let pts = top + mid + bot;
  if (top === 1 && mid === 1 && bot === 1) pts += SCOOP_BONUS;
  else if (top === -1 && mid === -1 && bot === -1) pts -= SCOOP_BONUS;

  const roy = runRoyalties(aBoard).total - runRoyalties(bBoard).total;
  return pts + roy;
}

export interface RunScoreResult {
  /** Final net score for the round per uid (pairwise + charm bonus / foul-shield). */
  netScores: Record<string, number>;
  /** Charm bonus applied per uid (0 for fouled players); for display. */
  charmBonuses: Record<string, number>;
  /** Final foul decision per uid (declared timeout-foul OR run-aware board foul). */
  fouled: Record<string, boolean>;
}

/**
 * Score a run-mode round. `declaredFouls` carries timeout auto-fouls; this also
 * folds in run-aware board fouls. Charms add bonuses for non-fouled players;
 * Foul Shield refunds fouled players (capped at the penalty, per penalizing
 * opponent).
 */
export function scoreRunPlayers(
  boards: Map<string, Board>,
  declaredFouls: Map<string, boolean>,
  charmsByUid: Record<string, CharmId[] | undefined>,
): RunScoreResult {
  const uids = Array.from(boards.keys());

  const fouled: Record<string, boolean> = {};
  for (const uid of uids) {
    fouled[uid] = (declaredFouls.get(uid) ?? false) || isRunFoul(boards.get(uid)!);
  }

  const netScores: Record<string, number> = {};
  for (const uid of uids) netScores[uid] = 0;

  for (let i = 0; i < uids.length; i++) {
    for (let j = i + 1; j < uids.length; j++) {
      const a = uids[i];
      const b = uids[j];
      const net = runPairwiseNet(fouled[a], boards.get(a)!, fouled[b], boards.get(b)!);
      netScores[a] += net;
      netScores[b] -= net;
    }
  }

  const charmBonuses: Record<string, number> = {};
  for (const uid of uids) {
    let bonus = 0;
    if (!fouled[uid]) {
      bonus = rawCharmBonus(charmsByUid[uid], boards.get(uid)!);
      netScores[uid] += bonus;
    } else {
      const shield = Math.min(foulShieldReduction(charmsByUid[uid]), FOUL_PENALTY);
      if (shield > 0) {
        const penalizingOpponents = uids.filter((o) => o !== uid && !fouled[o]).length;
        netScores[uid] += shield * penalizingOpponents;
      }
    }
    charmBonuses[uid] = bonus;
  }

  return { netScores, charmBonuses, fouled };
}
