import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase.ts';
import type { KitesCard } from '@shared/kites/types';
import { parseKitesHandDoc } from '@shared/kites/schemas';

export function useKitesHand(uid: string | undefined, roomId: string | null) {
  const [hand, setHand] = useState<KitesCard[]>([]);

  // Reset hand synchronously when subscription identity changes — avoids
  // briefly showing stale cards after switching room or signing out.
  const [prevKey, setPrevKey] = useState<string | null>(uid && roomId ? `${uid}:${roomId}` : null);
  const key = uid && roomId ? `${uid}:${roomId}` : null;
  if (prevKey !== key) {
    setPrevKey(key);
    setHand([]);
  }

  useEffect(() => {
    if (!uid || !roomId) return;
    const unsub = onSnapshot(
      doc(db, 'kitesGames', roomId, 'hands', uid),
      (snap) => {
        if (snap.exists()) {
          try {
            setHand(parseKitesHandDoc(snap.data()).cards);
          } catch (err) {
            console.error('[useKitesHand] Parse error:', err);
            setHand([]);
          }
        } else {
          setHand([]);
        }
      },
      (err) => console.error('[useKitesHand] Listener error:', err),
    );
    return unsub;
  }, [uid, roomId]);

  return hand;
}
