import { DIFFICULTY, STICK, PLATFORM } from './constants.js';
import { lerp, clamp } from './utils.js';

const MAX_REACH = STICK.MAX_LENGTH - PLATFORM.SAFETY_MARGIN;

export function levelForCrossings(crossings) {
  return clamp(1 + Math.floor(crossings / DIFFICULTY.LEVEL_UP_EVERY), 1, DIFFICULTY.MAX_LEVEL);
}

export function paramsForLevel(level) {
  const t = clamp((level - 1) / (DIFFICULTY.MAX_LEVEL - 1), 0, 1);

  const minGap = lerp(45, 130, t);
  const maxGap = lerp(85, 215, t);
  const minWidth = lerp(150, 70, t);
  const maxWidth = lerp(215, 105, t);
  const minTarget = lerp(44, 20, t);
  const maxTarget = lerp(58, 28, t);

  return {
    level,
    minGap,
    maxGap,
    minWidth,
    maxWidth,
    minTarget: Math.min(minTarget, minWidth - PLATFORM.TARGET_MARGIN * 2),
    maxTarget: Math.min(maxTarget, MAX_REACH),
    goldenChance: lerp(0.06, 0.1, t),
  };
}
