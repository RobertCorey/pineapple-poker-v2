import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase.ts';
import type { GameState } from '@shared/core/types';
import { parseGameState } from '@shared/core/schemas';

export const LAST_ROOM_KEY = 'pineapple_last_room';

export interface ResumableGame {
  roomId: string;
  game: GameState;
}

/**
 * Seat recovery: if the player closed the tab (or otherwise lost the ?room=
 * URL) while seated in a game, offer to rejoin it.
 *
 * The last joined room is persisted in localStorage (written by App while the
 * player is seated). When `enabled` (i.e. on the home screen), do a one-time
 * read of that game doc and report it as resumable only if the game still
 * exists and this uid still has a seat. Stale entries are cleaned up.
 */
export function useResumableGame(uid: string | undefined, enabled: boolean) {
  const [resumable, setResumable] = useState<ResumableGame | null>(null);

  useEffect(() => {
    if (!enabled || !uid) return;
    const savedRoomId = localStorage.getItem(LAST_ROOM_KEY);
    if (!savedRoomId) return;

    let cancelled = false;
    getDoc(doc(db, 'games', savedRoomId))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) {
          localStorage.removeItem(LAST_ROOM_KEY);
          setResumable(null);
          return;
        }
        try {
          const game = parseGameState(snap.data());
          if (game.players[uid]) {
            setResumable({ roomId: savedRoomId, game });
          } else {
            // Seat is gone (kicked, or a different uid) — forget the room.
            localStorage.removeItem(LAST_ROOM_KEY);
            setResumable(null);
          }
        } catch (err) {
          console.error('[useResumableGame] Failed to parse game doc:', err);
        }
      })
      .catch((err) => {
        // Network hiccup — don't clear storage; we may succeed next visit.
        console.error('[useResumableGame] Failed to check saved room:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [uid, enabled]);

  const dismiss = useCallback(() => {
    localStorage.removeItem(LAST_ROOM_KEY);
    setResumable(null);
  }, []);

  // Gate at read time rather than clearing state in the effect body (which
  // would be a synchronous setState-in-effect): only report a resumable game
  // while on the home screen AND the saved key still points at it. This keeps
  // a stale result from flashing after rejoin/leave without extra renders.
  const active =
    enabled && uid && resumable && localStorage.getItem(LAST_ROOM_KEY) === resumable.roomId
      ? resumable
      : null;

  return { resumable: active, dismiss };
}
