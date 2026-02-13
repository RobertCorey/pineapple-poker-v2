/**
 * Firestore path constants and helpers
 * Consolidated from dealer and functions to prevent duplication
 */

/** Get game document path for a room */
export function gameDoc(roomId: string): string {
  return `games/${roomId}`;
}

/** Get path to a player's hand document */
export function handDoc(uid: string, roomId: string): string {
  return `games/${roomId}/hands/${uid}`;
}

/** Get path to a player's deck document */
export function deckDoc(uid: string, roomId: string): string {
  return `games/${roomId}/decks/${uid}`;
}
