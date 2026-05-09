import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase.ts';
import type { KitesGameState } from '@shared/kites/types';
import { parseKitesGameState } from '@shared/kites/schemas';

export function useKitesGameState(roomId: string | null) {
  const [gameState, setGameState] = useState<KitesGameState | null>(null);
  const [loading, setLoading] = useState(true);

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
      doc(db, 'kitesGames', roomId),
      (snap) => {
        if (snap.exists()) {
          try {
            setGameState(parseKitesGameState(snap.data()));
          } catch (err) {
            console.error('[useKitesGameState] Parse error:', err);
          }
        } else {
          setGameState(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('[useKitesGameState] Listener error:', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [roomId]);

  return { gameState, loading };
}
