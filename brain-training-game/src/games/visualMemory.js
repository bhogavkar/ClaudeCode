/* Visual Memory — a grid briefly flashes lit tiles; reproduce them.
   Trains: visual / creative spatial encoding. Scales grid + tile count. */
(function () {
  "use strict";
  const NF = window.NF, el = NF.util.el;

  class VisualMemory extends NF.GameBase {
    mount(stage) {
      this.size = NF.util.clamp(3 + Math.floor(this.difficulty / 2.5), 3, 6);
      this.round = 0; this.maxRound = 0; this.host.setLives(3);
      this.box = el("div", { class: "center" });
      this.status = el("div", { class: "center muted mt", text: "Memorise the lit tiles…" });
      stage.appendChild(el("div", {}, [this.box, this.status]));
      this.nextRound();
    }

    nextRound() {
      this.round++;
      const total = this.size * this.size;
      const count = NF.util.clamp(2 + this.round, 3, total - 1);
      this.target = new Set();
      while (this.target.size < count) this.target.add(NF.util.randInt(0, total - 1));
      this.selected = new Set(); this.accept = false;

      this.box.innerHTML = "";
      this.grid = el("div", { class: "pad-grid", style: {
        gridTemplateColumns: `repeat(${this.size}, minmax(40px, 64px))`,
      } });
      this.cells = [];
      for (let i = 0; i < total; i++) {
        const c = el("div", { class: "pad", "data-i": i, onclick: () => this.tap(i) });
        this.cells.push(c); this.grid.appendChild(c);
      }
      this.box.appendChild(this.grid);
      this.status.textContent = "Round " + this.round + " — memorise " + count + " tiles";

      // flash
      this.target.forEach((i) => this.cells[i].classList.add("lit"));
      NF.audio.play("pad", 2);
      const show = NF.util.clamp(1400 - this.difficulty * 70, 600, 1400);
      setTimeout(() => {
        this.target.forEach((i) => this.cells[i].classList.remove("lit"));
        this.accept = true;
        this.status.textContent = "Tap the tiles you saw";
      }, show);
    }

    tap(i) {
      if (!this.accept || this.selected.has(i) || this._done) return;
      const c = this.cells[i];
      if (this.target.has(i)) {
        this.selected.add(i); c.classList.add("lit", "good");
        NF.audio.play("pad", i % 7); this.host.hit(true);
        this.host.addScore(Math.round(12 * this.host.comboMult()));
        if (this.selected.size === this.target.size) { // round clear
          this.maxRound = this.round; this.accept = false;
          this.status.textContent = "Perfect!";
          if (this.round >= 3 + Math.round(this.difficulty / 1.5)) return this.end(true);
          setTimeout(() => this.nextRound(), 650);
        }
      } else {
        c.classList.add("bad"); this.host.hit(false);
        this.accept = false;
        // reveal correct answers briefly
        this.target.forEach((t) => this.cells[t].classList.add("lit"));
        if (this.host.loseLife()) return setTimeout(() => this.end(false), 600);
        this.status.textContent = "Missed one! Lives: " + this.host.lives;
        setTimeout(() => this.nextRound(), 900);
      }
    }

    end(won) {
      this._done = true;
      const accuracy = NF.util.clamp(this.maxRound / (3 + Math.round(this.difficulty / 1.5)), 0, 1);
      this.host.finish({ accuracy, won, mistakes: this.host.maxLives - this.host.lives });
    }
  }

  NF.games.define({
    id: "visual-memory", name: "Visual Memory", icon: "🌌", skill: "creativity",
    category: "Memory Master", accent: "var(--c3)",
    desc: "A constellation of tiles flashes for a moment. Reproduce the pattern from memory.",
    tags: ["Spatial memory", "Encoding"],
    create: (host) => new VisualMemory(host),
  });
})();
