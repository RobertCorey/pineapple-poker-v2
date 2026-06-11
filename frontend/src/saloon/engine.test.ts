import { describe, it, expect } from 'vitest';
import {
  applyPlacement,
  createTable,
  currentSeat,
  heroWonMatch,
  nextHand,
  placementsRequired,
  startHand,
  type TableState,
} from './engine.ts';
import { decideBotMove } from './bots.ts';
import { createDeck } from './vendor/deck.ts';
import type { Card, Row } from './vendor/types.ts';

/** Place the acting seat's dealt cards legally-shaped (5 on street 1, 2+discard after),
 *  filling bottom → middle → top in dealt order. */
function autoPlace(state: TableState): TableState {
  const seat = currentSeat(state);
  const required = placementsRequired(state.street);
  const order: Row[] = ['bottom', 'middle', 'top'];
  const max: Record<Row, number> = { bottom: 5, middle: 5, top: 3 };
  const counts: Record<Row, number> = {
    bottom: seat.board.bottom.length,
    middle: seat.board.middle.length,
    top: seat.board.top.length,
  };
  const placements = seat.hand.slice(0, required).map((card) => {
    const row = order.find((r) => counts[r] < max[r])!;
    counts[row] += 1;
    return { card, row };
  });
  const discard = state.street === 1 ? null : seat.hand[required];
  return applyPlacement(state, placements, discard);
}

function newTable(opponentCount = 1, hands = 2): TableState {
  const opponents = Array.from({ length: opponentCount }, (_, i) => ({
    id: `bot${i}`,
    name: `Bot ${i}`,
    skill: 'outlaw' as const,
  }));
  return createTable('Hero', opponents, hands);
}

describe('createTable / startHand', () => {
  it('seats the hero first and deals them 5 cards from the shared deck', () => {
    const state = newTable(2);
    expect(state.seats).toHaveLength(3);
    expect(state.seats[0].isHero).toBe(true);
    expect(state.buttonIdx).toBe(2);
    expect(state.turnIdx).toBe(0); // left of button = hero
    expect(currentSeat(state).hand).toHaveLength(5);
    expect(state.deck).toHaveLength(47); // one shared deck
    expect(state.seats[1].hand).toHaveLength(0); // others wait their turn
  });

  it('rejects tables outside 2-3 players', () => {
    expect(() => createTable('Hero', [], 1)).toThrow();
    expect(() =>
      createTable(
        'Hero',
        [
          { id: 'a', name: 'A', skill: 'outlaw' },
          { id: 'b', name: 'B', skill: 'outlaw' },
          { id: 'c', name: 'C', skill: 'outlaw' },
        ],
        1,
      ),
    ).toThrow();
  });

  it('accepts a rigged deck for deterministic hands', () => {
    const rigged = createDeck(); // unshuffled: clubs 2..A, diamonds, hearts, spades
    const state = startHand(newTable(1), rigged);
    expect(currentSeat(state).hand).toEqual(rigged.slice(0, 5));
    expect(state.deck).toEqual(rigged.slice(5));
  });
});

describe('turn order and streets', () => {
  it('passes the turn clockwise and deals each seat on their turn', () => {
    let state = newTable(2); // hero, bot0, bot1; button on bot1
    expect(state.turnIdx).toBe(0);

    state = autoPlace(state); // hero places 5
    expect(state.turnIdx).toBe(1);
    expect(state.street).toBe(1);
    expect(currentSeat(state).hand).toHaveLength(5);
    expect(state.seats[0].hand).toHaveLength(0);

    state = autoPlace(state); // bot0 places 5
    expect(state.turnIdx).toBe(2);

    state = autoPlace(state); // bot1 (button) places 5 → street 2
    expect(state.street).toBe(2);
    expect(state.turnIdx).toBe(0);
    expect(currentSeat(state).hand).toHaveLength(3); // pineapple deal
  });

  it('players never receive a card another seat already got', () => {
    let state = newTable(2);
    const seen = new Set<string>();
    const key = (c: Card) => `${c.rank}${c.suit}`;
    // Walk the entire hand; collect every dealt card.
    while (state.phase === 'acting') {
      for (const c of currentSeat(state).hand) {
        expect(seen.has(key(c))).toBe(false);
        seen.add(key(c));
      }
      state = autoPlace(state);
    }
    // 3 players × (5 + 4×3) = 51 distinct cards dealt
    expect(seen.size).toBe(51);
  });

  it('validates placements come from the dealt hand', () => {
    const state = newTable(1);
    const hand = currentSeat(state).hand;
    const notDealt: Card = state.deck[0];
    expect(() =>
      applyPlacement(
        state,
        [
          { card: notDealt, row: 'bottom' },
          { card: hand[1], row: 'bottom' },
          { card: hand[2], row: 'middle' },
          { card: hand[3], row: 'middle' },
          { card: hand[4], row: 'top' },
        ],
        null,
      ),
    ).toThrow(/not in dealt hand/);
  });

  it('requires a discard on streets 2-5 and none on street 1', () => {
    let state = newTable(1);
    const hand = currentSeat(state).hand;
    expect(() =>
      applyPlacement(
        state,
        hand.map((card) => ({ card, row: 'bottom' as Row })).slice(0, 5),
        hand[0],
      ),
    ).toThrow(/No discard/);

    state = autoPlace(state); // hero street 1
    state = autoPlace(state); // bot street 1 → street 2, hero dealt 3
    const street2Hand = currentSeat(state).hand;
    expect(() =>
      applyPlacement(
        state,
        [
          { card: street2Hand[0], row: 'middle' },
          { card: street2Hand[1], row: 'middle' },
        ],
        null,
      ),
    ).toThrow(/require a discard/);
  });
});

describe('hand scoring and match flow', () => {
  it('scores the hand after street 5 with zero-sum points', () => {
    let state = newTable(2);
    while (state.phase === 'acting') {
      state = autoPlace(state);
    }
    expect(state.phase).toBe('hand_scored');
    expect(state.lastResult).not.toBeNull();
    const sum = state.seats.reduce((s, seat) => s + seat.matchPoints, 0);
    expect(sum).toBe(0);
    // Every board is complete
    for (const seat of state.seats) {
      expect(seat.board.top).toHaveLength(3);
      expect(seat.board.middle).toHaveLength(5);
      expect(seat.board.bottom).toHaveLength(5);
    }
  });

  it('rotates the button between hands and ends the match after the last hand', () => {
    let state = newTable(1, 2);
    const firstButton = state.buttonIdx;
    while (state.phase === 'acting') state = autoPlace(state);
    state = nextHand(state);
    expect(state.phase).toBe('acting');
    expect(state.handNumber).toBe(2);
    expect(state.buttonIdx).toBe((firstButton + 1) % 2);
    // New hand: first to act is left of the new button
    expect(state.turnIdx).toBe((state.buttonIdx + 1) % 2);

    while (state.phase === 'acting') state = autoPlace(state);
    state = nextHand(state);
    expect(state.phase).toBe('match_over');
  });

  it('heroWonMatch requires strictly more points than every opponent', () => {
    const state = newTable(2, 1);
    state.seats[0].matchPoints = 5;
    state.seats[1].matchPoints = 5;
    state.seats[2].matchPoints = -10;
    expect(heroWonMatch(state)).toBe(false);
    state.seats[1].matchPoints = 4;
    expect(heroWonMatch(state)).toBe(true);
  });
});

describe('bot play', () => {
  it.each(['greenhorn', 'gunslinger', 'outlaw'] as const)(
    '%s bots complete full matches legally',
    (skill) => {
      let state = createTable('Hero', [
        { id: 'a', name: 'A', skill },
        { id: 'b', name: 'B', skill },
      ], 2);
      // Let bots play every seat (including the hero's) to exercise the
      // strategy across all positions.
      for (let guard = 0; guard < 200 && state.phase !== 'match_over'; guard++) {
        if (state.phase === 'acting') {
          const move = decideBotMove(state);
          state = applyPlacement(state, move.placements, move.discard);
        } else {
          state = nextHand(state);
        }
      }
      expect(state.phase).toBe('match_over');
      const sum = state.seats.reduce((s, seat) => s + seat.matchPoints, 0);
      expect(sum).toBe(0);
    },
  );
});
