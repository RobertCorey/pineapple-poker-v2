import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase.ts';

export const joinGame = httpsCallable(functions, 'joinGame');
export const leaveGame = httpsCallable(functions, 'leaveGame');
export const placeCards = httpsCallable(functions, 'placeCards');
export const startMatch = httpsCallable(functions, 'startMatch');
export const playAgain = httpsCallable(functions, 'playAgain');
export const addBot = httpsCallable(functions, 'addBot');
export const removeBot = httpsCallable(functions, 'removeBot');
