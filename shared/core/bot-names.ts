/** Bot display names — fun gambling-themed nicknames. */
export const BOT_NAMES: Array<{ nickname: string; fullName: string }> = [
  { nickname: 'Degen', fullName: 'Darryl' },
  { nickname: 'Coin Flip', fullName: 'Carl' },
  { nickname: 'All-In', fullName: 'Alice' },
  { nickname: 'Bad Beat', fullName: 'Bobby' },
  { nickname: 'Tilt Master', fullName: 'Tony' },
  { nickname: 'River Rat', fullName: 'Randy' },
  { nickname: 'Pot Committed', fullName: 'Pete' },
  { nickname: 'Double Down', fullName: 'Donna' },
  { nickname: 'Whale', fullName: 'Walter' },
  { nickname: 'Nit', fullName: 'Nancy' },
  { nickname: 'Gutshot', fullName: 'Gary' },
  { nickname: 'Sandbag', fullName: 'Sally' },
  { nickname: 'Slowroll', fullName: 'Steve' },
  { nickname: 'Railbird', fullName: 'Rita' },
  { nickname: 'Busto', fullName: 'Benny' },
  { nickname: 'Cooler', fullName: 'Cathy' },
];

/** Pick a random bot name that isn't already taken by another bot in the game. */
export function pickBotName(usedNames: Set<string>): { nickname: string; fullName: string } {
  const available = BOT_NAMES.filter((b) => !usedNames.has(b.nickname));
  if (available.length === 0) {
    // Fallback: all names taken, generate a generic one
    const n = usedNames.size + 1;
    return { nickname: `Bot #${n}`, fullName: `Bot Player ${n}` };
  }
  return available[Math.floor(Math.random() * available.length)];
}
