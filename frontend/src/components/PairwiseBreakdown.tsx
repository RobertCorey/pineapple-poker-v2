import type { PlayerState, RoundResult } from '@shared/core/types';
import { scorePairwise } from '@shared/game-logic/scoring';
import { pairwiseLabel } from '../utils/scoring-display.ts';

interface PairwiseBreakdownProps {
  players: PlayerState[];
  roundResults: Record<string, RoundResult>;
}

export function PairwiseBreakdown({ players, roundResults }: PairwiseBreakdownProps) {
  if (players.length < 2) return null;

  return (
    <div className="text-xs text-gray-500 border-t border-gray-800 pt-2">
      <div className="font-bold text-gray-400 mb-1">Pairwise</div>
      {players.map((pA, i) =>
        players.slice(i + 1).map((pB) => {
          const aFouled = roundResults[pA.uid]?.fouled ?? false;
          const bFouled = roundResults[pB.uid]?.fouled ?? false;
          const result = scorePairwise(
            pA.uid, aFouled, pA.board,
            pB.uid, bFouled, pB.board,
          );
          return (
            <div key={`${pA.uid}-${pB.uid}`} className="flex justify-between gap-2 mb-1">
              <span className="text-gray-400 truncate">{pA.displayName} vs {pB.displayName}</span>
              <span className="whitespace-nowrap">
                {pairwiseLabel(result.rowPoints, result.scoopBonus, result.total, aFouled, bFouled)}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}
