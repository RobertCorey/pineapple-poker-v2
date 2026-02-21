import { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import { useAllGames, type GameStateWithRoom } from '../hooks/useAllGames';
import { adminDeleteRoom, adminKickPlayer } from '../api';

const ADMIN_EMAIL = 'robertbcorey@gmail.com';

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function RoomRow({ game }: { game: GameStateWithRoom }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const playerNames = Object.values(game.players).map(p => p.displayName).join(', ');

  const handleDelete = async () => {
    if (!window.confirm(`Delete room ${game.roomId}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await adminDeleteRoom({ roomId: game.roomId });
    } catch (err) {
      alert(`Failed to delete: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
    }
  };

  const handleKick = async (targetUid: string, displayName: string) => {
    if (!window.confirm(`Kick ${displayName} from room ${game.roomId}?`)) return;
    setBusy(true);
    try {
      await adminKickPlayer({ roomId: game.roomId, targetUid });
    } catch (err) {
      alert(`Failed to kick: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <tr
        className="border-b border-gray-800 hover:bg-gray-900 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="py-2 px-3 font-mono">{game.roomId}</td>
        <td className="py-2 px-3">{game.phase}</td>
        <td className="py-2 px-3">{Object.keys(game.players).length}</td>
        <td className="py-2 px-3 max-w-[200px] truncate">{playerNames}</td>
        <td className="py-2 px-3">R{game.round}/{game.totalRounds}</td>
        <td className="py-2 px-3 text-gray-400">{timeAgo(game.updatedAt)}</td>
        <td className="py-2 px-3">
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            disabled={busy}
            className="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs disabled:opacity-50"
          >
            Delete
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-800 bg-gray-900/50">
          <td colSpan={7} className="p-3">
            <div className="text-sm text-gray-300 space-y-1">
              {Object.values(game.players).map(p => (
                <div key={p.uid} className="flex items-center gap-3">
                  <span className="font-mono text-xs text-gray-500">{p.uid.slice(0, 8)}...</span>
                  <span>{p.displayName}</span>
                  {p.uid === game.hostUid && <span className="text-yellow-400 text-xs">(host)</span>}
                  {p.isBot && <span className="text-blue-400 text-xs">(bot)</span>}
                  {!game.playerOrder.includes(p.uid) && <span className="text-gray-500 text-xs">(observer)</span>}
                  <span className="text-gray-500">score: {p.score}</span>
                  <button
                    onClick={() => handleKick(p.uid, p.displayName)}
                    disabled={busy}
                    className="px-2 py-0.5 bg-orange-700 hover:bg-orange-600 rounded text-xs disabled:opacity-50"
                  >
                    Kick
                  </button>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Dashboard() {
  const { games, loading } = useAllGames();

  if (loading) {
    return <p className="text-gray-400">Loading rooms...</p>;
  }

  if (games.length === 0) {
    return <p className="text-gray-400">No active rooms.</p>;
  }

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-gray-700 text-gray-400">
          <th className="py-2 px-3">Room</th>
          <th className="py-2 px-3">Phase</th>
          <th className="py-2 px-3">Players</th>
          <th className="py-2 px-3">Names</th>
          <th className="py-2 px-3">Round</th>
          <th className="py-2 px-3">Updated</th>
          <th className="py-2 px-3"></th>
        </tr>
      </thead>
      <tbody>
        {games.map(game => (
          <RoomRow key={game.roomId} game={game} />
        ))}
      </tbody>
    </table>
  );
}

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const handleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  if (loading) {
    return <div className="bg-gray-950 h-screen" />;
  }

  if (!user) {
    return (
      <div className="bg-gray-950 h-screen flex items-center justify-center">
        <button
          onClick={handleSignIn}
          className="px-6 py-3 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-200 transition-colors"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  if (user.email !== ADMIN_EMAIL) {
    return (
      <div className="bg-gray-950 h-screen flex flex-col items-center justify-center gap-4 text-white">
        <p>Access denied</p>
        <button
          onClick={handleSignOut}
          className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-950 min-h-screen text-white p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Admin</h1>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{user.email}</span>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors text-sm"
          >
            Sign out
          </button>
        </div>
      </div>
      <Dashboard />
    </div>
  );
}
