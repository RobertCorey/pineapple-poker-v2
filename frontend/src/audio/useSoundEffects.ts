import { useEffect, useRef } from 'react';
import type { Board, GameState } from '@shared/core/types';
import { GamePhase } from '@shared/core/types';
import { calculateRoyalties } from '@shared/game-logic/scoring';
import { SoundEngine } from './SoundEngine';
import { scoreIntensity } from './intensity';

/** Count how many rows in this board are full. */
function fullRowCount(board: Board): number {
  let count = 0;
  if (board.top.length === 3) count++;
  if (board.middle.length === 5) count++;
  if (board.bottom.length === 5) count++;
  return count;
}

export function useSoundEffects(gameState: GameState, currentUid: string): void {
  const prevPhaseRef = useRef(gameState.phase);
  const prevFouledRef = useRef(false);
  const initialPlayer = gameState.players[currentUid];
  const prevFullRowsRef = useRef<number>(initialPlayer ? fullRowCount(initialPlayer.board) : 0);

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

  // Row completion sounds — detect when current player's board gains a full row
  const player = gameState.players[currentUid];
  const currentFullRows = player ? fullRowCount(player.board) : 0;

  useEffect(() => {
    const prevCount = prevFullRowsRef.current;
    prevFullRowsRef.current = currentFullRows;
    if (typeof prevCount !== 'number') return;
    if (currentFullRows <= prevCount) return;

    // A row just became full — check for royalties
    const engine = SoundEngine.get();
    if (!player) return;

    const royalties = calculateRoyalties(player.board);
    const totalRoyalties = royalties.top + royalties.middle + royalties.bottom;

    if (totalRoyalties > 0) {
      engine.playRoyaltyReveal(totalRoyalties);
    } else {
      engine.playRowComplete();
    }
  }, [currentFullRows, player]);
}
