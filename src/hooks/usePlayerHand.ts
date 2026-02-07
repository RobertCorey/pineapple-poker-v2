import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.ts';
import type { Card } from '../../shared/types.ts';

interface HandDoc {
  cards: Card[];
}

export function usePlayerHand(uid: string | undefined) {
  const [hand, setHand] = useState<Card[]>([]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      doc(db, 'games', 'current', 'hands', uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as HandDoc;
          setHand(data.cards ?? []);
        } else {
          setHand([]);
        }
      },
    );
    return unsub;
  }, [uid]);

  return hand;
}
