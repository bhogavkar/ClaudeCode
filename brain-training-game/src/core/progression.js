/* =========================================================================
   progression.js — XP, levels, coins, brain score, skills, brain age,
   achievements, daily/weekly challenges, streaks.
   Central place that turns a finished game session into rewards.
   ========================================================================= */
(function () {
  "use strict";
  const NF = window.NF;
  const U = NF.util;

  // XP needed to reach level n+1 grows gently.
  function xpForLevel(level) { return Math.round(80 * Math.pow(level, 1.35)); }

  const ACHIEVEMENTS = [
    { id: "first_step", icon: "👣", name: "First Step", test: (s) => s.history.length >= 1 },
    { id: "ten_sessions", icon: "🔟", name: "Getting Warm", test: (s) => s.history.length >= 10 },
    { id: "fifty_sessions", icon: "🏋️", name: "Dedicated", test: (s) => s.history.length >= 50 },
    { id: "streak3", icon: "🔥", name: "3-Day Streak", test: (s) => s.streak >= 3 },
    { id: "streak7", icon: "⚡", name: "Week Warrior", test: (s) => s.streak >= 7 },
    { id: "level5", icon: "⭐", name: "Level 5", test: (s) => s.level >= 5 },
    { id: "level10", icon: "🌟", name: "Level 10", test: (s) => s.level >= 10 },
    { id: "brain500", icon: "🧠", name: "Brain 500", test: (s) => s.bestBrainScore >= 500 },
    { id: "brain1000", icon: "💎", name: "Brain 1000", test: (s) => s.bestBrainScore >= 1000 },
    { id: "perfect", icon: "🎯", name: "Flawless", test: (s) => s.history.some((h) => h.accuracy >= 1) },
    { id: "allrounder", icon: "🌀", name: "All-Rounder", test: (s) => new Set(s.history.map((h) => h.skill)).size >= 6 },
    { id: "rich", icon: "💰", name: "Coin Hoarder", test: (s) => s.coins >= 1000 },
    { id: "skillmax", icon: "🏆", name: "Specialist", test: (s) => Object.values(s.skills).some((v) => v >= 10) },
    { id: "speedster", icon: "💨", name: "Speedster", test: (s) => s.history.some((h) => h.reaction && h.reaction < 280) },
  ];

  const Prog = {
    xpForLevel,
    achievementsList: ACHIEVEMENTS,

    /** total XP required to have reached the start of `level` */
    cumulativeXp(level) { let t = 0; for (let i = 1; i < level; i++) t += xpForLevel(i); return t; },

    /** progress {into, need, pct} within current level */
    levelProgress() {
      const s = NF.store.get();
      const base = this.cumulativeXp(s.level);
      const need = xpForLevel(s.level);
      const into = s.xp - base;
      return { into, need, pct: U.clamp(into / need, 0, 1) };
    },

    /**
     * Brain Score: a normalised 0..~1500 composite of recent session quality.
     * Uses the best recent sessions so it trends with genuine improvement.
     */
    computeBrainScore() {
      const s = NF.store.get();
      if (!s.history.length) return 0;
      const recent = s.history.slice(-40);
      const avgAcc = recent.reduce((a, h) => a + (h.accuracy || 0), 0) / recent.length;
      const avgScore = recent.reduce((a, h) => a + (h.score || 0), 0) / recent.length;
      const diversity = new Set(recent.map((h) => h.skill)).size / 8;
      const score = Math.round(avgAcc * 600 + Math.min(avgScore, 600) * 0.7 + diversity * 300 + s.level * 12);
      return score;
    },

    /** Brain Age: lower is better. Maps brain score inversely to an age 18..80. */
    brainAge() {
      const bs = NF.store.get().brainScore || this.computeBrainScore();
      const age = Math.round(U.lerp(80, 18, U.clamp(bs / 1200, 0, 1)));
      return age;
    },

    /** Skill rating label */
    skillRating() {
      const bs = NF.store.get().bestBrainScore;
      const tiers = [["Novice", 0], ["Apprentice", 300], ["Skilled", 550], ["Expert", 800], ["Master", 1050], ["Grandmaster", 1300]];
      let label = tiers[0][0];
      for (const [n, t] of tiers) if (bs >= t) label = n;
      return label;
    },

    /**
     * Award rewards for a completed session and update all derived stats.
     * session: { gameId, skill, score, accuracy, reaction, durationMs, won, stars }
     * Returns a summary object for the results modal.
     */
    award(session) {
      const today = U.today();
      let leveledUp = false, newAchievements = [], dailyDone = false;

      NF.store.update((s) => {
        // ---- streak (counts a day where the player completed any session) ----
        if (s.lastPlayed !== today) {
          if (s.lastPlayed && U.daysBetween(s.lastPlayed, today) === 1) s.streak += 1;
          else s.streak = 1;
          s.lastPlayed = today;
        }

        // ---- xp + coins (scaled by score, accuracy and difficulty stars) ----
        const xpGain = Math.round(20 + session.score * 0.25 + (session.stars || 0) * 15 + (session.accuracy || 0) * 30);
        const coinGain = Math.round(5 + (session.stars || 0) * 6 + (session.won ? 10 : 0));
        s.xp += xpGain;
        s.coins += coinGain;
        session._xp = xpGain; session._coins = coinGain;

        // ---- level up loop ----
        while (s.xp >= this.cumulativeXp(s.level + 1)) { s.level += 1; leveledUp = true; }

        // ---- skill growth: small bump weighted by accuracy ----
        if (session.skill && s.skills[session.skill] != null) {
          s.skills[session.skill] = +(s.skills[session.skill] + (session.accuracy || 0.5) * 0.4).toFixed(2);
        }

        // ---- history (cap to keep storage tidy) ----
        s.history.push({
          date: today, ts: undefined, gameId: session.gameId, skill: session.skill,
          score: Math.round(session.score), accuracy: +(session.accuracy || 0).toFixed(3),
          reaction: session.reaction || null, durationMs: session.durationMs || 0,
        });
        if (s.history.length > 500) s.history = s.history.slice(-500);

        // ---- per-game best ----
        const g = s.games[session.gameId] || (s.games[session.gameId] = { best: 0, plays: 0, difficulty: 1, lastAccuracy: 0 });
        g.plays += 1;
        if (session.score > g.best) g.best = Math.round(session.score);

        // ---- brain score ----
        s.brainScore = this.computeBrainScore();
        if (s.brainScore > s.bestBrainScore) s.bestBrainScore = s.brainScore;

        // ---- daily challenge ----
        if (s.daily.date === today && s.daily.challengeGame === session.gameId && !s.daily.challengeDone) {
          s.daily.challengeDone = true; dailyDone = true; s.coins += 50; s.xp += 60;
        }

        // ---- weekly progress ----
        this._tickWeekly(s, today);

        // ---- achievements ----
        for (const a of ACHIEVEMENTS) {
          if (!s.achievements[a.id] && a.test(s)) { s.achievements[a.id] = today; newAchievements.push(a); }
        }
      });

      // side-effects (sounds/toasts) after state settled
      if (leveledUp) { NF.audio.play("victory"); NF.bus.emit("levelup", NF.store.get().level); }
      newAchievements.forEach((a) => { NF.audio.play("achievement"); NF.bus.emit("achievement", a); });
      if (dailyDone) NF.bus.emit("daily-done");
      NF.bus.emit("progress", session);

      return { leveledUp, newAchievements, dailyDone, session };
    },

    _tickWeekly(s, today) {
      const monday = mondayOf(today);
      if (s.weekly.weekStart !== monday) { s.weekly = { weekStart: monday, progress: 0, goal: 7, done: false }; }
      // count one unit per distinct play-day handled by streak; here count sessions toward goal
      s.weekly.progress = Math.min(s.weekly.goal, s.weekly.progress + 1);
      if (s.weekly.progress >= s.weekly.goal && !s.weekly.done) { s.weekly.done = true; s.coins += 100; }
    },

    /** ensure today's daily challenge exists (random game) */
    ensureDaily(games) {
      const today = U.today();
      const s = NF.store.get();
      if (s.daily.date !== today) {
        const g = U.pick(games);
        NF.store.update((st) => { st.daily = { date: today, claimed: false, challengeGame: g.id, challengeDone: false }; });
      }
      return NF.store.get().daily;
    },

    /** claim the daily login reward (separate from challenge) */
    claimDaily() {
      const today = U.today();
      const s = NF.store.get();
      if (s.daily.date === today && s.daily.claimed) return false;
      NF.store.update((st) => {
        if (st.daily.date !== today) st.daily = { date: today, claimed: false, challengeGame: st.daily.challengeGame, challengeDone: false };
        st.daily.claimed = true;
        const bonus = 25 + st.streak * 5;
        st.coins += bonus; st.xp += 30;
        st._dailyBonus = bonus;
      });
      NF.audio.play("coin");
      return true;
    },
  };

  function mondayOf(dateStr) {
    const d = new Date(dateStr);
    const day = (d.getDay() + 6) % 7; // Mon=0
    d.setDate(d.getDate() - day);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  NF.prog = Prog;
})();
