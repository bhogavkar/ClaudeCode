/* =====================================================================
   import.js — Import engine: JSON, SVG, Draw.io (mxGraph) XML, CSV.
   ===================================================================== */
(function () {
  "use strict";
  const DD = window.DD;
  const { store, bus, EV } = DD;
  const { uid, toast } = DD.util;

  function read(file) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });
  }

  const Import = {
    async file(file) {
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      try {
        const text = await read(file);
        if (ext === "json") return this.json(text, file.name);
        if (ext === "svg") return this.svg(text, file.name);
        if (ext === "csv") return this.csv(text, file.name);
        if (ext === "xml" || ext === "drawio") return this.drawio(text, file.name);
        toast("Unsupported file type: ." + ext, "error");
      } catch (err) { toast("Import failed: " + err.message, "error"); }
    },

    json(text, name) {
      const doc = JSON.parse(text);
      if (!doc.shapes) throw new Error("Not a diagram JSON");
      DD.history.transaction("Import JSON", () => store.load(doc));
      document.getElementById("docName").value = doc.name || name || "Imported";
      toast("Imported diagram"); setTimeout(() => DD.canvas.fit(), 30);
    },

    /** Embed an SVG as a single image-fill shape (simple, lossless preview). */
    svg(text, name) {
      const parser = new DOMParser();
      const d = parser.parseFromString(text, "image/svg+xml");
      const root = d.documentElement;
      let w = parseFloat(root.getAttribute("width")) || 400, h = parseFloat(root.getAttribute("height")) || 300;
      if (root.viewBox && root.viewBox.baseVal && root.viewBox.baseVal.width) { w = root.viewBox.baseVal.width; h = root.viewBox.baseVal.height; }
      const dataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(text)));
      DD.history.transaction("Import SVG", () => {
        const s = store.addShape({ type: "rectangle", x: 60, y: 60, w, h, style: { fill: "transparent", stroke: "transparent" }, image: dataUrl });
        // store image — render via a simple overlay is out of scope; we keep ref + note
        store.update(s.id, { text: "" });
        store.select(s.id);
      });
      toast("SVG imported (embedded). Name: " + (name || "svg"));
      setTimeout(() => DD.canvas.fit(), 30);
    },

    /** CSV → nodes laid out in a grid. First column = label, optional 2nd = group. */
    csv(text, name) {
      const rows = text.trim().split(/\r?\n/).map((r) => r.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
      const header = rows[0].map((h) => h.toLowerCase());
      const li = Math.max(0, header.indexOf("label")), pi = header.indexOf("parent");
      const data = rows.slice(1);
      const byLabel = new Map();
      DD.history.transaction("Import CSV", () => {
        data.forEach((r, i) => {
          const label = r[li < 0 ? 0 : li] || "Item " + (i + 1);
          const s = store.addShape(Object.assign(DD.shapes.create("rounded", 80 + (i % 5) * 170, 80 + Math.floor(i / 5) * 110), { text: label }));
          byLabel.set(label, s);
        });
        if (pi >= 0) data.forEach((r) => {
          const child = byLabel.get(r[li < 0 ? 0 : li]); const parent = byLabel.get(r[pi]);
          if (child && parent) store.addConnector({ from: { shapeId: parent.id, port: "s" }, to: { shapeId: child.id, port: "n" } });
        });
      });
      bus.emit(EV.DOC_LOADED, store.doc); toast(`Imported ${data.length} rows from CSV`); setTimeout(() => DD.canvas.fit(), 30);
    },

    /** Basic Draw.io / mxGraph import: vertices → shapes, edges → connectors. */
    drawio(text, name) {
      const parser = new DOMParser();
      let doc = parser.parseFromString(text, "text/xml");
      // handle compressed <diagram> wrapper that contains plain mxGraphModel
      let model = doc.querySelector("mxGraphModel");
      if (!model) throw new Error("No mxGraphModel found (compressed .drawio not supported — export as uncompressed XML)");
      const cells = Array.from(model.querySelectorAll("mxCell"));
      const idMap = new Map();
      DD.history.transaction("Import Draw.io", () => {
        store.doc.shapes = []; store.doc.connectors = []; store.selection.clear();
        cells.forEach((cell) => {
          const geo = cell.querySelector("mxGeometry");
          if (cell.getAttribute("vertex") === "1" && geo) {
            const style = cell.getAttribute("style") || "";
            let type = "rectangle";
            if (style.includes("ellipse")) type = "ellipse";
            else if (style.includes("rhombus")) type = "fc-decision";
            else if (style.includes("rounded=1")) type = "rounded";
            else if (style.includes("cylinder")) type = "cylinder";
            const s = store.addShape({
              type, x: +geo.getAttribute("x") || 0, y: +geo.getAttribute("y") || 0,
              w: +geo.getAttribute("width") || 120, h: +geo.getAttribute("height") || 60,
              text: (cell.getAttribute("value") || "").replace(/<[^>]+>/g, " ").trim(),
            });
            idMap.set(cell.getAttribute("id"), s.id);
          }
        });
        cells.forEach((cell) => {
          if (cell.getAttribute("edge") === "1") {
            const from = idMap.get(cell.getAttribute("source")), to = idMap.get(cell.getAttribute("target"));
            if (from && to) store.addConnector({ from: { shapeId: from, port: "e" }, to: { shapeId: to, port: "w" }, label: (cell.getAttribute("value") || "").trim() });
          }
        });
      });
      store.doc.name = name || "Draw.io import";
      document.getElementById("docName").value = store.doc.name;
      bus.emit(EV.DOC_LOADED, store.doc); toast("Imported Draw.io diagram"); setTimeout(() => DD.canvas.fit(), 30);
    },
  };

  DD.import = Import;
})();
