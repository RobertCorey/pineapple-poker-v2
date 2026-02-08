/**
 * Board utility functions
 * Consolidated from dealer and functions to prevent duplication
 */

import type { Board, GamePhase } from '../core/types';

/** Create an empty board with no cards */
export function emptyBoard(): Board {
  return { top: [], middle: [], bottom: [] };
}

/** Get the game phase for a given street number */
export function phaseForStreet(street: number): GamePhase {
  switch (street) {
    case 1: return 'initial_deal';
    case 2: return 'street_2';
    case 3: return 'street_3';
    case 4: return 'street_4';
    case 5: return 'street_5';
    default: return 'scoring';
  }
}
