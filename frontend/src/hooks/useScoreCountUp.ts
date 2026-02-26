import { useState, useEffect, useRef } from 'react';
import { SoundEngine } from '../audio/SoundEngine.ts';

const TICK_INTERVAL_MS = 80;
const HOLD_AFTER_MS = 800;

/**
 * Animates a score counting from 0 to `target` one unit at a time.
 * Returns { displayValue, done } — `done` becomes true after the count
 * finishes and a short hold period elapses.
 */
export function useScoreCountUp(target: number): { displayValue: number; done: boolean } {
  const [displayValue, setDisplayValue] = useState(0);
  const [done, setDone] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const holdRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const currentRef = useRef(0);

  useEffect(() => {
    if (target === 0) {
      // Nothing to animate — play a single neutral sound and move on
      SoundEngine.get().playScoreTick(0);
      holdRef.current = setTimeout(() => setDone(true), HOLD_AFTER_MS);
      return () => {
        clearTimeout(holdRef.current);
      };
    }

    const step = target > 0 ? 1 : -1;
    currentRef.current = 0;

    tickRef.current = setInterval(() => {
      currentRef.current += step;
      setDisplayValue(currentRef.current);
      SoundEngine.get().playScoreTick(currentRef.current / target);

      if (currentRef.current === target) {
        clearInterval(tickRef.current);
        // Final emphasis sound
        SoundEngine.get().playScoreCountFinish(target > 0);
        holdRef.current = setTimeout(() => setDone(true), HOLD_AFTER_MS);
      }
    }, TICK_INTERVAL_MS);

    return () => {
      clearInterval(tickRef.current);
      clearTimeout(holdRef.current);
    };
  }, [target]);

  return { displayValue, done };
}
