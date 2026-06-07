import { useState, useEffect, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { useAuth } from './hooks/useAuth.ts';
import { useGameState } from './hooks/useGameState.ts';
import { usePlayerHand } from './hooks/usePlayerHand.ts';
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
  // Sync URL on popstate (back/forward)
  useEffect(() => {
    const onPopState = () => setRoomId(getRoomFromUrl());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleRoomJoined = (newRoomId: string) => {
    setRoomId(newRoomId);
    setRoomInUrl(newRoomId);
  };

  const handleLeaveRoom = () => {
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

  // No room selected — show room selector
  if (!roomId) {
    return (
      <RoomSelector
        displayName={displayName}
        setDisplayName={setDisplayName}
        signIn={signIn}
        onRoomJoined={handleRoomJoined}
      />
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
