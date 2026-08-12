import { VIRTUAL_HEIGHT, GROUND_Y, WATER_Y, PLATFORM } from './constants.js';
import { drawRanger } from './characterArt.js';
import { StickPhase } from './stick.js';

function hash(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function mixColor(hexA, hexB, t) {
  const a = parseInt(hexA.replace('#', ''), 16);
  const b = parseInt(hexB.replace('#', ''), 16);
  const ar = (a >> 16) & 0xff,
    ag = (a >> 8) & 0xff,
    ab = a & 0xff;
  const br = (b >> 16) & 0xff,
    bg = (b >> 8) & 0xff,
    bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.scale = 1;
    this.viewWidth = 960;
    this.quality = 'high';
    this.birds = Array.from({ length: 5 }, (_, i) => ({
      seed: i * 7.3,
      y: 70 + hash(i * 3.1) * 120,
      speed: 26 + hash(i * 5.7) * 18,
    }));
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.dpr = dpr;
    this.cssWidth = rect.width;
    this.cssHeight = rect.height || 1;
    this.scale = this.cssHeight / VIRTUAL_HEIGHT;
    this.viewWidth = this.cssWidth / this.scale;
  }

  setQuality(q) {
    this.quality = q;
  }

  begin(camera) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const off = camera.offset;
    ctx.setTransform(
      this.dpr * this.scale,
      0,
      0,
      this.dpr * this.scale,
      this.dpr * this.scale * off.x,
      this.dpr * this.scale * off.y
    );
  }

  drawBackground(camera, timeSec) {
    const ctx = this.ctx;
    const w = this.viewWidth;
    const dayT = (Math.sin(timeSec * 0.02) + 1) / 2;

    const topColor = mixColor('#2f8fd6', '#6a5fb0', dayT * 0.4);
    const horizonColor = mixColor('#bfe8f7', '#ffd9a0', dayT);
    const grad = ctx.createLinearGradient(0, 0, 0, VIRTUAL_HEIGHT * 0.72);
    grad.addColorStop(0, topColor);
    grad.addColorStop(1, horizonColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, VIRTUAL_HEIGHT);

    const sunX = w * 0.72;
    const sunY = 90 + Math.sin(timeSec * 0.05) * 10;
    const sunGlow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
    sunGlow.addColorStop(0, 'rgba(255,244,214,0.95)');
    sunGlow.addColorStop(1, 'rgba(255,244,214,0)');
    ctx.fillStyle = sunGlow;
    ctx.fillRect(sunX - 100, sunY - 100, 200, 200);

    this._drawClouds(camera, timeSec);
    this._drawMountains(camera);
    if (this.quality !== 'low') this._drawBirds(timeSec);
    this._drawTreeline(camera);
  }

  _drawClouds(camera, timeSec) {
    const ctx = this.ctx;
    const factor = 0.1;
    const repeat = 420;
    const drift = timeSec * 4;
    const startTile = Math.floor((camera.x * factor + drift - 200) / repeat) - 1;
    const tiles = Math.ceil(this.viewWidth / repeat) + 3;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < tiles; i++) {
      const tile = startTile + i;
      const baseX = tile * repeat - camera.x * factor - drift;
      const y = 60 + hash(tile) * 70;
      const puffs = 3 + Math.floor(hash(tile * 1.7) * 2);
      for (let p = 0; p < puffs; p++) {
        const px = baseX + p * 26 * hash(tile + p * 0.3);
        const r = 16 + hash(tile + p) * 14;
        ctx.beginPath();
        ctx.ellipse(px, y - p * 3, r, r * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawMountains(camera) {
    const ctx = this.ctx;
    const factor = 0.28;
    const repeat = 360;
    const baseY = 300;
    const startTile = Math.floor((camera.x * factor - 200) / repeat) - 1;
    const tiles = Math.ceil(this.viewWidth / repeat) + 3;
    ctx.fillStyle = 'rgba(90,95,140,0.45)';
    for (let i = 0; i < tiles; i++) {
      const tile = startTile + i;
      const baseX = tile * repeat - camera.x * factor;
      const peakH = 90 + hash(tile * 2.1) * 70;
      ctx.beginPath();
      ctx.moveTo(baseX - 40, baseY);
      ctx.lineTo(baseX + repeat * 0.5, baseY - peakH);
      ctx.lineTo(baseX + repeat + 40, baseY);
      ctx.closePath();
      ctx.fill();
    }
  }

  _drawTreeline(camera) {
    const ctx = this.ctx;
    const factor = 0.55;
    const repeat = 130;
    const baseY = GROUND_Y - 4;
    const startTile = Math.floor((camera.x * factor - 200) / repeat) - 1;
    const tiles = Math.ceil(this.viewWidth / repeat) + 3;
    for (let i = 0; i < tiles; i++) {
      const tile = startTile + i;
      const baseX = tile * repeat - camera.x * factor;
      const h = 26 + hash(tile * 3.3) * 30;
      const g = 100 + Math.floor(hash(tile) * 30);
      ctx.fillStyle = `rgba(30,${g},70,0.5)`;
      ctx.beginPath();
      ctx.ellipse(baseX, baseY - h * 0.5, 22, h * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawBirds(timeSec) {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(50,40,60,0.55)';
    ctx.lineWidth = 2;
    for (const b of this.birds) {
      const span = this.viewWidth + 160;
      const x = (((timeSec * b.speed + b.seed * 60) % span) + span) % span - 80;
      const y = b.y + Math.sin(timeSec * 2 + b.seed) * 6;
      const flap = Math.sin(timeSec * 10 + b.seed) * 6;
      ctx.beginPath();
      ctx.moveTo(x - 8, y - flap);
      ctx.lineTo(x, y);
      ctx.lineTo(x + 8, y - flap);
      ctx.stroke();
    }
  }

  drawCanyon(camera, platforms, timeSec) {
    const ctx = this.ctx;
    this._drawWater(camera, timeSec);
    for (const p of platforms) {
      this._drawPlatform(camera, p, timeSec);
    }
  }

  _drawWater(camera, timeSec) {
    const ctx = this.ctx;
    const w = this.viewWidth;
    const grad = ctx.createLinearGradient(0, WATER_Y, 0, VIRTUAL_HEIGHT);
    grad.addColorStop(0, '#1c5f7a');
    grad.addColorStop(1, '#0c3b52');
    ctx.fillStyle = grad;
    ctx.fillRect(0, WATER_Y, w, VIRTUAL_HEIGHT - WATER_Y);

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    const factor = 0.9;
    for (let row = 0; row < 3; row++) {
      const y = WATER_Y + 14 + row * 16;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 24) {
        const yy = y + Math.sin((x + camera.x * factor) * 0.02 + timeSec + row) * 3;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  _drawPlatform(camera, p, timeSec) {
    const ctx = this.ctx;
    const x = p.x - camera.x;
    if (x + p.width < -40 || x > this.viewWidth + 40) return;

    const topY = GROUND_Y + p.yOffset;
    const bottomY = VIRTUAL_HEIGHT + 20;

    let grassTop = '#4fae3f';
    let grassEdge = '#2f7d28';
    if (p.variant === 'golden') {
      grassTop = '#e8c94a';
      grassEdge = '#b89320';
    } else if (p.variant === 'wide') {
      grassTop = '#63c454';
      grassEdge = '#3a8a34';
    }

    // Rock column
    const rockGrad = ctx.createLinearGradient(x, topY, x, bottomY);
    rockGrad.addColorStop(0, '#8a6a4f');
    rockGrad.addColorStop(1, '#3d2c22');
    ctx.fillStyle = rockGrad;
    ctx.fillRect(x, topY + 12, p.width, bottomY - topY - 12);

    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, topY + 12, 6, bottomY - topY - 12);
    ctx.fillRect(x + p.width - 6, topY + 12, 6, bottomY - topY - 12);

    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 2; i++) {
      const cx = x + p.width * (0.3 + i * 0.35);
      ctx.beginPath();
      ctx.moveTo(cx, topY + 30 + i * 10);
      ctx.lineTo(cx + 8, topY + 70 + i * 20);
      ctx.stroke();
    }

    // Grass top
    ctx.fillStyle = grassEdge;
    ctx.fillRect(x, topY, p.width, 16);
    ctx.fillStyle = grassTop;
    ctx.fillRect(x, topY, p.width, 11);

    // Target zone marker
    if (p.targetStart != null) {
      const tx = p.x + p.targetStart - camera.x;
      const pulse = 0.85 + Math.sin(timeSec * 5) * 0.15;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#e34b3d';
      const th = 8;
      ctx.fillRect(tx, topY - 2, p.targetWidth, th);
      ctx.strokeStyle = '#7a1f16';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(tx, topY - 2, p.targetWidth, th);
      ctx.restore();
    }

    if (p.variant === 'golden' && this.quality === 'high') {
      const sparkleX = x + p.width * 0.5 + Math.sin(timeSec * 3) * p.width * 0.3;
      ctx.fillStyle = 'rgba(255,255,220,0.8)';
      ctx.beginPath();
      ctx.arc(sparkleX, topY - 10, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawStick(camera, stick) {
    if (stick.phase === StickPhase.HIDDEN || stick.length <= 0) return;
    const ctx = this.ctx;
    const x0 = stick.pivotX - camera.x;
    const y0 = stick.pivotY;
    ctx.save();
    ctx.translate(x0, y0);
    ctx.rotate(stick.angle);
    const w = 7;
    ctx.fillStyle = '#7fae3f';
    ctx.fillRect(0, -w / 2, stick.length, w);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, w / 2 - 2, stick.length, 2);
    ctx.strokeStyle = '#4f7a26';
    ctx.lineWidth = 1;
    for (let seg = 18; seg < stick.length; seg += 22) {
      ctx.beginPath();
      ctx.moveTo(seg, -w / 2);
      ctx.lineTo(seg, w / 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPlayer(camera, player) {
    drawRanger(this.ctx, {
      x: player.x - camera.x,
      y: player.y,
      scale: 1,
      palette: player.palette,
      state: player.state,
      t: player.clock,
      facing: player.facing,
      tilt: player.tilt,
      squash: player.squash,
    });
  }

  drawFlash(alpha, color = '255,255,255') {
    if (alpha <= 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(${color},${alpha})`;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
  }
}
