function shade(hex, amt) {
  const c = hex.replace('#', '');
  const num = parseInt(c, 16);
  let r = (num >> 16) + amt;
  let g = ((num >> 8) & 0xff) + amt;
  let b = (num & 0xff) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `rgb(${r},${g},${b})`;
}

// Draws a stylized cartoon dinosaur "ranger" facing right at (x, y) where
// y is the ground/foot line. scale ~1 means roughly 70px tall.
export function drawRanger(ctx, opts) {
  const {
    x,
    y,
    scale = 1,
    palette,
    state = 'idle', // idle | charging | walking | falling | celebrate
    t = 0, // animation clock in seconds, monotonic
    facing = 1,
    tilt = 0, // extra rotation, used while falling
    squash = 1, // vertical squash/stretch (landing bounce)
  } = opts;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing * scale, scale);
  if (tilt) ctx.rotate(tilt);
  ctx.scale(1, squash);

  const bob =
    state === 'idle'
      ? Math.sin(t * 2.4) * 1.6
      : state === 'charging'
      ? Math.sin(t * 9) * 0.8 - 2
      : 0;

  const walkCycle = state === 'walking' ? Math.sin(t * 14) : 0;
  const legSwing = state === 'walking' ? walkCycle * 16 : 0;
  const celebrateHop = state === 'celebrate' ? Math.abs(Math.sin(t * 10)) * -10 : 0;

  ctx.translate(0, bob + celebrateHop);

  // Shadow-cast body group anchors around the feet (0,0), body sits above.
  const bodyY = -34;
  const neckLen = 10 + palette.neckLength * 22;

  // Tail
  ctx.beginPath();
  ctx.moveTo(-16, bodyY + 6);
  ctx.quadraticCurveTo(-40, bodyY + 2 - legSwing * 0.3, -46, bodyY - 14);
  ctx.quadraticCurveTo(-38, bodyY + 4, -14, bodyY + 14);
  ctx.closePath();
  ctx.fillStyle = palette.body;
  ctx.fill();

  // Back legs
  drawLeg(ctx, -8, bodyY + 20, -legSwing, palette.accent);
  drawLeg(ctx, 10, bodyY + 20, legSwing, palette.accent);

  // Body
  ctx.beginPath();
  ctx.ellipse(0, bodyY, 22, 16, 0, 0, Math.PI * 2);
  ctx.fillStyle = palette.body;
  ctx.fill();

  // Belly
  ctx.beginPath();
  ctx.ellipse(-2, bodyY + 6, 14, 9, 0, 0, Math.PI * 2);
  ctx.fillStyle = palette.belly;
  ctx.fill();

  // Spikes
  if (palette.hasSpikes) {
    ctx.fillStyle = palette.accent;
    for (let i = -1; i <= 2; i++) {
      const sx = -10 + i * 9;
      ctx.beginPath();
      ctx.moveTo(sx - 4, bodyY - 12);
      ctx.lineTo(sx + 4, bodyY - 12);
      ctx.lineTo(sx, bodyY - 22);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Neck + head
  const headX = 20;
  const headY = bodyY - 8 - neckLen * 0.6;
  ctx.beginPath();
  ctx.moveTo(14, bodyY - 6);
  ctx.quadraticCurveTo(18, bodyY - neckLen, headX, headY + 6);
  ctx.quadraticCurveTo(24, bodyY - neckLen, 20, bodyY - 6);
  ctx.closePath();
  ctx.fillStyle = palette.body;
  ctx.fill();

  // Head
  ctx.save();
  ctx.translate(headX, headY);
  const lookTilt = state === 'charging' ? -0.12 : 0;
  ctx.rotate(lookTilt);

  ctx.beginPath();
  ctx.ellipse(0, 0, 13, 10, 0, 0, Math.PI * 2);
  ctx.fillStyle = palette.body;
  ctx.fill();

  // Snout
  ctx.beginPath();
  ctx.moveTo(8, -3);
  ctx.quadraticCurveTo(20, -2, 20, 3);
  ctx.quadraticCurveTo(14, 7, 6, 6);
  ctx.closePath();
  ctx.fillStyle = palette.body;
  ctx.fill();

  // Bandana (ranger flair)
  ctx.beginPath();
  ctx.moveTo(-9, -3);
  ctx.quadraticCurveTo(2, 6, 10, 1);
  ctx.quadraticCurveTo(2, 3, -9, -3);
  ctx.closePath();
  ctx.fillStyle = palette.bandana;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.lineTo(-15, 5);
  ctx.lineTo(-9, 3);
  ctx.closePath();
  ctx.fillStyle = shade(palette.bandana, -20);
  ctx.fill();

  // Eye
  ctx.beginPath();
  ctx.ellipse(3, -3, 3.6, 3.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  const blink = state === 'idle' && Math.sin(t * 0.7) > 0.985 ? 0.2 : 1;
  ctx.beginPath();
  ctx.ellipse(4, -3, 1.8, 1.8 * blink, 0, 0, Math.PI * 2);
  ctx.fillStyle = palette.eye;
  ctx.fill();

  ctx.restore();

  // Front legs
  drawLeg(ctx, 12, bodyY + 18, legSwing * -1, palette.accent);
  drawLeg(ctx, 4, bodyY + 18, legSwing, palette.accent);

  // Small arm
  const armSwing = state === 'celebrate' ? -50 : state === 'charging' ? -18 : -4;
  ctx.save();
  ctx.translate(14, bodyY);
  ctx.rotate((armSwing * Math.PI) / 180);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(8, 4, 10, -2);
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.strokeStyle = palette.body;
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

function drawLeg(ctx, x, y, swingDeg, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((swingDeg * Math.PI) / 180);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(1, 10, 0, 18);
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.stroke();
  // Foot
  ctx.beginPath();
  ctx.ellipse(0, 19, 6, 3, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

export function renderThumbnail(canvas, palette) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  drawRanger(ctx, {
    x: w * 0.42,
    y: h * 0.78,
    scale: Math.min(w, h) / 90,
    palette,
    state: 'idle',
    t: performance.now() / 1000,
    facing: 1,
  });
}
