import { useAuth } from './hooks/useAuth.ts';
import { useGameState } from './hooks/useGameState.ts';
import { usePlayerHand } from './hooks/usePlayerHand.ts';
import { useScoreboard } from './hooks/useScoreboard.ts';
import { Lobby } from './components/Lobby.tsx';
import { GamePage } from './components/GamePage.tsx';
import { GamePhase } from '../shared/types.ts';

function App() {
  const { user, loading: authLoading, displayName, setDisplayName, signIn } = useAuth();
  const { gameState, loading: gameLoading } = useGameState();
  const hand = usePlayerHand(user?.uid);
  const scores = useScoreboard();

  if (authLoading || gameLoading) {
    return (
      <div className="min-h-screen bg-green-900 text-white flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  const isInGame = user && gameState?.players[user.uid] !== undefined;
  const isActive = gameState && gameState.phase !== GamePhase.Waiting;

  if (isInGame && isActive) {
    return (
      <GamePage
        gameState={gameState}
        hand={hand}
        scores={scores}
        uid={user.uid}
      />
    );
  }

  return (
    <Lobby
      uid={user?.uid ?? ''}
      displayName={displayName}
      setDisplayName={setDisplayName}
      signIn={signIn}
      gameState={gameState}
    />
  );
}

export default App;
