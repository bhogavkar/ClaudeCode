/* Schulte Table — find numbers 1..N in order as fast as possible.
   Trains: focus, attention span, peripheral vision. Scales grid size. */
(function () {
  "use strict";
  const NF = window.NF, el = NF.util.el;

  class Schulte extends NF.GameBase {
    mount(stage) {
      this.size = NF.util.clamp(3 + Math.floor(this.difficulty / 2), 3, 7);
      this.n = this.size * this.size;
      this.next = 1; this.mistakes = 0;
      const order = NF.util.shuffle(Array.from({ length: this.n }, (_, i) => i + 1));
      this.grid = el("div", { class: "pad-grid", style: {
        gridTemplateColumns: `repeat(${this.size}, minmax(40px, 64px))`,
      } });
      this.cells = order.map((v) => {
        const c = el("div", { class: "pad", "data-v": v, text: v, style: { fontSize: "1.1rem" }, onclick: () => this.tap(v, c) });
        this.grid.appendChild(c); return c;
      });
      this.status = el("div", { class: "center", style: { fontSize: "1.4rem", fontWeight: 700, margin: "8px" }, text: "Find: 1" });
      stage.appendChild(el("div", { class: "center" }, [
        this.status, this.grid,
        el("div", { class: "muted mt", text: `Tap 1 → ${this.n} in order, as fast as you can.` }),
      ]));
      this._start = performance.now();
      this._tick = setInterval(() => this.host.countUp(), 100);
    }

    tap(v, c) {
      if (this._done) return;
      if (v === this.next) {
        c.classList.add("matched", "good"); NF.audio.play("pad", v % 7);
        this.host.hit(true); this.host.addScore(Math.round(10 * this.host.comboMult()));
        this.next++;
        this.status.textContent = this.next > this.n ? "Done!" : "Find: " + this.next;
        if (this.next > this.n) this.end();
      } else {
        this.mistakes++; this.host.hit(false);
        c.classList.add("bad"); setTimeout(() => c.classList.remove("bad"), 300);
      }
    }

    end() {
      this._done = true; clearInterval(this._tick);
      const elapsed = performance.now() - this._start;
      const perCell = elapsed / this.n;
      // ideal ~700ms/cell; accuracy blends speed with mistake penalty
      const speedAcc = NF.util.clamp(1 - (perCell - 500) / 2500, 0, 1);
      const accuracy = NF.util.clamp(speedAcc * (1 - this.mistakes * 0.05), 0, 1);
      const timeBonus = Math.max(0, Math.round((this.n * 1500 - elapsed) / 50));
      this.host.addScore(timeBonus);
      this.host.finish({ accuracy, reaction: perCell, target: 700, won: true, mistakes: this.mistakes });
    }

    destroy() { clearInterval(this._tick); }
  }

  NF.games.define({
    id: "schulte", name: "Schulte Focus", icon: "🎯", skill: "focus",
    category: "Speed Challenge", accent: "var(--c4)",
    desc: "Fix your gaze on the centre and find every number in sequence. Trains attention span.",
    tags: ["Attention", "Peripheral vision"],
    create: (host) => new Schulte(host),
  });
})();
