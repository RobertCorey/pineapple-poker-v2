import type { GameState } from '@shared/core/types';
import { scorePairwise } from '@shared/game-logic/scoring';

interface RoundResultsProps {
  gameState: GameState;
  currentUid: string;
  onClose: () => void;
}

function formatScore(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function pairwiseLabel(rowPoints: number, scoopBonus: number, total: number, aFouled: boolean, bFouled: boolean): string {
  if (aFouled && bFouled) return `both fouled = ${formatScore(total)}`;
  if (aFouled || bFouled) return `foul penalty = ${formatScore(total)}`;
  if (scoopBonus !== 0) return `rows ${formatScore(rowPoints)}  scoop ${formatScore(scoopBonus)}  = ${formatScore(total)}`;
  return `rows ${formatScore(rowPoints)}  = ${formatScore(total)}`;
}

export function RoundResults({ gameState, currentUid, onClose }: RoundResultsProps) {
  const players = gameState.playerOrder.map((uid) => gameState.players[uid]).filter(Boolean);
  const roundResults = gameState.roundResults ?? {};

  return (
    <div data-testid="round-results" className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 font-mono">
      <div className="bg-gray-900 border border-gray-700 p-4 max-w-md w-full mx-4">
        <h2 className="text-sm font-bold text-white mb-3 text-center">
          Round {gameState.round} of {gameState.totalRounds} Complete
        </h2>

        <table className="w-full text-xs mb-3">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-1">Player</th>
              <th className="text-right py-1">Round</th>
              <th className="text-right py-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const result = roundResults[player.uid];
              const roundScore = result?.netScore ?? 0;

              return (
                <tr
                  key={player.uid}
                  className={`border-b border-gray-800 ${
                    player.uid === currentUid ? 'text-yellow-300' : 'text-gray-300'
                  }`}
                >
                  <td className="py-1">
                    {player.displayName}
                    {player.uid === currentUid && ' (you)'}
                    {result?.fouled && (
                      <span className="ml-1 text-red-400">[FOULED]</span>
                    )}
                  </td>
                  <td className="py-1 text-right">
                    {formatScore(roundScore)}
                  </td>
                  <td className="py-1 text-right">
                    {formatScore(player.score)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pairwise breakdown */}
        {players.length >= 2 && (
          <div className="text-[11px] text-gray-500 border-t border-gray-800 pt-2 mb-3">
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
                  <div key={`${pA.uid}-${pB.uid}`} className="flex justify-between gap-2">
                    <span className="text-gray-400 truncate">{pA.displayName} vs {pB.displayName}:</span>
                    <span className="whitespace-nowrap">
                      {pairwiseLabel(result.rowPoints, result.scoopBonus, result.total, aFouled, bFouled)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}

        <p className="text-xs text-gray-500 text-center mb-2">Next round starts automatically...</p>

        <div className="flex justify-center">
          <button
            data-testid="close-results"
            onClick={onClose}
            className="px-4 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
