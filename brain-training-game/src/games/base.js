/* =========================================================================
   base.js — GameBase contract + GameHost (the chrome around every game).
   GameHost renders score/lives/timer/combo, runs the loop, and on finish
   funnels results into adaptive AI + progression + analytics + results UI.
   ========================================================================= */
(function () {
  "use strict";
  const NF = window.NF;
  const el = NF.util.el;

  /**
   * Every mini-game extends GameBase. Lifecycle:
   *   mount(stage)  — build the UI; called once
   *   destroy()     — clean up timers/listeners; called on exit
   * Games drive scoring through `this.host` helpers and call host.finish().
   */
  class GameBase {
    constructor(host) {
      this.host = host;
      this.difficulty = host.difficulty; // 1..10
      this.stage = host.stage;
    }
    mount() {}
    destroy() {}
    onKey() {}
  }
  NF.GameBase = GameBase;

  /** Maps an accuracy + difficulty into a 0..3 star rating. */
  function starsFor(accuracy, difficulty, won) {
    let stars = 0;
    if (accuracy >= 0.5 || won) stars = 1;
    if (accuracy >= 0.75) stars = 2;
    if (accuracy >= 0.92) stars = 3;
    if (won === false && accuracy < 0.5) stars = 0;
    return stars;
  }

  class GameHost {
    /** def: registry definition. onExit: callback to return to menu. */
    constructor(def, mountEl, onExit) {
      this.def = def;
      this.root = mountEl;
      this.onExit = onExit;
      this.difficulty = NF.adaptive.difficulty(def.id);
      this.score = 0;
      this.comboCount = 0;
      this.maxCombo = 0;
      this._timer = null;
      this._startTs = performance.now();
      this._finished = false;
      this._build();
    }

    _build() {
      this.root.innerHTML = "";
      this.scoreEl = el("b", { text: "0" });
      this.timerEl = el("b", { text: "—" });
      this.comboEl = el("b", { text: "x1" });
      this.livesEl = el("span", { class: "lives" });
      this.infoEl = el("b", { text: NF.adaptive.label(this.difficulty) });

      const bar = el("div", { class: "game-topbar" }, [
        el("button", { class: "btn ghost", onclick: () => this.quit() }, "← Exit"),
        el("h2", { text: this.def.icon + " " + this.def.name }),
        el("div", { class: "hud-pill" }, ["Score ", this.scoreEl]),
        el("div", { class: "hud-pill" }, ["Combo ", this.comboEl]),
        el("div", { class: "hud-pill" }, ["⏱ ", this.timerEl]),
        el("div", { class: "hud-pill" }, ["AI ", this.infoEl]),
        el("div", { class: "hud-pill" }, [this.livesEl]),
      ]);
      this.stage = el("div", { class: "game-stage" });
      this.host = el("div", { class: "gamehost" }, [bar, this.stage]);
      this.root.appendChild(this.host);

      // instantiate the game
      this.game = this.def.create(this);
      this._keyHandler = (e) => { if (!this._finished && this.game.onKey) this.game.onKey(e); };
      window.addEventListener("keydown", this._keyHandler);
      this.game.mount(this.stage);
    }

    // ---------- scoring helpers used by games ----------
    addScore(n) { this.score = Math.max(0, this.score + Math.round(n)); this.scoreEl.textContent = NF.util.abbr(this.score); }
    setInfo(text) { this.infoEl.textContent = text; }

    /** register a hit (good=true) or miss; manages combo + sounds. */
    hit(good) {
      if (good) {
        this.comboCount++; this.maxCombo = Math.max(this.maxCombo, this.comboCount);
        this.comboEl.textContent = "x" + (this.comboCount + 1);
        this.comboEl.classList.toggle("combo-flash", this.comboCount >= 2);
        if (this.comboCount >= 2) NF.audio.play("combo", this.comboCount); else NF.audio.play("correct");
        if (this.comboCount > 0 && this.comboCount % 5 === 0) NF.ui.toast(this.comboCount + 1 + "x combo! 🔥", "good", "⚡");
      } else {
        this.comboCount = 0; this.comboEl.textContent = "x1"; this.comboEl.classList.remove("combo-flash");
        NF.audio.play("wrong");
      }
    }

    /** combo bonus multiplier applied to base points */
    comboMult() { return 1 + Math.min(this.comboCount, 9) * 0.1; }

    // ---------- lives ----------
    setLives(n) {
      this.lives = n; this.maxLives = n;
      this.livesEl.textContent = "♥".repeat(n);
    }
    loseLife() {
      if (this.lives == null) return false;
      this.lives--; this.livesEl.textContent = "♥".repeat(Math.max(0, this.lives));
      return this.lives <= 0;
    }

    // ---------- timer ----------
    startTimer(seconds, onEnd) {
      this._remain = seconds;
      this.timerEl.textContent = seconds + "s";
      this._timer = setInterval(() => {
        this._remain--;
        this.timerEl.textContent = Math.max(0, this._remain) + "s";
        if (this._remain <= 0) { this.stopTimer(); onEnd && onEnd(); }
      }, 1000);
    }
    stopTimer() { clearInterval(this._timer); this._timer = null; }

    countUp() { this.timerEl.textContent = ((performance.now() - this._startTs) / 1000).toFixed(1) + "s"; }

    /**
     * Finish a session. result: { accuracy, reaction, won, mistakes, scoreOverride }
     * Computes stars, awards XP/coins, updates adaptive AI + analytics, shows modal.
     */
    finish(result) {
      if (this._finished) return;
      this._finished = true;
      this.stopTimer();
      const durationMs = performance.now() - this._startTs;
      const accuracy = NF.util.clamp(result.accuracy == null ? 0.5 : result.accuracy, 0, 1);
      const finalScore = result.scoreOverride != null ? result.scoreOverride : this.score;
      const stars = starsFor(accuracy, this.difficulty, result.won);

      // adaptive update
      const diff = NF.adaptive.record(this.def.id, {
        accuracy, reaction: result.reaction || null, won: result.won,
        mistakes: result.mistakes || 0, target: result.target || null,
      });

      const session = {
        gameId: this.def.id, skill: this.def.skill, score: finalScore,
        accuracy, reaction: result.reaction || null, durationMs,
        won: result.won, stars,
      };
      const summary = NF.prog.award(session);
      summary.diff = diff;

      NF.ui.syncHud();
      NF.bus.emit("session-finished", session);

      NF.ui.results(summary,
        () => this.restart(),
        () => this.quit());
    }

    restart() {
      window.removeEventListener("keydown", this._keyHandler);
      if (this.game.destroy) this.game.destroy();
      this.score = 0; this.comboCount = 0; this._finished = false;
      this._startTs = performance.now();
      this.difficulty = NF.adaptive.difficulty(this.def.id);
      this._build();
    }

    quit() {
      window.removeEventListener("keydown", this._keyHandler);
      this.stopTimer();
      if (this.game && this.game.destroy) this.game.destroy();
      this.onExit && this.onExit();
    }
  }

  NF.GameHost = GameHost;
  NF.games = { _list: [], starsFor,
    define(def) { this._list.push(def); return def; },
    all() { return this._list; },
    byId(id) { return this._list.find((g) => g.id === id); },
    byCategory(cat) { return this._list.filter((g) => g.category === cat); },
  };
})();
