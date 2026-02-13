import type { HandEvaluation, ThreeCardHandEvaluation } from '@shared/core/types';
import { HandRank, ThreeCardHandRank } from '@shared/core/types';
import { RANK_NAMES } from '@shared/core/constants';

function r(rank: number): string {
  return RANK_NAMES[rank] ?? '?';
}

export function describeHand(eval_: HandEvaluation): string {
  const k = eval_.kickers;
  switch (eval_.handRank) {
    case HandRank.RoyalFlush:
      return 'Royal Flush';
    case HandRank.StraightFlush:
      return `Str. Flush (${r(k[0])}-high)`;
    case HandRank.FourOfAKind:
      return `Quads (${r(k[0])})`;
    case HandRank.FullHouse:
      return `Full House (${r(k[0])}/${r(k[1])})`;
    case HandRank.Flush:
      return `Flush (${r(k[0])}-high)`;
    case HandRank.Straight:
      return `Straight (${r(k[0])}-high)`;
    case HandRank.ThreeOfAKind:
      return `Trips (${r(k[0])})`;
    case HandRank.TwoPair:
      return `Two Pair (${r(k[0])}/${r(k[1])})`;
    case HandRank.Pair:
      return `Pair (${r(k[0])})`;
    case HandRank.HighCard:
      return `High Card (${r(k[0])})`;
    default:
      return '?';
  }
}

export function describe3CardHand(eval_: ThreeCardHandEvaluation): string {
  const k = eval_.kickers;
  switch (eval_.handRank) {
    case ThreeCardHandRank.ThreeOfAKind:
      return `Trips (${r(k[0])})`;
    case ThreeCardHandRank.Pair:
      return `Pair (${r(k[0])})`;
    case ThreeCardHandRank.HighCard:
      return `High Card (${r(k[0])})`;
    default:
      return '?';
  }
}
