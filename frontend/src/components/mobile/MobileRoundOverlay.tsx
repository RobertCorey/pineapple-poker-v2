import type { GameState } from '@shared/core/types';
import { formatScore } from '../../utils/scoring-display.ts';

interface MobileRoundOverlayProps {
  gameState: GameState;
  currentUid: string;
}

export function MobileRoundOverlay({ gameState, currentUid }: MobileRoundOverlayProps) {
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

      <p className="text-xs text-gray-500 animate-pulse">Next round starting...</p>
    </div>
  );
}
