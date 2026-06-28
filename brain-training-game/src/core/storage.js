/* =========================================================================
   storage.js — persistent player profile (LocalStorage + export/import)
   Single source of truth for save data. Auto-saves on every mutation.
   ========================================================================= */
(function () {
  "use strict";
  const NF = window.NF;
  const KEY = "neuroforge.save.v1";

  const DEFAULTS = () => ({
    version: 1,
    created: NF.util.today(),
    player: { name: "Recruit", avatar: "🧠" },
    xp: 0,
    coins: 0,
    level: 1,
    brainScore: 0,
    bestBrainScore: 0,
    streak: 0,
    lastPlayed: null,
    // per-skill levels (0..) fed by the skill tree + gameplay
    skills: { memory: 0, focus: 0, speed: 0, logic: 0, observation: 0, math: 0, creativity: 0, strategy: 0 },
    // per-game adaptive difficulty + best scores
    games: {},          // id -> { best, plays, difficulty, lastAccuracy }
    // analytics history: array of session records
    history: [],        // { date, gameId, skill, score, accuracy, reaction, durationMs }
    achievements: {},   // id -> unlockedDateString
    settings: {
      theme: "neon",
      colorblind: false,
      fontScale: 1,
      sound: true,
      music: false,
      volume: 0.7,
      reduceMotion: false,
    },
    daily: { date: null, claimed: false, challengeGame: null, challengeDone: false },
    weekly: { weekStart: null, progress: 0, goal: 7, done: false },
  });

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return DEFAULTS();
      const parsed = JSON.parse(raw);
      return mergeDefaults(parsed);
    } catch (e) {
      console.warn("Save corrupted, resetting.", e);
      return DEFAULTS();
    }
  }

  // shallow-merge to tolerate older saves missing newer keys
  function mergeDefaults(saved) {
    const base = DEFAULTS();
    const out = Object.assign({}, base, saved);
    out.skills = Object.assign({}, base.skills, saved.skills);
    out.settings = Object.assign({}, base.settings, saved.settings);
    out.daily = Object.assign({}, base.daily, saved.daily);
    out.weekly = Object.assign({}, base.weekly, saved.weekly);
    out.games = saved.games || {};
    out.achievements = saved.achievements || {};
    out.history = saved.history || [];
    return out;
  }

  let saveTimer = null;
  function save(immediate) {
    const write = () => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); }
      catch (e) { console.error("Save failed", e); }
      NF.bus.emit("save", state);
    };
    if (immediate) { clearTimeout(saveTimer); write(); return; }
    // debounce frequent writes (auto-save)
    clearTimeout(saveTimer);
    saveTimer = setTimeout(write, 300);
  }

  NF.store = {
    get() { return state; },

    /** mutate via callback then auto-save; returns state */
    update(fn) { fn(state); save(); NF.bus.emit("state", state); return state; },

    save,

    /** per-game record accessor (auto-creates) */
    game(id) {
      if (!state.games[id]) state.games[id] = { best: 0, plays: 0, difficulty: 1, lastAccuracy: 0 };
      return state.games[id];
    },

    reset() { state = DEFAULTS(); save(true); NF.bus.emit("state", state); },

    /** Export the save as a downloadable JSON string */
    exportString() { return JSON.stringify(state, null, 2); },

    /** Import from JSON string; returns true on success */
    importString(str) {
      try {
        const parsed = JSON.parse(str);
        if (!parsed || typeof parsed !== "object") throw new Error("bad");
        state = mergeDefaults(parsed);
        save(true);
        NF.bus.emit("state", state);
        return true;
      } catch (e) { console.error("Import failed", e); return false; }
    },
  };
})();
