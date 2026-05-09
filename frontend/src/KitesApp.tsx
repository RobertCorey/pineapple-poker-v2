import { useEffect, useState } from 'react';
import { useAuth } from './hooks/useAuth.ts';
import { useKitesGameState } from './hooks/kites/useKitesGameState.ts';
import { useKitesHand } from './hooks/kites/useKitesHand.ts';
import { KitesRoomSelector } from './components/kites/KitesRoomSelector.tsx';
import { KitesLobby } from './components/kites/KitesLobby.tsx';
import { KitesGamePage } from './components/kites/KitesGamePage.tsx';

function getRoomFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('room') || null;
}

function setRoomInUrl(roomId: string | null) {
  const url = new URL(window.location.href);
  if (roomId) {
    url.searchParams.set('room', roomId);
    url.searchParams.set('game', 'kites');
  } else {
    url.searchParams.delete('room');
  }
  history.replaceState(null, '', url.toString());
}

interface Props {
  onSwitchToPineapple?: () => void;
}

export function KitesApp({ onSwitchToPineapple }: Props) {
  const { user, loading: authLoading, displayName, setDisplayName, signIn } = useAuth();
  const [roomId, setRoomId] = useState<string | null>(getRoomFromUrl);
  const { gameState, loading: gameLoading } = useKitesGameState(roomId);
  const hand = useKitesHand(user?.uid, roomId);

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
      <div className="min-h-screen bg-sky-950 text-white flex items-center justify-center">
        <div className="text-sky-400">Loading...</div>
      </div>
    );
  }

  if (!roomId) {
    return (
      <KitesRoomSelector
        displayName={displayName}
        setDisplayName={setDisplayName}
        signIn={signIn}
        onRoomJoined={handleRoomJoined}
        onSwitchGame={onSwitchToPineapple}
      />
    );
  }

  if (gameLoading) {
    return (
      <div className="min-h-screen bg-sky-950 text-white flex items-center justify-center">
        <div className="text-sky-400">Loading room...</div>
      </div>
    );
  }

  const isInGame = !!user && !!gameState?.players[user.uid];

  if (!gameState || !isInGame || gameState.phase === 'lobby') {
    return (
      <KitesLobby
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
    <KitesGamePage
      gameState={gameState}
      hand={hand}
      uid={user!.uid}
      roomId={roomId}
      onLeaveRoom={handleLeaveRoom}
    />
  );
}
