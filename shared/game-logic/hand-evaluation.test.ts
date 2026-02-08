import { describe, it, expect } from 'vitest';
import {
  evaluate5CardHand,
  evaluate3CardHand,
  compareHands,
  compare5CardHands,
  compare3CardHands,
  compareRows,
} from './hand-evaluation';
import { HandRank, Rank, Suit, ThreeCardHandRank } from '../core/types';
import type { Card } from '../core/types';

// -- Helpers to build cards concisely --

function card(rank: Rank, suit: Suit = Suit.Spades): Card {
  return { rank, suit };
}

const c = Suit.Clubs;
const d = Suit.Diamonds;
const h = Suit.Hearts;
const s = Suit.Spades;

// ---- 5-card hand evaluation ----

describe('evaluate5CardHand', () => {
  it('throws if not exactly 5 cards', () => {
    expect(() => evaluate5CardHand([])).toThrow('Expected 5 cards');
    expect(() => evaluate5CardHand([card(Rank.Ace)])).toThrow('Expected 5 cards');
  });

  it('detects Royal Flush', () => {
    const hand: Card[] = [
      { rank: Rank.Ace, suit: s },
      { rank: Rank.King, suit: s },
      { rank: Rank.Queen, suit: s },
      { rank: Rank.Jack, suit: s },
      { rank: Rank.Ten, suit: s },
    ];
    const result = evaluate5CardHand(hand);
    expect(result.handRank).toBe(HandRank.RoyalFlush);
  });

  it('detects Straight Flush', () => {
    const hand: Card[] = [
      { rank: Rank.Nine, suit: h },
      { rank: Rank.Eight, suit: h },
      { rank: Rank.Seven, suit: h },
      { rank: Rank.Six, suit: h },
      { rank: Rank.Five, suit: h },
    ];
    const result = evaluate5CardHand(hand);
    expect(result.handRank).toBe(HandRank.StraightFlush);
    expect(result.kickers).toEqual([Rank.Nine]);
  });

  it('detects Wheel Straight Flush (A-2-3-4-5)', () => {
    const hand: Card[] = [
      { rank: Rank.Ace, suit: d },
      { rank: Rank.Two, suit: d },
      { rank: Rank.Three, suit: d },
      { rank: Rank.Four, suit: d },
      { rank: Rank.Five, suit: d },
    ];
    const result = evaluate5CardHand(hand);
    expect(result.handRank).toBe(HandRank.StraightFlush);
    expect(result.kickers).toEqual([Rank.Five]); // 5-high
  });

  it('detects Four of a Kind', () => {
    const hand: Card[] = [
      { rank: Rank.King, suit: s },
      { rank: Rank.King, suit: h },
      { rank: Rank.King, suit: d },
      { rank: Rank.King, suit: c },
      { rank: Rank.Three, suit: s },
    ];
    const result = evaluate5CardHand(hand);
    expect(result.handRank).toBe(HandRank.FourOfAKind);
    expect(result.kickers).toEqual([Rank.King, Rank.Three]);
  });

  it('detects Full House', () => {
    const hand: Card[] = [
      { rank: Rank.Ten, suit: s },
      { rank: Rank.Ten, suit: h },
      { rank: Rank.Ten, suit: d },
      { rank: Rank.Four, suit: c },
      { rank: Rank.Four, suit: s },
    ];
    const result = evaluate5CardHand(hand);
    expect(result.handRank).toBe(HandRank.FullHouse);
    expect(result.kickers).toEqual([Rank.Ten, Rank.Four]);
  });

  it('detects Flush', () => {
    const hand: Card[] = [
      { rank: Rank.Ace, suit: c },
      { rank: Rank.Jack, suit: c },
      { rank: Rank.Eight, suit: c },
      { rank: Rank.Five, suit: c },
      { rank: Rank.Three, suit: c },
    ];
    const result = evaluate5CardHand(hand);
    expect(result.handRank).toBe(HandRank.Flush);
    expect(result.kickers).toEqual([Rank.Ace, Rank.Jack, Rank.Eight, Rank.Five, Rank.Three]);
  });

  it('detects Straight', () => {
    const hand: Card[] = [
      { rank: Rank.Eight, suit: s },
      { rank: Rank.Seven, suit: h },
      { rank: Rank.Six, suit: d },
      { rank: Rank.Five, suit: c },
      { rank: Rank.Four, suit: s },
    ];
    const result = evaluate5CardHand(hand);
    expect(result.handRank).toBe(HandRank.Straight);
    expect(result.kickers).toEqual([Rank.Eight]);
  });

  it('detects Wheel Straight (A-2-3-4-5, not flush)', () => {
    const hand: Card[] = [
      { rank: Rank.Ace, suit: s },
      { rank: Rank.Two, suit: h },
      { rank: Rank.Three, suit: d },
      { rank: Rank.Four, suit: c },
      { rank: Rank.Five, suit: s },
    ];
    const result = evaluate5CardHand(hand);
    expect(result.handRank).toBe(HandRank.Straight);
    expect(result.kickers).toEqual([Rank.Five]); // 5-high
  });

  it('detects Broadway Straight (A-K-Q-J-T, not flush)', () => {
    const hand: Card[] = [
      { rank: Rank.Ace, suit: s },
      { rank: Rank.King, suit: h },
      { rank: Rank.Queen, suit: d },
      { rank: Rank.Jack, suit: c },
      { rank: Rank.Ten, suit: s },
    ];
    const result = evaluate5CardHand(hand);
    expect(result.handRank).toBe(HandRank.Straight);
    expect(result.kickers).toEqual([Rank.Ace]);
  });

  it('detects Three of a Kind', () => {
    const hand: Card[] = [
      { rank: Rank.Seven, suit: s },
      { rank: Rank.Seven, suit: h },
      { rank: Rank.Seven, suit: d },
      { rank: Rank.King, suit: c },
      { rank: Rank.Two, suit: s },
    ];
    const result = evaluate5CardHand(hand);
    expect(result.handRank).toBe(HandRank.ThreeOfAKind);
    expect(result.kickers).toEqual([Rank.Seven, Rank.King, Rank.Two]);
  });

  it('detects Two Pair', () => {
    const hand: Card[] = [
      { rank: Rank.Jack, suit: s },
      { rank: Rank.Jack, suit: h },
      { rank: Rank.Four, suit: d },
      { rank: Rank.Four, suit: c },
      { rank: Rank.Ace, suit: s },
    ];
    const result = evaluate5CardHand(hand);
    expect(result.handRank).toBe(HandRank.TwoPair);
    expect(result.kickers).toEqual([Rank.Jack, Rank.Four, Rank.Ace]);
  });

  it('detects One Pair', () => {
    const hand: Card[] = [
      { rank: Rank.Nine, suit: s },
      { rank: Rank.Nine, suit: h },
      { rank: Rank.Ace, suit: d },
      { rank: Rank.King, suit: c },
      { rank: Rank.Two, suit: s },
    ];
    const result = evaluate5CardHand(hand);
    expect(result.handRank).toBe(HandRank.Pair);
    expect(result.kickers).toEqual([Rank.Nine, Rank.Ace, Rank.King, Rank.Two]);
  });

  it('detects High Card', () => {
    const hand: Card[] = [
      { rank: Rank.Ace, suit: s },
      { rank: Rank.Ten, suit: h },
      { rank: Rank.Eight, suit: d },
      { rank: Rank.Five, suit: c },
      { rank: Rank.Three, suit: h },
    ];
    const result = evaluate5CardHand(hand);
    expect(result.handRank).toBe(HandRank.HighCard);
    expect(result.kickers).toEqual([Rank.Ace, Rank.Ten, Rank.Eight, Rank.Five, Rank.Three]);
  });
});

// ---- 3-card hand evaluation ----

describe('evaluate3CardHand', () => {
  it('throws if not exactly 3 cards', () => {
    expect(() => evaluate3CardHand([])).toThrow('Expected 3 cards');
    expect(() => evaluate3CardHand([card(Rank.Ace), card(Rank.King)])).toThrow('Expected 3 cards');
  });

  it('detects Three of a Kind', () => {
    const hand: Card[] = [
      { rank: Rank.Queen, suit: s },
      { rank: Rank.Queen, suit: h },
      { rank: Rank.Queen, suit: d },
    ];
    const result = evaluate3CardHand(hand);
    expect(result.handRank).toBe(ThreeCardHandRank.ThreeOfAKind);
    expect(result.kickers).toEqual([Rank.Queen]);
  });

  it('detects Pair', () => {
    const hand: Card[] = [
      { rank: Rank.Five, suit: s },
      { rank: Rank.Five, suit: h },
      { rank: Rank.King, suit: d },
    ];
    const result = evaluate3CardHand(hand);
    expect(result.handRank).toBe(ThreeCardHandRank.Pair);
    expect(result.kickers).toEqual([Rank.Five, Rank.King]);
  });

  it('detects High Card', () => {
    const hand: Card[] = [
      { rank: Rank.Ace, suit: s },
      { rank: Rank.Seven, suit: h },
      { rank: Rank.Two, suit: d },
    ];
    const result = evaluate3CardHand(hand);
    expect(result.handRank).toBe(ThreeCardHandRank.HighCard);
    expect(result.kickers).toEqual([Rank.Ace, Rank.Seven, Rank.Two]);
  });
});

// ---- Comparison functions ----

describe('compareHands', () => {
  it('higher handRank wins', () => {
    const flush = { handRank: HandRank.Flush, kickers: [14, 10, 8, 5, 3] };
    const pair = { handRank: HandRank.Pair, kickers: [14, 13, 10, 5] };
    expect(compareHands(flush, pair)).toBe(1);
    expect(compareHands(pair, flush)).toBe(-1);
  });

  it('same handRank compares kickers', () => {
    const pairAces = { handRank: HandRank.Pair, kickers: [14, 13, 10, 5] };
    const pairKings = { handRank: HandRank.Pair, kickers: [13, 14, 10, 5] };
    expect(compareHands(pairAces, pairKings)).toBe(1);
    expect(compareHands(pairKings, pairAces)).toBe(-1);
  });

  it('identical hands are tied', () => {
    const a = { handRank: HandRank.TwoPair, kickers: [10, 5, 3] };
    const b = { handRank: HandRank.TwoPair, kickers: [10, 5, 3] };
    expect(compareHands(a, b)).toBe(0);
  });

  it('compares deeper kickers for tiebreaking', () => {
    const a = { handRank: HandRank.HighCard, kickers: [14, 13, 10, 8, 5] };
    const b = { handRank: HandRank.HighCard, kickers: [14, 13, 10, 8, 4] };
    expect(compareHands(a, b)).toBe(1);
    expect(compareHands(b, a)).toBe(-1);
  });
});

describe('compare5CardHands', () => {
  it('flush beats straight', () => {
    const flush: Card[] = [
      { rank: Rank.Ace, suit: c },
      { rank: Rank.Jack, suit: c },
      { rank: Rank.Eight, suit: c },
      { rank: Rank.Five, suit: c },
      { rank: Rank.Three, suit: c },
    ];
    const straight: Card[] = [
      { rank: Rank.Eight, suit: s },
      { rank: Rank.Seven, suit: h },
      { rank: Rank.Six, suit: d },
      { rank: Rank.Five, suit: c },
      { rank: Rank.Four, suit: s },
    ];
    expect(compare5CardHands(flush, straight)).toBe(1);
    expect(compare5CardHands(straight, flush)).toBe(-1);
  });

  it('higher pair beats lower pair', () => {
    const pairAces: Card[] = [
      { rank: Rank.Ace, suit: s },
      { rank: Rank.Ace, suit: h },
      { rank: Rank.Five, suit: d },
      { rank: Rank.Three, suit: c },
      { rank: Rank.Two, suit: s },
    ];
    const pairKings: Card[] = [
      { rank: Rank.King, suit: s },
      { rank: Rank.King, suit: h },
      { rank: Rank.Queen, suit: d },
      { rank: Rank.Jack, suit: c },
      { rank: Rank.Ten, suit: s },
    ];
    expect(compare5CardHands(pairAces, pairKings)).toBe(1);
  });

  it('identical hands tie', () => {
    const a: Card[] = [
      { rank: Rank.Ace, suit: s },
      { rank: Rank.King, suit: s },
      { rank: Rank.Queen, suit: s },
      { rank: Rank.Jack, suit: s },
      { rank: Rank.Nine, suit: s },
    ];
    const b: Card[] = [
      { rank: Rank.Ace, suit: h },
      { rank: Rank.King, suit: h },
      { rank: Rank.Queen, suit: h },
      { rank: Rank.Jack, suit: h },
      { rank: Rank.Nine, suit: h },
    ];
    // Both are flushes with same kickers
    expect(compare5CardHands(a, b)).toBe(0);
  });
});

describe('compare3CardHands', () => {
  it('trips beat pair', () => {
    const trips: Card[] = [
      { rank: Rank.Two, suit: s },
      { rank: Rank.Two, suit: h },
      { rank: Rank.Two, suit: d },
    ];
    const pair: Card[] = [
      { rank: Rank.Ace, suit: s },
      { rank: Rank.Ace, suit: h },
      { rank: Rank.King, suit: d },
    ];
    expect(compare3CardHands(trips, pair)).toBe(1);
  });

  it('pair beats high card', () => {
    const pair: Card[] = [
      { rank: Rank.Two, suit: s },
      { rank: Rank.Two, suit: h },
      { rank: Rank.Three, suit: d },
    ];
    const high: Card[] = [
      { rank: Rank.Ace, suit: s },
      { rank: Rank.King, suit: h },
      { rank: Rank.Queen, suit: d },
    ];
    expect(compare3CardHands(pair, high)).toBe(1);
  });

  it('higher kicker breaks pair tie', () => {
    const pairWithAce: Card[] = [
      { rank: Rank.Five, suit: s },
      { rank: Rank.Five, suit: h },
      { rank: Rank.Ace, suit: d },
    ];
    const pairWithKing: Card[] = [
      { rank: Rank.Five, suit: d },
      { rank: Rank.Five, suit: c },
      { rank: Rank.King, suit: s },
    ];
    expect(compare3CardHands(pairWithAce, pairWithKing)).toBe(1);
  });
});

describe('compareRows', () => {
  it('uses 3-card eval for top row', () => {
    const pairTop: Card[] = [
      { rank: Rank.Two, suit: s },
      { rank: Rank.Two, suit: h },
      { rank: Rank.Three, suit: d },
    ];
    const highCardTop: Card[] = [
      { rank: Rank.Ace, suit: s },
      { rank: Rank.King, suit: h },
      { rank: Rank.Queen, suit: d },
    ];
    // Pair beats high card in 3-card eval
    expect(compareRows(pairTop, highCardTop, true)).toBe(1);
  });

  it('uses 5-card eval for non-top rows', () => {
    const flush: Card[] = [
      { rank: Rank.Ace, suit: c },
      { rank: Rank.Jack, suit: c },
      { rank: Rank.Eight, suit: c },
      { rank: Rank.Five, suit: c },
      { rank: Rank.Three, suit: c },
    ];
    const twoPair: Card[] = [
      { rank: Rank.Ace, suit: s },
      { rank: Rank.Ace, suit: h },
      { rank: Rank.King, suit: d },
      { rank: Rank.King, suit: c },
      { rank: Rank.Queen, suit: s },
    ];
    expect(compareRows(flush, twoPair, false)).toBe(1);
  });
});

// ---- Hand ranking ordering ----

describe('hand ranking ordering', () => {
  const royalFlush: Card[] = [
    { rank: Rank.Ace, suit: s },
    { rank: Rank.King, suit: s },
    { rank: Rank.Queen, suit: s },
    { rank: Rank.Jack, suit: s },
    { rank: Rank.Ten, suit: s },
  ];
  const straightFlush: Card[] = [
    { rank: Rank.Nine, suit: h },
    { rank: Rank.Eight, suit: h },
    { rank: Rank.Seven, suit: h },
    { rank: Rank.Six, suit: h },
    { rank: Rank.Five, suit: h },
  ];
  const fourOfAKind: Card[] = [
    { rank: Rank.Ace, suit: s },
    { rank: Rank.Ace, suit: h },
    { rank: Rank.Ace, suit: d },
    { rank: Rank.Ace, suit: c },
    { rank: Rank.King, suit: s },
  ];
  const fullHouse: Card[] = [
    { rank: Rank.King, suit: s },
    { rank: Rank.King, suit: h },
    { rank: Rank.King, suit: d },
    { rank: Rank.Queen, suit: c },
    { rank: Rank.Queen, suit: s },
  ];
  const flush: Card[] = [
    { rank: Rank.Ace, suit: c },
    { rank: Rank.Jack, suit: c },
    { rank: Rank.Eight, suit: c },
    { rank: Rank.Five, suit: c },
    { rank: Rank.Three, suit: c },
  ];
  const straight: Card[] = [
    { rank: Rank.Ten, suit: s },
    { rank: Rank.Nine, suit: h },
    { rank: Rank.Eight, suit: d },
    { rank: Rank.Seven, suit: c },
    { rank: Rank.Six, suit: s },
  ];
  const threeOfAKind: Card[] = [
    { rank: Rank.Seven, suit: s },
    { rank: Rank.Seven, suit: h },
    { rank: Rank.Seven, suit: d },
    { rank: Rank.King, suit: c },
    { rank: Rank.Two, suit: s },
  ];
  const twoPair: Card[] = [
    { rank: Rank.Jack, suit: s },
    { rank: Rank.Jack, suit: h },
    { rank: Rank.Four, suit: d },
    { rank: Rank.Four, suit: c },
    { rank: Rank.Ace, suit: s },
  ];
  const onePair: Card[] = [
    { rank: Rank.Nine, suit: s },
    { rank: Rank.Nine, suit: h },
    { rank: Rank.Ace, suit: d },
    { rank: Rank.King, suit: c },
    { rank: Rank.Two, suit: s },
  ];
  const highCard: Card[] = [
    { rank: Rank.Ace, suit: s },
    { rank: Rank.Ten, suit: h },
    { rank: Rank.Eight, suit: d },
    { rank: Rank.Five, suit: c },
    { rank: Rank.Three, suit: h },
  ];

  const orderedHands = [
    highCard,
    onePair,
    twoPair,
    threeOfAKind,
    straight,
    flush,
    fullHouse,
    fourOfAKind,
    straightFlush,
    royalFlush,
  ];

  it('each hand beats all lower-ranked hands', () => {
    for (let i = 0; i < orderedHands.length; i++) {
      for (let j = i + 1; j < orderedHands.length; j++) {
        expect(compare5CardHands(orderedHands[j], orderedHands[i])).toBe(1);
        expect(compare5CardHands(orderedHands[i], orderedHands[j])).toBe(-1);
      }
    }
  });
});
