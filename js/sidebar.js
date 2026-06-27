/* =====================================================================
   sidebar.js — Shape library palette (search + drag-to-canvas).
   ===================================================================== */
(function () {
  "use strict";
  const DD = window.DD;
  const { svg, el, $, $$ } = DD.util;
  const { bus } = DD;

  class Sidebar {
    constructor() {
      this.root = $("#shapePalette");
      this.search = $("#shapeSearch");
      this.collapsed = new Set();
      this.render();
      this.search.addEventListener("input", DD.util.debounce(() => this.render(this.search.value.trim().toLowerCase()), 120));
    }

    /** Build a small preview icon from the shape's own renderer. */
    icon(def) {
      const s = { type: def.type, x: 0, y: 0, w: 36, h: 28, style: {} };
      const wrap = svg("svg", { viewBox: "-2 -2 40 32" });
      const g = svg("g", { fill: "var(--bg-panel)", stroke: "currentColor", "stroke-width": 1.4 });
      let geom = def.render(s); geom = Array.isArray(geom) ? geom : [geom];
      geom.forEach((e) => g.appendChild(e));
      wrap.appendChild(g);
      return wrap;
    }

    render(query = "") {
      this.root.textContent = "";
      DD.shapes.categories.forEach((cat) => {
        let items = cat.items.map((t) => DD.shapes.get(t));
        if (query) items = items.filter((d) => d.label.toLowerCase().includes(query) || d.type.includes(query));
        if (!items.length) return;
        const group = el("div", { class: "palette__group" + (this.collapsed.has(cat.id) ? " collapsed" : "") });
        const head = el("button", { class: "palette__head" }, [
          el("span", { text: cat.label }),
          el("span", { class: "chev", html: "▾" }),
        ]);
        head.addEventListener("click", () => {
          group.classList.toggle("collapsed");
          if (this.collapsed.has(cat.id)) this.collapsed.delete(cat.id); else this.collapsed.add(cat.id);
        });
        const grid = el("div", { class: "palette__items" });
        items.forEach((def) => grid.appendChild(this.item(def)));
        group.appendChild(head); group.appendChild(grid);
        this.root.appendChild(group);
      });
      if (!this.root.children.length) this.root.appendChild(el("div", { class: "empty-hint", text: "No shapes match your search." }));
    }

    item(def) {
      const node = el("div", { class: "palette__item", draggable: "true", title: def.label });
      node.appendChild(this.icon(def));
      node.appendChild(el("span", { class: "lbl", text: def.label }));
      node.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/shape-type", def.type);
        e.dataTransfer.effectAllowed = "copy";
      });
      // click to drop at viewport center
      node.addEventListener("dblclick", () => {
        const c = DD.canvas; const r = c.svgEl.getBoundingClientRect();
        const w = c.screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
        DD.history.transaction("Add " + def.label, () => {
          const s = DD.store.addShape(DD.shapes.create(def.type, c.snap(w.x - def.w / 2), c.snap(w.y - def.h / 2)));
          DD.store.select(s.id);
        });
        c.refreshObject([...DD.store.selection][0]);
      });
      return node;
    }
  }

  bus.on(DD.EV.DOC_LOADED, () => { });
  DD.sidebar = new Sidebar();
})();
