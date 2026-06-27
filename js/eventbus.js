/* =====================================================================
   eventbus.js — Observer pattern. Decouples all modules.
   Usage: DD.bus.on("event", fn); DD.bus.emit("event", payload);
   ===================================================================== */
(function () {
  "use strict";
  const DD = window.DD;

  class EventBus {
    constructor() { this._h = new Map(); }

    /** Subscribe. Returns an unsubscribe function. */
    on(type, handler) {
      if (!this._h.has(type)) this._h.set(type, new Set());
      this._h.get(type).add(handler);
      return () => this.off(type, handler);
    }

    once(type, handler) {
      const off = this.on(type, (p) => { off(); handler(p); });
      return off;
    }

    off(type, handler) {
      const set = this._h.get(type);
      if (set) set.delete(handler);
    }

    emit(type, payload) {
      const set = this._h.get(type);
      if (set) for (const h of [...set]) {
        try { h(payload); }
        catch (err) { console.error(`[bus] handler error for "${type}"`, err); }
      }
      // Wildcard listeners receive (type, payload)
      const wild = this._h.get("*");
      if (wild) for (const h of [...wild]) { try { h(type, payload); } catch (e) { console.error(e); } }
    }
  }

  DD.bus = new EventBus();

  /** Canonical event names — single source of truth. */
  DD.EV = {
    DOC_LOADED: "doc:loaded",
    DOC_CHANGED: "doc:changed",        // any model mutation (debounced consumers re-render)
    DOC_META: "doc:meta",              // name / settings changed
    SHAPE_ADDED: "shape:added",
    SHAPE_REMOVED: "shape:removed",
    SHAPE_UPDATED: "shape:updated",
    SELECTION: "selection:changed",
    HISTORY: "history:changed",
    ZOOM: "view:zoom",
    PAN: "view:pan",
    TOOL: "tool:changed",
    LAYERS: "layers:changed",
    THEME: "theme:changed",
    RENDER: "canvas:render",
  };
})();
