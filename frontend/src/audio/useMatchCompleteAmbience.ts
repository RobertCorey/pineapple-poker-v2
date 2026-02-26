import { useEffect } from 'react';
import { SoundEngine } from './SoundEngine';

export function useMatchCompleteAmbience(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    SoundEngine.get().startAmbientLoop();
    return () => SoundEngine.get().stopAmbientLoop();
  }, [enabled]);
}
