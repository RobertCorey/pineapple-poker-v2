/**
 * Named timeout constants for E2E tests.
 *
 * Centralizes all wait durations so they can be tuned in one place.
 * CI is slower than local dev (Cloud Function cold starts, shared runners).
 */

/** Cloud Function call (joinGame, startMatch) — includes cold start on CI */
export const T_JOIN = 45_000;

/** Phase transition — dealer processes snapshot and advances game */
export const T_PHASE = 15_000;

/** Waiting for a real game timeout to expire (30s deadline + buffer) */
export const T_GAME_TIMEOUT = 45_000;

/** Simple UI state change (modal appear, button toggle) */
export const T_UI = 5_000;
