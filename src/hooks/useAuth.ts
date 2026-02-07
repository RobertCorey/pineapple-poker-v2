import { useState, useEffect, useCallback } from 'react';
import { signInAnonymously, onAuthStateChanged, type User } from 'firebase/auth';
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
    return unsub;
  }, []);

  const signIn = useCallback(async () => {
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }
  }, []);

  const setDisplayName = useCallback((name: string) => {
    const trimmed = name.trim();
    setDisplayNameState(trimmed);
    localStorage.setItem(DISPLAY_NAME_KEY, trimmed);
  }, []);

  return { user, loading, displayName, setDisplayName, signIn };
}
