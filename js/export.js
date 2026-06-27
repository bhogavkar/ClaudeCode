/* =====================================================================
   export.js — Export engine: JSON, SVG, PNG, HTML, Print/PDF.
   Builds a standalone SVG from the model with concrete (non-CSS-var)
   colors so exported files render identically anywhere.
   ===================================================================== */
(function () {
  "use strict";
  const DD = window.DD;
  const { svg, download, unionBox, readableText, escapeHtml } = DD.util;
  const { store } = DD;
  const SVGNS = DD.util.SVGNS;

  function sanitize(name) { return (name || "diagram").replace(/[^\w.-]+/g, "_"); }

  /* ----------------------------------------- build standalone SVG */
  function buildSVG({ padding = 24, background = null, scale = 1 } = {}) {
    const shapes = store.visibleShapes(), conns = store.visibleConnectors();
    const box = unionBox(shapes) || { x: 0, y: 0, w: 400, h: 300 };
    const W = box.w + padding * 2, H = box.h + padding * 2;
    const root = document.createElementNS(SVGNS, "svg");
    root.setAttribute("xmlns", SVGNS);
    root.setAttribute("viewBox", `${box.x - padding} ${box.y - padding} ${W} ${H}`);
    root.setAttribute("width", W * scale);
    root.setAttribute("height", H * scale);
    const defs = document.createElementNS(SVGNS, "defs");
    root.appendChild(defs);
    if (background) root.appendChild(svg("rect", { x: box.x - padding, y: box.y - padding, width: W, height: H, fill: background }));

    // connectors first
    conns.forEach((c) => root.appendChild(connEl(c)));
    shapes.forEach((s) => root.appendChild(shapeEl(s, defs)));
    return { root, W, H, box };
  }

  function shapeEl(s, defs) {
    const def = DD.shapes.get(s.type);
    const st = s.style || {};
    const g = svg("g", { transform: `translate(${s.x} ${s.y}) rotate(${s.rotation || 0} ${s.w / 2} ${s.h / 2})` });
    let fill = st.fill || "#ffffff";
    if (st.gradient) {
      const id = "g" + s.id.replace(/\W/g, "");
      const lg = svg("linearGradient", { id, x1: 0, y1: 0, x2: 0, y2: 1 });
      lg.appendChild(svg("stop", { offset: "0%", "stop-color": st.fill || "#fff" }));
      lg.appendChild(svg("stop", { offset: "100%", "stop-color": st.gradientTo || "#cfe0ff" }));
      defs.appendChild(lg); fill = `url(#${id})`;
    }
    g.setAttribute("fill", fill === "transparent" ? "none" : fill);
    g.setAttribute("stroke", st.stroke === "transparent" ? "none" : (st.stroke || "#1c2430"));
    g.setAttribute("stroke-width", (st.strokeWidth != null ? st.strokeWidth : 1.6) * (def.strokeBoost || 1));
    if (st.opacity != null) g.setAttribute("opacity", st.opacity);
    if (st.strokeStyle === "dashed") g.setAttribute("stroke-dasharray", "8 5");
    if (st.strokeStyle === "dotted") g.setAttribute("stroke-dasharray", "2 4");
    let geom = def.render(s); geom = Array.isArray(geom) ? geom : [geom];
    geom.forEach((e) => g.appendChild(e));
    if (s.text) textEl(g, s, def);
    return g;
  }

  function textEl(g, s, def) {
    const ts = s.textStyle || {}, fs = ts.fontSize || 13, pad = 8, lh = fs * 1.25;
    const lines = DD.canvas._wrap(s.text, s.w - pad * 2, fs, ts);
    const valign = ts.valign || (def.compartments ? "top" : "middle");
    let startY = valign === "top" ? pad + fs : valign === "bottom" ? s.h - pad - (lines.length - 1) * lh : s.h / 2 - (lines.length - 1) * lh / 2;
    const anchor = ts.align === "left" ? "start" : ts.align === "right" ? "end" : "middle";
    const tx = ts.align === "left" ? pad : ts.align === "right" ? s.w - pad : s.w / 2;
    const t = svg("text", {
      x: tx, y: startY, "text-anchor": anchor, "font-size": fs,
      "font-family": ts.fontFamily && !ts.fontFamily.includes("var(") ? ts.fontFamily : "Segoe UI, Arial, sans-serif",
      "font-weight": ts.bold ? "700" : "400", "font-style": ts.italic ? "italic" : "normal",
      fill: ts.color || readableText(s.style && s.style.fill), stroke: "none",
    });
    lines.forEach((ln, i) => t.appendChild(svg("tspan", { x: tx, dy: i ? lh : 0 }, ln)));
    g.appendChild(t);
  }

  function connEl(c) {
    const r = DD.connectors.routePath(c), st = c.style || {};
    const g = svg("g", {});
    const col = st.stroke || "#5b6675";
    const p = svg("path", { d: r.d, fill: "none", stroke: col, "stroke-width": st.strokeWidth || 2 });
    if (st.strokeStyle === "dashed") p.setAttribute("stroke-dasharray", "8 5");
    if (st.strokeStyle === "dotted") p.setAttribute("stroke-dasharray", "2 4");
    g.appendChild(p);
    [[r.b, r.angleEnd, c.arrowEnd], [r.a, r.angleStart, c.arrowStart]].forEach(([pt, ang, type]) => {
      const h = DD.connectors.arrowHead(type, 11);
      if (h) g.appendChild(svg("path", { d: h.d, transform: `translate(${pt.x} ${pt.y}) rotate(${ang * 180 / Math.PI})`, fill: h.fill ? col : "none", stroke: col, "stroke-width": st.strokeWidth || 2 }));
    });
    if (c.label) g.appendChild(svg("text", { x: r.mid.x, y: r.mid.y - 5, "text-anchor": "middle", "font-size": 12, fill: col, "font-family": "Segoe UI, Arial, sans-serif" }, c.label));
    return g;
  }

  function svgString(opts) {
    const { root } = buildSVG(opts);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(root);
  }

  /* ----------------------------------------- formats */
  const Export = {
    json() { download(sanitize(store.doc.name) + ".json", JSON.stringify(store.doc, null, 2), "application/json"); },

    svg() { download(sanitize(store.doc.name) + ".svg", svgString({ background: store.settings.background }), "image/svg+xml"); },

    async png({ scale = 2, transparent = false } = {}) {
      const bg = transparent ? null : (store.settings.background || "#ffffff");
      const str = svgString({ background: bg, scale: 1 });
      const { W, H } = buildSVG({});
      const img = new Image();
      const blob = new Blob([str], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(W * scale)); cv.height = Math.max(1, Math.round(H * scale));
      const ctx = cv.getContext("2d");
      if (!transparent) { ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height); }
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob((b) => download(sanitize(store.doc.name) + (transparent ? "-transparent" : "") + ".png", b, "image/png"), "image/png");
    },

    html() {
      const body = svgString({ background: store.settings.background });
      const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(store.doc.name)}</title>
<style>body{margin:0;display:flex;justify-content:center;background:#eef1f5;padding:24px}svg{max-width:100%;box-shadow:0 4px 20px rgba(0,0,0,.15);background:#fff}</style></head>
<body>${body}</body></html>`;
      download(sanitize(store.doc.name) + ".html", doc, "text/html");
    },

    print() {
      const body = svgString({ background: "#ffffff", padding: 40 });
      const w = window.open("", "_blank");
      if (!w) return DD.util.toast("Popup blocked — allow popups to print", "error");
      w.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(store.doc.name)}</title>
<style>@page{margin:12mm}body{margin:0}svg{width:100%;height:auto}</style></head>
<body>${body}<script>window.onload=function(){window.print()}<\/script></body></html>`);
      w.document.close();
    },
  };

  DD.export = Export;
  DD.export.svgString = svgString;
})();
