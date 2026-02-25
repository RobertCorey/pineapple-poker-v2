import { describe, it, expect } from 'vitest';
import { scoreIntensity } from './intensity';

describe('scoreIntensity', () => {
  it('returns 0 for fewer than 2 players', () => {
    expect(scoreIntensity(5, 1)).toBe(0);
    expect(scoreIntensity(5, 0)).toBe(0);
  });

  it('returns 0 for break-even', () => {
    expect(scoreIntensity(0, 2)).toBe(0);
  });

  it('returns 1.0 for max win (2 players)', () => {
    // Max = 9 * 1 = 9
    expect(scoreIntensity(9, 2)).toBe(1);
  });

  it('returns -1.0 for max loss (2 players)', () => {
    expect(scoreIntensity(-9, 2)).toBe(-1);
  });

  it('clamps beyond max', () => {
    expect(scoreIntensity(20, 2)).toBe(1);
    expect(scoreIntensity(-20, 2)).toBe(-1);
  });

  it('scales with player count', () => {
    // 3 players: max = 9 * 2 = 18
    expect(scoreIntensity(9, 3)).toBeCloseTo(0.5);
    expect(scoreIntensity(18, 3)).toBe(1);
  });
});
