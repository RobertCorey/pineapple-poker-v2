/** Firestore path helpers for Kites docs. Mirrors shared/core/firestore-paths.ts. */

export function kitesGameDoc(roomId: string): string {
  return `kitesGames/${roomId}`;
}

export function kitesHandDoc(uid: string, roomId: string): string {
  return `kitesGames/${roomId}/hands/${uid}`;
}

/** Single deck doc per room (shared draw pile, no per-player decks). */
export function kitesDeckDoc(roomId: string): string {
  return `kitesGames/${roomId}/deck/main`;
}
