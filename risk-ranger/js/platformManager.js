import { PLATFORM, STICK } from './constants.js';
import { randRange, clamp } from './utils.js';
import { paramsForLevel } from './difficulty.js';

const MAX_REACH = STICK.MAX_LENGTH - PLATFORM.SAFETY_MARGIN;

let nextId = 1;

export class PlatformManager {
  constructor() {
    this.platforms = [];
  }

  init() {
    this.platforms = [];
    nextId = 1;
    const first = {
      id: nextId++,
      x: PLATFORM.FIRST_X,
      width: PLATFORM.FIRST_WIDTH,
      yOffset: 0,
      targetStart: null,
      targetWidth: 0,
      variant: 'start',
    };
    this.platforms.push(first);
    this.generateNext(1);
    return first;
  }

  get(index) {
    return this.platforms[index];
  }

  last() {
    return this.platforms[this.platforms.length - 1];
  }

  generateNext(level) {
    const from = this.last();
    const p = paramsForLevel(level);

    let gap = randRange(p.minGap, p.maxGap);
    let width = randRange(p.minWidth, p.maxWidth);

    if (gap + width > MAX_REACH) {
      const scale = MAX_REACH / (gap + width);
      gap *= scale;
      width *= scale;
    }

    let variant = 'normal';
    const roll = Math.random();
    if (roll < p.goldenChance) {
      variant = 'golden';
    } else if (roll < p.goldenChance + 0.08) {
      variant = 'wide';
      width = Math.min(width * 1.35, MAX_REACH - gap);
    }

    const targetWidth = clamp(
      randRange(p.minTarget, p.maxTarget),
      14,
      Math.max(14, width - PLATFORM.TARGET_MARGIN * 2)
    );
    const minStart = gap + PLATFORM.TARGET_MARGIN;
    const maxStart = gap + width - targetWidth - PLATFORM.TARGET_MARGIN;
    const targetStart = maxStart > minStart ? randRange(minStart, maxStart) : gap + (width - targetWidth) / 2;

    const platform = {
      id: nextId++,
      x: from.x + from.width + gap,
      width,
      yOffset: randRange(-16, 16) * clamp((level - 1) / 10, 0, 1),
      targetStart,
      targetWidth,
      variant,
    };
    this.platforms.push(platform);
    return platform;
  }

  pruneBefore(worldX) {
    while (this.platforms.length > 2 && this.platforms[0].x + this.platforms[0].width < worldX) {
      this.platforms.shift();
    }
  }
}
