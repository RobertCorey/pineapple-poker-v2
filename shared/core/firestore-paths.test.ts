import { describe, it, expect } from 'vitest';
import { gameDoc, handDoc, deckDoc } from './firestore-paths';

describe('gameDoc', () => {
  it('returns path for a room', () => {
    expect(gameDoc('ABCD12')).toBe('games/ABCD12');
  });
});

describe('handDoc', () => {
  it('returns hand path for a room', () => {
    expect(handDoc('player1', 'ABCD12')).toBe('games/ABCD12/hands/player1');
  });
});

describe('deckDoc', () => {
  it('returns deck path for a room', () => {
    expect(deckDoc('player1', 'ABCD12')).toBe('games/ABCD12/decks/player1');
  });
});
