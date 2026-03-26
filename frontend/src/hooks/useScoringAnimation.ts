import { useState, useEffect, useRef } from 'react';

export type ScoringPhase = 'boards' | 'pairwise' | 'scores';

interface ScoringAnimationState {
  phase: ScoringPhase;
  /** Which pair index is currently revealed (0-based, increments over time) */
  pairIndex: number;
  /** Total number of pairs to reveal */
  totalPairs: number;
}

const BOARDS_DURATION_MS = 800;
const PAIR_STAGGER_MS = 400;
const SCORES_DELAY_AFTER_PAIRS_MS = 600;

/**
 * Manages the multi-phase scoring animation timing.
 * Phase A: boards (0 - 800ms)
 * Phase B: pairwise (800ms - variable, one pair every 400ms)
 * Phase C: scores (after all pairs revealed + 600ms)
 */
export function useScoringAnimation(numPairs: number): ScoringAnimationState {
  const [phase, setPhase] = useState<ScoringPhase>('boards');
  const [pairIndex, setPairIndex] = useState(-1);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timersRef.current = timers;

    // Phase B: start revealing pairs
    const pairStart = BOARDS_DURATION_MS;
    timers.push(setTimeout(() => {
      setPhase('pairwise');
      setPairIndex(0);
    }, pairStart));

    // Stagger each pair reveal
    for (let i = 1; i < numPairs; i++) {
      timers.push(setTimeout(() => {
        setPairIndex(i);
      }, pairStart + i * PAIR_STAGGER_MS));
    }

    // Phase C: scores
    const scoresStart = pairStart + Math.max(0, numPairs - 1) * PAIR_STAGGER_MS + SCORES_DELAY_AFTER_PAIRS_MS;
    timers.push(setTimeout(() => {
      setPhase('scores');
    }, scoresStart));

    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [numPairs]);

  return { phase, pairIndex, totalPairs: numPairs };
}
