export const VIRTUAL_HEIGHT = 600;
export const GROUND_Y = 400;
export const WATER_Y = 560;

export const STICK = {
  GROWTH_RATE: 320,
  MAX_LENGTH: 420,
  ROTATE_DURATION: 0.32,
  WIDTH: 7,
};

export const PLATFORM = {
  EDGE_INSET: 24,
  FIRST_WIDTH: 300,
  FIRST_X: 60,
  SAFETY_MARGIN: 50,
  TARGET_MARGIN: 10,
};

export const WALK_SPEED = 280;

export const DIFFICULTY = {
  LEVEL_UP_EVERY: 3,
  MAX_LEVEL: 25,
};

export const SCORE = {
  BASE: 10,
  PERFECT_MULT: 2,
  STREAK_BONUS: { 3: 5, 5: 10, 10: 25, 15: 25, 20: 25 },
};

export const STORAGE_KEYS = {
  BEST_SCORE: 'bestScore',
  BEST_CROSSINGS: 'bestCrossings',
  BEST_STREAK: 'bestStreak',
  SETTINGS: 'settings',
  CHARACTER: 'character',
  SEEN_TUTORIAL: 'seenTutorial',
};

export const DEFAULT_SETTINGS = {
  music: true,
  sfx: true,
  vibration: true,
  quality: 'high',
};

export const CHARACTERS = [
  {
    id: 'scout',
    name: 'Blue Scout',
    blurb: 'Quick and cautious.',
    body: '#2f8fd1',
    belly: '#eaf6ff',
    accent: '#1c5f8f',
    bandana: '#e0563f',
    eye: '#123',
    hasSpikes: false,
    neckLength: 0.5,
  },
  {
    id: 'ember',
    name: 'Ember Crest',
    blurb: 'Bold and steady.',
    body: '#e0913a',
    belly: '#fff1d9',
    accent: '#b5541c',
    bandana: '#2f8fd1',
    eye: '#123',
    hasSpikes: false,
    neckLength: 1,
  },
  {
    id: 'jade',
    name: 'Jade Spike',
    blurb: 'Tough and sure-footed.',
    body: '#2fb6a5',
    belly: '#e9fff9',
    accent: '#1c7f72',
    bandana: '#b5541c',
    eye: '#123',
    hasSpikes: true,
    neckLength: 0.35,
  },
];

export const RANKS = [
  { min: 0, name: 'Beginner' },
  { min: 10, name: 'Explorer' },
  { min: 25, name: 'Risk Ranger' },
  { min: 50, name: 'Master Ranger' },
  { min: 100, name: 'Legend' },
];

export function rankForCrossings(n) {
  let rank = RANKS[0].name;
  for (const r of RANKS) {
    if (n >= r.min) rank = r.name;
  }
  return rank;
}
