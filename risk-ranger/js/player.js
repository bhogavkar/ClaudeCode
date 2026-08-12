import { GROUND_Y, WALK_SPEED } from './constants.js';
import { clamp } from './utils.js';

export const PlayerState = {
  IDLE: 'idle',
  CHARGING: 'charging',
  WALKING: 'walking',
  CELEBRATE: 'celebrate',
  FALLING: 'falling',
};

export class Player {
  constructor(palette) {
    this.palette = palette;
    this.x = 0;
    this.y = GROUND_Y;
    this.state = PlayerState.IDLE;
    this.clock = 0;
    this.facing = 1;
    this.squash = 1;
    this.tilt = 0;
    this.fallVy = 0;
    this._walk = null;
  }

  setPosition(x, y = GROUND_Y) {
    this.x = x;
    this.y = y;
  }

  setState(state) {
    if (this.state !== state) {
      this.state = state;
      this.clock = 0;
    }
  }

  startWalk(toX, onDone, opts = {}) {
    this._walk = {
      fromX: this.x,
      toX,
      dist: Math.abs(toX - this.x),
      elapsed: 0,
      onDone,
      thenFall: !!opts.thenFall,
    };
    this.setState(PlayerState.WALKING);
  }

  startFall() {
    this.setState(PlayerState.FALLING);
    this.fallVy = 40;
  }

  update(dt) {
    this.clock += dt;

    if (this.state === PlayerState.WALKING && this._walk) {
      const w = this._walk;
      const duration = Math.max(0.14, w.dist / WALK_SPEED);
      w.elapsed += dt;
      const t = clamp(w.elapsed / duration, 0, 1);
      this.x = w.fromX + (w.toX - w.fromX) * t;
      if (t >= 1) {
        const done = w.onDone;
        const thenFall = w.thenFall;
        this._walk = null;
        if (thenFall) {
          this.startFall();
        } else {
          this.setState(PlayerState.IDLE);
        }
        if (done) done();
      }
    } else if (this.state === PlayerState.FALLING) {
      this.fallVy += 900 * dt;
      this.y += this.fallVy * dt;
      this.tilt += dt * 5 * this.facing;
    } else if (this.state === PlayerState.CELEBRATE) {
      if (this.clock > 0.7) this.setState(PlayerState.IDLE);
    }

    if (this.squash !== 1) {
      this.squash += (1 - this.squash) * Math.min(1, dt * 10);
    }
  }

  bounceSquash() {
    this.squash = 0.72;
  }
}
