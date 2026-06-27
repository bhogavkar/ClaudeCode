/* =====================================================================
   store.js — Central application state (MVVM model layer)
   Holds the document model + selection. All mutations go through here so
   history & rendering stay consistent. Emits events via DD.bus.
   ===================================================================== */
(function () {
  "use strict";
  const DD = window.DD;
  const { uid, clone, deepMerge } = DD.util;
  const { bus, EV } = DD;

  const DEFAULT_SETTINGS = {
    gridType: "dot",      // dot | line | none
    gridSize: 20,
    snap: true,
    snapTolerance: 6,
    smartGuides: true,
    theme: "light",
    background: "#fbfcfe",
    pageWidth: 1654,      // A4 landscape @ 150dpi-ish, for print framing
    pageHeight: 1169,
    showPage: false,
  };

  function newDocument(name = "Untitled Diagram") {
    return {
      id: uid("doc"),
      name,
      created: Date.now(),
      modified: Date.now(),
      schema: 1,
      settings: clone(DEFAULT_SETTINGS),
      layers: [{ id: uid("layer"), name: "Layer 1", visible: true, locked: false, opacity: 1 }],
      shapes: [],
      connectors: [],
    };
  }

  class Store {
    constructor() {
      this.doc = newDocument();
      this.activeLayer = this.doc.layers[0].id;
      this.selection = new Set();   // ids of shapes & connectors
      this._dirty = false;
      this._suspend = false;        // when true, mutations don't push history
    }

    /* ---------------------------------------------------- document */
    load(doc, { silent = false } = {}) {
      this.doc = this._migrate(doc);
      this.activeLayer = (this.doc.layers[0] || {}).id;
      this.selection.clear();
      this._dirty = false;
      if (!silent) {
        bus.emit(EV.DOC_LOADED, this.doc);
        bus.emit(EV.SELECTION, this.getSelection());
      }
    }

    reset(name) { this.load(newDocument(name)); DD.util.toast("New diagram created"); }

    _migrate(doc) {
      // Fill any missing fields from defaults — forward compatible loading.
      doc.settings = deepMerge(clone(DEFAULT_SETTINGS), doc.settings || {});
      doc.layers = doc.layers && doc.layers.length ? doc.layers : newDocument().layers;
      doc.shapes ||= []; doc.connectors ||= [];
      doc.shapes.forEach((s) => { s.style ||= {}; s.layerId ||= doc.layers[0].id; });
      doc.connectors.forEach((c) => { c.style ||= {}; c.layerId ||= doc.layers[0].id; });
      return doc;
    }

    markDirty() {
      this._dirty = true;
      this.doc.modified = Date.now();
      bus.emit(EV.DOC_CHANGED, this.doc);
    }
    isDirty() { return this._dirty; }
    markClean() { this._dirty = false; bus.emit(EV.DOC_CHANGED, this.doc); }

    /* ---------------------------------------------------- queries */
    getShape(id) { return this.doc.shapes.find((s) => s.id === id); }
    getConnector(id) { return this.doc.connectors.find((c) => c.id === id); }
    getObject(id) { return this.getShape(id) || this.getConnector(id); }
    get shapes() { return this.doc.shapes; }
    get connectors() { return this.doc.connectors; }
    get layers() { return this.doc.layers; }
    get settings() { return this.doc.settings; }

    layerOf(id) { const o = this.getObject(id); return o && this.doc.layers.find((l) => l.id === o.layerId); }
    isEditable(id) {
      const layer = this.layerOf(id);
      const o = this.getObject(id);
      return layer && layer.visible && !layer.locked && o && !o.locked;
    }
    visibleShapes() { return this.doc.shapes.filter((s) => { const l = this.doc.layers.find((x) => x.id === s.layerId); return !l || l.visible; }); }
    visibleConnectors() { return this.doc.connectors.filter((c) => { const l = this.doc.layers.find((x) => x.id === c.layerId); return !l || l.visible; }); }

    /* ---------------------------------------------------- shape mutations */
    addShape(shape) {
      const s = Object.assign({
        id: uid("s"), type: "rectangle", x: 0, y: 0, w: 120, h: 70,
        rotation: 0, text: "", layerId: this.activeLayer, locked: false, style: {},
      }, shape);
      s.layerId ||= this.activeLayer;
      this.doc.shapes.push(s);
      bus.emit(EV.SHAPE_ADDED, s);
      this.markDirty();
      return s;
    }

    addConnector(conn) {
      const c = Object.assign({
        id: uid("c"), from: null, to: null, points: null,
        routing: "orthogonal", layerId: this.activeLayer, label: "", style: {},
        arrowStart: "none", arrowEnd: "filled",
      }, conn);
      c.layerId ||= this.activeLayer;
      this.doc.connectors.push(c);
      bus.emit(EV.SHAPE_ADDED, c);
      this.markDirty();
      return c;
    }

    /** Patch fields on a shape or connector. */
    update(id, patch, { merge = true } = {}) {
      const o = this.getObject(id);
      if (!o) return;
      for (const k in patch) {
        if (merge && k === "style" && typeof patch.style === "object") Object.assign(o.style, patch.style);
        else if (merge && k === "textStyle" && typeof patch.textStyle === "object") o.textStyle = Object.assign({}, o.textStyle, patch.textStyle);
        else o[k] = patch[k];
      }
      bus.emit(EV.SHAPE_UPDATED, o);
      this.markDirty();
      return o;
    }

    /** Bulk update over current selection or given ids. */
    updateMany(ids, patch) { ids.forEach((id) => this.update(id, patch)); }

    remove(ids) {
      const set = new Set(Array.isArray(ids) ? ids : [ids]);
      // Also drop connectors attached to removed shapes.
      this.doc.connectors = this.doc.connectors.filter((c) => {
        const attached = (c.from && set.has(c.from.shapeId)) || (c.to && set.has(c.to.shapeId));
        if (set.has(c.id) || attached) { bus.emit(EV.SHAPE_REMOVED, c); return false; }
        return true;
      });
      this.doc.shapes = this.doc.shapes.filter((s) => {
        if (set.has(s.id)) { bus.emit(EV.SHAPE_REMOVED, s); return false; }
        return true;
      });
      set.forEach((id) => this.selection.delete(id));
      bus.emit(EV.SELECTION, this.getSelection());
      this.markDirty();
    }

    /* ---------------------------------------------------- z-order */
    _arr(id) { return this.getShape(id) ? this.doc.shapes : this.doc.connectors; }
    bringToFront(ids) { this._reorder(ids, "front"); }
    sendToBack(ids) { this._reorder(ids, "back"); }
    bringForward(ids) { this._reorder(ids, "fwd"); }
    sendBackward(ids) { this._reorder(ids, "back1"); }
    _reorder(ids, mode) {
      const list = Array.isArray(ids) ? ids : [ids];
      list.forEach((id) => {
        const arr = this._arr(id); const i = arr.findIndex((o) => o.id === id);
        if (i < 0) return; const [o] = arr.splice(i, 1);
        if (mode === "front") arr.push(o);
        else if (mode === "back") arr.unshift(o);
        else if (mode === "fwd") arr.splice(Math.min(arr.length, i + 1), 0, o);
        else if (mode === "back1") arr.splice(Math.max(0, i - 1), 0, o);
      });
      this.markDirty();
    }

    /* ---------------------------------------------------- layers */
    addLayer(name) {
      const l = { id: uid("layer"), name: name || `Layer ${this.doc.layers.length + 1}`, visible: true, locked: false, opacity: 1 };
      this.doc.layers.push(l); this.activeLayer = l.id;
      bus.emit(EV.LAYERS); this.markDirty(); return l;
    }
    removeLayer(id) {
      if (this.doc.layers.length <= 1) return DD.util.toast("Cannot delete the last layer", "error");
      this.remove(this.doc.shapes.filter((s) => s.layerId === id).map((s) => s.id));
      this.doc.layers = this.doc.layers.filter((l) => l.id !== id);
      if (this.activeLayer === id) this.activeLayer = this.doc.layers[0].id;
      bus.emit(EV.LAYERS); this.markDirty();
    }
    updateLayer(id, patch) {
      const l = this.doc.layers.find((x) => x.id === id);
      if (l) { Object.assign(l, patch); bus.emit(EV.LAYERS); this.markDirty(); }
    }
    moveLayer(id, dir) {
      const i = this.doc.layers.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= this.doc.layers.length) return;
      const [l] = this.doc.layers.splice(i, 1); this.doc.layers.splice(j, 0, l);
      bus.emit(EV.LAYERS); this.markDirty();
    }

    /* ---------------------------------------------------- selection */
    getSelection() { return [...this.selection].map((id) => this.getObject(id)).filter(Boolean); }
    selectedShapes() { return [...this.selection].map((id) => this.getShape(id)).filter(Boolean); }
    selectedConnectors() { return [...this.selection].map((id) => this.getConnector(id)).filter(Boolean); }
    isSelected(id) { return this.selection.has(id); }

    select(ids, { add = false } = {}) {
      const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
      if (!add) this.selection.clear();
      list.forEach((id) => this.selection.add(id));
      bus.emit(EV.SELECTION, this.getSelection());
    }
    toggleSelect(id) {
      if (this.selection.has(id)) this.selection.delete(id); else this.selection.add(id);
      bus.emit(EV.SELECTION, this.getSelection());
    }
    clearSelection() { if (this.selection.size) { this.selection.clear(); bus.emit(EV.SELECTION, []); } }
    selectAll() { this.select(this.visibleShapes().map((s) => s.id).concat(this.visibleConnectors().map((c) => c.id))); }
  }

  DD.store = new Store();
  DD.newDocument = newDocument;
})();
