/* =====================================================================
   properties.js — Context-aware inspector (Properties + Document tabs).
   ===================================================================== */
(function () {
  "use strict";
  const DD = window.DD;
  const { el, $ } = DD.util;
  const { bus, EV, store } = DD;

  class Properties {
    constructor() {
      this.panel = $("#panelProperties");
      this.docPanel = $("#panelDocument");
      bus.on(EV.SELECTION, () => this.render());
      bus.on(EV.SHAPE_UPDATED, () => { if (!this._editing) this.render(); });
      bus.on(EV.DOC_LOADED, () => { this.render(); this.renderDoc(); });
      this.render(); this.renderDoc();
    }

    /* ---------- helpers to build fields ---------- */
    field(label, control) { return el("div", { class: "field" }, [el("label", { class: "field__label", text: label }), control]); }
    row(...controls) { return el("div", { class: "field__row" }, controls); }
    section(t) { return el("div", { class: "section-title", text: t }); }

    num(value, on, attrs = {}) {
      const i = el("input", { class: "input", type: "number", value: Math.round(value), ...attrs });
      i.addEventListener("input", () => { this._editing = true; on(parseFloat(i.value) || 0); });
      i.addEventListener("change", () => { this._editing = false; DD.history._commit("Edit"); });
      return i;
    }
    color(value, on) {
      const i = el("input", { class: "input", type: "color", value: this._hex(value) });
      i.addEventListener("input", () => on(i.value));
      i.addEventListener("change", () => DD.history._commit("Color"));
      return i;
    }
    text(value, on, ph = "") {
      const i = el("input", { class: "input", type: "text", value: value || "", placeholder: ph });
      i.addEventListener("input", () => { this._editing = true; on(i.value); });
      i.addEventListener("change", () => { this._editing = false; DD.history._commit("Edit text"); });
      return i;
    }
    select(value, opts, on) {
      const s = el("select", { class: "input" }, opts.map((o) => {
        const [v, t] = Array.isArray(o) ? o : [o, o];
        return el("option", { value: v, text: t, ...(v === value ? { selected: "" } : {}) });
      }));
      s.addEventListener("change", () => { on(s.value); DD.history._commit("Edit"); });
      return s;
    }
    range(value, on, attrs = {}) {
      const i = el("input", { class: "input", type: "range", value, ...attrs });
      i.addEventListener("input", () => on(parseFloat(i.value)));
      i.addEventListener("change", () => DD.history._commit("Edit"));
      return i;
    }
    toggle(label, active, on) {
      const b = el("button", { class: "icon-btn" + (active ? " is-active" : ""), text: label });
      b.addEventListener("click", () => { on(!active); DD.history._commit("Toggle"); });
      return b;
    }
    _hex(v) { return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v || "") ? v : "#ffffff"; }

    /* ---------- main render ---------- */
    render() {
      const p = this.panel; p.textContent = "";
      const sel = store.getSelection();
      if (!sel.length) {
        p.appendChild(el("div", { class: "empty-hint", html: "Nothing selected.<br><br>Drag a shape from the left, double-click the canvas to add a process, or pick the connector tool to link shapes." }));
        return;
      }
      const shapes = store.selectedShapes();
      const conns = store.selectedConnectors();
      p.appendChild(el("div", { class: "section-title", text: sel.length === 1 ? this._title(sel[0]) : sel.length + " objects selected" }));

      if (shapes.length) this._shapeProps(p, shapes);
      if (conns.length) this._connProps(p, conns);
      this._arrange(p, sel);
    }
    _title(o) {
      if (o.type) return DD.shapes.has(o.type) ? DD.shapes.get(o.type).label : "Shape";
      return "Connector";
    }

    _shapeProps(p, shapes) {
      const s = shapes[0];
      const set = (patch) => store.updateMany(shapes.map((x) => x.id), patch);
      const setStyle = (st) => set({ style: st });
      const setTS = (ts) => set({ textStyle: ts });

      // Geometry
      p.appendChild(this.section("Position & Size"));
      p.appendChild(this.row(
        this.field("X", this.num(s.x, (v) => set({ x: v }))),
        this.field("Y", this.num(s.y, (v) => set({ y: v }))),
      ));
      p.appendChild(this.row(
        this.field("W", this.num(s.w, (v) => set({ w: Math.max(8, v) }))),
        this.field("H", this.num(s.h, (v) => set({ h: Math.max(8, v) }))),
      ));
      p.appendChild(this.row(
        this.field("Rotation", this.num(s.rotation || 0, (v) => set({ rotation: v }))),
        this.field("Flip", el("div", { class: "field__row" }, [
          this.toggle("⇄", s.flipH, (v) => set({ flipH: v })),
          this.toggle("⇅", s.flipV, (v) => set({ flipV: v })),
        ])),
      ));

      // Text content
      p.appendChild(this.section("Text"));
      p.appendChild(this.field("Label", this.text(s.text, (v) => set({ text: v }), "Type label…")));
      const ts = s.textStyle || {};
      p.appendChild(this.row(
        this.field("Font", this.select(ts.fontFamily || "var(--font-ui)", [["var(--font-ui)", "Sans"], ["Georgia, serif", "Serif"], ["var(--font-mono)", "Mono"]], (v) => setTS({ fontFamily: v }))),
        this.field("Size", this.num(ts.fontSize || 13, (v) => setTS({ fontSize: v }), { min: 6, max: 96 })),
      ));
      p.appendChild(this.field("Style", el("div", { class: "btn-grid" }, [
        this.toggle("B", ts.bold, (v) => setTS({ bold: v })),
        this.toggle("I", ts.italic, (v) => setTS({ italic: v })),
        this.toggle("U", ts.underline, (v) => setTS({ underline: v })),
        this.toggle("S", ts.strike, (v) => setTS({ strike: v })),
      ])));
      p.appendChild(this.row(
        this.field("Align", this.select(ts.align || "center", ["left", "center", "right"], (v) => setTS({ align: v }))),
        this.field("Text color", this.color(ts.color || "#1c2430", (v) => setTS({ color: v }))),
      ));

      // Fill & stroke
      const st = s.style || {};
      p.appendChild(this.section("Fill & Border"));
      p.appendChild(this.row(
        this.field("Fill", this.color(st.fill || "#ffffff", (v) => setStyle({ fill: v }))),
        this.field("Border", this.color(st.stroke || "#1c2430", (v) => setStyle({ stroke: v }))),
      ));
      p.appendChild(this.field("Gradient", el("div", { class: "field__row" }, [
        this.toggle("On", st.gradient, (v) => setStyle({ gradient: v })),
        this.color(st.gradientTo || "#cfe0ff", (v) => setStyle({ gradientTo: v })),
      ])));
      p.appendChild(this.row(
        this.field("Border width", this.num(st.strokeWidth != null ? st.strokeWidth : 1.6, (v) => setStyle({ strokeWidth: v }), { min: 0, max: 20, step: 0.5 })),
        this.field("Border style", this.select(st.strokeStyle || "solid", ["solid", "dashed", "dotted"], (v) => setStyle({ strokeStyle: v }))),
      ));
      p.appendChild(this.field("Opacity", this.range((st.opacity != null ? st.opacity : 1) * 100, (v) => setStyle({ opacity: v / 100 }), { min: 0, max: 100 })));
      p.appendChild(this.field("Effects", el("div", { class: "btn-grid" }, [
        this.toggle("Shadow", st.shadow, (v) => setStyle({ shadow: v })),
      ])));
    }

    _connProps(p, conns) {
      const c = conns[0];
      const set = (patch) => store.updateMany(conns.map((x) => x.id), patch);
      const setStyle = (st) => set({ style: st });
      p.appendChild(this.section("Connector"));
      p.appendChild(this.field("Label", this.text(c.label, (v) => set({ label: v }), "Edge label…")));
      p.appendChild(this.field("Routing", this.select(c.routing || "orthogonal",
        [["orthogonal", "Orthogonal"], ["straight", "Straight"], ["curved", "Curved"], ["bezier", "Bezier"]], (v) => set({ routing: v }))));
      p.appendChild(this.row(
        this.field("Start arrow", this.select(c.arrowStart || "none", DD.connectors.ARROWS, (v) => set({ arrowStart: v }))),
        this.field("End arrow", this.select(c.arrowEnd || "filled", DD.connectors.ARROWS, (v) => set({ arrowEnd: v }))),
      ));
      const st = c.style || {};
      p.appendChild(this.row(
        this.field("Color", this.color(st.stroke || "#5b6675", (v) => setStyle({ stroke: v }))),
        this.field("Width", this.num(st.strokeWidth || 2, (v) => setStyle({ strokeWidth: v }), { min: 0.5, max: 12, step: 0.5 })),
      ));
      p.appendChild(this.row(
        this.field("Line", this.select(st.strokeStyle || "solid", ["solid", "dashed", "dotted"], (v) => setStyle({ strokeStyle: v }))),
        this.field("Animate", el("div", {}, [this.toggle("Flow", st.animated, (v) => setStyle({ animated: v }))])),
      ));
    }

    _arrange(p, sel) {
      p.appendChild(this.section("Arrange"));
      const mk = (t, fn) => { const b = el("button", { class: "btn btn--block", text: t, style: { marginBottom: "4px" } }); b.addEventListener("click", fn); return b; };
      p.appendChild(this.row(mk("Bring front", () => DD.app.zorder("bringToFront")), mk("Send back", () => DD.app.zorder("sendToBack"))));
      p.appendChild(this.row(mk("Duplicate", () => DD.app.duplicate()), mk("Delete", () => DD.app.deleteSelection())));
      // layer assignment
      p.appendChild(this.field("Layer", this.select(sel[0].layerId, store.layers.map((l) => [l.id, l.name]), (v) => store.updateMany(sel.map((s) => s.id), { layerId: v }))));
    }

    /* ---------- document settings ---------- */
    renderDoc() {
      const p = this.docPanel; p.textContent = "";
      const g = store.settings;
      const set = (patch) => { Object.assign(store.settings, patch); store.markDirty(); DD.canvas.applyGrid(); DD.canvas.renderAll(); };
      p.appendChild(this.section("Canvas"));
      p.appendChild(this.field("Grid type", this.select(g.gridType, [["dot", "Dots"], ["line", "Lines"], ["none", "None"]], (v) => set({ gridType: v }))));
      p.appendChild(this.field("Grid size", this.num(g.gridSize, (v) => set({ gridSize: Math.max(4, v) }), { min: 4, max: 100 })));
      p.appendChild(this.field("Snapping", el("div", { class: "btn-grid" }, [
        this.toggle("Snap grid", g.snap, (v) => set({ snap: v })),
        this.toggle("Guides", g.smartGuides, (v) => set({ smartGuides: v })),
      ])));
      p.appendChild(this.section("Theme"));
      p.appendChild(this.field("Theme", this.select(document.documentElement.dataset.theme || "light",
        [["light", "Light"], ["dark", "Dark"], ["oracle", "Oracle"], ["microsoft", "Microsoft"], ["contrast", "High Contrast"]],
        (v) => DD.app.setTheme(v))));
      p.appendChild(this.section("Document"));
      p.appendChild(this.field("Objects", el("div", { class: "field__label", text: `${store.shapes.length} shapes · ${store.connectors.length} connectors · ${store.layers.length} layers` })));
    }
  }

  DD.properties = new Properties();
})();
