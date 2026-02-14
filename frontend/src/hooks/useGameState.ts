import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.ts';
import type { GameState } from '@shared/core/types';
import { parseGameState } from '@shared/core/schemas';

export function useGameState(roomId: string | null) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);

  // Reset state immediately when roomId changes (track previous value with state)
  const [prevRoomId, setPrevRoomId] = useState(roomId);
  if (prevRoomId !== roomId) {
    setPrevRoomId(roomId);
    if (!roomId) {
      setGameState(null);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }

  useEffect(() => {
    if (!roomId) return;

    const unsub = onSnapshot(
      doc(db, 'games', roomId),
      (snap) => {
        if (snap.exists()) {
          setGameState(parseGameState(snap.data()));
        } else {
          setGameState(null);
        }
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );
    return unsub;
  }, [roomId]);

  return { gameState, loading };
}
