import type { GameState, Row } from '../../shared/types.ts';
import { PlayerBoard } from './PlayerBoard.tsx';

interface PlayerGridProps {
  gameState: GameState;
  currentUid: string;
  onSlotClick?: (row: Row, index: number) => void;
}

export function PlayerGrid({ gameState, currentUid, onSlotClick }: PlayerGridProps) {
  const otherPlayers = gameState.playerOrder.filter((uid) => uid !== currentUid);
  const currentPlayer = gameState.players[currentUid];

  return (
    <div className="flex flex-col gap-4">
      {/* Other players' boards */}
      {otherPlayers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {otherPlayers.map((uid) => {
            const player = gameState.players[uid];
            if (!player) return null;
            return (
              <PlayerBoard
                key={uid}
                board={player.board}
                playerName={player.displayName}
                small
              />
            );
          })}
        </div>
      )}

      {/* Current player's board */}
      {currentPlayer && (
        <div className="flex justify-center">
          <PlayerBoard
            board={currentPlayer.board}
            playerName={`${currentPlayer.displayName} (You)`}
            isCurrentPlayer
            onSlotClick={onSlotClick}
          />
        </div>
      )}
    </div>
  );
}
