/* =========================================================================
   screens.js — renders each route into #screen. Pure view layer; reads the
   store and calls into prog/analytics/games. Returns DOM via the `el` helper.
   ========================================================================= */
(function () {
  "use strict";
  const NF = window.NF, el = NF.util.el, U = NF.util;

  const Screens = {
    // ---------------- HOME / Lab ----------------
    home(mount, go) {
      const s = NF.store.get();
      const lp = NF.prog.levelProgress();
      const daily = NF.prog.ensureDaily(NF.games.all());
      const challengeGame = NF.games.byId(daily.challengeGame);

      mount.append(
        el("section", { class: "hero" }, [
          el("h1", { html: `Welcome back, <span style="color:var(--c1)">${s.player.avatar} ${s.player.name}</span>` }),
          el("p", { text: "Your AI lab adapts every drill to your performance. Train a little every day to lower your Brain Age and climb the skill tiers." }),
          el("div", { class: "cta" }, [
            el("button", { class: "btn primary", onclick: () => go("play") }, "▶ Start Training"),
            el("button", { class: "btn", onclick: () => NF.app.startInfinite() }, "♾ AI Infinite"),
            !s.daily.claimed ? el("button", { class: "btn", onclick: () => Screens._claimDaily(go) }, "🎁 Daily Reward") : null,
          ]),
        ]),

        el("div", { class: "tiles mt2" }, [
          tile("Brain Score", U.abbr(s.brainScore), "best " + U.abbr(s.bestBrainScore)),
          tile("Brain Age", NF.prog.brainAge(), "lower is better"),
          tile("Skill Rating", NF.prog.skillRating(), "level " + s.level),
          tile("Day Streak", s.streak + "🔥", "keep it alive"),
        ]),

        el("div", { class: "tile mt2" }, [
          el("div", { class: "row-between" }, [
            el("div", { class: "k", text: "Level " + s.level + " progress" }),
            el("div", { class: "muted", text: lp.into + " / " + lp.need + " XP" }),
          ]),
          el("div", { class: "bar mt" }, [el("i", { style: { width: lp.pct * 100 + "%" } })]),
        ]),

        // daily + weekly challenge cards
        el("div", { class: "section-title", text: "Today" }),
        el("div", { class: "grid cols-auto" }, [
          el("div", { class: "card", style: { "--accent": "var(--c3)" }, onclick: () => challengeGame && NF.app.launch(challengeGame.id) }, [
            el("div", { class: "ico", text: "🎯" }),
            el("h3", { text: "Daily Challenge" }),
            el("div", { class: "desc", text: challengeGame ? `Play ${challengeGame.name} for +50⬡ / +60XP` : "Loading…" }),
            el("div", { class: "meta" }, [el("span", { class: "tag", text: daily.challengeDone ? "✓ Completed" : "Reward pending" })]),
          ]),
          el("div", { class: "card", style: { "--accent": "var(--c4)" } }, [
            el("div", { class: "ico", text: "📅" }),
            el("h3", { text: "Weekly Goal" }),
            el("div", { class: "desc", text: `${s.weekly.progress}/${s.weekly.goal} sessions this week` }),
            el("div", { class: "bar mt" }, [el("i", { style: { width: U.clamp(s.weekly.progress / s.weekly.goal, 0, 1) * 100 + "%" } })]),
          ]),
        ]),

        el("div", { class: "section-title", text: "Quick Train" }),
        el("div", { class: "grid cols-auto" }, NF.games.all().slice(0, 6).map((g) => gameCard(g))),
      );
    },

    _claimDaily(go) {
      if (NF.prog.claimDaily()) {
        const b = NF.store.get()._dailyBonus;
        NF.ui.toast("Daily reward: +" + b + "⬡", "good", "🎁");
        NF.ui.syncHud(); go("home");
      }
    },

    // ---------------- PLAY / mode browser ----------------
    play(mount) {
      mount.append(el("div", { class: "page-head" }, [
        el("div", {}, [el("h2", { text: "Training Modes" }), el("p", { text: "Pick a discipline. The AI sets difficulty from your history." })]),
        el("button", { class: "btn primary", onclick: () => NF.app.startInfinite() }, "♾ AI Infinite Mode"),
      ]));

      const grouped = NF.modes.grouped();
      NF.modes.list.forEach((mode) => {
        const games = grouped[mode.name] || [];
        if (!games.length) return;
        mount.append(
          el("div", { class: "section-title", html: `${mode.icon} ${mode.name} <span style="text-transform:none;color:var(--txt-dim);font-weight:400"> — ${mode.blurb}</span>` }),
          el("div", { class: "grid cols-auto" }, games.map((g) => gameCard(g))),
        );
      });
    },

    // ---------------- STATS / analytics ----------------
    stats(mount) {
      const s = NF.store.get();
      const A = NF.analytics;
      mount.append(el("div", { class: "page-head" }, [
        el("div", {}, [el("h2", { text: "Analytics Lab" }), el("p", { text: `${s.history.length} sessions analysed` })]),
      ]));

      const str = A.strengths();
      mount.append(el("div", { class: "tiles" }, [
        tile("Recent Accuracy", Math.round(A.recentAccuracy(20) * 100) + "%", "last 20 sessions"),
        tile("Strong Area", str.strong[0] ? cap(str.strong[0]) : "—", "highest accuracy"),
        tile("Weak Area", str.weak[0] ? cap(str.weak[0]) : "—", "needs training"),
        tile("Total Sessions", s.history.length, "all-time"),
      ]));

      // radar
      const radar = el("canvas", { class: "chart" });
      const acc = A.skillAccuracy();
      const radarBox = el("div", { class: "tile", style: { display: "grid", placeItems: "center" } }, [
        el("div", { class: "k", text: "Skill Radar" }), radar,
      ]);

      // line charts
      const accCanvas = el("canvas", { class: "chart" });
      const rtCanvas = el("canvas", { class: "chart" });
      const barCanvas = el("canvas", { class: "chart" });

      mount.append(el("div", { class: "grid mt2", style: { gridTemplateColumns: "minmax(280px,1fr) minmax(280px,1.4fr)" } }, [
        radarBox,
        el("div", { class: "tile" }, [el("div", { class: "k", text: "Accuracy trend (%)" }), accCanvas]),
      ]));
      mount.append(el("div", { class: "grid mt2", style: { gridTemplateColumns: "1fr 1fr" } }, [
        el("div", { class: "tile" }, [el("div", { class: "k", text: "Reaction time (ms, lower is better)" }), rtCanvas]),
        el("div", { class: "tile" }, [el("div", { class: "k", text: "Daily activity (14 days)" }), barCanvas]),
      ]));

      // render after layout so canvas has width
      requestAnimationFrame(() => {
        A.radar(radar, A.SKILLS.map((k) => acc[k]), A.SKILLS.map((k) => cap(k).slice(0, 4)));
        A.line(accCanvas, A.accuracySeries(30), { max: 100, color: NF.analytics.css("--c4") });
        const rt = A.reactionSeries(30);
        A.line(rtCanvas, rt, { color: NF.analytics.css("--c3") });
        A.bars(barCanvas, A.dailyCounts(14));
      });
    },

    // ---------------- SKILLS / skill tree ----------------
    skills(mount, go) {
      const s = NF.store.get();
      mount.append(el("div", { class: "page-head" }, [
        el("div", {}, [el("h2", { text: "Skill Tree" }), el("p", { text: "Spend coins to permanently boost a discipline. Skills also grow as you play." })]),
        el("div", { class: "hud-pill" }, ["Coins ", el("b", { text: U.abbr(s.coins) })]),
      ]));

      const meta = {
        memory: ["🧠", "Memory"], focus: ["🎯", "Focus"], speed: ["⚡", "Speed"], logic: ["🧩", "Logic"],
        observation: ["🔍", "Observation"], math: ["➗", "Mathematics"], creativity: ["🌌", "Creativity"], strategy: ["🌀", "Strategy"],
      };
      const wrap = el("div", { class: "tile" });
      Object.keys(meta).forEach((k) => {
        const lvl = Math.floor(s.skills[k]);
        const cost = 50 + lvl * 40;
        const frac = s.skills[k] - lvl;
        wrap.append(el("div", { class: "skill-row" }, [
          el("div", { class: "name", text: meta[k][0] + " " + meta[k][1] }),
          el("div", { class: "bar" }, [el("i", { style: { width: frac * 100 + "%" } })]),
          el("div", { class: "lvl", text: "L" + lvl }),
          el("button", { class: "btn", disabled: s.coins < cost,
            onclick: () => Screens._upgrade(k, cost, go) }, "Upgrade " + cost + "⬡"),
        ]));
      });
      mount.append(wrap);
    },

    _upgrade(skill, cost, go) {
      const s = NF.store.get();
      if (s.coins < cost) return;
      NF.store.update((st) => { st.coins -= cost; st.skills[skill] = Math.floor(st.skills[skill]) + 1; });
      NF.audio.play("coin"); NF.ui.toast(cap(skill) + " upgraded!", "good", "✦"); NF.ui.syncHud(); go("skills");
    },

    // ---------------- REWARDS / achievements ----------------
    rewards(mount) {
      const s = NF.store.get();
      mount.append(el("div", { class: "page-head" }, [
        el("div", {}, [el("h2", { text: "Achievements & Badges" }),
          el("p", { text: Object.keys(s.achievements).length + " / " + NF.prog.achievementsList.length + " unlocked" })]),
      ]));

      mount.append(el("div", { class: "badge-grid" }, NF.prog.achievementsList.map((a) => {
        const unlocked = !!s.achievements[a.id];
        return el("div", { class: "badge " + (unlocked ? "" : "locked"), title: unlocked ? "Unlocked " + s.achievements[a.id] : "Locked" }, [
          el("div", { class: "b-ico", text: a.icon }),
          el("div", { class: "b-name", text: a.name }),
        ]);
      })));

      mount.append(el("div", { class: "section-title", text: "Unlockable Themes (by level)" }));
      const themes = [["Neon", 1, "neon"], ["Midnight", 3, "midnight"], ["Light", 1, "light"]];
      mount.append(el("div", { class: "grid cols-auto" }, themes.map(([name, lvl, id]) => {
        const ok = s.level >= lvl;
        return el("div", { class: "card", onclick: () => { if (ok) { NF.store.update((st) => (st.settings.theme = id)); NF.ui.applySettings(); NF.ui.toast(name + " theme applied", "good", "🎨"); } } }, [
          el("div", { class: "ico", text: "🎨" }), el("h3", { text: name }),
          el("div", { class: "desc", text: ok ? "Tap to apply" : "Unlocks at level " + lvl }),
        ]);
      })));
    },
  };

  // ---- small view helpers ----
  function tile(k, v, sub) {
    return el("div", { class: "tile" }, [
      el("div", { class: "k", text: k }), el("div", { class: "v", text: String(v) }),
      sub ? el("div", { class: "sub", text: sub }) : null,
    ]);
  }
  function gameCard(g) {
    const rec = NF.store.game(g.id);
    return el("div", { class: "card", style: { "--accent": g.accent || "var(--c1)" }, onclick: () => NF.app.launch(g.id) }, [
      rec.best ? el("div", { class: "best", text: "Best " + U.abbr(rec.best) }) : null,
      el("div", { class: "ico", text: g.icon }),
      el("h3", { text: g.name }),
      el("div", { class: "desc", text: g.desc }),
      el("div", { class: "meta" }, [
        el("span", { class: "tag", text: NF.adaptive.label(NF.adaptive.difficulty(g.id)) }),
        ...(g.tags || []).map((t) => el("span", { class: "tag", text: t })),
      ]),
    ]);
  }
  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

  NF.screens = Screens;
})();
