import type { GameState } from '@shared/core/types';
import { isFoul } from '@shared/game-logic/scoring';
import { PlayerBoard } from '../PlayerBoard.tsx';

interface MobileOpponentGridProps {
  gameState: GameState;
  currentUid: string;
  cardWidthPx: number;
  cols: number;
}

export function MobileOpponentGrid({ gameState, currentUid, cardWidthPx, cols }: MobileOpponentGridProps) {
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

  const boardGap = Math.max(2, Math.round(cardWidthPx * 0.15));

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex items-center justify-center">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${cols}, auto)`,
            gap: boardGap,
            justifyItems: 'center',
          }}
        >
          {otherPlayers.map((uid) => {
            const player = gameState.players[uid];
            if (!player) return null;
            return (
              <PlayerBoard
                key={uid}
                board={player.board}
                playerName={player.displayName}
                fouled={player.fouled || isFoul(player.board)}
                cardWidthPx={cardWidthPx}
                score={player.score}
                disconnected={player.disconnected}
              />
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
