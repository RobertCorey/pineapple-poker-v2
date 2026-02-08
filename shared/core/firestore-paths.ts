/**
 * Firestore path constants and helpers
 * Consolidated from dealer and functions to prevent duplication
 */

/** Main game document path */
export const GAME_DOC = 'games/current';

/** Get path to a player's hand document */
export function handDoc(uid: string, gameId: string = 'current'): string {
  return `games/${gameId}/hands/${uid}`;
}

/** Get path to a player's deck document */
export function deckDoc(uid: string, gameId: string = 'current'): string {
  return `games/${gameId}/decks/${uid}`;
}
