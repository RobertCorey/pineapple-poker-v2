/**
 * Bot decision layer for the Saloon: maps a character's skill tier to the
 * vendored greedy strategy with score jitter. Greenhorns make real mistakes
 * (including the occasional foul); outlaws play the strategy straight.
 */
import type { TableState } from './engine.ts';
import { currentSeat } from './engine.ts';
import type { BotSkill, SeatPlacement } from './engine.ts';
import type { Card } from './vendor/types.ts';
import { botPlaceInitialDeal, botPlaceStreet } from './vendor/bot-strategy.ts';

/** Score jitter per skill tier — tuned against scoreBoard's scale, where
 *  ~600 is a made-tier inversion and ~5000 a near-certain foul. */
const SKILL_JITTER: Record<BotSkill, number> = {
  greenhorn: 900,
  gunslinger: 250,
  outlaw: 0,
};

export interface BotMove {
  placements: SeatPlacement[];
  discard: Card | null;
}

/** Decide the acting bot's move for the current street. */
export function decideBotMove(state: TableState): BotMove {
  const seat = currentSeat(state);
  const jitter = SKILL_JITTER[seat.skill ?? 'outlaw'];
  const decision = state.street === 1
    ? botPlaceInitialDeal(seat.hand, seat.board, jitter)
    : botPlaceStreet(seat.hand, seat.board, jitter);
  return {
    placements: decision.placements,
    discard: decision.discard ?? null,
  };
}
