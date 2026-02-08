import { describe, it, expect } from 'vitest';
import { emptyBoard, phaseForStreet } from './board-utils';

describe('emptyBoard', () => {
  it('returns a board with three empty arrays', () => {
    const board = emptyBoard();
    expect(board.top).toEqual([]);
    expect(board.middle).toEqual([]);
    expect(board.bottom).toEqual([]);
  });

  it('returns a new object each time', () => {
    const a = emptyBoard();
    const b = emptyBoard();
    expect(a).not.toBe(b);
    expect(a.top).not.toBe(b.top);
  });
});

describe('phaseForStreet', () => {
  it('maps street 1 to initial_deal', () => {
    expect(phaseForStreet(1)).toBe('initial_deal');
  });

  it('maps street 2 to street_2', () => {
    expect(phaseForStreet(2)).toBe('street_2');
  });

  it('maps street 3 to street_3', () => {
    expect(phaseForStreet(3)).toBe('street_3');
  });

  it('maps street 4 to street_4', () => {
    expect(phaseForStreet(4)).toBe('street_4');
  });

  it('maps street 5 to street_5', () => {
    expect(phaseForStreet(5)).toBe('street_5');
  });

  it('maps out-of-range streets to scoring', () => {
    expect(phaseForStreet(0)).toBe('scoring');
    expect(phaseForStreet(6)).toBe('scoring');
    expect(phaseForStreet(100)).toBe('scoring');
  });
});
