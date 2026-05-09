import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase.ts';

export const kitesJoinGame = httpsCallable(functions, 'kitesJoinGame');
export const kitesLeaveGame = httpsCallable(functions, 'kitesLeaveGame');
export const kitesStartGame = httpsCallable(functions, 'kitesStartGame');
export const kitesPlayCard = httpsCallable(functions, 'kitesPlayCard');
export const kitesPlayAgain = httpsCallable(functions, 'kitesPlayAgain');
