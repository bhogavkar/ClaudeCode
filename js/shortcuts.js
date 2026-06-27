/* =====================================================================
   shortcuts.js — Professional keyboard shortcuts (Visio/draw.io style).
   ===================================================================== */
(function () {
  "use strict";
  const DD = window.DD;
  const { store } = DD;

  function typing(e) {
    const t = e.target;
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  }

  const MAP = [
    { combo: "mod+z", run: () => DD.history.undo() },
    { combo: "mod+shift+z", run: () => DD.history.redo() },
    { combo: "mod+y", run: () => DD.history.redo() },
    { combo: "mod+c", run: () => DD.app.copy() },
    { combo: "mod+x", run: () => DD.app.cut() },
    { combo: "mod+v", run: () => DD.app.paste() },
    { combo: "mod+d", run: () => DD.app.duplicate() },
    { combo: "mod+a", run: () => store.selectAll() },
    { combo: "mod+g", run: () => DD.app.group() },
    { combo: "mod+shift+g", run: () => DD.app.ungroup() },
    { combo: "mod+s", run: () => DD.storage.save() },
    { combo: "mod+o", run: () => DD.app.openFileDialog() },
    { combo: "mod+e", run: () => DD.app.openExportMenu() },
    { combo: "mod+p", run: () => DD.export.print() },
    { combo: "mod+k", run: () => DD.app.toggleCommandPalette() },
    { combo: "mod+f", run: () => { DD.app.toggleCommandPalette(); } },
    { combo: "delete", run: () => DD.app.deleteSelection() },
    { combo: "backspace", run: () => DD.app.deleteSelection() },
    { combo: "escape", run: () => { store.clearSelection(); DD.app.closeAll(); } },
    { combo: "f2", run: () => { const id = [...store.selection][0]; if (id) DD.bus.emit("ui:editText", id); } },
    { combo: "home", run: () => DD.canvas.fit() },
    { combo: "v", run: () => DD.toolbar.selectTool("select") },
    { combo: "h", run: () => DD.toolbar.selectTool("pan") },
    { combo: "c", run: () => DD.toolbar.selectTool("connector") },
    { combo: "t", run: () => DD.app.cycleTheme() },
    { combo: "g", run: () => DD.app.cycleGrid() },
    { combo: "=", run: () => DD.canvas.zoom(1.2) },
    { combo: "+", run: () => DD.canvas.zoom(1.2) },
    { combo: "-", run: () => DD.canvas.zoom(1 / 1.2) },
    { combo: "mod+0", run: () => DD.canvas.resetZoom() },
    { combo: "]", run: () => DD.app.zorder("bringForward") },
    { combo: "[", run: () => DD.app.zorder("sendBackward") },
    // arrow nudging
    { combo: "arrowup", run: (e) => DD.app.nudge(0, e.shiftKey ? -10 : -1) },
    { combo: "arrowdown", run: (e) => DD.app.nudge(0, e.shiftKey ? 10 : 1) },
    { combo: "arrowleft", run: (e) => DD.app.nudge(e.shiftKey ? -10 : -1, 0) },
    { combo: "arrowright", run: (e) => DD.app.nudge(e.shiftKey ? 10 : 1, 0) },
  ];

  function comboOf(e) {
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push("mod");
    if (e.shiftKey) parts.push("shift");
    if (e.altKey) parts.push("alt");
    const k = (e.key || "").toLowerCase();
    const named = { " ": "space", "arrowup": "arrowup", "arrowdown": "arrowdown", "arrowleft": "arrowleft", "arrowright": "arrowright" };
    parts.push(named[k] || k);
    return parts.join("+");
  }

  window.addEventListener("keydown", (e) => {
    // allow command palette & search inputs through
    if (typing(e)) {
      if (e.key === "Escape") e.target.blur();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); DD.app.toggleCommandPalette(); }
      return;
    }
    const combo = comboOf(e);
    const hit = MAP.find((m) => m.combo === combo);
    if (hit) { e.preventDefault(); hit.run(e); }
  });

  DD.shortcuts = { MAP };
})();
