import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase.ts';
import type { GameState } from '@shared/core/types';
import { parseGameState } from '@shared/core/schemas';

export type GameStateWithRoom = GameState & { roomId: string };

export function useAllGames() {
  const [games, setGames] = useState<GameStateWithRoom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'games'), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const results: GameStateWithRoom[] = [];
        for (const doc of snapshot.docs) {
          try {
            const game = parseGameState(doc.data());
            results.push({ ...game, roomId: doc.id });
          } catch {
            // Skip malformed docs
          }
        }
        setGames(results);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  return { games, loading };
}
