/* Odd One Out — a grid of identical symbols hides one slightly different.
   Trains: observation, visual discrimination. Scales grid + subtlety + clock. */
(function () {
  "use strict";
  const NF = window.NF, el = NF.util.el;
  const GLYPHS = ["◆", "●", "▲", "★", "♥", "✦", "❄", "⬟", "■", "✚"];

  class OddOneOut extends NF.GameBase {
    mount(stage) {
      this.round = 0; this.correct = 0; this.times = []; this.mistakes = 0;
      this.totalR = 10;
      this.host.setLives(3);
      this.grid = el("div", { class: "pad-grid" });
      this.status = el("div", { class: "center muted mt", text: "Tap the tile that is different." });
      stage.appendChild(el("div", { class: "center" }, [this.grid, this.status]));
      this.next();
    }

    next() {
      if (this.round >= this.totalR || this._done) return this.end();
      this.round++; this.host.timerEl.textContent = this.round + "/" + this.totalR;
      const cols = NF.util.clamp(3 + Math.floor(this.difficulty / 2), 3, 8);
      const rows = cols; const n = cols * rows;
      const glyph = NF.util.pick(GLYPHS);
      // base colour + a subtly different colour for the odd one
      const baseHue = NF.util.randInt(0, 360);
      const diff = NF.util.clamp(26 - this.difficulty * 2, 6, 26); // smaller = harder
      const baseColor = `hsl(${baseHue},80%,62%)`;
      const oddColor = `hsl(${baseHue},80%,${62 - diff}%)`;
      const oddIndex = NF.util.randInt(0, n - 1);

      this.grid.style.gridTemplateColumns = `repeat(${cols}, minmax(26px, 52px))`;
      this.grid.innerHTML = "";
      this._qStart = performance.now(); this._lock = false;
      for (let i = 0; i < n; i++) {
        const c = el("div", { class: "pad", text: glyph,
          style: { color: i === oddIndex ? oddColor : baseColor, fontSize: "1.4rem" },
          onclick: () => this.tap(i === oddIndex, c) });
        this.grid.appendChild(c);
      }
    }

    tap(isOdd, c) {
      if (this._lock || this._done) return; this._lock = true;
      this.times.push(performance.now() - this._qStart);
      if (isOdd) {
        this.correct++; c.classList.add("good"); this.host.hit(true);
        this.host.addScore(Math.round(25 * this.host.comboMult()));
        setTimeout(() => this.next(), 300);
      } else {
        this.mistakes++; c.classList.add("bad"); this.host.hit(false);
        if (this.host.loseLife()) { setTimeout(() => this.end(), 500); return; }
        setTimeout(() => { c.classList.remove("bad"); this._lock = false; }, 350);
      }
    }

    end() {
      this._done = true;
      const avg = this.times.length ? this.times.reduce((a, b) => a + b, 0) / this.times.length : null;
      this.host.finish({ accuracy: this.correct / this.totalR, reaction: avg, target: 2500, won: this.host.lives > 0, mistakes: this.mistakes });
    }
  }

  NF.games.define({
    id: "odd-one", name: "Odd One Out", icon: "🔍", skill: "observation",
    category: "Observation Zone", accent: "var(--c3)",
    desc: "One tile's shade is slightly off. Find it fast — the difference shrinks as you improve.",
    tags: ["Visual search", "Discrimination"],
    create: (host) => new OddOneOut(host),
  });
})();
