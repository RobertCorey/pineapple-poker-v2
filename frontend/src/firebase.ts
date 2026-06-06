import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, initializeFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'
import { getAnalytics, logEvent, isSupported, type Analytics } from 'firebase/analytics'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
// In DEV we talk to the Firestore emulator, whose WebChannel streaming is flaky:
// Listen channels intermittently ERR_ABORT and never deliver the first snapshot,
// which strands the UI waiting on game state (the e2e join → start-match flake).
// Force long-polling for a reliable emulator connection. Production keeps the
// default streaming transport (real Firestore handles WebChannel fine).
export const db = import.meta.env.DEV
  ? initializeFirestore(app, { experimentalForceLongPolling: true })
  : getFirestore(app)
export const functions = getFunctions(app)

if (import.meta.env.DEV) {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, 'localhost', 8080)
  connectFunctionsEmulator(functions, 'localhost', 5001)
}

// Analytics — production only, no-op in dev/emulator mode
let analyticsInstance: Analytics | null = null

if (!import.meta.env.DEV && firebaseConfig.measurementId) {
  isSupported().then((supported) => {
    if (supported) {
      analyticsInstance = getAnalytics(app)
    }
  })
}

export function trackEvent(eventName: string, params?: Record<string, string | number>) {
  if (analyticsInstance) {
    logEvent(analyticsInstance, eventName, params)
  }
}
