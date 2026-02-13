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

  const expectedCards = gameState.street === 1 ? 5 : 3 + 2 * gameState.street;

  // Observers: players in the players map but not in playerOrder
  const observers = Object.values(gameState.players).filter(
    (p) => !gameState.playerOrder.includes(p.uid)
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Other players' boards */}
      {otherPlayers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {otherPlayers.map((uid) => {
            const player = gameState.players[uid];
            if (!player) return null;
            const boardCount = player.board.top.length + player.board.middle.length + player.board.bottom.length;
            return (
              <PlayerBoard
                key={uid}
                board={player.board}
                playerName={player.displayName}
                fouled={player.fouled}
                small
                score={player.score}
                hasPlaced={boardCount >= expectedCards}
                disconnected={player.disconnected}
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
            score={currentPlayer.score}
            hasPlaced={(() => {
              const b = currentPlayerBoard || currentPlayer.board;
              return b.top.length + b.middle.length + b.bottom.length >= expectedCards;
            })()}
          />
        </div>
      )}

      {/* Observers */}
      {observers.length > 0 && (
        <div className="text-xs text-gray-500 text-center">
          Watching: {observers.map((p) => p.displayName).join(', ')}
        </div>
      )}
    </div>
  );
}
