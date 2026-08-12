import { randRange } from './utils.js';

export class ParticleSystem {
  constructor(maxParticles = 220) {
    this.pool = Array.from({ length: maxParticles }, () => ({ active: false }));
    this.texts = [];
  }

  spawnBurst(x, y, count, opts = {}) {
    const {
      color = '#ffd76a',
      speed = 160,
      life = 0.6,
      gravity = 260,
      size = 4,
      spread = Math.PI * 2,
      baseAngle = -Math.PI / 2,
    } = opts;

    let spawned = 0;
    for (const p of this.pool) {
      if (spawned >= count) break;
      if (p.active) continue;
      const angle = baseAngle + (Math.random() - 0.5) * spread;
      const s = speed * randRange(0.4, 1);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * s;
      p.vy = Math.sin(angle) * s;
      p.gravity = gravity;
      p.life = life * randRange(0.7, 1.3);
      p.maxLife = p.life;
      p.color = color;
      p.size = size * randRange(0.6, 1.3);
      spawned++;
    }
  }

  spawnFloatingText(x, y, text, opts = {}) {
    this.texts.push({
      x,
      y,
      text,
      color: opts.color || '#fff',
      size: opts.size || 20,
      life: opts.life || 1.1,
      maxLife: opts.life || 1.1,
      vy: opts.vy || -46,
    });
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
  }

  draw(ctx, camera) {
    for (const p of this.pool) {
      if (!p.active) continue;
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x - camera.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const t of this.texts) {
      const alpha = Math.max(0, Math.min(1, t.life / t.maxLife + 0.15));
      ctx.globalAlpha = alpha;
      ctx.font = `800 ${t.size}px 'Baloo 2', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = t.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 4;
      ctx.strokeText(t.text, t.x - camera.x, t.y);
      ctx.fillText(t.text, t.x - camera.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
}
