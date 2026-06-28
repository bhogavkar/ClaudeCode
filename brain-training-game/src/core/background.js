/* =========================================================================
   background.js — animated neon particle field + dynamic lighting.
   Lightweight canvas loop, capped to keep ~60fps and pause when hidden.
   ========================================================================= */
(function () {
  "use strict";
  const NF = window.NF;

  const canvas = document.getElementById("bg-canvas");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  let particles = [];
  let raf = null;
  let last = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.width = Math.floor(innerWidth * dpr);
    H = canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
  }

  function themeColors() {
    const cs = getComputedStyle(document.documentElement);
    return [cs.getPropertyValue("--c1").trim(), cs.getPropertyValue("--c2").trim(), cs.getPropertyValue("--c3").trim()];
  }

  let palette = ["#19e3ff", "#b14bff", "#ff3ea5"];

  function seed() {
    palette = themeColors();
    const count = Math.round((innerWidth * innerHeight) / 26000);
    particles = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.18 * dpr,
        vy: (Math.random() - 0.5) * 0.18 * dpr,
        r: (Math.random() * 1.8 + 0.6) * dpr,
        c: palette[i % palette.length],
        a: Math.random() * 0.5 + 0.2,
      });
    }
  }

  const LINK = 130;
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (NF.store.get().settings.reduceMotion) { renderStatic(); return; }
    if (ts - last < 16) return; // ~60fps cap
    last = ts;
    ctx.clearRect(0, 0, W, H);

    // soft moving light blobs
    const t = ts * 0.0002;
    drawGlow(W * (0.5 + 0.3 * Math.sin(t)), H * (0.2 + 0.1 * Math.cos(t * 1.3)), palette[1], 260 * dpr);
    drawGlow(W * (0.2 + 0.2 * Math.cos(t * 0.8)), H * (0.85 + 0.08 * Math.sin(t)), palette[0], 240 * dpr);

    const link = LINK * dpr;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      // connecting lines
      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dx = p.x - q.x, dy = p.y - q.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < link * link) {
          const a = (1 - Math.sqrt(d2) / link) * 0.14;
          ctx.strokeStyle = hexA(p.c, a);
          ctx.lineWidth = 0.6 * dpr;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
      ctx.fillStyle = hexA(p.c, p.a);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
  }

  function renderStatic() {
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) { ctx.fillStyle = hexA(p.c, p.a); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
  }

  function drawGlow(x, y, color, r) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(color, 0.16));
    g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // convert "#rrggbb" -> rgba string
  function hexA(hex, a) {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const n = parseInt(hex || "19e3ff", 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function start() { if (!raf) raf = requestAnimationFrame(frame); }
  function stop() { cancelAnimationFrame(raf); raf = null; }

  window.addEventListener("resize", () => { resize(); seed(); });
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  NF.bus.on("theme", () => seed());

  NF.background = {
    init() { resize(); seed(); start(); },
  };
})();
