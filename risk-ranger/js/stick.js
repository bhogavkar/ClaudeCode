import { STICK } from './constants.js';
import { easeOutCubic } from './utils.js';

export const StickPhase = {
  HIDDEN: 'hidden',
  GROWING: 'growing',
  ROTATING: 'rotating',
  DONE: 'done',
};

export class Stick {
  constructor() {
    this.reset(0, 0);
  }

  reset(pivotX, pivotY) {
    this.pivotX = pivotX;
    this.pivotY = pivotY;
    this.length = 0;
    this.angle = -Math.PI / 2;
    this.phase = StickPhase.HIDDEN;
    this._rotT = 0;
  }

  startGrowing(pivotX, pivotY) {
    this.pivotX = pivotX;
    this.pivotY = pivotY;
    this.length = 0;
    this.angle = -Math.PI / 2;
    this.phase = StickPhase.GROWING;
  }

  release() {
    if (this.phase === StickPhase.GROWING) {
      this.phase = StickPhase.ROTATING;
      this._rotT = 0;
    }
  }

  update(dt) {
    if (this.phase === StickPhase.GROWING) {
      this.length = Math.min(STICK.MAX_LENGTH, this.length + STICK.GROWTH_RATE * dt);
    } else if (this.phase === StickPhase.ROTATING) {
      this._rotT += dt / STICK.ROTATE_DURATION;
      const t = Math.min(this._rotT, 1);
      this.angle = -Math.PI / 2 + easeOutCubic(t) * (Math.PI / 2);
      if (t >= 1) this.phase = StickPhase.DONE;
    }
  }

  get tipX() {
    return this.pivotX + Math.cos(this.angle) * this.length;
  }

  get tipY() {
    return this.pivotY + Math.sin(this.angle) * this.length;
  }
}
