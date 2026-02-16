import { useState } from 'react';
import type { GameState } from '@shared/core/types';
import { playAgain } from '../../api.ts';
import { trackEvent } from '../../firebase.ts';
import { formatScore } from '../../utils/scoring-display.ts';
import { PairwiseBreakdown } from '../PairwiseBreakdown.tsx';

interface MobileMatchOverlayProps {
  gameState: GameState;
  currentUid: string;
  roomId: string;
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

  const handlePlayAgain = async () => {
    setRestarting(true);
    try {
      await playAgain({ roomId });
      trackEvent('play_again', { roomId });
    } catch (err) {
      console.error('Failed to restart:', err);
      setRestarting(false);
    }
  };

  return (
    <div data-testid="match-results" className="fixed inset-0 bg-gray-900 z-50 flex flex-col items-center justify-center px-6 font-mono overflow-y-auto">
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

            <PairwiseBreakdown players={activePlayers} roundResults={roundResults} />
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
