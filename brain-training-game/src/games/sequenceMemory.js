/* Sequence Memory — Simon-style. Watch a growing sequence, repeat it.
   Trains: working memory. Difficulty scales sequence length + flash speed. */
(function () {
  "use strict";
  const NF = window.NF, el = NF.util.el;

  class SequenceMemory extends NF.GameBase {
    mount(stage) {
      this.pads = 4 + (this.difficulty >= 6 ? 2 : 0); // 4 or 6 pads
      this.flash = NF.util.clamp(620 - this.difficulty * 45, 220, 620);
      this.seq = [];
      this.targetLen = 0;
      this.round = 0;
      this.maxRound = 0;
      this.host.setLives(3);

      this.grid = el("div", { class: "pad-grid", style: {
        gridTemplateColumns: `repeat(${this.pads === 6 ? 3 : 2}, 92px)`,
      } });
      this.padEls = [];
      for (let i = 0; i < this.pads; i++) {
        const p = el("div", { class: "pad", role: "button", tabindex: "0",
          "data-i": i, onclick: () => this.press(i) });
        this.padEls.push(p); this.grid.appendChild(p);
      }
      this.status = el("div", { class: "center muted mt", text: "Watch the sequence…" });
      stage.appendChild(el("div", { class: "center" }, [this.grid, this.status]));
      this.nextRound();
    }

    async nextRound() {
      this.round++; this.targetLen = 2 + this.round; this.input = []; this.accept = false;
      this.seq.push(NF.util.randInt(0, this.pads - 1));
      this.status.textContent = "Round " + this.round + " — watch!";
      await NF.util.wait(500);
      for (const idx of this.seq) {
        await this.lightUp(idx);
        await NF.util.wait(this.flash * 0.35);
      }
      this.accept = true;
      this.status.textContent = "Your turn — repeat it";
    }

    async lightUp(idx) {
      const p = this.padEls[idx];
      p.classList.add("lit"); NF.audio.play("pad", idx);
      await NF.util.wait(this.flash);
      p.classList.remove("lit");
    }

    press(idx) {
      if (!this.accept || this._done) return;
      NF.audio.play("pad", idx);
      const p = this.padEls[idx];
      p.classList.add("lit"); setTimeout(() => p.classList.remove("lit"), 160);
      this.input.push(idx);
      const pos = this.input.length - 1;
      if (this.seq[pos] !== idx) { // wrong
        this.host.hit(false);
        if (this.host.loseLife()) return this.end(false);
        this.status.textContent = "Wrong! Lives left: " + this.host.lives + " — watch again";
        this.accept = false; this.input = []; setTimeout(() => this.replay(), 700);
        return;
      }
      if (this.input.length === this.seq.length) { // round cleared
        this.host.hit(true);
        this.host.addScore(Math.round(20 * this.seq.length * this.host.comboMult()));
        this.maxRound = this.seq.length;
        this.accept = false;
        if (this.seq.length >= 4 + Math.round(this.difficulty)) return this.end(true); // mastered
        this.status.textContent = "Correct! +" + this.seq.length;
        setTimeout(() => this.nextRound(), 650);
      }
    }

    async replay() {
      for (const idx of this.seq) { await this.lightUp(idx); await NF.util.wait(this.flash * 0.35); }
      this.accept = true; this.input = [];
    }

    onKey(e) {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= this.pads) this.press(n - 1);
    }

    end(won) {
      this._done = true;
      const accuracy = NF.util.clamp((this.maxRound) / (4 + Math.round(this.difficulty)), 0, 1);
      this.host.finish({ accuracy, won, mistakes: this.host.maxLives - this.host.lives });
    }
  }

  NF.games.define({
    id: "seq-memory", name: "Sequence Memory", icon: "🔊", skill: "memory",
    category: "Memory Master", accent: "var(--c1)",
    desc: "Watch the glowing pattern, then repeat it. Each round adds a step.",
    tags: ["Working memory", "Attention"],
    create: (host) => new SequenceMemory(host),
  });
})();
