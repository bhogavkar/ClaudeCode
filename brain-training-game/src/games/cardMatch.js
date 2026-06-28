/* Card Matching — flip cards to find pairs against the clock.
   Trains: focus / concentration. Difficulty scales grid size + time. */
(function () {
  "use strict";
  const NF = window.NF, el = NF.util.el;
  const ICONS = ["🧠", "⚡", "🔮", "🎯", "🚀", "💎", "🌀", "🔥", "🛰", "🧩", "⭐", "🎲", "🪐", "🔋", "📡", "🧪", "🦾", "🌐"];

  class CardMatch extends NF.GameBase {
    mount(stage) {
      const pairs = NF.util.clamp(4 + Math.floor(this.difficulty), 4, 18);
      const cols = pairs <= 6 ? 4 : pairs <= 10 ? 5 : 6;
      const time = NF.util.clamp(70 - this.difficulty * 2 + pairs * 3, 40, 140);
      this.totalPairs = pairs; this.matched = 0; this.flips = 0; this.mistakes = 0;
      this.first = null; this.lock = false;

      const icons = NF.util.shuffle(ICONS).slice(0, pairs);
      const deck = NF.util.shuffle(icons.concat(icons));
      this.grid = el("div", { class: "pad-grid", style: {
        gridTemplateColumns: `repeat(${cols}, minmax(48px, 74px))`,
      } });
      this.cards = deck.map((icon, i) => {
        const c = el("div", { class: "pad", "data-icon": icon, text: "", onclick: () => this.flip(c) });
        c._icon = icon; c._matched = false; c._up = false;
        this.grid.appendChild(c); return c;
      });
      stage.appendChild(el("div", { class: "center" }, [
        this.grid,
        el("div", { class: "muted mt", text: `Find all ${pairs} pairs before time runs out.` }),
      ]));
      this.host.startTimer(time, () => this.end(false));
    }

    flip(card) {
      if (this.lock || card._up || card._matched) return;
      card.textContent = card._icon; card.classList.add("flip"); card._up = true;
      NF.audio.play("flip"); this.flips++;
      if (!this.first) { this.first = card; return; }
      this.lock = true;
      if (this.first._icon === card._icon) { // match
        this.first._matched = card._matched = true;
        this.first.classList.add("matched"); card.classList.add("matched");
        this.first = null; this.lock = false; this.matched++;
        this.host.hit(true); this.host.addScore(Math.round(30 * this.host.comboMult()));
        if (this.matched === this.totalPairs) this.end(true);
      } else { // no match
        this.mistakes++; this.host.hit(false);
        const a = this.first, b = card; this.first = null;
        setTimeout(() => {
          [a, b].forEach((x) => { x.textContent = ""; x.classList.remove("flip"); x._up = false; });
          this.lock = false;
        }, 620);
      }
    }

    end(won) {
      this._done = true;
      const accuracy = this.flips ? NF.util.clamp((this.totalPairs * 2) / this.flips, 0, 1) : 0;
      if (won) this.host.addScore(this.host._remain * 4); // time bonus
      this.host.finish({ accuracy, won, mistakes: this.mistakes });
    }
  }

  NF.games.define({
    id: "card-match", name: "Card Matching", icon: "🃏", skill: "focus",
    category: "Memory Master", accent: "var(--c2)",
    desc: "Flip cards two at a time and clear every matching pair before the timer ends.",
    tags: ["Concentration", "Visual memory"],
    create: (host) => new CardMatch(host),
  });
})();
