export function formatScore(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function pairwiseLabel(
  rowPoints: number,
  scoopBonus: number,
  total: number,
  aFouled: boolean,
  bFouled: boolean,
): string {
  if (aFouled && bFouled) return `both fouled = ${formatScore(total)}`;
  if (aFouled || bFouled) return `foul = ${formatScore(total)}`;
  if (scoopBonus !== 0)
    return `rows ${formatScore(rowPoints)} scoop ${formatScore(scoopBonus)} = ${formatScore(total)}`;
  return `rows ${formatScore(rowPoints)} = ${formatScore(total)}`;
}
