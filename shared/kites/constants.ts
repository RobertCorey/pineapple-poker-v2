import type { KitesCardColor, KitesColor, KitesTimer } from './types';
import { KitesColor as KC } from './types';

/** Timer durations from the rulebook (ms). */
export const KITES_TIMER_DURATION_MS: Record<KitesColor, number> = {
  red: 30_000,
  orange: 45_000,
  yellow: 60_000,
  white: 60_000,
  blue: 75_000,
  purple: 90_000,
};

/** Display order for the 6 timers (left-to-right in the UI). */
export const KITES_TIMER_ORDER: KitesColor[] = [
  KC.Red,
  KC.Orange,
  KC.Yellow,
  KC.White,
  KC.Blue,
  KC.Purple,
];

/** Hand size by player count. */
export function kitesHandSize(playerCount: number): number {
  if (playerCount <= 2) return 5;
  if (playerCount <= 4) return 4;
  return 3;
}

export const KITES_MIN_PLAYERS = 2;
export const KITES_MAX_PLAYERS = 6;

/** Cap on the recentPlays array so the public game doc stays small. */
export const KITES_RECENT_PLAYS_CAP = 12;

/**
 * Kite card distribution. 53 cards total (matches the rulebook).
 * Singles per timer color (5 colors): heavier weight on slower timers,
 * since faster timers need more frequent flips.
 *   red:5 + orange:6 + yellow:7 + blue:9 + purple:10 = 37 singles.
 * Doubles: 16 across all 10 unordered color pairs (~1-2 each).
 */
export const KITES_SINGLE_COUNTS: Record<KitesCardColor, number> = {
  red: 5,
  orange: 6,
  yellow: 7,
  blue: 9,
  purple: 10,
};

/** Pair counts. Keyed by 'colorA-colorB' with colors sorted alphabetically. */
export const KITES_DOUBLE_COUNTS: Record<string, number> = {
  'orange-red': 2,
  'red-yellow': 2,
  'blue-red': 1,
  'purple-red': 1,
  'orange-yellow': 2,
  'blue-orange': 2,
  'orange-purple': 1,
  'blue-yellow': 2,
  'purple-yellow': 1,
  'blue-purple': 2,
};

/** Total deck size — sanity-checked by createKitesDeck(). */
export const KITES_DECK_SIZE = 53;

export function emptyTimers(): KitesTimer[] {
  return KITES_TIMER_ORDER.map((color) => ({
    color,
    durationMs: KITES_TIMER_DURATION_MS[color],
    flippedAt: null,
  }));
}

/**
 * Score tiers from the rulebook. Lower is better; 0 is a perfect win.
 * Returned as the raw label for display.
 */
export function kitesScoreLabel(score: number): string {
  if (score === 0) return "You've blown everyone away!";
  if (score <= 6) return 'Flying high!';
  if (score <= 15) return "You're lifting people's spirits.";
  if (score <= 20) return 'Your kites are starting to flop out — keep at it.';
  if (score <= 39) return 'A slight breeze... warming up.';
  return 'No wind in sight.';
}
