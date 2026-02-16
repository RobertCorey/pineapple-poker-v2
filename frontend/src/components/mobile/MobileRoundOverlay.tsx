import type { GameState } from '@shared/core/types';
import { scorePairwise } from '@shared/game-logic/scoring';

interface MobileRoundOverlayProps {
  gameState: GameState;
  currentUid: string;
  onClose?: () => void;
}

function formatScore(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function pairwiseLabel(rowPoints: number, scoopBonus: number, total: number, aFouled: boolean, bFouled: boolean): string {
  if (aFouled && bFouled) return `both fouled = ${formatScore(total)}`;
  if (aFouled || bFouled) return `foul = ${formatScore(total)}`;
  if (scoopBonus !== 0) return `rows ${formatScore(rowPoints)} scoop ${formatScore(scoopBonus)} = ${formatScore(total)}`;
  return `rows ${formatScore(rowPoints)} = ${formatScore(total)}`;
}

export function MobileRoundOverlay({ gameState, currentUid, onClose }: MobileRoundOverlayProps) {
  const players = gameState.playerOrder.map((uid) => gameState.players[uid]).filter(Boolean);
  const roundResults = gameState.roundResults ?? {};

  return (
    <div data-testid="round-results" className="fixed inset-0 bg-gray-900 z-50 flex flex-col items-center justify-center px-6 font-mono">
      <h2 className="text-lg font-bold text-white mb-6">
        Round {gameState.round} of {gameState.totalRounds} Complete
      </h2>

      {/* Score table */}
      <div className="w-full max-w-sm mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-2">Player</th>
              <th className="text-right py-2">Round</th>
              <th className="text-right py-2">Total</th>
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
                  <td className="py-2">
                    {player.displayName}
                    {player.uid === currentUid && ' (you)'}
                    {result?.fouled && (
                      <span className="ml-1 text-red-400 text-xs">[FOULED]</span>
                    )}
                  </td>
                  <td className="py-2 text-right">{formatScore(roundScore)}</td>
                  <td className="py-2 text-right">{formatScore(player.score)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pairwise breakdown */}
      {players.length >= 2 && (
        <div className="w-full max-w-sm text-xs text-gray-500 border-t border-gray-800 pt-3 mb-6">
          <div className="font-bold text-gray-400 mb-2">Pairwise</div>
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
      )}

      {onClose ? (
        <button
          data-testid="close-results"
          onClick={onClose}
          className="px-6 py-2 bg-gray-700 hover:bg-gray-600 active:bg-gray-800 text-white text-sm rounded-lg"
        >
          Close
        </button>
      ) : (
        <p className="text-xs text-gray-500 animate-pulse">Next round starting...</p>
      )}
    </div>
  );
}
