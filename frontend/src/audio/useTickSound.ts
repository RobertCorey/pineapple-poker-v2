import { useEffect, useRef } from 'react';
import { SoundEngine } from './SoundEngine';

export function useTickSound(countdown: number, active: boolean): void {
  const prevRef = useRef(countdown);

  useEffect(() => {
    if (!active || countdown >= 5 || countdown === prevRef.current) {
      prevRef.current = countdown;
      return;
    }
    prevRef.current = countdown;

    // urgency: 0.0 at 4s, 1.0 at 0s
    const urgency = 1 - countdown / 5;
    SoundEngine.get().playTick(urgency);
  }, [countdown, active]);
}
