import { useState, useEffect, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { useAuth } from './hooks/useAuth.ts';
import { useGameState } from './hooks/useGameState.ts';
import { usePlayerHand } from './hooks/usePlayerHand.ts';
import { useResumableGame, LAST_ROOM_KEY } from './hooks/useResumableGame.ts';
import { RoomSelector } from './components/RoomSelector.tsx';
import { Lobby } from './components/Lobby.tsx';
import { MobileGamePage } from './components/mobile/MobileGamePage.tsx';
import { GamePhase } from '@shared/core/types';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center font-mono">
          <div className="text-center p-6">
            <p className="text-red-400 text-lg mb-2">Something went wrong</p>
            <p className="text-gray-500 text-sm mb-4">{this.state.error.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function getRoomFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('room') || null;
}

function setRoomInUrl(roomId: string | null) {
  const url = new URL(window.location.href);
  if (roomId) {
    url.searchParams.set('room', roomId);
  } else {
    url.searchParams.delete('room');
  }
  history.replaceState(null, '', url.toString());
}

function App() {
  const { user, loading: authLoading, displayName, setDisplayName, signIn } = useAuth();
  const [roomId, setRoomId] = useState<string | null>(getRoomFromUrl);
  const { gameState, loading: gameLoading } = useGameState(roomId);
  const hand = usePlayerHand(user?.uid, roomId);
  const { resumable, dismiss: dismissResumable } = useResumableGame(user?.uid, !roomId);
  // Sync URL on popstate (back/forward)
  useEffect(() => {
    const onPopState = () => setRoomId(getRoomFromUrl());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Seat recovery: remember the room while this player holds a seat in it, so
  // a closed tab / lost URL can offer "rejoin" from the home screen.
  useEffect(() => {
    if (roomId && user && gameState?.players[user.uid]) {
      localStorage.setItem(LAST_ROOM_KEY, roomId);
    }
  }, [roomId, user, gameState]);

  const handleRoomJoined = (newRoomId: string) => {
    setRoomId(newRoomId);
    setRoomInUrl(newRoomId);
  };

  const handleLeaveRoom = () => {
    // Deliberate exit — don't offer to resume this room later.
    localStorage.removeItem(LAST_ROOM_KEY);
    setRoomId(null);
    setRoomInUrl(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-green-900 text-white flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  // No room selected — show room selector (+ rejoin banner if we hold a seat)
  if (!roomId) {
    return (
      <>
        <RoomSelector
          displayName={displayName}
          setDisplayName={setDisplayName}
          signIn={signIn}
          onRoomJoined={handleRoomJoined}
        />
        {resumable && (
          <div
            data-testid="resume-banner"
            className="fixed top-0 inset-x-0 z-50 bg-green-900 border-b border-green-600 px-3 py-2 flex items-center justify-between gap-2 font-mono text-sm"
          >
            <span className="text-green-200 min-w-0 truncate">
              You have a seat in room{' '}
              <span className="font-bold tracking-wider text-white">{resumable.roomId}</span>
              {resumable.game.round > 0 && resumable.game.phase !== GamePhase.MatchComplete
                ? ` — round ${resumable.game.round}/${resumable.game.totalRounds} in progress`
                : ''}
            </span>
            <span className="flex items-center gap-2 flex-shrink-0">
              <button
                data-testid="resume-game-button"
                onClick={() => handleRoomJoined(resumable.roomId)}
                className="px-3 py-1 bg-green-700 hover:bg-green-600 text-white text-xs font-bold rounded"
              >
                Rejoin
              </button>
              <button
                data-testid="dismiss-resume-button"
                onClick={dismissResumable}
                aria-label="Dismiss"
                className="px-2 py-1 text-green-300 hover:text-white text-xs"
              >
                ✕
              </button>
            </span>
          </div>
        )}
      </>
    );
  }

  // Room selected but still loading game state
  if (gameLoading) {
    return (
      <div className="min-h-screen bg-green-900 text-white flex items-center justify-center">
        <div className="text-gray-400">Loading room...</div>
      </div>
    );
  }

  const isInGame = user && gameState?.players[user.uid] !== undefined;

  // Show Lobby when not in game, or when in lobby phase pre-match (round 0)
  if (!isInGame || (gameState?.phase === GamePhase.Lobby && gameState?.round === 0)) {
    return (
      <Lobby
        uid={user?.uid ?? ''}
        displayName={displayName}
        setDisplayName={setDisplayName}
        signIn={signIn}
        gameState={gameState}
        isInGame={!!isInGame}
        roomId={roomId}
        onLeaveRoom={handleLeaveRoom}
      />
    );
  }

  return (
    <div className="h-[100dvh]">
      <MobileGamePage
        gameState={gameState}
        hand={hand}
        uid={user.uid}
        roomId={roomId}
        onLeaveRoom={handleLeaveRoom}
      />
    </div>
  );
}

function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

export default AppWithErrorBoundary;
