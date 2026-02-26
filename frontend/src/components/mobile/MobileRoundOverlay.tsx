import type { GameState } from '@shared/core/types';
import { formatScore } from '../../utils/scoring-display.ts';
import { useScoreCountUp } from '../../hooks/useScoreCountUp.ts';

interface MobileRoundOverlayProps {
  gameState: GameState;
  currentUid: string;
}

export function MobileRoundOverlay({ gameState, currentUid }: MobileRoundOverlayProps) {
  const roundResults = gameState.roundResults ?? {};
  const myRoundScore = roundResults[currentUid]?.netScore ?? 0;

  const { displayValue, done } = useScoreCountUp(myRoundScore);

  return (
    <div data-testid="round-results" className="fixed inset-0 bg-gray-900 z-50 flex flex-col items-center justify-center px-6 font-mono">
      <h2 className="text-lg font-bold text-white mb-6">
        Round {gameState.round} of {gameState.totalRounds} Complete
      </h2>

      <div className="flex flex-col items-center">
        <span className="text-sm text-gray-500 mb-2">Your round score</span>
        <span
          className={`text-6xl font-black tabular-nums transition-colors duration-100 ${
            displayValue > 0
              ? 'text-green-400'
              : displayValue < 0
                ? 'text-red-400'
                : 'text-gray-300'
          }`}
        >
          {formatScore(displayValue)}
        </span>
      </div>

      {done && (
        <p className="mt-6 text-xs text-gray-500 animate-pulse">Next round starting...</p>
      )}
    </div>
  );
}
