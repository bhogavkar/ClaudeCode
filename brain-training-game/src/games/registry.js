/* registry.js — game mode catalogue + AI Infinite mode helper.
   Games self-register via NF.games.define(); this file groups them into the
   eight training modes and exposes helpers the screens use. */
(function () {
  "use strict";
  const NF = window.NF;

  // Display order + theming for the eight training modes.
  const MODES = [
    { name: "Memory Master", icon: "🧠", accent: "var(--c1)", blurb: "Sequence, cards & visual recall." },
    { name: "Logic Arena", icon: "🧩", accent: "var(--c2)", blurb: "Pattern completion & deduction." },
    { name: "Speed Challenge", icon: "⚡", accent: "var(--c4)", blurb: "Reaction & rapid focus drills." },
    { name: "Math Arena", icon: "➗", accent: "var(--c1)", blurb: "Mental arithmetic under pressure." },
    { name: "Observation Zone", icon: "🔍", accent: "var(--c3)", blurb: "Spot differences & visual search." },
    { name: "Spatial & Strategy", icon: "🌀", accent: "var(--c2)", blurb: "Mazes, planning & spatial reasoning." },
  ];

  NF.modes = {
    list: MODES,
    /** games grouped by their category string */
    grouped() {
      const out = {};
      MODES.forEach((m) => (out[m.name] = NF.games.byCategory(m.name)));
      // catch any uncategorised game
      NF.games.all().forEach((g) => { if (!out[g.category]) (out[g.category] = out[g.category] || []).push(g); });
      return out;
    },

    /**
     * AI Infinite Mode — picks a game, nudges difficulty up a notch and
     * returns the def so no two runs feel the same. Slightly biases toward
     * the player's weaker skills to keep training balanced.
     */
    infinitePick() {
      const all = NF.games.all();
      const acc = NF.analytics.skillAccuracy();
      // weight: weaker skills (lower accuracy) get higher pick weight
      const weighted = [];
      all.forEach((g) => {
        const w = Math.max(1, Math.round((1 - (acc[g.skill] || 0)) * 5) + 1);
        for (let i = 0; i < w; i++) weighted.push(g);
      });
      return NF.util.pick(weighted.length ? weighted : all);
    },
  };
})();
