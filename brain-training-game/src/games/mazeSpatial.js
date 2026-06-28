/* Maze Navigator — plan a route through a procedurally generated maze.
   Trains: spatial reasoning, planning, strategy. Scales maze size.
   Maze built with a recursive-backtracker (guarantees a solvable path). */
(function () {
  "use strict";
  const NF = window.NF, el = NF.util.el;

  class MazeSpatial extends NF.GameBase {
    mount(stage) {
      this.cells = NF.util.clamp(4 + Math.floor(this.difficulty), 5, 14); // logical cells per side
      this.dim = this.cells * 2 + 1; // grid incl. walls
      this.moves = 0;
      this.build();
      this.px = 1; this.py = 1;
      this.gx = this.dim - 2; this.gy = this.dim - 2;
      this.optimal = this.bfs(this.px, this.py, this.gx, this.gy);

      this.gridEl = el("div", { class: "maze-grid", style: {
        gridTemplateColumns: `repeat(${this.dim}, 1fr)`,
        maxWidth: Math.min(this.dim * 28, 560) + "px",
      } });
      this.cellEls = [];
      for (let y = 0; y < this.dim; y++) for (let x = 0; x < this.dim; x++) {
        const c = el("div", { class: "maze-cell" });
        this.cellEls.push(c); this.gridEl.appendChild(c);
      }
      const pad = (label, dx, dy) => el("button", { class: "btn", onclick: () => this.move(dx, dy) }, label);
      const dpad = el("div", { style: { display: "grid", gridTemplateColumns: "repeat(3,52px)", gap: "6px", justifyContent: "center", marginTop: "14px" } }, [
        el("span"), pad("↑", 0, -1), el("span"),
        pad("←", -1, 0), el("span"), pad("→", 1, 0),
        el("span"), pad("↓", 0, 1), el("span"),
      ]);
      stage.appendChild(el("div", { class: "center" }, [
        this.gridEl, dpad,
        el("div", { class: "muted mt", text: "Reach the green exit. Use arrow keys, WASD or the pad." }),
      ]));
      this._start = performance.now();
      this._tick = setInterval(() => this.host.countUp(), 100);
      this.render();
    }

    idx(x, y) { return y * this.dim + x; }

    build() {
      // start fully walled
      this.wall = new Array(this.dim * this.dim).fill(true);
      const carve = (cx, cy) => {
        this.wall[this.idx(cx, cy)] = false;
        const dirs = NF.util.shuffle([[0, -2], [0, 2], [-2, 0], [2, 0]]);
        for (const [dx, dy] of dirs) {
          const nx = cx + dx, ny = cy + dy;
          if (nx > 0 && ny > 0 && nx < this.dim - 1 && ny < this.dim - 1 && this.wall[this.idx(nx, ny)]) {
            this.wall[this.idx(cx + dx / 2, cy + dy / 2)] = false;
            carve(nx, ny);
          }
        }
      };
      carve(1, 1);
    }

    bfs(sx, sy, gx, gy) {
      const q = [[sx, sy, 0]]; const seen = new Set([sx + "," + sy]);
      while (q.length) {
        const [x, y, d] = q.shift();
        if (x === gx && y === gy) return d;
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const nx = x + dx, ny = y + dy, k = nx + "," + ny;
          if (nx >= 0 && ny >= 0 && nx < this.dim && ny < this.dim && !this.wall[this.idx(nx, ny)] && !seen.has(k)) {
            seen.add(k); q.push([nx, ny, d + 1]);
          }
        }
      }
      return 999;
    }

    onKey(e) {
      const map = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
        w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0] };
      if (map[e.key]) { e.preventDefault(); this.move(map[e.key][0], map[e.key][1]); }
    }

    move(dx, dy) {
      if (this._done) return;
      const nx = this.px + dx, ny = this.py + dy;
      if (nx < 0 || ny < 0 || nx >= this.dim || ny >= this.dim || this.wall[this.idx(nx, ny)]) { NF.audio.play("wrong"); return; }
      this.px = nx; this.py = ny; this.moves++; NF.audio.play("flip");
      this.render();
      if (this.px === this.gx && this.py === this.gy) this.end();
    }

    render() {
      for (let y = 0; y < this.dim; y++) for (let x = 0; x < this.dim; x++) {
        const c = this.cellEls[this.idx(x, y)];
        c.className = "maze-cell " + (this.wall[this.idx(x, y)] ? "wall" : "path");
        if (x === this.gx && y === this.gy) c.className = "maze-cell goal";
        if (x === this.px && y === this.py) c.className = "maze-cell player";
      }
    }

    end() {
      this._done = true; clearInterval(this._tick);
      NF.audio.play("victory");
      // efficiency: optimal moves / actual moves
      const efficiency = NF.util.clamp(this.optimal / Math.max(this.moves, 1), 0, 1);
      const elapsed = performance.now() - this._start;
      const timeBonus = Math.max(0, Math.round((this.cells * 4000 - elapsed) / 60));
      this.host.addScore(Math.round(efficiency * 200) + timeBonus);
      this.host.finish({ accuracy: efficiency, won: true, mistakes: Math.max(0, this.moves - this.optimal) });
    }

    destroy() { clearInterval(this._tick); }
  }

  NF.games.define({
    id: "maze", name: "Maze Navigator", icon: "🌀", skill: "strategy",
    category: "Spatial & Strategy", accent: "var(--c2)",
    desc: "Plan and execute the shortest route through a procedurally generated labyrinth.",
    tags: ["Spatial", "Planning"],
    create: (host) => new MazeSpatial(host),
  });
})();
