/* Reaction Time — wait for green, then tap as fast as possible.
   Trains: processing speed / reflexes. Records true reaction in ms. */
(function () {
  "use strict";
  const NF = window.NF, el = NF.util.el;

  class ReactionTime extends NF.GameBase {
    mount(stage) {
      this.rounds = 5; this.done = 0; this.times = []; this.misfires = 0;
      this.state = "idle";
      this.target = el("div", { class: "react-target react-wait", onclick: () => this.tap() }, "Tap to start");
      stage.appendChild(this.target);
      this.host.timerEl.textContent = "0/" + this.rounds;
    }

    tap() {
      if (this._done) return;
      if (this.state === "idle" || this.state === "result") return this.arm();
      if (this.state === "waiting") { // tapped too early
        this.misfires++; this.host.hit(false);
        clearTimeout(this._t); this.state = "result";
        this.target.className = "react-target react-early";
        this.target.textContent = "Too early! Tap to retry";
        return;
      }
      if (this.state === "go") {
        const rt = performance.now() - this._goTs;
        this.times.push(rt); this.done++;
        this.host.hit(true);
        const pts = Math.max(5, Math.round((500 - rt) * 0.6 * this.host.comboMult()));
        this.host.addScore(pts);
        this.host.timerEl.textContent = this.done + "/" + this.rounds;
        this.state = "result";
        this.target.className = "react-target react-wait";
        this.target.textContent = Math.round(rt) + " ms — tap to continue";
        if (this.done >= this.rounds) return this.end();
      }
    }

    arm() {
      this.state = "waiting";
      this.target.className = "react-target react-wait";
      this.target.textContent = "Wait for green…";
      const delay = NF.util.randInt(900, 2600);
      this._t = setTimeout(() => {
        this.state = "go"; this._goTs = performance.now();
        this.target.className = "react-target react-go";
        this.target.textContent = "TAP!"; NF.audio.play("go");
      }, delay);
    }

    onKey(e) { if (e.code === "Space") { e.preventDefault(); this.tap(); } }

    end() {
      this._done = true;
      const avg = this.times.reduce((a, b) => a + b, 0) / this.times.length;
      // accuracy: faster than 450ms target ≈ perfect; penalise misfires
      const accuracy = NF.util.clamp(1 - (avg - 200) / 500, 0, 1) * (1 - this.misfires * 0.12);
      this.host.finish({ accuracy: NF.util.clamp(accuracy, 0, 1), reaction: avg, target: 400, won: true, mistakes: this.misfires });
    }

    destroy() { clearTimeout(this._t); }
  }

  NF.games.define({
    id: "reaction", name: "Reaction Time", icon: "⚡", skill: "speed",
    category: "Speed Challenge", accent: "var(--c4)",
    desc: "Wait for the panel to turn green, then strike instantly. Five lightning rounds.",
    tags: ["Reflexes", "Processing speed"],
    create: (host) => new ReactionTime(host),
  });
})();
