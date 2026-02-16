import type { GameState, Board, Row } from '@shared/core/types';
import { PlayerBoard } from './PlayerBoard.tsx';

interface OpponentGridProps {
  gameState: GameState;
  currentUid: string;
}

/** Top half: opponents in auto-fitting grid + observer list */
export function OpponentGrid({ gameState, currentUid }: OpponentGridProps) {
  const otherPlayers = gameState.playerOrder.filter((uid) => uid !== currentUid);
  const expectedCards = gameState.street === 1 ? 5 : 3 + 2 * gameState.street;

  // Observers: players in the players map but not in playerOrder
  const observers = Object.values(gameState.players).filter(
    (p) => !gameState.playerOrder.includes(p.uid)
  );

  if (otherPlayers.length === 0 && observers.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-sm">
        Waiting for opponents...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto p-2">
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))' }}>
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
                cardSize="sm"
                score={player.score}
                hasPlaced={boardCount >= expectedCards}
                disconnected={player.disconnected}
                isBot={player.isBot}
              />
            );
          })}
        </div>
      </div>

      {/* Observers */}
      {observers.length > 0 && (
        <div className="text-xs text-gray-500 text-center py-1 border-t border-gray-800">
          Watching: {observers.map((p) => p.displayName).join(', ')}
        </div>
      )}
    </div>
  );
}

interface PlayerSectionProps {
  gameState: GameState;
  currentUid: string;
  currentPlayerBoard?: Board;
  onRowClick?: (row: Row) => void;
  hasCardSelected?: boolean;
}

/** Bottom half: current player's board */
export function PlayerSection({ gameState, currentUid, currentPlayerBoard, onRowClick, hasCardSelected }: PlayerSectionProps) {
  const currentPlayer = gameState.players[currentUid];
  const expectedCards = gameState.street === 1 ? 5 : 3 + 2 * gameState.street;

  if (!currentPlayer) return null;

  return (
    <div data-testid="my-board" className="flex justify-center">
      <PlayerBoard
        board={currentPlayerBoard || currentPlayer.board}
        playerName={`${currentPlayer.displayName} (You)`}
        fouled={currentPlayer.fouled}
        isCurrentPlayer
        onRowClick={onRowClick}
        hasCardSelected={hasCardSelected}
        cardSize="md"
        score={currentPlayer.score}
        hasPlaced={(() => {
          const b = currentPlayerBoard || currentPlayer.board;
          return b.top.length + b.middle.length + b.bottom.length >= expectedCards;
        })()}
      />
    </div>
  );
}

// Keep backward-compatible export for any external references
interface PlayerGridProps {
  gameState: GameState;
  currentUid: string;
  currentPlayerBoard?: Board;
  onRowClick?: (row: Row) => void;
  hasCardSelected?: boolean;
}

export function PlayerGrid({ gameState, currentUid, currentPlayerBoard, onRowClick, hasCardSelected }: PlayerGridProps) {
  return (
    <div className="flex flex-col gap-3">
      <OpponentGrid gameState={gameState} currentUid={currentUid} />
      <PlayerSection
        gameState={gameState}
        currentUid={currentUid}
        currentPlayerBoard={currentPlayerBoard}
        onRowClick={onRowClick}
        hasCardSelected={hasCardSelected}
      />
    </div>
  );
}
