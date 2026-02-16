import { useState, useEffect } from 'react';
import { signInAnonymously, signInWithCustomToken, onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../firebase.ts';

const DISPLAY_NAME_KEY = 'pineapple_display_name';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayNameState] = useState<string>(
    () => localStorage.getItem(DISPLAY_NAME_KEY) ?? '',
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });

    // Auto sign-in with bot token if present (spectate mode)
    const params = new URLSearchParams(window.location.search);
    const botToken = params.get('botToken');
    if (botToken && !auth.currentUser) {
      signInWithCustomToken(auth, botToken).catch((err) => {
        console.error('Bot token sign-in failed:', err);
      });
    }

    return unsub;
  }, []);

  const signIn = async () => {
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }
  };

  const setDisplayName = (name: string) => {
    const trimmed = name.trim();
    setDisplayNameState(trimmed);
    localStorage.setItem(DISPLAY_NAME_KEY, trimmed);
  };

  return { user, loading, displayName, setDisplayName, signIn };
}
