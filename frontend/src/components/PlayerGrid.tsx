import type { GameState, Board, Row } from '@shared/core/types';
import { PlayerBoard } from './PlayerBoard.tsx';

interface PlayerGridProps {
  gameState: GameState;
  currentUid: string;
  currentPlayerBoard?: Board;
  onRowClick?: (row: Row) => void;
  hasCardSelected?: boolean;
}

export function PlayerGrid({ gameState, currentUid, currentPlayerBoard, onRowClick, hasCardSelected }: PlayerGridProps) {
  const otherPlayers = gameState.playerOrder.filter((uid) => uid !== currentUid);
  const currentPlayer = gameState.players[currentUid];

  return (
    <div className="flex flex-col gap-3">
      {/* Other players' boards */}
      {otherPlayers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {otherPlayers.map((uid) => {
            const player = gameState.players[uid];
            if (!player) return null;
            return (
              <PlayerBoard
                key={uid}
                board={player.board}
                playerName={player.displayName}
                fouled={player.fouled}
                small
              />
            );
          })}
        </div>
      )}

      {/* Current player's board */}
      {currentPlayer && (
        <div data-testid="my-board" className="flex justify-center">
          <PlayerBoard
            board={currentPlayerBoard || currentPlayer.board}
            playerName={`${currentPlayer.displayName} (You)`}
            fouled={currentPlayer.fouled}
            isCurrentPlayer
            onRowClick={onRowClick}
            hasCardSelected={hasCardSelected}
          />
        </div>
      )}
    </div>
  );
}
