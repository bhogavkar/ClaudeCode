/* =====================================================================
   toolbar.js — Drawing tools + quick actions toolbar, top menus.
   ===================================================================== */
(function () {
  "use strict";
  const DD = window.DD;
  const { el, $, $$ } = DD.util;
  const { bus, EV, store } = DD;

  const ICONS = {
    select: '<svg viewBox="0 0 24 24"><path d="M5 3l6 16 2-7 7-2z"/></svg>',
    pan: '<svg viewBox="0 0 24 24"><path d="M9 11V5a1.5 1.5 0 013 0v5m0 0V4a1.5 1.5 0 013 0v6m0 0V6a1.5 1.5 0 013 0v8a6 6 0 01-6 6h-1a6 6 0 01-5-3l-3-5a1.5 1.5 0 012.5-1.6L9 13"/></svg>',
    connector: '<svg viewBox="0 0 24 24"><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M7 17L17 7"/></svg>',
    text: '<svg viewBox="0 0 24 24"><path d="M5 5h14M12 5v14"/></svg>',
    undo: '<svg viewBox="0 0 24 24"><path d="M9 7L4 12l5 5M4 12h11a5 5 0 010 10"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="M15 7l5 5-5 5M20 12H9a5 5 0 000 10"/></svg>',
    delete: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    duplicate: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V4h12"/></svg>',
    front: '<svg viewBox="0 0 24 24"><rect x="8" y="3" width="13" height="13" rx="2"/><path d="M3 8v13h13"/></svg>',
    back: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="13" height="13" rx="2"/><path d="M8 21h13V8"/></svg>',
    group: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><path d="M10 6h4M6 10v4"/></svg>',
    alignL: '<svg viewBox="0 0 24 24"><path d="M4 4v16M8 7h9M8 13h6"/></svg>',
    alignC: '<svg viewBox="0 0 24 24"><path d="M12 4v16M7 8h10M9 14h6"/></svg>',
    alignR: '<svg viewBox="0 0 24 24"><path d="M20 4v16M7 7h9M11 13h6"/></svg>',
    alignT: '<svg viewBox="0 0 24 24"><path d="M4 4h16M7 8v9M13 8v6"/></svg>',
    alignM: '<svg viewBox="0 0 24 24"><path d="M4 12h16M8 7v10M14 9v6"/></svg>',
    alignB: '<svg viewBox="0 0 24 24"><path d="M4 20h16M7 7v9M13 11v5"/></svg>',
    distH: '<svg viewBox="0 0 24 24"><path d="M3 4v16M21 4v16M9 8h6v8H9z"/></svg>',
    distV: '<svg viewBox="0 0 24 24"><path d="M4 3h16M4 21h16M8 9h8v6H8z"/></svg>',
    grid: '<svg viewBox="0 0 24 24"><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>',
    template: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/></svg>',
  };

  class Toolbar {
    constructor() {
      this.root = $("#toolbar");
      this.build();
      this.bind();
    }

    btn(id, icon, title, onClick, isTool) {
      const b = el("button", { class: "tool", title, html: ICONS[icon] || icon, dataset: isTool ? { tool: id } : {} });
      b.addEventListener("click", onClick);
      return b;
    }
    sep() { return el("div", { class: "toolbar__sep" }); }

    build() {
      const r = this.root;
      // Tools
      const tools = el("div", { class: "toolbar__group" });
      ["select", "pan", "connector"].forEach((t) =>
        tools.appendChild(this.btn(t, t, t[0].toUpperCase() + t.slice(1) + " tool", () => this.selectTool(t), true)));
      r.appendChild(tools); r.appendChild(this.sep());

      // History
      const hist = el("div", { class: "toolbar__group" });
      this.undoBtn = this.btn("undo", "undo", "Undo (Ctrl+Z)", () => DD.history.undo());
      this.redoBtn = this.btn("redo", "redo", "Redo (Ctrl+Y)", () => DD.history.redo());
      hist.append(this.undoBtn, this.redoBtn);
      r.appendChild(hist); r.appendChild(this.sep());

      // Object ops
      const ops = el("div", { class: "toolbar__group" });
      ops.append(
        this.btn("dup", "duplicate", "Duplicate (Ctrl+D)", () => DD.app.duplicate()),
        this.btn("del", "delete", "Delete (Del)", () => DD.app.deleteSelection()),
        this.btn("group", "group", "Group (Ctrl+G)", () => DD.app.group()),
      );
      r.appendChild(ops); r.appendChild(this.sep());

      // Z-order
      const z = el("div", { class: "toolbar__group" });
      z.append(
        this.btn("front", "front", "Bring to front", () => DD.app.zorder("bringToFront")),
        this.btn("back", "back", "Send to back", () => DD.app.zorder("sendToBack")),
      );
      r.appendChild(z); r.appendChild(this.sep());

      // Align
      const al = el("div", { class: "toolbar__group" });
      [["alignL", "left"], ["alignC", "centerH"], ["alignR", "right"], ["alignT", "top"], ["alignM", "middle"], ["alignB", "bottom"]]
        .forEach(([ic, mode]) => al.appendChild(this.btn(ic, ic, "Align " + mode, () => DD.app.align(mode))));
      al.appendChild(this.btn("distH", "distH", "Distribute horizontally", () => DD.app.distribute("h")));
      al.appendChild(this.btn("distV", "distV", "Distribute vertically", () => DD.app.distribute("v")));
      r.appendChild(al); r.appendChild(this.sep());

      // View
      const v = el("div", { class: "toolbar__group" });
      this.gridBtn = this.btn("grid", "grid", "Toggle grid", () => DD.app.cycleGrid());
      v.append(
        this.gridBtn,
        this.btn("tpl", "template", "Templates", () => DD.templates.openGallery()),
      );
      r.appendChild(v);
    }

    selectTool(t) {
      DD.canvas.setTool(t);
      $$(".tool[data-tool]", this.root).forEach((b) => b.classList.toggle("is-active", b.dataset.tool === t));
    }

    bind() {
      bus.on(EV.HISTORY, (info) => {
        this.undoBtn.disabled = !info.canUndo;
        this.redoBtn.disabled = !info.canRedo;
      });
      bus.on(EV.TOOL, (t) => $$(".tool[data-tool]", this.root).forEach((b) => b.classList.toggle("is-active", b.dataset.tool === t)));
      this.selectTool("select");
      // top menu wiring
      $$(".menu__item").forEach((m) => m.addEventListener("click", (e) => DD.app.openMenu(m.dataset.menu, m)));
    }
  }

  DD.toolbar = new Toolbar();
})();
