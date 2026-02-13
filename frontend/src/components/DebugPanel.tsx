import { useState, useEffect } from 'react';
import type { GameState } from '@shared/core/types';
import { useCountdown } from '../hooks/useCountdown.ts';

interface DebugPanelProps {
  gameState: GameState;
  currentUid: string;
}

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

function truncUid(uid: string): string {
  return uid.length > 8 ? uid.slice(0, 8) + '...' : uid;
}

export function DebugPanel({ gameState, currentUid }: DebugPanelProps) {
  const countdown = useCountdown(gameState.phaseDeadline);
  const [, setTick] = useState(0);

  // Re-render every second for relative times
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const expectedCards = gameState.street === 1 ? 5 : 3 + 2 * gameState.street;
  const hostName = gameState.players[gameState.hostUid]?.displayName ?? '?';

  return (
    <div className="w-72 border-l border-gray-700 bg-gray-950 p-2 text-[11px] text-gray-400 overflow-y-auto flex-shrink-0">
      <div className="text-xs font-bold text-gray-300 mb-2">Debug</div>

      <table className="w-full mb-3">
        <tbody className="[&_td]:py-0.5 [&_td:first-child]:text-gray-500 [&_td:first-child]:pr-2">
          <tr><td>gameId</td><td className="text-gray-300 break-all">{gameState.gameId}</td></tr>
          <tr><td>phase</td><td className="text-green-400">{gameState.phase}</td></tr>
          <tr><td>street</td><td>{gameState.street}</td></tr>
          <tr><td>round</td><td>{gameState.round}/{gameState.totalRounds}</td></tr>
          <tr><td>host</td><td>{hostName} <span className="text-gray-600">({truncUid(gameState.hostUid)})</span></td></tr>
          <tr><td>created</td><td>{formatTime(gameState.createdAt)} <span className="text-gray-600">({relativeTime(gameState.createdAt)})</span></td></tr>
          <tr><td>updated</td><td>{formatTime(gameState.updatedAt)} <span className="text-gray-600">({relativeTime(gameState.updatedAt)})</span></td></tr>
          {gameState.phaseDeadline && (
            <tr>
              <td>deadline</td>
              <td>
                {formatTime(gameState.phaseDeadline)}{' '}
                <span className={countdown < 10 ? 'text-red-400' : 'text-yellow-400'}>
                  ({countdown}s)
                </span>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="text-xs font-bold text-gray-300 mb-1">Players</div>
      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-gray-600 border-b border-gray-800">
            <th className="text-left py-0.5">Name</th>
            <th className="text-right py-0.5">Score</th>
            <th className="text-center py-0.5">P</th>
            <th className="text-center py-0.5">F</th>
            <th className="text-center py-0.5">St</th>
          </tr>
        </thead>
        <tbody>
          {Object.values(gameState.players).map((player) => {
            const isActive = gameState.playerOrder.includes(player.uid);
            const boardCount = player.board.top.length + player.board.middle.length + player.board.bottom.length;
            const hasPlaced = boardCount >= expectedCards;
            const isYou = player.uid === currentUid;

            return (
              <tr key={player.uid} className={`border-b border-gray-800/50 ${isYou ? 'text-yellow-300' : ''}`}>
                <td className="py-0.5">
                  {player.displayName}
                  {isYou && ' *'}
                  {!isActive && <span className="ml-1 text-blue-500">[obs]</span>}
                  {player.disconnected && <span className="ml-1 text-red-500">[dc]</span>}
                </td>
                <td className="text-right py-0.5">{player.score}</td>
                <td className="text-center py-0.5">{hasPlaced ? '\u2713' : '\u00b7'}</td>
                <td className="text-center py-0.5">{player.fouled ? '!' : '\u00b7'}</td>
                <td className="text-center py-0.5 text-gray-600">{isActive ? 'act' : 'obs'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-1 text-[10px] text-gray-600">
        P=placed F=fouled St=status | expect {expectedCards} cards
      </div>
    </div>
  );
}
