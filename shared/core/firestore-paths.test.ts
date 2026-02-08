import { describe, it, expect } from 'vitest';
import { GAME_DOC, handDoc, deckDoc } from './firestore-paths';

describe('GAME_DOC', () => {
  it('is the expected path', () => {
    expect(GAME_DOC).toBe('games/current');
  });
});

describe('handDoc', () => {
  it('returns default path with current game', () => {
    expect(handDoc('player1')).toBe('games/current/hands/player1');
  });

  it('uses custom gameId', () => {
    expect(handDoc('player1', 'game123')).toBe('games/game123/hands/player1');
  });
});

describe('deckDoc', () => {
  it('returns default path with current game', () => {
    expect(deckDoc('player1')).toBe('games/current/decks/player1');
  });

  it('uses custom gameId', () => {
    expect(deckDoc('player1', 'game123')).toBe('games/game123/decks/player1');
  });
});
