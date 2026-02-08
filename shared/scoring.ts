import {
  FOUL_PENALTY,
  SCOOP_BONUS,
} from './constants';
import {
  compare5CardHands,
  compareRows,
  evaluate3CardHand,
  evaluate5CardHand,
} from './hand-evaluation';
import {
  type Board,
  HandRank,
  type PairwiseResult,
  type PlayerScore,
  type ScoringResult,
  ThreeCardHandRank,
} from './types';

// ---- Foul detection ----

/**
 * A board is fouled if the rows are not in ascending order:
 * bottom >= middle > top
 *
 * A board with incomplete rows is not considered fouled (game in progress).
 */
export function isFoul(board: Board): boolean {
  // Incomplete board - not fouled (game in progress)
  if (board.top.length < 3 || board.middle.length < 5 || board.bottom.length < 5) {
    return false;
  }

  // Check bottom >= middle (both 5-card)
  const bottomVsMiddle = compare5CardHands(board.bottom, board.middle);
  if (bottomVsMiddle < 0) return true; // bottom is weaker than middle

  // Check middle > top
  const middleEval = evaluate5CardHand(board.middle);
  const topEval = evaluate3CardHand(board.top);

  // Map ThreeCardHandRank to HandRank for comparison
  const topMappedRank = mapThreeCardToFiveCardRank(topEval.handRank);

  // Middle must be strictly greater than top
  if (middleEval.handRank > topMappedRank) return false;
  if (middleEval.handRank < topMappedRank) return true;

  // Same hand rank category: compare kickers
  const len = Math.min(middleEval.kickers.length, topEval.kickers.length);
  for (let i = 0; i < len; i++) {
    if (middleEval.kickers[i] > topEval.kickers[i]) return false;
    if (middleEval.kickers[i] < topEval.kickers[i]) return true;
  }

  return true; // middle == top is a foul (must be strictly greater)
}

/** Map a 3-card hand rank to the equivalent 5-card hand rank for comparison. */
function mapThreeCardToFiveCardRank(rank: ThreeCardHandRank): HandRank {
  switch (rank) {
    case ThreeCardHandRank.HighCard:
      return HandRank.HighCard;
    case ThreeCardHandRank.Pair:
      return HandRank.Pair;
    case ThreeCardHandRank.ThreeOfAKind:
      return HandRank.ThreeOfAKind;
  }
}

// ---- Pairwise scoring ----

/**
 * Score player A vs player B.
 * Returns PairwiseResult from A's perspective.
 *
 * Rules:
 * - If both fouled: 0 points each
 * - If one fouled: non-fouled player gets +FOUL_PENALTY, fouled player gets -FOUL_PENALTY
 * - Otherwise: +1/-1 per row won/lost, +3 scoop for sweeping all 3
 */
export function scorePairwise(
  playerAUid: string,
  playerAFouled: boolean,
  playerABoard: Board,
  playerBUid: string,
  playerBFouled: boolean,
  playerBBoard: Board,
): PairwiseResult {
  // Both fouled: 0 all around
  if (playerAFouled && playerBFouled) {
    return {
      playerA: playerAUid,
      playerB: playerBUid,
      rowPoints: 0,
      scoopBonus: 0,
      total: 0,
    };
  }

  // A fouled: B gets penalty
  if (playerAFouled) {
    return {
      playerA: playerAUid,
      playerB: playerBUid,
      rowPoints: -FOUL_PENALTY,
      scoopBonus: 0,
      total: -FOUL_PENALTY,
    };
  }

  // B fouled: A gets penalty
  if (playerBFouled) {
    return {
      playerA: playerAUid,
      playerB: playerBUid,
      rowPoints: FOUL_PENALTY,
      scoopBonus: 0,
      total: FOUL_PENALTY,
    };
  }

  // Neither fouled: compare row by row
  const topResult = compareRows(playerABoard.top, playerBBoard.top, true);
  const middleResult = compareRows(
    playerABoard.middle,
    playerBBoard.middle,
    false,
  );
  const bottomResult = compareRows(
    playerABoard.bottom,
    playerBBoard.bottom,
    false,
  );

  const rowPoints = topResult + middleResult + bottomResult;

  // Scoop: all 3 rows won
  let scoopBonus = 0;
  if (topResult === 1 && middleResult === 1 && bottomResult === 1) {
    scoopBonus = SCOOP_BONUS;
  } else if (topResult === -1 && middleResult === -1 && bottomResult === -1) {
    scoopBonus = -SCOOP_BONUS;
  }

  return {
    playerA: playerAUid,
    playerB: playerBUid,
    rowPoints,
    scoopBonus,
    total: rowPoints + scoopBonus,
  };
}

// ---- Multi-player scoring ----

/**
 * Score all players pairwise. Takes boards map and fouls map.
 * Fouls map includes both auto-fouls (timeout) and natural fouls (bad row ordering).
 */
export function scoreAllPlayers(
  boards: Map<string, Board>,
  fouls: Map<string, boolean>,
): ScoringResult {
  const uids = Array.from(boards.keys());
  const scores = new Map<string, PlayerScore>();

  // Initialize
  for (const uid of uids) {
    scores.set(uid, {
      uid,
      fouled: fouls.get(uid) ?? false,
      netScore: 0,
      pairwise: [],
    });
  }

  // Score each pair
  for (let i = 0; i < uids.length; i++) {
    for (let j = i + 1; j < uids.length; j++) {
      const uidA = uids[i];
      const uidB = uids[j];
      const boardA = boards.get(uidA)!;
      const boardB = boards.get(uidB)!;
      const aFouled = fouls.get(uidA) ?? false;
      const bFouled = fouls.get(uidB) ?? false;

      const result = scorePairwise(uidA, aFouled, boardA, uidB, bFouled, boardB);

      // Store A's perspective
      scores.get(uidA)!.pairwise.push(result);
      scores.get(uidA)!.netScore += result.total;

      // Store B's perspective (inverted)
      const invertedResult: PairwiseResult = {
        playerA: uidB,
        playerB: uidA,
        rowPoints: -result.rowPoints,
        scoopBonus: -result.scoopBonus,
        total: -result.total,
      };
      scores.get(uidB)!.pairwise.push(invertedResult);
      scores.get(uidB)!.netScore += invertedResult.total;
    }
  }

  return { players: uids.map((uid) => scores.get(uid)!) };
}
