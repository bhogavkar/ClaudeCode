export class Camera {
  constructor() {
    this.x = 0;
    this.targetX = 0;
    this.shakeT = 0;
    this.shakeMag = 0;
  }

  follow(worldX, viewWidth) {
    this.targetX = Math.max(0, worldX - viewWidth * 0.36);
  }

  snap(worldX, viewWidth) {
    this.follow(worldX, viewWidth);
    this.x = this.targetX;
  }

  shake(magnitude, duration = 0.35) {
    this.shakeMag = magnitude;
    this.shakeT = duration;
  }

  update(dt) {
    this.x += (this.targetX - this.x) * Math.min(1, dt * 5);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
    }
  }

  get offset() {
    if (this.shakeT <= 0) return { x: 0, y: 0 };
    const decay = this.shakeT;
    return {
      x: (Math.random() * 2 - 1) * this.shakeMag * decay,
      y: (Math.random() * 2 - 1) * this.shakeMag * decay,
    };
  }
}
