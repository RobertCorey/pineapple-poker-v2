import * as admin from 'firebase-admin';

admin.initializeApp();

export { joinGame, leaveGame, placeCards, startMatch, playAgain, addBot, removeBot, pickCharm, pickMutation } from './player-actions';
export { pruneOldGames } from './cleanup';
export { adminDeleteRoom, adminKickPlayer, adminKillAllGames } from './admin-actions';
export {
  kitesJoinGame,
  kitesLeaveGame,
  kitesStartGame,
  kitesPlayCard,
  kitesPlayAgain,
} from './kites-actions';
