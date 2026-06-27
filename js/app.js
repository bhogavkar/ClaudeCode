/* =====================================================================
   app.js — Application controller (MVVM glue).
   Wires menus, command palette, context menu, modals, clipboard,
   align/distribute, grouping, text editing, theme, status bar.
   ===================================================================== */
(function () {
  "use strict";
  const DD = window.DD;
  const { el, $, $$, clone, uid, unionBox, toast } = DD.util;
  const { bus, EV, store } = DD;

  const THEMES = ["light", "dark", "oracle", "microsoft", "contrast"];

  class App {
    constructor() {
      this.clipboard = null;
      this._selGuard = false;
      this.wire();
      this.bind();
      this.updateStatus();
      toast("Welcome to Enterprise Diagram Designer — press Ctrl+K for commands");
    }

    /* ============================================ selection helpers */
    selIds() { return [...store.selection]; }
    selShapes() { return store.selectedShapes(); }

    /* ============================================ clipboard */
    copy() {
      const shapes = store.selectedShapes();
      if (!shapes.length) return;
      const ids = new Set(shapes.map((s) => s.id));
      const conns = store.connectors.filter((c) => c.from && c.to && ids.has(c.from.shapeId) && ids.has(c.to.shapeId));
      this.clipboard = { shapes: clone(shapes), connectors: clone(conns) };
      try { navigator.clipboard && navigator.clipboard.writeText(JSON.stringify(this.clipboard)); } catch (e) {}
      toast(`Copied ${shapes.length} object(s)`);
    }
    cut() { this.copy(); this.deleteSelection(); }
    paste() {
      if (!this.clipboard) return;
      const map = new Map();
      DD.history.transaction("Paste", () => {
        const newIds = [];
        this.clipboard.shapes.forEach((s) => {
          const ns = clone(s); ns.id = uid("s"); ns.x += 24; ns.y += 24; ns.layerId = store.activeLayer;
          store.shapes.push(ns); map.set(s.id, ns.id); newIds.push(ns.id);
        });
        this.clipboard.connectors.forEach((c) => {
          const nc = clone(c); nc.id = uid("c"); nc.layerId = store.activeLayer;
          if (nc.from && map.has(nc.from.shapeId)) nc.from.shapeId = map.get(nc.from.shapeId);
          if (nc.to && map.has(nc.to.shapeId)) nc.to.shapeId = map.get(nc.to.shapeId);
          store.connectors.push(nc); newIds.push(nc.id);
        });
        store.markDirty();
        bus.emit(EV.DOC_LOADED, store.doc);
        store.select(newIds);
      });
    }
    duplicate() { if (store.selection.size) { this.copy(); this.paste(); } }

    deleteSelection() {
      const ids = this.selIds(); if (!ids.length) return;
      DD.history.transaction("Delete", () => store.remove(ids));
    }

    /* ============================================ z-order & arrange */
    zorder(op) { const ids = this.selIds(); if (!ids.length) return; DD.history.transaction(op, () => store[op](ids)); bus.emit(EV.DOC_LOADED, store.doc); }

    nudge(dx, dy) {
      const shapes = store.selectedShapes(); if (!shapes.length) return;
      DD.history.transaction("Move", () => shapes.forEach((s) => store.update(s.id, { x: s.x + dx, y: s.y + dy })));
    }

    align(mode) {
      const shapes = store.selectedShapes(); if (shapes.length < 1) return;
      const box = unionBox(shapes);
      DD.history.transaction("Align " + mode, () => shapes.forEach((s) => {
        if (mode === "left") store.update(s.id, { x: box.x });
        else if (mode === "right") store.update(s.id, { x: box.x2 - s.w });
        else if (mode === "centerH") store.update(s.id, { x: box.cx - s.w / 2 });
        else if (mode === "top") store.update(s.id, { y: box.y });
        else if (mode === "bottom") store.update(s.id, { y: box.y2 - s.h });
        else if (mode === "middle") store.update(s.id, { y: box.cy - s.h / 2 });
      }));
      bus.emit(EV.DOC_LOADED, store.doc);
    }

    distribute(axis) {
      const shapes = store.selectedShapes(); if (shapes.length < 3) return toast("Select 3+ shapes to distribute");
      const key = axis === "h" ? "x" : "y", size = axis === "h" ? "w" : "h";
      const sorted = [...shapes].sort((a, b) => a[key] - b[key]);
      const first = sorted[0], last = sorted[sorted.length - 1];
      const total = (last[key] + last[size]) - first[key];
      const span = sorted.reduce((acc, s) => acc + s[size], 0);
      const gap = (total - span) / (sorted.length - 1);
      let cursor = first[key];
      DD.history.transaction("Distribute", () => sorted.forEach((s) => { store.update(s.id, { [key]: Math.round(cursor) }); cursor += s[size] + gap; }));
      bus.emit(EV.DOC_LOADED, store.doc);
    }

    /* ============================================ grouping */
    group() {
      const shapes = store.selectedShapes(); if (shapes.length < 2) return;
      const gid = uid("grp");
      DD.history.transaction("Group", () => shapes.forEach((s) => store.update(s.id, { groupId: gid })));
      toast("Grouped " + shapes.length + " shapes");
    }
    ungroup() {
      const shapes = store.selectedShapes();
      DD.history.transaction("Ungroup", () => shapes.forEach((s) => { if (s.groupId) store.update(s.id, { groupId: null }); }));
      toast("Ungrouped");
    }
    _expandGroups() {
      if (this._selGuard) return;
      const extra = new Set();
      store.selectedShapes().forEach((s) => {
        if (s.groupId) store.shapes.forEach((o) => { if (o.groupId === s.groupId) extra.add(o.id); });
      });
      const cur = new Set(store.selection);
      let changed = false; extra.forEach((id) => { if (!cur.has(id)) { cur.add(id); changed = true; } });
      if (changed) { this._selGuard = true; store.select([...cur]); this._selGuard = false; }
    }

    /* ============================================ text editing */
    editText(id) {
      const o = store.getObject(id); if (!o) return;
      const isConn = !o.type;
      const c = DD.canvas;
      let sx, sy, w, h, fs;
      if (isConn) { const r = DD.connectors.routePath(o); const p = c.worldToScreen(r.mid.x, r.mid.y); sx = p.x - 60; sy = p.y - 14; w = 120; h = 28; fs = 12; }
      else { const tl = c.worldToScreen(o.x, o.y); sx = tl.x; sy = tl.y; w = o.w * c.scale; h = o.h * c.scale; fs = ((o.textStyle && o.textStyle.fontSize) || 13) * c.scale; }
      const ta = el("textarea", { class: "inline-editor" });
      Object.assign(ta.style, {
        position: "fixed", left: sx + "px", top: sy + "px", width: w + "px", height: h + "px",
        fontSize: fs + "px", textAlign: (o.textStyle && o.textStyle.align) || "center",
        border: "2px solid var(--accent)", borderRadius: "4px", padding: "2px 4px",
        resize: "none", zIndex: 350, background: "var(--bg-panel)", color: "var(--text)",
        fontFamily: "var(--font-ui)", outline: "none", boxShadow: "var(--shadow-3)",
      });
      ta.value = (isConn ? o.label : o.text) || "";
      document.body.appendChild(ta); ta.focus(); ta.select();
      const commit = () => {
        DD.history.transaction("Edit text", () => store.update(id, isConn ? { label: ta.value } : { text: ta.value }));
        ta.remove();
      };
      ta.addEventListener("blur", commit);
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { ta.value = (isConn ? o.label : o.text) || ""; ta.blur(); }
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ta.blur(); }
      });
    }

    /* ============================================ theme & grid */
    setTheme(t) { document.documentElement.dataset.theme = t; store.settings.theme = t; bus.emit(EV.THEME, t); store.markDirty(); DD.properties.renderDoc(); }
    cycleTheme() { const cur = document.documentElement.dataset.theme || "light"; this.setTheme(THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length]); toast("Theme: " + (document.documentElement.dataset.theme)); }
    cycleGrid() { const order = ["dot", "line", "none"]; const cur = store.settings.gridType; store.settings.gridType = order[(order.indexOf(cur) + 1) % order.length]; DD.canvas.applyGrid(); store.markDirty(); DD.properties.renderDoc(); toast("Grid: " + store.settings.gridType); }

    /* ============================================ file ops */
    openFileDialog() { $("#fileInput").click(); }

    /* ============================================ menus */
    menus() {
      return {
        file: [
          { label: "New", key: "", run: () => { if (!store.isDirty() || confirm("Discard unsaved changes?")) store.reset(); } },
          { label: "Open file…", key: "Ctrl+O", run: () => this.openFileDialog() },
          { label: "Open recent…", run: () => this.openRecent() },
          { divider: true },
          { label: "Save", key: "Ctrl+S", run: () => DD.storage.save() },
          { label: "Save as JSON", run: () => DD.export.json() },
          { divider: true },
          { label: "Templates…", run: () => DD.templates.openGallery() },
          { label: "Print / PDF", key: "Ctrl+P", run: () => DD.export.print() },
        ],
        edit: [
          { label: "Undo", key: "Ctrl+Z", run: () => DD.history.undo() },
          { label: "Redo", key: "Ctrl+Y", run: () => DD.history.redo() },
          { divider: true },
          { label: "Cut", key: "Ctrl+X", run: () => this.cut() },
          { label: "Copy", key: "Ctrl+C", run: () => this.copy() },
          { label: "Paste", key: "Ctrl+V", run: () => this.paste() },
          { label: "Duplicate", key: "Ctrl+D", run: () => this.duplicate() },
          { label: "Delete", key: "Del", run: () => this.deleteSelection() },
          { divider: true },
          { label: "Select all", key: "Ctrl+A", run: () => store.selectAll() },
        ],
        view: [
          { label: "Zoom in", key: "+", run: () => DD.canvas.zoom(1.2) },
          { label: "Zoom out", key: "-", run: () => DD.canvas.zoom(1 / 1.2) },
          { label: "Reset zoom", key: "Ctrl+0", run: () => DD.canvas.resetZoom() },
          { label: "Fit to screen", key: "Home", run: () => DD.canvas.fit() },
          { divider: true },
          { label: "Cycle grid", key: "G", run: () => this.cycleGrid() },
          { label: "Cycle theme", key: "T", run: () => this.cycleTheme() },
        ],
        arrange: [
          { label: "Bring to front", run: () => this.zorder("bringToFront") },
          { label: "Bring forward", key: "]", run: () => this.zorder("bringForward") },
          { label: "Send backward", key: "[", run: () => this.zorder("sendBackward") },
          { label: "Send to back", run: () => this.zorder("sendToBack") },
          { divider: true },
          { label: "Group", key: "Ctrl+G", run: () => this.group() },
          { label: "Ungroup", key: "Ctrl+Shift+G", run: () => this.ungroup() },
          { divider: true },
          { label: "Align left", run: () => this.align("left") },
          { label: "Align center", run: () => this.align("centerH") },
          { label: "Align right", run: () => this.align("right") },
          { label: "Distribute horizontally", run: () => this.distribute("h") },
        ],
        help: [
          { label: "Command palette", key: "Ctrl+K", run: () => this.toggleCommandPalette() },
          { label: "Keyboard shortcuts", run: () => this.showShortcuts() },
          { label: "About", run: () => this.about() },
        ],
      };
    }

    openMenu(name, anchor) {
      const items = this.menus()[name]; if (!items) return;
      this.dropdownFrom(items, anchor);
    }
    dropdownFrom(items, anchor) {
      const dd = $("#dropdown"); dd.textContent = ""; dd.hidden = false;
      items.forEach((it) => {
        if (it.divider) return dd.appendChild(el("div", { class: "menu-divider" }));
        const row = el("div", { class: "menu-row" }, [el("span", { text: it.label }), it.key ? el("span", { class: "menu-row__key", text: it.key }) : null]);
        row.addEventListener("click", () => { dd.hidden = true; it.run(); });
        dd.appendChild(row);
      });
      const r = anchor.getBoundingClientRect();
      dd.style.left = r.left + "px"; dd.style.top = (r.bottom + 4) + "px";
      this._activeMenuAnchor = anchor; anchor.classList && anchor.classList.add("is-open");
    }

    /* ============================================ export menu */
    openExportMenu() {
      const items = [
        { label: "PNG (2×)", run: () => DD.export.png({ scale: 2 }) },
        { label: "PNG high-res (4×)", run: () => DD.export.png({ scale: 4 }) },
        { label: "Transparent PNG", run: () => DD.export.png({ scale: 2, transparent: true }) },
        { label: "SVG (vector)", run: () => DD.export.svg() },
        { divider: true },
        { label: "JSON (project)", run: () => DD.export.json() },
        { label: "HTML", run: () => DD.export.html() },
        { label: "Print / PDF", run: () => DD.export.print() },
      ];
      this.dropdownFrom(items, $("#btnExport"));
    }

    /* ============================================ context menu */
    contextMenu({ x, y, hit }) {
      const cm = $("#contextMenu"); cm.textContent = ""; cm.hidden = false;
      const has = store.selection.size > 0;
      const items = has ? [
        { label: "Cut", run: () => this.cut() },
        { label: "Copy", run: () => this.copy() },
        { label: "Duplicate", run: () => this.duplicate() },
        { label: "Delete", run: () => this.deleteSelection() },
        { divider: true },
        { label: "Bring to front", run: () => this.zorder("bringToFront") },
        { label: "Send to back", run: () => this.zorder("sendToBack") },
        { divider: true },
        { label: "Edit text (F2)", run: () => this.editText(this.selIds()[0]) },
      ] : [
        { label: "Paste", run: () => this.paste() },
        { label: "Select all", run: () => store.selectAll() },
        { divider: true },
        { label: "Templates…", run: () => DD.templates.openGallery() },
        { label: "Fit to screen", run: () => DD.canvas.fit() },
      ];
      items.forEach((it) => {
        if (it.divider) return cm.appendChild(el("div", { class: "menu-divider" }));
        const row = el("div", { class: "menu-row" }, [el("span", { text: it.label })]);
        row.addEventListener("click", () => { cm.hidden = true; it.run(); });
        cm.appendChild(row);
      });
      cm.style.left = Math.min(x, innerWidth - 220) + "px";
      cm.style.top = Math.min(y, innerHeight - cm.offsetHeight - 10) + "px";
    }

    /* ============================================ command palette */
    commands() {
      const c = [];
      Object.entries(this.menus()).forEach(([cat, items]) => items.forEach((it) => { if (!it.divider) c.push({ name: it.label, cat, run: it.run }); }));
      c.push({ name: "Export PNG", cat: "export", run: () => DD.export.png({ scale: 2 }) });
      c.push({ name: "Export SVG", cat: "export", run: () => DD.export.svg() });
      c.push({ name: "Export JSON", cat: "export", run: () => DD.export.json() });
      // quick-add shapes
      DD.shapes.list().forEach((d) => c.push({ name: "Add: " + d.label, cat: "shape", run: () => this.quickAdd(d.type) }));
      // apply templates
      Object.entries(DD.templates.list).forEach(([k, t]) => c.push({ name: "Template: " + t.name, cat: "template", run: () => DD.templates.apply(k, { replace: store.shapes.length === 0 }) }));
      return c;
    }
    quickAdd(type) {
      const c = DD.canvas; const r = c.svgEl.getBoundingClientRect();
      const w = c.screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
      const def = DD.shapes.get(type);
      DD.history.transaction("Add " + def.label, () => { const s = store.addShape(DD.shapes.create(type, c.snap(w.x - def.w / 2), c.snap(w.y - def.h / 2))); store.select(s.id); });
    }

    toggleCommandPalette() {
      const cp = $("#commandPalette");
      if (!cp.hidden) return this.closeCommandPalette();
      cp.hidden = false;
      const input = $("#commandInput"); input.value = ""; input.focus();
      this._cmds = this.commands(); this._cmdIdx = 0;
      this.renderCommands("");
    }
    closeCommandPalette() { $("#commandPalette").hidden = true; }
    renderCommands(q) {
      const list = $("#commandList"); list.textContent = "";
      q = q.toLowerCase();
      const items = this._cmds.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 40);
      this._cmdFiltered = items; this._cmdIdx = 0;
      items.forEach((c, i) => {
        const li = el("li", { class: i === 0 ? "active" : "" }, [el("span", { text: c.name }), el("span", { class: "cmd-cat", text: c.cat })]);
        li.addEventListener("click", () => { this.closeCommandPalette(); c.run(); });
        list.appendChild(li);
      });
    }

    /* ============================================ modal */
    modal(title, bodyNode, footNodes) {
      const host = $("#modalHost"); host.hidden = false; host.textContent = "";
      const m = el("div", { class: "modal" }, [
        el("div", { class: "modal__head" }, [el("span", { text: title }), (() => { const b = el("button", { class: "modal__close", html: "×" }); b.addEventListener("click", () => this.closeModal()); return b; })()]),
        el("div", { class: "modal__body" }, [bodyNode]),
        footNodes ? el("div", { class: "modal__foot" }, footNodes) : null,
      ]);
      host.appendChild(m);
      host.addEventListener("pointerdown", (e) => { if (e.target === host) this.closeModal(); }, { once: true });
    }
    closeModal() { $("#modalHost").hidden = true; $("#modalHost").textContent = ""; }

    openRecent() {
      const recent = DD.storage.recent();
      const body = el("div", {}, recent.length ? recent.map((r) => {
        const row = el("div", { class: "menu-row" }, [el("span", { text: r.name }), el("span", { class: "menu-row__key", text: new Date(r.modified).toLocaleString() })]);
        row.addEventListener("click", () => { this.closeModal(); DD.storage.open(r.id); });
        return row;
      }) : [el("div", { class: "empty-hint", text: "No recent files yet." })]);
      this.modal("Recent files", body);
    }

    showShortcuts() {
      const rows = [
        ["Ctrl+Z / Ctrl+Y", "Undo / Redo"], ["Ctrl+C / V / X", "Copy / Paste / Cut"], ["Ctrl+D", "Duplicate"],
        ["Ctrl+G / Ctrl+Shift+G", "Group / Ungroup"], ["Delete", "Delete selection"], ["Ctrl+A", "Select all"],
        ["Ctrl+S / Ctrl+O", "Save / Open"], ["Ctrl+E", "Export"], ["Ctrl+P", "Print"], ["Ctrl+K", "Command palette"],
        ["V / H / C", "Select / Pan / Connector tool"], ["F2", "Edit text"], ["Home", "Fit to screen"],
        ["Space + drag", "Pan canvas"], ["Mouse wheel", "Zoom"], ["Arrows / Shift+Arrows", "Nudge 1px / 10px"],
        ["T / G", "Cycle theme / grid"], ["[ / ]", "Send backward / bring forward"],
      ];
      const body = el("div", {}, rows.map(([k, d]) => el("div", { class: "menu-row" }, [el("span", { text: d }), el("span", { class: "menu-row__key", text: k })])));
      this.modal("Keyboard shortcuts", body);
    }
    about() {
      this.modal("About", el("div", { class: "empty-hint", html: `<b style="font-size:16px">Enterprise Diagram Designer</b><br>Version ${DD.version}<br><br>A professional, browser-based diagramming tool.<br>No server · no build · no install.<br><br>Built with native HTML5, CSS3, SVG and ES2024.` }));
    }

    closeAll() { $("#dropdown").hidden = true; $("#contextMenu").hidden = true; this.closeCommandPalette(); }

    /* ============================================ status bar */
    updateStatus() {
      const sel = store.getSelection();
      $("#statusSelection").textContent = sel.length ? (sel.length === 1 ? this._desc(sel[0]) : sel.length + " objects selected") : "No selection";
      $("#statusObjects").textContent = `${store.shapes.length + store.connectors.length} objects`;
      const st = $("#saveStatus"); st.textContent = store.isDirty() ? "Unsaved" : "Saved"; st.dataset.dirty = store.isDirty();
    }
    _desc(o) {
      if (o.type) { const d = DD.shapes.get(o.type); return `${d.label} · ${Math.round(o.w)}×${Math.round(o.h)} @ (${Math.round(o.x)}, ${Math.round(o.y)})`; }
      return "Connector";
    }

    /* ============================================ wiring */
    wire() {
      $("#btnExport").addEventListener("click", () => this.openExportMenu());
      $("#btnTheme").addEventListener("click", () => this.cycleTheme());
      $("#btnCommand").addEventListener("click", () => this.toggleCommandPalette());
      $("#zoomIn").addEventListener("click", () => DD.canvas.zoom(1.2));
      $("#zoomOut").addEventListener("click", () => DD.canvas.zoom(1 / 1.2));
      $("#zoomFit").addEventListener("click", () => DD.canvas.fit());
      $("#zoomLevel").addEventListener("click", () => DD.canvas.resetZoom());

      $("#docName").addEventListener("change", (e) => { store.doc.name = e.target.value || "Untitled Diagram"; store.markDirty(); });

      $("#fileInput").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) DD.import.file(f); e.target.value = ""; });

      // command palette input
      const ci = $("#commandInput");
      ci.addEventListener("input", () => this.renderCommands(ci.value));
      ci.addEventListener("keydown", (e) => {
        const list = $("#commandList"); const items = [...list.children];
        if (e.key === "ArrowDown") { e.preventDefault(); this._cmdIdx = Math.min(items.length - 1, this._cmdIdx + 1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); this._cmdIdx = Math.max(0, this._cmdIdx - 1); }
        else if (e.key === "Enter") { e.preventDefault(); const c = this._cmdFiltered[this._cmdIdx]; if (c) { this.closeCommandPalette(); c.run(); } return; }
        else if (e.key === "Escape") { this.closeCommandPalette(); return; }
        items.forEach((li, i) => li.classList.toggle("active", i === this._cmdIdx));
        if (items[this._cmdIdx]) items[this._cmdIdx].scrollIntoView({ block: "nearest" });
      });

      // close overlays on outside click
      document.addEventListener("pointerdown", (e) => {
        if (!e.target.closest("#dropdown") && !e.target.closest(".menu__item") && !e.target.closest("#btnExport")) {
          $("#dropdown").hidden = true;
          $$(".menu__item.is-open").forEach((m) => m.classList.remove("is-open"));
        }
        if (!e.target.closest("#contextMenu")) $("#contextMenu").hidden = true;
        if (!e.target.closest("#commandPalette") && !e.target.closest("#btnCommand")) this.closeCommandPalette();
      });
    }

    bind() {
      bus.on("ui:editText", (id) => this.editText(id));
      bus.on("ui:contextmenu", (p) => this.contextMenu(p));
      bus.on(EV.SELECTION, () => { this._expandGroups(); this.updateStatus(); });
      bus.on(EV.DOC_CHANGED, DD.util.debounce(() => this.updateStatus(), 120));
      bus.on(EV.DOC_LOADED, () => { this.updateStatus(); document.documentElement.dataset.theme = store.settings.theme || "light"; });
      bus.on(EV.ZOOM, (s) => { $("#zoomLevel").textContent = Math.round(s * 100) + "%"; });
      // pointer coords
      DD.canvas.svgEl.addEventListener("pointermove", DD.util.throttle((e) => {
        const w = DD.canvas.screenToWorld(e.clientX, e.clientY);
        $("#statusPointer").textContent = `${Math.round(w.x)}, ${Math.round(w.y)}`;
      }, 50));
      // apply stored theme
      document.documentElement.dataset.theme = store.settings.theme || "light";
    }
  }

  // Register service worker for PWA / offline (best-effort, ignored on file://)
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  DD.app = new App();
})();
