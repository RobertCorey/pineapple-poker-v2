import { useState, useEffect } from 'react';

export function useCountdown(deadline: number | null | undefined): number {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!deadline) {
      setRemaining(0);
      return;
    }

    const update = () => {
      const now = Date.now();
      const seconds = Math.max(0, Math.floor((deadline - now) / 1000));
      setRemaining(seconds);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  return remaining;
}
