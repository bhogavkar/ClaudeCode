/* =========================================================================
   analytics.js — derives insights from history and draws charts on canvas
   (no charting library needed). Provides radar, line and bar renderers.
   ========================================================================= */
(function () {
  "use strict";
  const NF = window.NF;

  const SKILLS = ["memory", "focus", "speed", "logic", "observation", "math", "creativity", "strategy"];

  const A = {
    SKILLS,

    /** aggregate accuracy per skill (0..1) over history */
    skillAccuracy() {
      const s = NF.store.get();
      const acc = {}, cnt = {};
      SKILLS.forEach((k) => { acc[k] = 0; cnt[k] = 0; });
      s.history.forEach((h) => { if (acc[h.skill] != null) { acc[h.skill] += h.accuracy || 0; cnt[h.skill]++; } });
      const out = {};
      SKILLS.forEach((k) => (out[k] = cnt[k] ? acc[k] / cnt[k] : 0));
      return out;
    },

    /** strong / weak areas by accuracy (skills actually played) */
    strengths() {
      const acc = this.skillAccuracy();
      const played = SKILLS.filter((k) => this._count(k) > 0);
      const sorted = played.sort((a, b) => acc[b] - acc[a]);
      return { strong: sorted.slice(0, 3), weak: sorted.slice(-3).reverse(), acc };
    },

    _count(skill) { return NF.store.get().history.filter((h) => h.skill === skill).length; },

    /** average accuracy over the most recent n sessions */
    recentAccuracy(n) {
      const h = NF.store.get().history.slice(-(n || 20));
      if (!h.length) return 0;
      return h.reduce((a, x) => a + (x.accuracy || 0), 0) / h.length;
    },

    /** reaction-time series (sessions that recorded reaction) */
    reactionSeries(n) {
      return NF.store.get().history.filter((h) => h.reaction).slice(-(n || 30)).map((h) => h.reaction);
    },

    /** accuracy series */
    accuracySeries(n) {
      return NF.store.get().history.slice(-(n || 30)).map((h) => (h.accuracy || 0) * 100);
    },

    /** sessions grouped by date for a daily progress view */
    dailyCounts(days) {
      const map = {};
      NF.store.get().history.forEach((h) => (map[h.date] = (map[h.date] || 0) + 1));
      const out = [];
      const today = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today); d.setDate(today.getDate() - i);
        const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
        out.push({ date: key, count: map[key] || 0 });
      }
      return out;
    },

    // ---------- canvas chart renderers ----------
    css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); },

    setup(canvas, w, h) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = "100%"; canvas.style.maxWidth = w + "px";
      const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
      return ctx;
    },

    radar(canvas, values, labels) {
      const w = 320, h = 320, cx = w / 2, cy = h / 2, R = 110;
      const ctx = this.setup(canvas, w, h);
      const n = values.length;
      const c1 = this.css("--c1"), dim = this.css("--txt-dim"), txt = this.css("--txt");
      // rings
      ctx.strokeStyle = "rgba(150,170,220,0.18)";
      for (let r = 1; r <= 4; r++) {
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
          const rr = (R * r) / 4;
          const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // axes + labels
      ctx.fillStyle = dim; ctx.font = "11px system-ui"; ctx.textAlign = "center";
      for (let i = 0; i < n; i++) {
        const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
        ctx.strokeStyle = "rgba(150,170,220,0.12)";
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R); ctx.stroke();
        const lx = cx + Math.cos(ang) * (R + 18), ly = cy + Math.sin(ang) * (R + 18);
        ctx.fillText(labels[i], lx, ly + 3);
      }
      // data polygon
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const idx = i % n;
        const ang = (Math.PI * 2 * idx) / n - Math.PI / 2;
        const rr = R * NF.util.clamp(values[idx], 0, 1);
        const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = this._alpha(c1, 0.25); ctx.fill();
      ctx.strokeStyle = c1; ctx.lineWidth = 2; ctx.stroke();
      void txt;
    },

    line(canvas, series, opts) {
      opts = opts || {};
      const w = 520, h = 180, pad = 28;
      const ctx = this.setup(canvas, w, h);
      const c = opts.color || this.css("--c1");
      if (!series.length) { this._empty(ctx, w, h); return; }
      const max = opts.max != null ? opts.max : Math.max.apply(null, series) * 1.1 || 1;
      const min = opts.min != null ? opts.min : 0;
      // grid
      ctx.strokeStyle = "rgba(150,170,220,0.12)";
      for (let i = 0; i <= 4; i++) { const y = pad + ((h - pad * 2) * i) / 4; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke(); }
      const X = (i) => pad + ((w - pad * 2) * i) / Math.max(series.length - 1, 1);
      const Y = (v) => h - pad - ((h - pad * 2) * (v - min)) / (max - min || 1);
      // area
      ctx.beginPath(); ctx.moveTo(X(0), Y(series[0]));
      series.forEach((v, i) => ctx.lineTo(X(i), Y(v)));
      ctx.lineTo(X(series.length - 1), h - pad); ctx.lineTo(X(0), h - pad); ctx.closePath();
      ctx.fillStyle = this._alpha(c, 0.16); ctx.fill();
      // line
      ctx.beginPath(); series.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
      ctx.strokeStyle = c; ctx.lineWidth = 2.4; ctx.lineJoin = "round"; ctx.stroke();
      // dots
      ctx.fillStyle = c; series.forEach((v, i) => { ctx.beginPath(); ctx.arc(X(i), Y(v), 2.5, 0, 7); ctx.fill(); });
    },

    bars(canvas, data, opts) {
      opts = opts || {};
      const w = 520, h = 160, pad = 26;
      const ctx = this.setup(canvas, w, h);
      if (!data.length) { this._empty(ctx, w, h); return; }
      const max = Math.max.apply(null, data.map((d) => d.count)) || 1;
      const bw = (w - pad * 2) / data.length;
      const c = this.css("--c2");
      data.forEach((d, i) => {
        const bh = ((h - pad * 2) * d.count) / max;
        const x = pad + i * bw + bw * 0.18, y = h - pad - bh;
        ctx.fillStyle = this._alpha(c, 0.85);
        this._roundRect(ctx, x, y, bw * 0.64, bh, 4); ctx.fill();
      });
      ctx.strokeStyle = "rgba(150,170,220,0.2)";
      ctx.beginPath(); ctx.moveTo(pad, h - pad); ctx.lineTo(w - pad, h - pad); ctx.stroke();
    },

    _roundRect(ctx, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2 || r);
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    },
    _empty(ctx, w, h) { ctx.fillStyle = this.css("--txt-dim"); ctx.font = "13px system-ui"; ctx.textAlign = "center"; ctx.fillText("Play a few sessions to see data", w / 2, h / 2); },
    _alpha(col, a) {
      col = (col || "#19e3ff").trim();
      if (col.startsWith("#")) {
        let h = col.slice(1); if (h.length === 3) h = h.split("").map((c) => c + c).join("");
        const n = parseInt(h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
      }
      return col;
    },
  };

  NF.analytics = A;
})();
