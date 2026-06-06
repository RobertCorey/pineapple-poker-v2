/**
 * Named timeout constants for E2E tests.
 *
 * Centralizes all wait durations so they can be tuned in one place.
 * CI is slower than local dev (Cloud Function cold starts, shared runners).
 */

/**
 * Cloud Function call (joinGame, startMatch) + the Firestore listener delivering
 * the resulting snapshot. Generous because a contended CI runner can make the
 * first listener handshake of an attempt hang well past a few seconds (retry
 * then clears it). Too-tight a value here was the main source of CI flakes.
 */
export const T_JOIN = 90_000;

/** Phase transition — dealer processes snapshot and advances game */
export const T_PHASE = 25_000;

/** Waiting for a real game timeout to expire (30s deadline + buffer) */
export const T_GAME_TIMEOUT = 45_000;

/** Simple UI state change (modal appear, button toggle) */
export const T_UI = 5_000;
