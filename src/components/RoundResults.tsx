import { useState, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.ts';
import type { GameState } from '../../shared/types.ts';
import type { ScoreEntry } from '../hooks/useScoreboard.ts';

interface RoundResultsProps {
  gameState: GameState;
  currentUid: string;
  scores: ScoreEntry[];
  onClose: () => void;
}

function formatScore(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function RoundResults({ gameState, currentUid, scores, onClose }: RoundResultsProps) {
  const [readying, setReadying] = useState(false);
  const players = gameState.playerOrder.map((uid) => gameState.players[uid]).filter(Boolean);
  const roundResults = gameState.roundResults ?? {};
  const scoreMap = new Map(scores.map((s) => [s.uid, s.totalScore]));

  const handleNextRound = useCallback(async () => {
    setReadying(true);
    try {
      const readyUp = httpsCallable(functions, 'readyUp');
      await readyUp({});
      onClose();
    } catch (err) {
      console.error('Failed to ready up:', err);
    } finally {
      setReadying(false);
    }
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-lg w-full mx-4">
        <h2 className="text-xl font-bold text-white mb-4 text-center">Round Complete</h2>

        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700">
              <th className="text-left py-2">Player</th>
              <th className="text-right py-2">Round</th>
              <th className="text-right py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const result = roundResults[player.uid];
              const roundScore = result?.netScore ?? 0;
              const totalScore = scoreMap.get(player.uid) ?? 0;

              return (
                <tr
                  key={player.uid}
                  className={`border-b border-gray-800 ${
                    player.uid === currentUid ? 'text-yellow-300' : 'text-gray-300'
                  }`}
                >
                  <td className="py-2">
                    {player.displayName}
                    {player.uid === currentUid && ' (You)'}
                    {result?.fouled && (
                      <span className="ml-1 text-xs text-red-400">(Fouled)</span>
                    )}
                  </td>
                  <td className="py-2 text-right font-mono">
                    {formatScore(roundScore)}
                  </td>
                  <td className="py-2 text-right font-mono">
                    {formatScore(totalScore)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex justify-center">
          <button
            onClick={handleNextRound}
            disabled={readying}
            className="px-6 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white rounded-lg font-semibold transition-colors"
          >
            {readying ? 'Starting...' : 'Next Round'}
          </button>
        </div>
      </div>
    </div>
  );
}
