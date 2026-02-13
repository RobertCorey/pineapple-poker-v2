import { useState, useEffect } from 'react';

export function useCountdown(deadline: number | null | undefined): number {
  const [remaining, setRemaining] = useState(0);

  // Reset when deadline becomes falsy (track previous value with state)
  const [prevDeadline, setPrevDeadline] = useState(deadline);
  if (prevDeadline !== deadline) {
    setPrevDeadline(deadline);
    if (!deadline) {
      setRemaining(0);
    }
  }

  useEffect(() => {
    if (!deadline) return;
    const update = () => {
      const seconds = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setRemaining(seconds);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  return remaining;
}
