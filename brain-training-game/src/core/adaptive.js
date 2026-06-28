/* =========================================================================
   adaptive.js — the "AI" difficulty director.
   Maintains a continuous difficulty value per game (1..10) and nudges it
   after each session based on a weighted performance signal blending:
   accuracy, reaction time, win/lose, mistakes and a fatigue estimate.
   ========================================================================= */
(function () {
  "use strict";
  const NF = window.NF;
  const clamp = NF.util.clamp;

  // session counter used as a crude fatigue proxy within a single sitting
  let sessionsThisSitting = 0;

  const Adaptive = {
    MIN: 1,
    MAX: 10,

    /** current difficulty for a game (float) */
    difficulty(id) {
      const g = NF.store.game(id);
      return clamp(g.difficulty || 1, this.MIN, this.MAX);
    },

    /** integer "level" derived from difficulty, handy for level labels */
    level(id) { return Math.round(this.difficulty(id)); },

    /**
     * Update difficulty after a session.
     * result: { accuracy 0..1, reaction (ms|null), won (bool), mistakes, target (ms ideal reaction|null) }
     * Returns { from, to, delta } so the UI can explain the adjustment.
     */
    record(id, result) {
      const g = NF.store.game(id);
      const from = clamp(g.difficulty || 1, this.MIN, this.MAX);

      // ---- build a performance signal in [-1, 1] ----
      const acc = clamp(result.accuracy == null ? 0.5 : result.accuracy, 0, 1);
      let signal = (acc - 0.7) / 0.3; // 0.7 accuracy = neutral

      // reaction component (faster than target => positive)
      if (result.reaction != null && result.target) {
        const rt = clamp((result.target - result.reaction) / result.target, -1, 1);
        signal = signal * 0.7 + rt * 0.3;
      }

      // win/lose nudge
      if (result.won === true) signal += 0.25;
      else if (result.won === false) signal -= 0.25;

      // mistakes penalty
      if (result.mistakes) signal -= clamp(result.mistakes * 0.08, 0, 0.5);

      // fatigue: late in a long sitting, ease off slightly to avoid frustration
      sessionsThisSitting++;
      const fatigue = clamp((sessionsThisSitting - 6) * 0.03, 0, 0.25);
      signal -= fatigue;

      signal = clamp(signal, -1, 1);

      // ---- apply with smoothing (max ±0.8 step) ----
      const step = signal * 0.8;
      const to = clamp(from + step, this.MIN, this.MAX);

      NF.store.update((s) => {
        const rec = s.games[id] || (s.games[id] = { best: 0, plays: 0, difficulty: 1, lastAccuracy: 0 });
        rec.difficulty = to;
        rec.lastAccuracy = acc;
      });

      return { from, to, delta: to - from, signal };
    },

    /** human label for a difficulty value */
    label(d) {
      if (d < 2.5) return "Warm-up";
      if (d < 4.5) return "Standard";
      if (d < 6.5) return "Challenging";
      if (d < 8.5) return "Hard";
      return "Elite";
    },

    /** reset the per-sitting fatigue counter (e.g. on app focus after idle) */
    resetSitting() { sessionsThisSitting = 0; },
  };

  NF.adaptive = Adaptive;
})();
