import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './hooks/useAuth.ts';
import { useGameState } from './hooks/useGameState.ts';
import { usePlayerHand } from './hooks/usePlayerHand.ts';
import { useIsMobile } from './hooks/useIsMobile.ts';
import { RoomSelector } from './components/RoomSelector.tsx';
import { Lobby } from './components/Lobby.tsx';
import { GamePage } from './components/GamePage.tsx';
import { MobileGamePage } from './components/mobile/MobileGamePage.tsx';
import { GamePhase } from '@shared/core/types';

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
  const isMobile = useIsMobile();

  // Sync URL on popstate (back/forward)
  useEffect(() => {
    const onPopState = () => setRoomId(getRoomFromUrl());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleRoomJoined = useCallback((newRoomId: string) => {
    setRoomId(newRoomId);
    setRoomInUrl(newRoomId);
  }, []);

  const handleLeaveRoom = useCallback(() => {
    setRoomId(null);
    setRoomInUrl(null);
  }, []);

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

  // Show Lobby when not in game, or when in game but in lobby phase (pre-match)
  if (!isInGame || gameState?.phase === GamePhase.Lobby) {
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

  if (isMobile) {
    return (
      <MobileGamePage
        gameState={gameState}
        hand={hand}
        uid={user.uid}
        roomId={roomId}
        onLeaveRoom={handleLeaveRoom}
      />
    );
  }

  return (
    <GamePage
      gameState={gameState}
      hand={hand}
      uid={user.uid}
      roomId={roomId}
      onLeaveRoom={handleLeaveRoom}
    />
  );
}

export default App;
