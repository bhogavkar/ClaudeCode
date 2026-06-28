/* Pattern Completion — deduce the rule of a sequence and pick what comes next.
   Trains: logical reasoning. Rules: arithmetic, geometric, fibonacci-like,
   alternating, squares — chosen by difficulty. */
(function () {
  "use strict";
  const NF = window.NF, el = NF.util.el;

  class PatternLogic extends NF.GameBase {
    mount(stage) {
      this.totalQ = 8; this.idx = 0; this.correct = 0; this.times = [];
      this.host.setLives(3);
      this.seqEl = el("div", { class: "prompt-big", text: "" });
      this.hintEl = el("div", { class: "muted", text: "" });
      this.choicesEl = el("div", { class: "answer-row" });
      stage.appendChild(el("div", { class: "center", style: { width: "100%" } }, [
        this.hintEl, this.seqEl, this.choicesEl,
        el("div", { class: "muted mt", text: "What value continues the pattern?" }),
      ]));
      this.next();
    }

    genQuestion() {
      const d = this.difficulty;
      const rules = ["arith", "geom", "alt"];
      if (d >= 3) rules.push("fib");
      if (d >= 5) rules.push("square", "arith2");
      const rule = NF.util.pick(rules);
      const R = (lo, hi) => NF.util.randInt(lo, hi);
      let seq = [], ans, label;
      switch (rule) {
        case "arith": { const a = R(1, 9), s = R(2, 4 + Math.round(d)); seq = [a, a + s, a + 2 * s, a + 3 * s]; ans = a + 4 * s; label = "Linear step"; break; }
        case "arith2": { const a = R(1, 6); let cur = a, step = R(1, 3); seq = [cur]; for (let i = 0; i < 4; i++) { cur += step; step += 1; seq.push(cur); } ans = seq.pop(); label = "Growing step"; break; }
        case "geom": { const a = R(1, 5), r = R(2, d >= 6 ? 4 : 3); seq = [a, a * r, a * r * r, a * r * r * r]; ans = a * Math.pow(r, 4); label = "Multiplying"; break; }
        case "alt": { const a = R(2, 9), b = R(1, 9); seq = [a, b, a + 1, b + 1, a + 2]; ans = b + 2; label = "Two interleaved series"; break; }
        case "fib": { let x = R(1, 4), y = R(1, 5); seq = [x, y]; for (let i = 0; i < 3; i++) { const z = x + y; seq.push(z); x = y; y = z; } ans = seq.pop(); label = "Sum of previous two"; break; }
        case "square": { const a = R(1, 4); seq = [0, 1, 2, 3].map((i) => (a + i) * (a + i)); ans = (a + 4) * (a + 4); label = "Perfect squares"; break; }
      }
      const set = new Set([ans]);
      while (set.size < 4) {
        const delta = NF.util.randInt(1, Math.max(3, Math.round(Math.abs(ans) * 0.2) + 2));
        set.add(ans + (Math.random() < 0.5 ? -delta : delta));
      }
      return { seq, ans, label, choices: NF.util.shuffle([...set]) };
    }

    next() {
      if (this.idx >= this.totalQ || this._done) return this.end();
      this.idx++; this.q = this.genQuestion(); this._qStart = performance.now();
      this.host.timerEl.textContent = this.idx + "/" + this.totalQ;
      this.hintEl.textContent = "Rule type: hidden";
      this.seqEl.textContent = this.q.seq.join("   ·   ") + "   ·   ?";
      this.choicesEl.innerHTML = "";
      this.q.choices.forEach((c) => this.choicesEl.appendChild(
        el("button", { class: "choice", "data-v": c, onclick: (e) => this.answer(c, e.currentTarget) }, String(c))));
      this._lock = false;
    }

    answer(val, btn) {
      if (this._lock || this._done) return; this._lock = true;
      this.times.push(performance.now() - this._qStart);
      this.hintEl.textContent = "Pattern: " + this.q.label;
      if (val === this.q.ans) {
        this.correct++; btn.classList.add("good"); this.host.hit(true);
        this.host.addScore(Math.round(40 * this.host.comboMult()));
      } else {
        btn.classList.add("bad"); this.host.hit(false);
        [...this.choicesEl.children].forEach((b) => { if (+b.dataset.v === this.q.ans) b.classList.add("good"); });
        if (this.host.loseLife()) { setTimeout(() => this.end(), 800); return; }
      }
      setTimeout(() => this.next(), 900);
    }

    onKey(e) { const n = parseInt(e.key, 10); if (n >= 1 && n <= 4 && this.choicesEl.children[n - 1]) this.choicesEl.children[n - 1].click(); }

    end() {
      this._done = true;
      const avg = this.times.length ? this.times.reduce((a, b) => a + b, 0) / this.times.length : null;
      this.host.finish({ accuracy: this.correct / this.totalQ, reaction: avg, target: 4000, won: this.host.lives > 0, mistakes: this.idx - this.correct });
    }
  }

  NF.games.define({
    id: "pattern-logic", name: "Pattern Completion", icon: "🧩", skill: "logic",
    category: "Logic Arena", accent: "var(--c2)",
    desc: "Spot the hidden rule behind each number sequence and choose what comes next.",
    tags: ["Deduction", "Reasoning"],
    create: (host) => new PatternLogic(host),
  });
})();
