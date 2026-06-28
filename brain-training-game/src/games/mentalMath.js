/* Mental Arithmetic — rapid-fire questions across +,−,×,÷, %, sequences.
   Trains: mathematics / processing speed. Difficulty grows operand range
   and unlocks harder operation types. Records reaction per question. */
(function () {
  "use strict";
  const NF = window.NF, el = NF.util.el;

  class MentalMath extends NF.GameBase {
    mount(stage) {
      this.totalQ = 10; this.idx = 0; this.correct = 0; this.times = [];
      this.host.setLives(3);
      this.promptEl = el("div", { class: "prompt-big", text: "" });
      this.choicesEl = el("div", { class: "answer-row" });
      stage.appendChild(el("div", { class: "center", style: { width: "100%" } }, [
        this.promptEl, this.choicesEl,
        el("div", { class: "muted mt", text: "Pick the correct answer — speed counts!" }),
      ]));
      this.next();
    }

    genQuestion() {
      const d = this.difficulty;
      const ops = ["+", "-", "×"];
      if (d >= 3) ops.push("÷");
      if (d >= 5) ops.push("%");
      if (d >= 6) ops.push("seq");
      const op = NF.util.pick(ops);
      const R = (lo, hi) => NF.util.randInt(lo, hi);
      let text, ans;
      const scale = Math.round(d);
      switch (op) {
        case "+": { const a = R(2, 10 + scale * 6), b = R(2, 10 + scale * 6); text = `${a} + ${b}`; ans = a + b; break; }
        case "-": { let a = R(5, 15 + scale * 6), b = R(1, a); text = `${a} − ${b}`; ans = a - b; break; }
        case "×": { const a = R(2, 4 + scale), b = R(2, 6 + scale); text = `${a} × ${b}`; ans = a * b; break; }
        case "÷": { const b = R(2, 4 + scale), q = R(2, 6 + scale); text = `${b * q} ÷ ${b}`; ans = q; break; }
        case "%": { const base = R(2, 10) * 10, p = NF.util.pick([10, 20, 25, 50]); text = `${p}% of ${base}`; ans = (base * p) / 100; break; }
        case "seq": { const start = R(1, 9), step = R(2, 5 + scale); const s = [start, start + step, start + 2 * step, start + 3 * step]; text = `${s[0]}, ${s[1]}, ${s[2]}, ?`; ans = s[3]; break; }
      }
      // build distractors
      const set = new Set([ans]);
      while (set.size < 4) {
        const delta = NF.util.randInt(1, Math.max(3, Math.round(Math.abs(ans) * 0.25) + scale));
        const cand = ans + (Math.random() < 0.5 ? -delta : delta);
        if (cand >= 0 || ans < 0) set.add(cand);
      }
      return { text, ans, choices: NF.util.shuffle([...set]) };
    }

    next() {
      if (this.idx >= this.totalQ || this._done) return this.end();
      this.idx++;
      this.q = this.genQuestion();
      this._qStart = performance.now();
      this.host.timerEl.textContent = this.idx + "/" + this.totalQ;
      this.promptEl.textContent = this.q.text + " =";
      this.choicesEl.innerHTML = "";
      this.q.choices.forEach((c) => {
        this.choicesEl.appendChild(el("button", { class: "choice", "data-v": c, onclick: (e) => this.answer(c, e.currentTarget) }, String(c)));
      });
    }

    answer(val, btn) {
      if (this._lock || this._done) return; this._lock = true;
      const rt = performance.now() - this._qStart; this.times.push(rt);
      if (val === this.q.ans) {
        this.correct++; btn.classList.add("good"); this.host.hit(true);
        const pts = Math.max(8, Math.round((1600 - Math.min(rt, 1600)) / 20 * this.host.comboMult())) + 10;
        this.host.addScore(pts);
      } else {
        btn.classList.add("bad"); this.host.hit(false);
        // highlight correct
        [...this.choicesEl.children].forEach((b) => { if (+b.dataset.v === this.q.ans) b.classList.add("good"); });
        if (this.host.loseLife()) { setTimeout(() => this.end(), 700); return; }
      }
      setTimeout(() => { this._lock = false; this.next(); }, 560);
    }

    onKey(e) {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 4 && this.choicesEl.children[n - 1]) this.choicesEl.children[n - 1].click();
    }

    end() {
      this._done = true;
      const accuracy = this.correct / this.totalQ;
      const avg = this.times.length ? this.times.reduce((a, b) => a + b, 0) / this.times.length : null;
      this.host.finish({ accuracy, reaction: avg, target: 1800, won: this.host.lives > 0, mistakes: this.idx - this.correct });
    }
  }

  NF.games.define({
    id: "mental-math", name: "Mental Arithmetic", icon: "➗", skill: "math",
    category: "Math Arena", accent: "var(--c1)",
    desc: "Ten quick problems — addition, subtraction, products, division, percentages and sequences.",
    tags: ["Calculation", "Speed"],
    create: (host) => new MentalMath(host),
  });
})();
