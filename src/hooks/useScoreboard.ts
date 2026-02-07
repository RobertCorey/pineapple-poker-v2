import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.ts';

export interface ScoreEntry {
  uid: string;
  displayName: string;
  totalScore: number;
}

export function useScoreboard() {
  const [scores, setScores] = useState<ScoreEntry[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'scoreboard'),
      (snap) => {
        const entries = snap.docs.map((d) => ({
          uid: d.id,
          displayName: (d.data().displayName as string) ?? '',
          totalScore: (d.data().totalScore as number) ?? 0,
        }));
        entries.sort((a, b) => b.totalScore - a.totalScore);
        setScores(entries);
      },
    );
    return unsub;
  }, []);

  return scores;
}
