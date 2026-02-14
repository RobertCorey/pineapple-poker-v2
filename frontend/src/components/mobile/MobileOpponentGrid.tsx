import type { GameState } from '@shared/core/types';
import { PlayerBoard } from '../PlayerBoard.tsx';

interface MobileOpponentGridProps {
  gameState: GameState;
  currentUid: string;
}

export function MobileOpponentGrid({ gameState, currentUid }: MobileOpponentGridProps) {
  const otherPlayers = gameState.playerOrder.filter((uid) => uid !== currentUid);

  const observers = Object.values(gameState.players).filter(
    (p) => !gameState.playerOrder.includes(p.uid)
  );

  if (otherPlayers.length === 0 && observers.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-xs">
        Waiting for opponents...
      </div>
    );
  }

  // 3-column grid, centered when fewer than 3
  const gridCols = otherPlayers.length === 1
    ? 'flex justify-center'
    : otherPlayers.length === 2
    ? 'grid grid-cols-2 gap-1'
    : 'grid grid-cols-3 gap-1';

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-1">
        <div className={gridCols}>
          {otherPlayers.map((uid) => {
            const player = gameState.players[uid];
            if (!player) return null;
            return (
              <div key={uid} className={otherPlayers.length === 1 ? 'w-40' : ''}>
                <PlayerBoard
                  board={player.board}
                  playerName={player.displayName}
                  fouled={player.fouled}
                  cardSize="xs"
                  score={player.score}
                  hasPlaced={player.hasPlaced}
                  disconnected={player.disconnected}
                />
              </div>
            );
          })}
        </div>
      </div>

      {observers.length > 0 && (
        <div className="text-[10px] text-gray-500 text-center py-0.5 border-t border-gray-800">
          Watching: {observers.map((p) => p.displayName).join(', ')}
        </div>
      )}
    </div>
  );
}
