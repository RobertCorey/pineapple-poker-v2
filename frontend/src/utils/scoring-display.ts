export function formatScore(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function pairwiseLabel(
  rowPoints: number,
  scoopBonus: number,
  total: number,
  aFouled: boolean,
  bFouled: boolean,
  royalties: number = 0,
): string {
  if (aFouled && bFouled) return `both fouled = ${formatScore(total)}`;
  if (aFouled || bFouled) return `foul = ${formatScore(total)}`;
  const parts = [`rows ${formatScore(rowPoints)}`];
  if (scoopBonus !== 0) parts.push(`scoop ${formatScore(scoopBonus)}`);
  if (royalties !== 0) parts.push(`royalties ${formatScore(royalties)}`);
  return `${parts.join(' ')} = ${formatScore(total)}`;
}
