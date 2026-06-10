/**
 * Captures the browser's `beforeinstallprompt` event so the app can offer an
 * "Install" button. Imported for its side effect from main.tsx — the event
 * often fires before React mounts, so it must be captured eagerly.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // suppress the mini-infobar; we offer our own button
  deferred = e as BeforeInstallPromptEvent;
  listeners.forEach((l) => l());
});

window.addEventListener('appinstalled', () => {
  deferred = null;
  listeners.forEach((l) => l());
});

/** True when the browser is offering installation and we can prompt. */
export function installAvailable(): boolean {
  return deferred !== null;
}

/** Subscribe to availability changes; returns an unsubscribe function. */
export function onInstallChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Show the browser install dialog (no-op if unavailable). */
export async function promptInstall(): Promise<void> {
  const e = deferred;
  if (!e) return;
  deferred = null;
  listeners.forEach((l) => l());
  await e.prompt();
}
