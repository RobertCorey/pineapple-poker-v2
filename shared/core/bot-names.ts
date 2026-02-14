/** Bot display names — old-time gambler nicknames. */
export const BOT_NAMES: Array<{ nickname: string; fullName: string }> = [
  { nickname: 'Amarillo Slim', fullName: 'Thomas Preston' },
  { nickname: 'Texas Dolly', fullName: 'Doyle Brunson' },
  { nickname: 'The Kid', fullName: 'Stu Ungar' },
  { nickname: 'Sailor Roberts', fullName: 'Brian Roberts' },
  { nickname: 'Puggy', fullName: 'Walter Pearson' },
  { nickname: 'The Grand Old Man', fullName: 'Johnny Moss' },
  { nickname: 'Treetop', fullName: 'Jack Straus' },
  { nickname: 'Devilfish', fullName: 'Dave Ulliott' },
  { nickname: 'The Orient Express', fullName: 'Johnny Chan' },
  { nickname: 'Comeback Kid', fullName: 'Paul Darden' },
  { nickname: 'Cigar', fullName: 'Crandell Addington' },
  { nickname: 'No Home Jerome', fullName: 'Jerome Graham' },
  { nickname: 'The Owl', fullName: 'Bobby Baldwin' },
  { nickname: 'Action Dan', fullName: 'Dan Harrington' },
  { nickname: 'The Mouth', fullName: 'Mike Matusow' },
  { nickname: 'Unabomber', fullName: 'Phil Laak' },
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
