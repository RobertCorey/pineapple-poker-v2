import { useState, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import type { GameState } from '@shared/core/types';
import { scorePairwise } from '@shared/game-logic/scoring';
import { functions } from '../../firebase.ts';

interface MobileMatchOverlayProps {
  gameState: GameState;
  currentUid: string;
  roomId: string;
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

export function MobileMatchOverlay({ gameState, currentUid, roomId }: MobileMatchOverlayProps) {
  const [restarting, setRestarting] = useState(false);
  const isHost = gameState.hostUid === currentUid;

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
    } catch (err) {
      console.error('Failed to restart:', err);
      setRestarting(false);
    }
  }, [roomId]);

  return (
    <div data-testid="mobile-match-overlay" className="fixed inset-0 bg-gray-900 z-50 flex flex-col items-center justify-center px-6 font-mono overflow-y-auto">
      <div className="py-8 w-full max-w-sm">
        <h2 className="text-xl font-bold text-white mb-6 text-center">Match Complete</h2>

        {/* Final round breakdown */}
        {Object.keys(roundResults).length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-bold text-gray-400 mb-2">Final Round</h3>
            <table className="w-full text-sm mb-3">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="text-left py-2">Player</th>
                  <th className="text-right py-2">Round</th>
                </tr>
              </thead>
              <tbody>
                {activePlayers.map((player) => {
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
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {activePlayers.length >= 2 && (
              <div className="text-xs text-gray-500 border-t border-gray-800 pt-2 mb-4">
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
          </div>
        )}

        {/* Final standings */}
        <h3 className="text-xs font-bold text-gray-400 mb-2">Final Standings</h3>
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-2">#</th>
              <th className="text-left py-2">Player</th>
              <th className="text-right py-2">Score</th>
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
                <td className="py-2">{i + 1}</td>
                <td className="py-2">
                  {player.displayName}
                  {player.uid === currentUid && ' (you)'}
                </td>
                <td className="py-2 text-right">{formatScore(player.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Host action */}
        <div className="flex justify-center">
          {isHost ? (
            <button
              data-testid="play-again-button"
              onClick={handlePlayAgain}
              disabled={restarting}
              className="px-8 py-3 bg-green-700 hover:bg-green-600 active:bg-green-800 disabled:bg-gray-700 text-white text-sm font-bold rounded-lg"
            >
              {restarting ? '...' : 'Play Again'}
            </button>
          ) : (
            <span className="text-sm text-gray-500">Waiting for host...</span>
          )}
        </div>
      </div>
    </div>
  );
}
