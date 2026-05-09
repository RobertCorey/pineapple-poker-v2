import type { KitesColor, KitesGameState, KitesTimer } from './types';

/**
 * Compute the wall-clock time at which a flowing timer will run out.
 * Returns Infinity if the timer is paused (flippedAt === null).
 */
export function timerExpiresAt(timer: KitesTimer): number {
  if (timer.flippedAt === null) return Infinity;
  return timer.flippedAt + timer.durationMs;
}

/** Find the soonest-expiring timer in a flowing state. */
export function nextTimerToExpire(
  game: KitesGameState,
): { timer: KitesTimer; expiresAt: number } | null {
  let best: { timer: KitesTimer; expiresAt: number } | null = null;
  for (const t of game.timers) {
    const exp = timerExpiresAt(t);
    if (exp === Infinity) continue;
    if (best === null || exp < best.expiresAt) {
      best = { timer: t, expiresAt: exp };
    }
  }
  return best;
}

/**
 * Compute total cards remaining (drawPileSize + sum of hand sizes).
 * Used to score the run when a timer expires.
 */
export function cardsRemaining(game: KitesGameState): number {
  let sum = game.drawPileSize;
  for (const p of Object.values(game.players)) sum += p.handSize;
  return sum;
}

/**
 * Validate a player's flip choice for a played card.
 *
 * Rules:
 *  - For a 2-symbol card, the player must flip the two matching colored timers.
 *  - For a 1-symbol card, the player must flip exactly one timer that is
 *    either the matching color OR the white timer.
 *
 * Returns null if valid, or a string error reason if invalid.
 */
export function validateFlipChoice(
  cardSymbols: KitesColor[],
  flipChoice: KitesColor[],
): string | null {
  if (flipChoice.length !== cardSymbols.length) {
    return `Must flip ${cardSymbols.length} timer(s) for this card.`;
  }

  if (cardSymbols.length === 2) {
    const sortedCard = [...cardSymbols].sort();
    const sortedChoice = [...flipChoice].sort();
    if (sortedCard[0] !== sortedChoice[0] || sortedCard[1] !== sortedChoice[1]) {
      return 'Flip choice must match both colored symbols on this card.';
    }
    return null;
  }

  // Single-symbol card: choice must be the matching color or white.
  const sym = cardSymbols[0];
  const choice = flipChoice[0];
  if (choice !== sym && choice !== 'white') {
    return `Single-symbol card can only flip the ${sym} timer or the white timer.`;
  }
  return null;
}
