import { useEffect, useRef } from 'react';
import type { GameState } from '@shared/core/types';
import { GamePhase } from '@shared/core/types';
import { SoundEngine } from './SoundEngine';
import { scoreIntensity } from './intensity';

export function useSoundEffects(gameState: GameState, currentUid: string): void {
  const prevPhaseRef = useRef(gameState.phase);
  const prevFouledRef = useRef(false);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = gameState.phase;
    if (prev === gameState.phase) return;

    const engine = SoundEngine.get();

    // Deal sound on any placement phase entry
    if (
      gameState.phase === GamePhase.InitialDeal ||
      gameState.phase === GamePhase.Street2 ||
      gameState.phase === GamePhase.Street3 ||
      gameState.phase === GamePhase.Street4 ||
      gameState.phase === GamePhase.Street5
    ) {
      engine.playCardDeal();
    }

    if (gameState.phase === GamePhase.Complete || gameState.phase === GamePhase.MatchComplete) {
      const result = gameState.roundResults?.[currentUid];
      if (result) {
        const intensity = scoreIntensity(result.netScore, gameState.playerOrder.length);
        engine.playScoreReveal(intensity);
      }
    }

    // Foul alert
    const currentFouled = gameState.roundResults?.[currentUid]?.fouled ?? false;
    if (currentFouled && !prevFouledRef.current) {
      engine.playFoulAlert();
    }
    prevFouledRef.current = currentFouled;
  }, [gameState.phase, gameState.roundResults, currentUid, gameState.playerOrder.length]);
}
