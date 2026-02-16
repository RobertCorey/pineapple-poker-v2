import { useState, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import type { GameState } from '@shared/core/types';
import { scorePairwise } from '@shared/game-logic/scoring';
import { functions, trackEvent } from '../firebase.ts';

interface MatchResultsProps {
  gameState: GameState;
  currentUid: string;
  roomId: string;
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

export function MatchResults({ gameState, currentUid, roomId }: MatchResultsProps) {
  const [restarting, setRestarting] = useState(false);

  const isHost = gameState.hostUid === currentUid;

  // Sort players by cumulative score descending
  const standings = gameState.playerOrder
    .map((uid) => gameState.players[uid])
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const roundResults = gameState.roundResults ?? {};

  const activePlayers = gameState.playerOrder
    .map((uid) => gameState.players[uid])
    .filter(Boolean);

  const handlePlayAgain = useCallback(async () => {
    setRestarting(true);
    try {
      const playAgainFn = httpsCallable(functions, 'playAgain');
      await playAgainFn({ roomId });
      trackEvent('play_again', { roomId });
    } catch (err) {
      console.error('Failed to restart:', err);
      setRestarting(false);
    }
  }, [roomId]);

  return (
    <div data-testid="match-results" className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 font-mono">
      <div className="bg-gray-900 border border-gray-700 p-4 max-w-md w-full mx-4">
        <h2 className="text-sm font-bold text-white mb-3 text-center">Match Complete</h2>

        {/* Final round breakdown */}
        {Object.keys(roundResults).length > 0 && (
          <>
            <h3 className="text-xs font-bold text-gray-400 mb-1">Final Round</h3>
            <table className="w-full text-xs mb-3">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="text-left py-1">Player</th>
                  <th className="text-right py-1">Round</th>
                </tr>
              </thead>
              <tbody>
                {gameState.playerOrder
                  .map((uid) => gameState.players[uid])
                  .filter(Boolean)
                  .map((player) => {
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
                      </tr>
                    );
                  })}
              </tbody>
            </table>

            {/* Pairwise breakdown for final round */}
            {activePlayers.length >= 2 && (
              <div className="text-[11px] text-gray-500 border-t border-gray-800 pt-2 mb-3">
                <div className="font-bold text-gray-400 mb-1">Pairwise</div>
                {activePlayers.map((pA, i) =>
                  activePlayers.slice(i + 1).map((pB) => {
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
          </>
        )}

        <h3 className="text-xs font-bold text-gray-400 mb-1">Final Standings</h3>
        <table className="w-full text-xs mb-3">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-1">#</th>
              <th className="text-left py-1">Player</th>
              <th className="text-right py-1">Score</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((player, i) => (
              <tr
                key={player.uid}
                className={`border-b border-gray-800 ${
                  player.uid === currentUid ? 'text-yellow-300' : 'text-gray-300'
                }`}
              >
                <td className="py-1">{i + 1}</td>
                <td className="py-1">
                  {player.displayName}
                  {player.uid === currentUid && ' (you)'}
                </td>
                <td className="py-1 text-right">
                  {formatScore(player.score)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-center">
          {isHost ? (
            <button
              data-testid="play-again-button"
              onClick={handlePlayAgain}
              disabled={restarting}
              className="px-4 py-1 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 text-white text-xs font-bold"
            >
              {restarting ? '...' : 'Play Again'}
            </button>
          ) : (
            <span className="text-xs text-gray-500">Waiting for host...</span>
          )}
        </div>
      </div>
    </div>
  );
}
