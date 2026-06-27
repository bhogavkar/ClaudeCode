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

    /** Preview icon for a connector/arrow preset (a line with arrowheads). */
    connIcon(preset) {
      const wrap = svg("svg", { viewBox: "0 0 44 20" });
      const dash = preset.style && preset.style.strokeStyle === "dashed" ? { "stroke-dasharray": "5 3" } : preset.style && preset.style.strokeStyle === "dotted" ? { "stroke-dasharray": "1.5 3" } : {};
      const isCurved = preset.routing === "curved";
      const d = isCurved ? "M8 10 C18 2, 26 18, 36 10" : "M8 10 H36";
      wrap.appendChild(svg("path", { d, fill: "none", stroke: "currentColor", "stroke-width": 1.8, ...dash }));
      const he = DD.connectors.arrowHead(preset.arrowEnd, 7);
      if (he) wrap.appendChild(svg("path", { d: he.d, transform: "translate(37 10)", fill: he.fill ? "currentColor" : "none", stroke: "currentColor", "stroke-width": 1.6 }));
      const hs = DD.connectors.arrowHead(preset.arrowStart, 7);
      if (hs) wrap.appendChild(svg("path", { d: hs.d, transform: "translate(7 10) rotate(180)", fill: hs.fill ? "currentColor" : "none", stroke: "currentColor", "stroke-width": 1.6 }));
      return wrap;
    }

    connItem(preset) {
      const node = el("div", { class: "palette__item", draggable: "true", title: preset.label + " — drag onto the canvas, then drag its ends onto shapes" });
      node.appendChild(this.connIcon(preset));
      node.appendChild(el("span", { class: "lbl", text: preset.label }));
      node.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/connector-preset", preset.id); e.dataTransfer.effectAllowed = "copy"; });
      node.addEventListener("dblclick", () => {
        const c = DD.canvas, r = c.svgEl.getBoundingClientRect();
        const w = c.screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
        DD.history.transaction("Add " + preset.label, () => {
          const conn = DD.store.addConnector({ from: { x: c.snap(w.x - 70), y: c.snap(w.y), side: "e" }, to: { x: c.snap(w.x + 70), y: c.snap(w.y), side: "w" }, routing: preset.routing || "orthogonal", arrowStart: preset.arrowStart || "none", arrowEnd: preset.arrowEnd || "filled", style: Object.assign({}, preset.style) });
          DD.store.select(conn.id);
        });
        c.refreshObject([...DD.store.selection][0]);
      });
      return node;
    }

    connectorGroup(query) {
      let presets = DD.connectors.PRESETS;
      if (query) presets = presets.filter((p) => p.label.toLowerCase().includes(query) || p.id.includes(query) || "arrow connector line".includes(query));
      if (!presets.length) return null;
      const group = el("div", { class: "palette__group" + (this.collapsed.has("connectors") ? " collapsed" : "") });
      const head = el("button", { class: "palette__head" }, [el("span", { text: "Connectors & Arrows" }), el("span", { class: "chev", html: "▾" })]);
      head.addEventListener("click", () => { group.classList.toggle("collapsed"); if (this.collapsed.has("connectors")) this.collapsed.delete("connectors"); else this.collapsed.add("connectors"); });
      const grid = el("div", { class: "palette__items" });
      presets.forEach((p) => grid.appendChild(this.connItem(p)));
      group.appendChild(head); group.appendChild(grid);
      return group;
    }

    render(query = "") {
      this.root.textContent = "";
      const cg = this.connectorGroup(query);
      if (cg) this.root.appendChild(cg);
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
