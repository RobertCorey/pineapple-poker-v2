export function scoreIntensity(netScore: number, playerCount: number): number {
  if (playerCount < 2) return 0;
  const maxScore = 9 * (playerCount - 1);
  return Math.max(-1, Math.min(1, netScore / maxScore));
}
