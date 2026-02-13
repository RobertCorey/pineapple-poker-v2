import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.ts';
import type { GameState } from '@shared/core/types';

export function useGameState(roomId: string | null) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomId) {
      setGameState(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = onSnapshot(
      doc(db, 'games', roomId),
      (snap) => {
        if (snap.exists()) {
          setGameState(snap.data() as GameState);
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
