const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I,O,0,1

export function generateRoomCode(): string {
  return Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}
