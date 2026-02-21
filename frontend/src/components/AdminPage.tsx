import { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth';

const ADMIN_EMAIL = 'robertbcorey@gmail.com';

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
        <button
          onClick={handleSignOut}
          className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors text-sm"
        >
          Sign out
        </button>
      </div>
      <p>Hello World</p>
    </div>
  );
}
