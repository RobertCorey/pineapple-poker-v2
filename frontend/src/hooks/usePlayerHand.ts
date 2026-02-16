import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.ts';
import type { Card } from '@shared/core/types';
import { parseHandDoc } from '@shared/core/schemas';

export function usePlayerHand(uid: string | undefined, roomId: string | null) {
  const [hand, setHand] = useState<Card[]>([]);

  useEffect(() => {
    if (!uid || !roomId) return;
    const unsub = onSnapshot(
      doc(db, 'games', roomId, 'hands', uid),
      (snap) => {
        if (snap.exists()) {
          const data = parseHandDoc(snap.data());
          setHand(data.cards ?? []);
        } else {
          setHand([]);
        }
      },
    );
    return unsub;
  }, [uid, roomId]);

  return hand;
}
