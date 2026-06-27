/* =====================================================================
   layers.js — Layer manager panel + inspector tab switching.
   ===================================================================== */
(function () {
  "use strict";
  const DD = window.DD;
  const { el, $, $$ } = DD.util;
  const { bus, EV, store } = DD;

  class Layers {
    constructor() {
      this.panel = $("#panelLayers");
      this.bindTabs();
      bus.on(EV.LAYERS, () => this.render());
      bus.on(EV.DOC_LOADED, () => this.render());
      bus.on(EV.SELECTION, () => this.render());
      this.render();
    }

    bindTabs() {
      $$(".tab").forEach((t) => t.addEventListener("click", () => {
        $$(".tab").forEach((x) => x.classList.remove("tab--active"));
        $$(".panel").forEach((x) => x.classList.remove("panel--active"));
        t.classList.add("tab--active");
        $("#panel" + t.dataset.tab[0].toUpperCase() + t.dataset.tab.slice(1)).classList.add("panel--active");
        if (t.dataset.tab === "document") DD.properties.renderDoc();
      }));
    }

    render() {
      const p = this.panel; p.textContent = "";
      const head = el("div", { class: "field__row", style: { marginBottom: "8px" } }, [
        (() => { const b = el("button", { class: "btn btn--block", text: "+ Add layer" }); b.addEventListener("click", () => DD.history.transaction("Add layer", () => store.addLayer())); return b; })(),
      ]);
      p.appendChild(head);
      const list = el("div", { class: "layer-list" });
      // top of panel = top of z-order, so iterate reversed
      [...store.layers].reverse().forEach((l) => list.appendChild(this.row(l)));
      p.appendChild(list);
    }

    row(l) {
      const count = store.shapes.filter((s) => s.layerId === l.id).length + store.connectors.filter((c) => c.layerId === l.id).length;
      const active = store.activeLayer === l.id;
      const row = el("div", { class: "layer-row" + (active ? " is-active" : "") });
      const vis = el("button", { class: "layer-row__btn", title: "Visibility", html: l.visible ? "👁" : "🚫" });
      vis.addEventListener("click", (e) => { e.stopPropagation(); DD.history.transaction("Toggle layer", () => store.updateLayer(l.id, { visible: !l.visible })); });
      const lock = el("button", { class: "layer-row__btn", title: "Lock", html: l.locked ? "🔒" : "🔓" });
      lock.addEventListener("click", (e) => { e.stopPropagation(); DD.history.transaction("Lock layer", () => store.updateLayer(l.id, { locked: !l.locked })); });
      const name = el("span", { class: "layer-row__name", text: l.name });
      const cnt = el("span", { class: "layer-row__count", text: count });
      const up = el("button", { class: "layer-row__btn", title: "Move up", html: "▲" });
      up.addEventListener("click", (e) => { e.stopPropagation(); DD.history.transaction("Reorder layer", () => store.moveLayer(l.id, 1)); });
      const down = el("button", { class: "layer-row__btn", title: "Move down", html: "▼" });
      down.addEventListener("click", (e) => { e.stopPropagation(); DD.history.transaction("Reorder layer", () => store.moveLayer(l.id, -1)); });
      const del = el("button", { class: "layer-row__btn", title: "Delete", html: "✕" });
      del.addEventListener("click", (e) => { e.stopPropagation(); DD.history.transaction("Delete layer", () => store.removeLayer(l.id)); });

      row.append(vis, lock, name, cnt, up, down, del);
      row.addEventListener("click", () => { store.activeLayer = l.id; this.render(); });
      // rename on double-click
      name.addEventListener("dblclick", () => {
        const inp = el("input", { value: l.name });
        name.textContent = ""; name.appendChild(inp); inp.focus(); inp.select();
        const commit = () => DD.history.transaction("Rename layer", () => store.updateLayer(l.id, { name: inp.value || l.name }));
        inp.addEventListener("blur", commit);
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
      });
      return row;
    }
  }

  DD.layers = new Layers();
})();
