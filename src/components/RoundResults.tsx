import type { GameState } from '../../shared/types.ts';

interface RoundResultsProps {
  gameState: GameState;
  currentUid: string;
  onClose: () => void;
}

function formatScore(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function RoundResults({ gameState, currentUid, onClose }: RoundResultsProps) {
  const players = gameState.playerOrder.map((uid) => gameState.players[uid]).filter(Boolean);
  const roundResults = gameState.roundResults ?? {};

  return (
    <div data-testid="round-results" className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 font-mono">
      <div className="bg-gray-900 border border-gray-700 p-4 max-w-md w-full mx-4">
        <h2 className="text-sm font-bold text-white mb-3 text-center">Round Complete</h2>

        <table className="w-full text-xs mb-3">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-1">Player</th>
              <th className="text-right py-1">Score</th>
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
                </tr>
              );
            })}
          </tbody>
        </table>

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
