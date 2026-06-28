/* =========================================================================
   audio.js — Web Audio engine. All sounds are synthesised (no asset files),
   so the game ships with zero audio downloads yet still has rich SFX + music.
   ========================================================================= */
(function () {
  "use strict";
  const NF = window.NF;

  let ctx = null;
  let master = null;
  let musicGain = null;
  let musicTimer = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.connect(master);
    applyVolume();
    return ctx;
  }

  function applyVolume() {
    const s = NF.store.get().settings;
    if (master) master.gain.value = s.sound ? s.volume : 0;
    if (musicGain) musicGain.gain.value = s.music && s.sound ? s.volume * 0.18 : 0;
  }

  /** play a simple oscillator tone */
  function tone(freq, dur, type, when, vol) {
    if (!ensure()) return;
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.5, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.18));
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + (dur || 0.18) + 0.02);
  }

  // pentatonic scale for pleasant feedback tones
  const PENTA = [392, 440, 523.25, 587.33, 659.25, 783.99, 880];

  const SFX = {
    click() { tone(660, 0.06, "triangle", 0, 0.25); },
    pad(i) { tone(PENTA[i % PENTA.length], 0.22, "sine", 0, 0.4); },
    correct() { tone(659.25, 0.1, "triangle"); tone(987.77, 0.16, "triangle", 0.08); },
    wrong() { tone(196, 0.18, "sawtooth", 0, 0.3); tone(146, 0.22, "sawtooth", 0.06, 0.3); },
    combo(n) { // rising arpeggio scaled by combo length
      const base = Math.min(n, 6);
      for (let i = 0; i <= base; i++) tone(PENTA[i % PENTA.length] * 1.5, 0.1, "square", i * 0.05, 0.22);
    },
    flip() { tone(520, 0.05, "sine", 0, 0.2); },
    countdown() { tone(440, 0.08, "sine", 0, 0.3); },
    go() { tone(880, 0.14, "triangle", 0, 0.4); },
    victory() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.28, "triangle", i * 0.12, 0.4));
    },
    achievement() {
      [659.25, 830.6, 987.77, 1318.5].forEach((f, i) => tone(f, 0.32, "sine", i * 0.1, 0.35));
    },
    coin() { tone(987.77, 0.07, "square"); tone(1318.5, 0.12, "square", 0.06); },
  };

  // ---- Ambient generative music (slow evolving pad arpeggio) ----
  const CHORD = [261.63, 329.63, 392, 493.88, 587.33];
  function musicStep() {
    if (!ctx) return;
    const s = NF.store.get().settings;
    if (s.music && s.sound) {
      const f = NF.util.pick(CHORD) * (Math.random() < 0.5 ? 1 : 2);
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      o.connect(g); g.connect(musicGain);
      o.start(t); o.stop(t + 2.5);
    }
    musicTimer = setTimeout(musicStep, NF.util.randInt(700, 1400));
  }

  NF.audio = {
    /** Must be called from a user gesture to unlock the AudioContext. */
    unlock() { const c = ensure(); if (c && c.state === "suspended") c.resume(); },
    play(name, arg) { if (NF.store.get().settings.sound && SFX[name]) { ensure(); SFX[name](arg); } },
    refresh: applyVolume,
    startMusic() { if (!musicTimer) musicStep(); applyVolume(); },
    stopMusic() { clearTimeout(musicTimer); musicTimer = null; },
  };

  // keep audio gains synced with settings changes
  NF.bus.on("settings", applyVolume);
})();
