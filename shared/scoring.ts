import {
  BOTTOM_ROYALTIES,
  FOUL_PENALTY,
  MIDDLE_ROYALTIES,
  SCOOP_BONUS,
  TOP_PAIR_ROYALTIES,
  TOP_TRIPS_ROYALTIES,
} from './constants';
import {
  compare5CardHands,
  compareRows,
  evaluate3CardHand,
  evaluate5CardHand,
} from './hand-evaluation';
import {
  type Board,
  type Card,
  HandRank,
  type PairwiseResult,
  type PlayerScore,
  type Rank,
  type RowRoyalties,
  type ScoringResult,
  ThreeCardHandRank,
} from './types';

// ---- Foul detection ----

/**
 * A board is fouled if the rows are not in ascending order:
 * bottom >= middle > top
 *
 * We compare using standard poker hand evaluation:
 * - bottom must be >= middle (5-card vs 5-card)
 * - middle must be > top
 *
 * For the middle vs top comparison we need to compare a 5-card hand
 * to a 3-card hand. Since they use different evaluation scales, we
 * compare by evaluating middle as a 5-card hand and top as a 3-card hand,
 * then map the 3-card evaluation to the 5-card scale for comparison.
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
  // We need to compare a 5-card hand (middle) vs a 3-card hand (top).
  // Map 3-card evaluation to 5-card scale for comparison.
  const middleEval = evaluate5CardHand(board.middle);
  const topEval = evaluate3CardHand(board.top);

  // Map ThreeCardHandRank to HandRank for comparison
  const topMappedRank = mapThreeCardToFiveCardRank(topEval.handRank);

  // Middle must be strictly greater than top
  if (middleEval.handRank > topMappedRank) return false; // middle stronger
  if (middleEval.handRank < topMappedRank) return true; // middle weaker

  // Same hand rank category: compare kickers
  const len = Math.min(middleEval.kickers.length, topEval.kickers.length);
  for (let i = 0; i < len; i++) {
    if (middleEval.kickers[i] > topEval.kickers[i]) return false;
    if (middleEval.kickers[i] < topEval.kickers[i]) return true;
  }

  // If middle has more kickers and they match so far, middle is still >=
  // but we need strictly greater, so equal means foul
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

// ---- Royalties ----

/** Calculate royalties for a complete board. Returns 0 for all rows if fouled. */
export function calculateRoyalties(board: Board): RowRoyalties {
  if (isFoul(board)) {
    return { top: 0, middle: 0, bottom: 0, total: 0 };
  }

  const top = topRoyalties(board.top);
  const middle = middleRoyalties(board.middle);
  const bottom = bottomRoyalties(board.bottom);

  return { top, middle, bottom, total: top + middle + bottom };
}

function topRoyalties(cards: Card[]): number {
  if (cards.length < 3) return 0;

  const eval3 = evaluate3CardHand(cards);

  if (eval3.handRank === ThreeCardHandRank.ThreeOfAKind) {
    const rank = eval3.kickers[0] as Rank;
    return TOP_TRIPS_ROYALTIES[rank] ?? 0;
  }

  if (eval3.handRank === ThreeCardHandRank.Pair) {
    const pairRank = eval3.kickers[0] as Rank;
    return TOP_PAIR_ROYALTIES[pairRank] ?? 0;
  }

  return 0;
}

function middleRoyalties(cards: Card[]): number {
  if (cards.length < 5) return 0;
  const eval5 = evaluate5CardHand(cards);
  return MIDDLE_ROYALTIES[eval5.handRank] ?? 0;
}

function bottomRoyalties(cards: Card[]): number {
  if (cards.length < 5) return 0;
  const eval5 = evaluate5CardHand(cards);
  return BOTTOM_ROYALTIES[eval5.handRank] ?? 0;
}

// ---- Pairwise scoring ----

/**
 * Score player A vs player B.
 * Returns PairwiseResult from A's perspective.
 *
 * Rules:
 * - If both fouled: 0 points each
 * - If one fouled: non-fouled player gets FOUL_PENALTY + their royalties
 * - Otherwise: +1/-1 per row won/lost, +3 scoop for sweeping all 3, plus royalty difference
 */
export function scorePairwise(
  playerAUid: string,
  playerABoard: Board,
  playerBUid: string,
  playerBBoard: Board,
): PairwiseResult {
  const aFouled = isFoul(playerABoard);
  const bFouled = isFoul(playerBBoard);

  // Both fouled: 0 all around
  if (aFouled && bFouled) {
    return {
      playerA: playerAUid,
      playerB: playerBUid,
      rowPoints: 0,
      scoopBonus: 0,
      royaltyDiff: 0,
      total: 0,
    };
  }

  // A fouled: B gets penalty + B's royalties
  if (aFouled) {
    const bRoyalties = calculateRoyalties(playerBBoard);
    const total = -(FOUL_PENALTY + bRoyalties.total);
    return {
      playerA: playerAUid,
      playerB: playerBUid,
      rowPoints: -FOUL_PENALTY,
      scoopBonus: 0,
      royaltyDiff: -bRoyalties.total,
      total,
    };
  }

  // B fouled: A gets penalty + A's royalties
  if (bFouled) {
    const aRoyalties = calculateRoyalties(playerABoard);
    const total = FOUL_PENALTY + aRoyalties.total;
    return {
      playerA: playerAUid,
      playerB: playerBUid,
      rowPoints: FOUL_PENALTY,
      scoopBonus: 0,
      royaltyDiff: aRoyalties.total,
      total,
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

  const aRoyalties = calculateRoyalties(playerABoard);
  const bRoyalties = calculateRoyalties(playerBBoard);
  const royaltyDiff = aRoyalties.total - bRoyalties.total;

  return {
    playerA: playerAUid,
    playerB: playerBUid,
    rowPoints,
    scoopBonus,
    royaltyDiff,
    total: rowPoints + scoopBonus + royaltyDiff,
  };
}

// ---- Multi-player scoring ----

/**
 * Score all players pairwise. Each pair is scored once, and the results
 * are accumulated for each player's net score.
 */
export function scoreAllPlayers(
  boards: Map<string, Board>,
): ScoringResult {
  const uids = Array.from(boards.keys());
  const scores = new Map<string, PlayerScore>();

  // Initialize
  for (const uid of uids) {
    const board = boards.get(uid)!;
    scores.set(uid, {
      uid,
      royalties: calculateRoyalties(board),
      fouled: isFoul(board),
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

      const result = scorePairwise(uidA, boardA, uidB, boardB);

      // Store A's perspective
      scores.get(uidA)!.pairwise.push(result);
      scores.get(uidA)!.netScore += result.total;

      // Store B's perspective (inverted)
      const invertedResult: PairwiseResult = {
        playerA: uidB,
        playerB: uidA,
        rowPoints: -result.rowPoints,
        scoopBonus: -result.scoopBonus,
        royaltyDiff: -result.royaltyDiff,
        total: -result.total,
      };
      scores.get(uidB)!.pairwise.push(invertedResult);
      scores.get(uidB)!.netScore += invertedResult.total;
    }
  }

  return { players: uids.map((uid) => scores.get(uid)!) };
}
