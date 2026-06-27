/* =====================================================================
   canvas.js — SVG rendering engine + viewport + interaction state machine.
   Responsibilities: pan/zoom, grid, render shapes/connectors, selection
   handles, move/resize/rotate, marquee, connector drawing, snapping,
   smart guides, drag-drop from palette, minimap.
   ===================================================================== */
(function () {
  "use strict";
  const DD = window.DD;
  const { svg, $, clamp, round, dist, unionBox } = Object.assign({}, DD.util, { svg: DD.util.svg, $: DD.util.$ });
  const U = DD.util, { store, bus, EV } = DD;

  class Canvas {
    constructor() {
      this.svgEl = $("#canvas");
      this.viewport = $("#viewport");
      this.gShapes = $("#layerShapes");
      this.gConn = $("#layerConnectors");
      this.gOverlay = $("#layerOverlay");
      this.defs = $("#canvasDefs");
      this.host = $("#canvasHost");

      this.scale = 1;
      this.tx = 0; this.ty = 0;
      this.tool = "select";
      this.mode = "idle";
      this._drag = null;
      this._spaceDown = false;
      this._elIndex = new Map();   // id → group element

      this._wire();
      this._bind();
      this.applyGrid();
      this.centerView();
    }

    /* =============================================== viewport */
    setTransform(s, tx, ty, emit = true) {
      this.scale = clamp(s, 0.04, 64);
      this.tx = tx; this.ty = ty;
      this.viewport.setAttribute("transform", `translate(${tx} ${ty}) scale(${this.scale})`);
      this.applyGrid();
      this.updateOverlayScale();
      this.updateMinimapView();
      if (emit) bus.emit(EV.ZOOM, this.scale);
    }
    screenToWorld(sx, sy) {
      const r = this.svgEl.getBoundingClientRect();
      return { x: (sx - r.left - this.tx) / this.scale, y: (sy - r.top - this.ty) / this.scale };
    }
    worldToScreen(wx, wy) {
      const r = this.svgEl.getBoundingClientRect();
      return { x: wx * this.scale + this.tx + r.left, y: wy * this.scale + this.ty + r.top };
    }

    zoomAt(factor, sx, sy) {
      const r = this.svgEl.getBoundingClientRect();
      const cx = sx - r.left, cy = sy - r.top;
      const ns = clamp(this.scale * factor, 0.04, 64);
      const k = ns / this.scale;
      this.setTransform(ns, cx - (cx - this.tx) * k, cy - (cy - this.ty) * k);
    }
    zoom(factor) { const r = this.svgEl.getBoundingClientRect(); this.zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2); }
    resetZoom() { const r = this.svgEl.getBoundingClientRect(); this.setTransform(1, r.width / 2 - 400, r.height / 2 - 300); }
    centerView() { const r = this.svgEl.getBoundingClientRect(); this.setTransform(1, r.width / 2 - 200, r.height / 2 - 150); }

    fit(padding = 80) {
      const box = unionBox(store.visibleShapes());
      const r = this.svgEl.getBoundingClientRect();
      if (!box) return this.resetZoom();
      const s = clamp(Math.min((r.width - padding) / box.w, (r.height - padding) / box.h), 0.05, 4);
      this.setTransform(s, (r.width - box.w * s) / 2 - box.x * s, (r.height - box.h * s) / 2 - box.y * s);
    }

    /* =============================================== grid */
    applyGrid() {
      const g = store.settings, host = this.host;
      const size = g.gridSize * this.scale;
      const ox = this.tx % (size || 1), oy = this.ty % (size || 1);
      const grid = $("#gridBg");
      if (g.gridType === "none" || size < 4) { grid.style.fill = "var(--bg-canvas)"; return; }
      const line = "var(--grid-line)", dotc = "var(--grid-dot)";
      let bg;
      if (g.gridType === "dot") {
        bg = `radial-gradient(circle, ${dotc} ${Math.max(1, this.scale)}px, transparent ${Math.max(1, this.scale)}px)`;
      } else {
        bg = `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`;
      }
      host.style.backgroundColor = "var(--bg-canvas)";
      host.style.backgroundImage = bg;
      host.style.backgroundSize = `${size}px ${size}px`;
      host.style.backgroundPosition = `${ox}px ${oy}px`;
      grid.style.fill = "transparent";
    }

    /* =============================================== rendering */
    renderAll() {
      this.gShapes.textContent = ""; this.gConn.textContent = "";
      this._elIndex.clear();
      const layerVis = new Map(store.layers.map((l) => [l.id, l]));
      for (const c of store.connectors) { const l = layerVis.get(c.layerId); if (l && !l.visible) continue; this._addConnEl(c, l); }
      for (const s of store.shapes) { const l = layerVis.get(s.layerId); if (l && !l.visible) continue; this._addShapeEl(s, l); }
      this.renderOverlay();
      this.renderMinimap();
      bus.emit(EV.RENDER);
    }

    _addShapeEl(s, layer) {
      const g = this._shapeEl(s, layer);
      this.gShapes.appendChild(g);
      this._elIndex.set(s.id, g);
    }
    _addConnEl(c, layer) {
      const g = this._connEl(c, layer);
      this.gConn.appendChild(g);
      this._elIndex.set(c.id, g);
    }

    _shapeEl(s, layer) {
      const def = DD.shapes.get(s.type);
      const g = svg("g", { class: "shape-group", "data-id": s.id });
      this._applyTransform(g, s);
      this._applyStyle(g, s, def, layer);
      let geom = def.render(s); geom = Array.isArray(geom) ? geom : [geom];
      geom.forEach((e) => g.appendChild(e));
      if (s.text) this._renderText(g, s, def);
      DD.shapes.ports(s).forEach((p) =>
        g.appendChild(svg("circle", { class: "port", cx: p.x, cy: p.y, r: 4.5 / this.scale, "data-port": p.id, "data-id": s.id })));
      return g;
    }

    _applyTransform(g, s) {
      const fx = s.flipH ? -1 : 1, fy = s.flipV ? -1 : 1;
      let t = `translate(${s.x} ${s.y}) rotate(${s.rotation || 0} ${s.w / 2} ${s.h / 2})`;
      if (s.flipH || s.flipV) t += ` translate(${s.flipH ? s.w : 0} ${s.flipV ? s.h : 0}) scale(${fx} ${fy})`;
      g.setAttribute("transform", t);
    }

    _applyStyle(g, s, def, layer) {
      const st = s.style || {};
      const fill = st.gradient ? this._gradient(s, st) : (st.fill || "#ffffff");
      g.setAttribute("fill", fill);
      g.setAttribute("stroke", st.stroke || "#1c2430");
      g.setAttribute("stroke-width", (st.strokeWidth != null ? st.strokeWidth : 1.6) * (def.strokeBoost || 1));
      g.setAttribute("opacity", (st.opacity != null ? st.opacity : 1) * (layer ? layer.opacity : 1));
      if (st.dash) g.setAttribute("stroke-dasharray", st.dash);
      if (st.strokeStyle === "dashed") g.setAttribute("stroke-dasharray", "8 5");
      if (st.strokeStyle === "dotted") g.setAttribute("stroke-dasharray", "2 4");
      if (st.shadow) g.setAttribute("filter", this._shadow());
    }

    _gradient(s, st) {
      const id = "grad_" + s.id;
      let lg = this.defs.querySelector("#" + CSS.escape(id));
      if (lg) lg.remove();
      lg = svg("linearGradient", { id, x1: 0, y1: 0, x2: 0, y2: 1 });
      lg.appendChild(svg("stop", { offset: "0%", "stop-color": st.fill || "#ffffff" }));
      lg.appendChild(svg("stop", { offset: "100%", "stop-color": st.gradientTo || "#cfe0ff" }));
      this.defs.appendChild(lg);
      return `url(#${id})`;
    }
    _shadow() {
      if (this._shadowId) return `url(#${this._shadowId})`;
      const id = "dd-shadow";
      const f = svg("filter", { id, x: "-20%", y: "-20%", width: "140%", height: "140%" });
      f.appendChild(svg("feDropShadow", { dx: 2, dy: 3, stdDeviation: 3, "flood-color": "rgba(0,0,0,.35)" }));
      this.defs.appendChild(f); this._shadowId = id; return `url(#${id})`;
    }

    _renderText(g, s, def) {
      const ts = s.textStyle || {};
      const fs = ts.fontSize || 13;
      const pad = 8;
      const lines = this._wrap(s.text, s.w - pad * 2, fs, ts);
      const lh = fs * 1.25;
      const cx = s.w / 2;
      let startY;
      const valign = ts.valign || (def.compartments ? "top" : "middle");
      if (valign === "top") startY = pad + fs;
      else if (valign === "bottom") startY = s.h - pad - (lines.length - 1) * lh;
      else startY = s.h / 2 - (lines.length - 1) * lh / 2;
      const anchor = ts.align === "left" ? "start" : ts.align === "right" ? "end" : "middle";
      const tx = ts.align === "left" ? pad : ts.align === "right" ? s.w - pad : cx;
      const text = svg("text", {
        class: "shape-text", x: tx, y: startY, "text-anchor": anchor,
        "font-size": fs, "font-family": ts.fontFamily || "var(--font-ui)",
        "font-weight": ts.bold ? "700" : "400", "font-style": ts.italic ? "italic" : "normal",
        "text-decoration": [ts.underline ? "underline" : "", ts.strike ? "line-through" : ""].join(" ").trim(),
        fill: ts.color || U.readableText(s.style && s.style.fill), stroke: "none",
      });
      lines.forEach((ln, i) => text.appendChild(svg("tspan", { x: tx, dy: i ? lh : 0 }, ln)));
      g.appendChild(text);
    }

    _wrap(str, maxW, fs, ts) {
      const charW = fs * 0.56 * (ts && ts.bold ? 1.05 : 1);
      const out = [];
      String(str).split("\n").forEach((para) => {
        const words = para.split(/\s+/); let line = "";
        for (const w of words) {
          const test = line ? line + " " + w : w;
          if (test.length * charW > maxW && line) { out.push(line); line = w; }
          else line = test;
        }
        out.push(line);
      });
      return out.length ? out : [""];
    }

    _connEl(c, layer) {
      const r = DD.connectors.routePath(c);
      const g = svg("g", { class: "connector-group", "data-id": c.id });
      g.appendChild(svg("path", { class: "connector-hit", d: r.d, "data-id": c.id }));
      const st = c.style || {};
      const path = svg("path", {
        class: "connector-path" + (st.animated ? " is-animated" : ""), d: r.d, "data-id": c.id,
        stroke: st.stroke || "#5b6675", "stroke-width": st.strokeWidth || 2,
        opacity: (st.opacity != null ? st.opacity : 1) * (layer ? layer.opacity : 1),
      });
      if (st.strokeStyle === "dashed") path.setAttribute("stroke-dasharray", "8 5");
      if (st.strokeStyle === "dotted") path.setAttribute("stroke-dasharray", "2 4");
      g.appendChild(path);
      this._arrow(g, c, r.b, r.angleEnd, c.arrowEnd, st);
      this._arrow(g, c, r.a, r.angleStart, c.arrowStart, st);
      if (c.label) {
        const t = svg("text", { class: "shape-text", x: r.mid.x, y: r.mid.y - 6, "text-anchor": "middle", "font-size": 12, fill: st.stroke || "#5b6675", stroke: "none" });
        const bg = svg("rect", { x: r.mid.x - c.label.length * 3.4 - 4, y: r.mid.y - 18, width: c.label.length * 6.8 + 8, height: 16, rx: 3, fill: "var(--bg-canvas)", stroke: "none" });
        t.textContent = c.label; g.appendChild(bg); g.appendChild(t);
      }
      return g;
    }
    _arrow(g, c, pt, ang, type, st) {
      const head = DD.connectors.arrowHead(type, 11);
      if (!head) return;
      const col = st.stroke || "#5b6675";
      const a = svg("path", { d: head.d, transform: `translate(${pt.x} ${pt.y}) rotate(${ang * 180 / Math.PI})`, fill: head.fill ? col : "none", stroke: col, "stroke-width": st.strokeWidth || 2 });
      g.appendChild(a);
    }

    /* incremental updates */
    refreshObject(id) {
      const old = this._elIndex.get(id);
      const s = store.getShape(id);
      if (s) {
        const layer = store.layers.find((l) => l.id === s.layerId);
        const g = this._shapeEl(s, layer);
        if (old) old.replaceWith(g); else this.gShapes.appendChild(g);
        this._elIndex.set(id, g);
        this._rerouteConnected(id);
      } else {
        const c = store.getConnector(id);
        if (c) { const layer = store.layers.find((l) => l.id === c.layerId); const g = this._connEl(c, layer); if (old) old.replaceWith(g); else this.gConn.appendChild(g); this._elIndex.set(id, g); }
      }
      this.renderOverlay();
    }
    _rerouteConnected(shapeId) {
      store.connectors.forEach((c) => {
        if ((c.from && c.from.shapeId === shapeId) || (c.to && c.to.shapeId === shapeId)) this.refreshObject(c.id);
      });
    }

    /* =============================================== selection overlay */
    renderOverlay() {
      this.gOverlay.textContent = "";
      const shapes = store.selectedShapes();
      const hs = 4.5 / this.scale, sw = 1.5 / this.scale;
      shapes.forEach((s) => {
        const og = svg("g", { class: "sel", "data-id": s.id });
        og.setAttribute("transform", `translate(${s.x} ${s.y}) rotate(${s.rotation || 0} ${s.w / 2} ${s.h / 2})`);
        og.appendChild(svg("rect", { class: "sel-outline", x: -2, y: -2, width: s.w + 4, height: s.h + 4 }));
        const pts = { nw: [0, 0], n: [s.w / 2, 0], ne: [s.w, 0], e: [s.w, s.h / 2], se: [s.w, s.h], s: [s.w / 2, s.h], sw: [0, s.h], w: [0, s.h / 2] };
        for (const k in pts) og.appendChild(svg("rect", { class: "sel-handle", x: pts[k][0] - hs, y: pts[k][1] - hs, width: hs * 2, height: hs * 2, "data-handle": k }));
        og.appendChild(svg("line", { class: "sel-outline", x1: s.w / 2, y1: -2, x2: s.w / 2, y2: -22 / this.scale }));
        og.appendChild(svg("circle", { class: "rotate-handle", cx: s.w / 2, cy: -22 / this.scale, r: hs * 1.1, "data-handle": "rotate" }));
        this.gOverlay.appendChild(og);
      });
      // connector selection highlight + draggable endpoint handles
      const ch = 6 / this.scale;
      store.selectedConnectors().forEach((c) => {
        const r = DD.connectors.routePath(c);
        this.gOverlay.appendChild(svg("path", { d: r.d, fill: "none", stroke: "var(--selection)", "stroke-width": (c.style.strokeWidth || 2) + 3, opacity: 0.3 }));
        [["from", r.a], ["to", r.b]].forEach(([end, pt]) => {
          const attached = c[end] && c[end].shapeId;
          this.gOverlay.appendChild(svg("circle", { class: "conn-handle" + (attached ? " is-attached" : ""), cx: pt.x, cy: pt.y, r: ch, "data-connend": end, "data-id": c.id }));
        });
      });
    }
    updateOverlayScale() {
      // ports radius depends on scale
      this._elIndex.forEach((g) => { g.querySelectorAll && g.querySelectorAll(".port").forEach((p) => p.setAttribute("r", 4.5 / this.scale)); });
      this.renderOverlay();
    }

    /* =============================================== snapping & guides */
    snap(v) { const g = store.settings; return g.snap ? round(v, g.gridSize) : v; }

    smartGuides(moving) {
      this._clearGuides();
      if (!store.settings.smartGuides) return { dx: 0, dy: 0 };
      const tol = store.settings.snapTolerance / this.scale;
      const movingBox = unionBox(moving);
      const movingIds = new Set(moving.map((s) => s.id));
      const targets = ["x", "cx", "x2"].flatMap((k) => [{ axis: "v", v: movingBox[k], from: k }])
        .concat(["y", "cy", "y2"].map((k) => ({ axis: "h", v: movingBox[k], from: k })));
      let dx = 0, dy = 0, snapped = { v: null, h: null };
      store.visibleShapes().filter((s) => !movingIds.has(s.id)).forEach((s) => {
        const b = U.bbox(s);
        [["x", b.x], ["cx", b.cx], ["x2", b.x2]].forEach(([, vv]) => {
          ["x", "cx", "x2"].forEach((mk) => { if (Math.abs(movingBox[mk] - vv) < tol && snapped.v == null) { dx = vv - movingBox[mk]; snapped.v = vv; } });
        });
        [["y", b.y], ["cy", b.cy], ["y2", b.y2]].forEach(([, vv]) => {
          ["y", "cy", "y2"].forEach((mk) => { if (Math.abs(movingBox[mk] - vv) < tol && snapped.h == null) { dy = vv - movingBox[mk]; snapped.h = vv; } });
        });
      });
      if (snapped.v != null) this._guide("v", snapped.v);
      if (snapped.h != null) this._guide("h", snapped.h);
      return { dx, dy };
    }
    _guide(axis, v) {
      const big = 100000;
      const ln = axis === "v" ? svg("line", { class: "guide-line", x1: v, y1: -big, x2: v, y2: big })
        : svg("line", { class: "guide-line", x1: -big, y1: v, x2: big, y2: v });
      this.gOverlay.appendChild(ln);
    }
    _clearGuides() { this.gOverlay.querySelectorAll(".guide-line").forEach((g) => g.remove()); }

    /* =============================================== hit testing */
    /** Topmost visible shape whose bounding box contains a world point.
     *  Geometry-based (not DOM target) so it stays reliable while dragging. */
    _shapeAt(wx, wy, excludeId) {
      const shapes = store.visibleShapes();
      for (let i = shapes.length - 1; i >= 0; i--) {
        const s = shapes[i];
        if (s.id === excludeId) continue;
        if (DD.util.pointInRect(wx, wy, DD.util.bbox(s))) return s;
      }
      return null;
    }

    _hit(e) {
      const t = e.target;
      const ce = t.closest && t.closest("[data-connend]");
      if (ce) return { kind: "connend", id: ce.dataset.id, end: ce.dataset.connend };
      const portEl = t.closest && t.closest(".port");
      if (portEl) return { kind: "port", id: portEl.dataset.id, port: portEl.dataset.port };
      const handle = t.closest && t.closest("[data-handle]");
      if (handle) return { kind: "handle", handle: handle.dataset.handle, id: handle.closest(".sel").dataset.id };
      const sg = t.closest && t.closest(".shape-group");
      if (sg) return { kind: "shape", id: sg.dataset.id };
      const cg = t.closest && t.closest(".connector-group");
      if (cg) return { kind: "connector", id: cg.dataset.id };
      return { kind: "canvas" };
    }

    /* =============================================== interactions */
    _wire() {
      const sv = this.svgEl;
      sv.addEventListener("pointerdown", (e) => this._down(e));
      window.addEventListener("pointermove", (e) => this._move(e));
      window.addEventListener("pointerup", (e) => this._up(e));
      sv.addEventListener("wheel", (e) => this._wheel(e), { passive: false });
      sv.addEventListener("dblclick", (e) => this._dbl(e));
      sv.addEventListener("contextmenu", (e) => this._context(e));
      // keyboard space-pan
      window.addEventListener("keydown", (e) => { if (e.code === "Space" && !this._isTyping(e)) { this._spaceDown = true; this.svgEl.style.cursor = "grab"; } });
      window.addEventListener("keyup", (e) => { if (e.code === "Space") { this._spaceDown = false; this.svgEl.style.cursor = ""; } });
      // drag-drop from palette
      this.host.addEventListener("dragover", (e) => { e.preventDefault(); this.host.classList.add("drag-over"); });
      this.host.addEventListener("dragleave", () => this.host.classList.remove("drag-over"));
      this.host.addEventListener("drop", (e) => this._drop(e));
      // touch pinch
      this._touch();
      window.addEventListener("resize", U.throttle(() => { this.applyGrid(); this.updateMinimapView(); }, 100));
    }
    _isTyping(e) { const t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); }

    _down(e) {
      if (e.button === 2) return; // context handled separately
      this.svgEl.focus({ preventScroll: true });
      const pan = this._spaceDown || this.tool === "pan" || e.button === 1;
      const w = this.screenToWorld(e.clientX, e.clientY);
      if (pan) { this.mode = "panning"; this._drag = { sx: e.clientX, sy: e.clientY, tx: this.tx, ty: this.ty }; this.svgEl.style.cursor = "grabbing"; return; }

      const hit = this._hit(e);
      if (this.tool === "connector") {
        if (hit.kind === "port" || hit.kind === "shape") return this._startConnector(hit, w);
      }
      if (hit.kind === "connend") return this._startConnEnd(hit);
      if (hit.kind === "port") return this._startConnector(hit, w);
      if (hit.kind === "handle") return this._startHandle(hit, w, e);

      if (hit.kind === "shape" || hit.kind === "connector") {
        if (e.shiftKey) store.toggleSelect(hit.id);
        else if (!store.isSelected(hit.id)) store.select(hit.id);
        // begin move (shapes only; connectors move by endpoints)
        if (store.selectedShapes().length) this._startMove(w);
        return;
      }
      // empty canvas → marquee or clear
      if (!e.shiftKey) store.clearSelection();
      this.mode = "marquee";
      this._drag = { x0: w.x, y0: w.y, add: e.shiftKey };
      this._marquee = svg("rect", { class: "marquee", x: w.x, y: w.y, width: 0, height: 0 });
      this.gOverlay.appendChild(this._marquee);
    }

    _startMove(w) {
      this.mode = "moving";
      const sel = store.selectedShapes();
      this._drag = { x0: w.x, y0: w.y, origins: sel.map((s) => ({ id: s.id, x: s.x, y: s.y })) };
    }
    _startHandle(hit, w, e) {
      const s = store.getShape(hit.id); if (!s) return;
      this.mode = hit.handle === "rotate" ? "rotating" : "resizing";
      this._drag = { id: hit.id, handle: hit.handle, orig: { x: s.x, y: s.y, w: s.w, h: s.h, rotation: s.rotation || 0 }, cx: s.x + s.w / 2, cy: s.y + s.h / 2, keep: e.shiftKey };
    }
    _startConnEnd(hit) {
      if (!store.isSelected(hit.id)) store.select(hit.id);
      this.mode = "connend";
      this._drag = { id: hit.id, end: hit.end };
      this.svgEl.classList.add("ports-visible");
    }
    _doConnEnd(e, w) {
      const c = store.getConnector(this._drag.id); if (!c) return;
      const other = this._drag.end === "from" ? c.to : c.from;
      const otherShape = other && other.shapeId;
      const s = this._shapeAt(w.x, w.y);
      let ep;
      if (s) { const p = DD.connectors.nearestPort(s, w.x, w.y); ep = { shapeId: s.id, port: p.port }; }
      else ep = { x: this.snap(w.x), y: this.snap(w.y), side: "w" };
      // avoid linking a shape to itself only if both ends would collapse; allowed otherwise
      void otherShape;
      c[this._drag.end] = ep;
      this.refreshObject(c.id);
      this._drag.moved = true;
    }

    _startConnector(hit, w) {
      this.mode = "connecting";
      let from;
      if (hit.kind === "port") from = { shapeId: hit.id, port: hit.port };
      else { const s = store.getShape(hit.id); const p = DD.connectors.nearestPort(s, w.x, w.y); from = { shapeId: hit.id, port: p.port }; }
      this._drag = { from };
      this._tempConn = svg("path", { class: "connector-path", d: "", stroke: "var(--accent)", "stroke-width": 2, "stroke-dasharray": "6 4", fill: "none" });
      this.gOverlay.appendChild(this._tempConn);
      this.svgEl.classList.add("ports-visible");
    }

    _move(e) {
      if (this.mode === "idle") { this._hover(e); return; }
      const w = this.screenToWorld(e.clientX, e.clientY);
      if (this.mode === "panning") {
        this.setTransform(this.scale, this._drag.tx + (e.clientX - this._drag.sx), this._drag.ty + (e.clientY - this._drag.sy), false);
        return;
      }
      if (this.mode === "moving") return this._doMove(w);
      if (this.mode === "resizing") return this._doResize(w);
      if (this.mode === "rotating") return this._doRotate(w);
      if (this.mode === "marquee") return this._doMarquee(w);
      if (this.mode === "connend") return this._doConnEnd(e, w);
      if (this.mode === "connecting") return this._doConnecting(e, w);
    }

    _doMove(w) {
      let dx = w.x - this._drag.x0, dy = w.y - this._drag.y0;
      const sel = store.selectedShapes();
      // tentative positions
      this._drag.origins.forEach((o) => { const s = store.getShape(o.id); s.x = this.snap(o.x + dx); s.y = this.snap(o.y + dy); });
      const g = this.smartGuides(sel);
      if (g.dx || g.dy) sel.forEach((s) => { s.x += g.dx; s.y += g.dy; });
      sel.forEach((s) => { this._applyTransform(this._elIndex.get(s.id), s); this._rerouteConnected(s.id); });
      this.renderOverlay();
      this._drag.moved = true;
    }

    _doResize(w) {
      const s = store.getShape(this._drag.id); const o = this._drag.orig; const h = this._drag.handle;
      let x = o.x, y = o.y, ww = o.w, hh = o.h;
      const minW = 16, minH = 16;
      const wx = this.snap(w.x), wy = this.snap(w.y);
      if (h.includes("e")) ww = Math.max(minW, wx - o.x);
      if (h.includes("s")) hh = Math.max(minH, wy - o.y);
      if (h.includes("w")) { ww = Math.max(minW, o.x + o.w - wx); x = wx; }
      if (h.includes("n")) { hh = Math.max(minH, o.y + o.h - wy); y = wy; }
      if (this._drag.keep) { const ar = o.w / o.h; if (h.length === 2) hh = ww / ar; }
      Object.assign(s, { x, y, w: ww, h: hh });
      this.refreshObject(s.id);
      this._drag.moved = true;
    }

    _doRotate(w) {
      const s = store.getShape(this._drag.id); const d = this._drag;
      let ang = Math.atan2(w.y - d.cy, w.x - d.cx) * 180 / Math.PI + 90;
      if (this._shiftHeld) ang = round(ang, 15);
      s.rotation = Math.round(ang);
      this._applyTransform(this._elIndex.get(s.id), s);
      this._rerouteConnected(s.id);
      this.renderOverlay();
      this._drag.moved = true;
    }

    _doMarquee(w) {
      const d = this._drag;
      const x = Math.min(d.x0, w.x), y = Math.min(d.y0, w.y), ww = Math.abs(w.x - d.x0), hh = Math.abs(w.y - d.y0);
      this._marquee.setAttribute("x", x); this._marquee.setAttribute("y", y);
      this._marquee.setAttribute("width", ww); this._marquee.setAttribute("height", hh);
      this._marqueeBox = { x, y, w: ww, h: hh };
    }

    _doConnecting(e, w) {
      this._drag.target = null;
      const s = this._shapeAt(w.x, w.y, this._drag.from.shapeId);
      if (s) { const p = DD.connectors.nearestPort(s, w.x, w.y); this._drag.target = { shapeId: s.id, port: p.port }; }
      const fake = { from: this._drag.from, to: this._drag.target || { x: w.x, y: w.y, side: "w" }, routing: "orthogonal" };
      this._tempConn.setAttribute("d", DD.connectors.routePath(fake).d);
    }

    _up(e) {
      if (this.mode === "panning") { this.svgEl.style.cursor = this._spaceDown ? "grab" : ""; }
      else if (this.mode === "moving" && this._drag.moved) { this._clearGuides(); DD.history._commit("Move"); store.markDirty(); }
      else if ((this.mode === "resizing" || this.mode === "rotating") && this._drag.moved) { DD.history._commit(this.mode === "resizing" ? "Resize" : "Rotate"); store.markDirty(); }
      else if (this.mode === "connend") {
        this.svgEl.classList.remove("ports-visible");
        if (this._drag.moved) { DD.history._commit("Edit connector"); store.markDirty(); }
        this.renderOverlay();
      }
      else if (this.mode === "marquee") {
        if (this._marqueeBox && (this._marqueeBox.w > 3 || this._marqueeBox.h > 3)) {
          const ids = store.visibleShapes().filter((s) => U.rectsIntersect(this._marqueeBox, U.bbox(s))).map((s) => s.id);
          store.select(ids, { add: this._drag.add });
        }
        this._marquee && this._marquee.remove(); this._marquee = null; this._marqueeBox = null;
      }
      else if (this.mode === "connecting") {
        this._tempConn && this._tempConn.remove(); this._tempConn = null;
        this.svgEl.classList.remove("ports-visible");
        if (this._drag.target) {
          DD.history.transaction("Add connector", () => {
            const c = store.addConnector({ from: this._drag.from, to: this._drag.target });
            store.select(c.id);
          });
          this.refreshObject([...store.selection][0]);
        }
      }
      this.mode = "idle"; this._drag = null;
    }

    _hover(e) {
      // show ports on hovered shape (handled by CSS :hover); could add cursor logic
      const hit = this._hit(e);
      if (hit.kind === "handle") {
        const cur = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", rotate: "grab" }[hit.handle];
        this.svgEl.style.cursor = cur || "";
      } else if (this.tool === "connector" || hit.kind === "port") this.svgEl.style.cursor = "crosshair";
      else this.svgEl.style.cursor = this._spaceDown ? "grab" : "";
    }

    _wheel(e) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || !e.shiftKey) {
        const factor = Math.pow(1.0015, -e.deltaY);
        this.zoomAt(factor, e.clientX, e.clientY);
      } else {
        this.setTransform(this.scale, this.tx - e.deltaX, this.ty - e.deltaY, false);
      }
    }

    _dbl(e) {
      const hit = this._hit(e);
      if (hit.kind === "shape" || hit.kind === "connector") {
        bus.emit("ui:editText", hit.id);
      } else if (hit.kind === "canvas") {
        // quick-add a process box on double-click
        const w = this.screenToWorld(e.clientX, e.clientY);
        DD.history.transaction("Add shape", () => {
          const s = store.addShape(DD.shapes.create("fc-process", this.snap(w.x - 65), this.snap(w.y - 32)));
          store.select(s.id);
        });
        this.refreshObject([...store.selection][0]);
        bus.emit("ui:editText", [...store.selection][0]);
      }
    }

    _context(e) {
      e.preventDefault();
      const hit = this._hit(e);
      if ((hit.kind === "shape" || hit.kind === "connector") && !store.isSelected(hit.id)) store.select(hit.id);
      bus.emit("ui:contextmenu", { x: e.clientX, y: e.clientY, hit });
    }

    _drop(e) {
      e.preventDefault(); this.host.classList.remove("drag-over");
      const w0 = this.screenToWorld(e.clientX, e.clientY);

      // Dropping an arrow/connector preset → create an interactive connector.
      const presetId = e.dataTransfer.getData("text/connector-preset");
      if (presetId) {
        const def = DD.connectors.preset(presetId);
        const s = this._shapeAt(w0.x, w0.y);
        let from, to;
        if (s) { const p = DD.connectors.nearestPort(s, w0.x, w0.y); from = { shapeId: s.id, port: p.port }; to = { x: this.snap(p.x + 150), y: this.snap(p.y), side: "w" }; }
        else { from = { x: this.snap(w0.x - 70), y: this.snap(w0.y), side: "e" }; to = { x: this.snap(w0.x + 70), y: this.snap(w0.y), side: "w" }; }
        DD.history.transaction("Add " + def.label, () => {
          const c = store.addConnector({ from, to, routing: def.routing || "orthogonal", arrowStart: def.arrowStart || "none", arrowEnd: def.arrowEnd || "filled", style: Object.assign({}, def.style) });
          store.select(c.id);
        });
        this.refreshObject([...store.selection][0]);
        DD.util.toast("Drag the endpoints onto shapes to connect");
        return;
      }

      const type = e.dataTransfer.getData("text/shape-type");
      if (!type || !DD.shapes.has(type)) return;
      const w = this.screenToWorld(e.clientX, e.clientY);
      const def = DD.shapes.get(type);
      DD.history.transaction("Add " + def.label, () => {
        const s = store.addShape(DD.shapes.create(type, this.snap(w.x - def.w / 2), this.snap(w.y - def.h / 2)));
        store.select(s.id);
      });
      this.refreshObject([...store.selection][0]);
    }

    _touch() {
      let pts = new Map(), startDist = 0, startScale = 1, startMid = null;
      this.svgEl.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") pts.set(e.pointerId, e); });
      this.svgEl.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "touch" || !pts.has(e.pointerId)) return;
        pts.set(e.pointerId, e);
        if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          const d = dist(a.clientX, a.clientY, b.clientX, b.clientY);
          const mid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
          if (!startDist) { startDist = d; startScale = this.scale; startMid = mid; }
          else { this.mode = "idle"; this._drag = null; this.zoomAt((d / startDist) * startScale / this.scale, mid.x, mid.y); }
        }
      });
      const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2) startDist = 0; };
      this.svgEl.addEventListener("pointerup", end);
      this.svgEl.addEventListener("pointercancel", end);
    }

    /* =============================================== minimap */
    renderMinimap() {
      const svgm = $("#minimapSvg"); if (!svgm) return;
      svgm.textContent = "";
      const box = unionBox(store.visibleShapes());
      if (!box) { this.updateMinimapView(); return; }
      const pad = 20;
      const vb = `${box.x - pad} ${box.y - pad} ${box.w + pad * 2} ${box.h + pad * 2}`;
      svgm.setAttribute("viewBox", vb);
      this._miniBox = { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
      store.visibleShapes().forEach((s) => {
        svgm.appendChild(svg("rect", { x: s.x, y: s.y, width: s.w, height: s.h, rx: 2, fill: (s.style && s.style.fill) || "#9ab", stroke: "none", opacity: 0.85 }));
      });
      this.updateMinimapView();
    }
    updateMinimapView() {
      const view = $("#minimapView"); const box = this._miniBox; if (!view || !box) return;
      const r = this.svgEl.getBoundingClientRect();
      const tl = this.screenToWorld(r.left, r.top), br = this.screenToWorld(r.right, r.bottom);
      const mm = $("#minimap").getBoundingClientRect();
      const sx = mm.width / box.w, sy = mm.height / box.h, s = Math.min(sx, sy);
      const offX = (mm.width - box.w * s) / 2, offY = (mm.height - box.h * s) / 2;
      view.style.left = ((tl.x - box.x) * s + offX) + "px";
      view.style.top = ((tl.y - box.y) * s + offY) + "px";
      view.style.width = ((br.x - tl.x) * s) + "px";
      view.style.height = ((br.y - tl.y) * s) + "px";
    }

    /* =============================================== events */
    _bind() {
      bus.on(EV.DOC_LOADED, () => this.renderAll());
      bus.on(EV.LAYERS, () => this.renderAll());
      bus.on(EV.SHAPE_UPDATED, (o) => { if (this.mode === "idle") this.refreshObject(o.id); });
      bus.on(EV.SHAPE_ADDED, (o) => { if (this.mode === "idle") this.refreshObject(o.id); });
      bus.on(EV.SHAPE_REMOVED, (o) => { const el = this._elIndex.get(o.id); if (el) el.remove(); this._elIndex.delete(o.id); this.renderOverlay(); });
      bus.on(EV.SELECTION, () => this.renderOverlay());
      bus.on(EV.DOC_CHANGED, U.debounce(() => this.renderMinimap(), 200));
      bus.on(EV.THEME, () => this.applyGrid());
      window.addEventListener("keydown", (e) => { this._shiftHeld = e.shiftKey; });
      window.addEventListener("keyup", (e) => { this._shiftHeld = e.shiftKey; });
      // minimap click-to-pan
      $("#minimap").addEventListener("pointerdown", (e) => {
        const box = this._miniBox; if (!box) return;
        const mm = $("#minimap").getBoundingClientRect();
        const s = Math.min(mm.width / box.w, mm.height / box.h);
        const offX = (mm.width - box.w * s) / 2, offY = (mm.height - box.h * s) / 2;
        const wx = (e.clientX - mm.left - offX) / s + box.x, wy = (e.clientY - mm.top - offY) / s + box.y;
        const r = this.svgEl.getBoundingClientRect();
        this.setTransform(this.scale, r.width / 2 - wx * this.scale, r.height / 2 - wy * this.scale);
      });
    }

    setTool(t) { this.tool = t; this.svgEl.style.cursor = t === "pan" ? "grab" : t === "connector" ? "crosshair" : ""; this.svgEl.classList.toggle("ports-visible", t === "connector"); bus.emit(EV.TOOL, t); }
  }

  DD.canvas = new Canvas();
})();
