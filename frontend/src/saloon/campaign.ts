/**
 * The Frontier Trail — campaign ladder for the single-player Saloon mode.
 *
 * Governor-of-Poker structure: a trail of old-West locales, each guarded by
 * one or two named characters. Beat the table (finish with the most points)
 * to unlock the next stop. Stakes and table size climb as you go; winnings
 * are tracked as a dollar bankroll in localStorage.
 */
import type { BotSkill } from './engine.ts';

export interface SaloonCharacter {
  id: string;
  name: string;
  /** Emoji avatar — keeps the art budget at zero. */
  avatar: string;
  skill: BotSkill;
  blurb: string;
}

export interface SaloonLevel {
  id: number;
  /** Locale name shown on the trail and table header. */
  location: string;
  /** Dollars per point. */
  stake: number;
  /** Hands per match. */
  hands: number;
  opponents: SaloonCharacter[];
  tagline: string;
}

export const SKILL_LABELS: Record<BotSkill, string> = {
  greenhorn: 'Greenhorn',
  gunslinger: 'Gunslinger',
  outlaw: 'Outlaw',
};

export const LEVELS: SaloonLevel[] = [
  {
    id: 1,
    location: 'Dusty Gulch',
    stake: 1,
    hands: 3,
    tagline: 'A one-mule town where the cards are stickier than the floor.',
    opponents: [
      {
        id: 'ted',
        name: 'Tumbleweed Ted',
        avatar: '🌵',
        skill: 'greenhorn',
        blurb: 'Learned poker off the back of a feed catalog. Folds to a stiff breeze.',
      },
    ],
  },
  {
    id: 2,
    location: 'Rattlesnake Creek',
    stake: 2,
    hands: 4,
    tagline: 'Mind the snakes. The two-legged kind mostly.',
    opponents: [
      {
        id: 'kate',
        name: 'Calamity Kate',
        avatar: '🐍',
        skill: 'gunslinger',
        blurb: 'Quick with a grin, quicker with a queen. Counts cards out loud to rattle you.',
      },
    ],
  },
  {
    id: 3,
    location: 'Silver City Saloon',
    stake: 3,
    hands: 4,
    tagline: 'Your first full table. Three players, one deck, no friends.',
    opponents: [
      {
        id: 'doc',
        name: 'Doc Maybury',
        avatar: '🥃',
        skill: 'gunslinger',
        blurb: 'Pulls teeth by day, pulls flushes by night.',
      },
      {
        id: 'sam',
        name: 'Snake-Eye Sam',
        avatar: '🎲',
        skill: 'gunslinger',
        blurb: 'Banned from every dice table west of the Pecos. Cards were the compromise.',
      },
    ],
  },
  {
    id: 4,
    location: 'Deadwood Card Hall',
    stake: 5,
    hands: 5,
    tagline: 'Where the stakes get tall and the stories taller.',
    opponents: [
      {
        id: 'brodie',
        name: 'Marshal Brodie',
        avatar: '⭐',
        skill: 'outlaw',
        blurb: 'Keeps the peace, takes your money. In that order.',
      },
      {
        id: 'bart',
        name: 'Black-Hat Bart',
        avatar: '🎩',
        skill: 'outlaw',
        blurb: "Nobody's seen him blink. Nobody's seen him foul, either.",
      },
    ],
  },
  {
    id: 5,
    location: "The Governor's Parlor",
    stake: 10,
    hands: 6,
    tagline: 'Velvet drapes, crystal glasses, and the coldest deck in the territory.',
    opponents: [
      {
        id: 'governor',
        name: 'The Governor',
        avatar: '🦅',
        skill: 'outlaw',
        blurb: 'Runs the territory from behind a card table. Beat him and the trail is yours.',
      },
    ],
  },
];

// ---- Progress persistence ----

export interface SaloonProgress {
  bankroll: number;
  /** Highest level id the player may attempt. */
  unlocked: number;
  /** Match wins per level id. */
  wins: Record<number, number>;
}

const PROGRESS_KEY = 'saloon_progress_v1';
export const STARTING_BANKROLL = 100;

export function defaultProgress(): SaloonProgress {
  return { bankroll: STARTING_BANKROLL, unlocked: 1, wins: {} };
}

export function loadProgress(): SaloonProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return defaultProgress();
    const parsed = JSON.parse(raw) as Partial<SaloonProgress>;
    return {
      bankroll: typeof parsed.bankroll === 'number' ? parsed.bankroll : STARTING_BANKROLL,
      unlocked: typeof parsed.unlocked === 'number' ? parsed.unlocked : 1,
      wins: parsed.wins && typeof parsed.wins === 'object' ? parsed.wins : {},
    };
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(progress: SaloonProgress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Private browsing / quota — progress just won't persist.
  }
}

export function resetProgress(): SaloonProgress {
  const fresh = defaultProgress();
  saveProgress(fresh);
  return fresh;
}

/**
 * Apply a finished match to progress: settle winnings at the level's stake
 * and unlock the next stop on a win.
 */
export function settleMatch(
  progress: SaloonProgress,
  level: SaloonLevel,
  heroPoints: number,
  won: boolean,
): SaloonProgress {
  const next: SaloonProgress = {
    bankroll: progress.bankroll + heroPoints * level.stake,
    unlocked: progress.unlocked,
    wins: { ...progress.wins },
  };
  if (won) {
    next.wins[level.id] = (next.wins[level.id] ?? 0) + 1;
    const after = LEVELS.find((l) => l.id === level.id + 1);
    if (after && next.unlocked < after.id) {
      next.unlocked = after.id;
    }
  }
  saveProgress(next);
  return next;
}
