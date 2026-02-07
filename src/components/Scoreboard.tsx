import type { ScoreEntry } from '../hooks/useScoreboard.ts';

interface ScoreboardProps {
  scores: ScoreEntry[];
  currentUid: string;
}

export function Scoreboard({ scores, currentUid }: ScoreboardProps) {
  if (scores.length === 0) return null;

  return (
    <div className="bg-gray-900/60 rounded-xl border border-gray-700/50 p-3">
      <h3 className="text-sm font-semibold text-gray-300 mb-2">Scoreboard</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 text-xs">
            <th className="text-left pb-1">#</th>
            <th className="text-left pb-1">Player</th>
            <th className="text-right pb-1">Score</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((entry, i) => (
            <tr
              key={entry.uid}
              className={entry.uid === currentUid ? 'text-yellow-300' : 'text-gray-300'}
            >
              <td className="py-0.5">{i + 1}</td>
              <td className="py-0.5">
                {entry.displayName}
                {entry.uid === currentUid && ' (You)'}
              </td>
              <td className="py-0.5 text-right font-mono">
                {entry.totalScore >= 0 ? '+' : ''}{entry.totalScore}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
