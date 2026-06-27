/* =====================================================================
   utils.js — Foundation: global namespace + shared utilities
   No dependencies. Establishes window.DD.
   ===================================================================== */
(function () {
  "use strict";

  /** Global application namespace. Every module attaches to this. */
  const DD = window.DD = window.DD || {};
  DD.version = "1.0.0";

  /* -------------------------------------------------- ID generation */
  let _seq = 0;
  const uid = (prefix = "id") => `${prefix}_${Date.now().toString(36)}_${(_seq++).toString(36)}`;

  /* -------------------------------------------------- math / geometry */
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const round = (v, step = 1) => Math.round(v / step) * step;
  const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  const lerp = (a, b, t) => a + (b - a) * t;

  /** Axis-aligned bounding box of a shape, accounting for rotation = ignored
   *  (rotation handled at render). Returns {x,y,w,h, cx, cy, x2, y2}. */
  function bbox(s) {
    return { x: s.x, y: s.y, w: s.w, h: s.h, x2: s.x + s.w, y2: s.y + s.h, cx: s.x + s.w / 2, cy: s.y + s.h / 2 };
  }

  /** Union bounding box of a list of shapes. */
  function unionBox(shapes) {
    if (!shapes.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const s of shapes) {
      x1 = Math.min(x1, s.x); y1 = Math.min(y1, s.y);
      x2 = Math.max(x2, s.x + s.w); y2 = Math.max(y2, s.y + s.h);
    }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
  }

  const rectsIntersect = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  const pointInRect = (px, py, r) =>
    px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;

  /* -------------------------------------------------- timing */
  function debounce(fn, ms) {
    let t; return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
  }
  function throttle(fn, ms) {
    let last = 0, queued; return function (...a) {
      const now = Date.now();
      if (now - last >= ms) { last = now; fn.apply(this, a); }
      else { clearTimeout(queued); queued = setTimeout(() => { last = Date.now(); fn.apply(this, a); }, ms - (now - last)); }
    };
  }
  const raf = (fn) => requestAnimationFrame(fn);

  /* -------------------------------------------------- object helpers */
  const clone = (o) => (typeof structuredClone === "function" ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
  function deepMerge(target, src) {
    for (const k in src) {
      if (src[k] && typeof src[k] === "object" && !Array.isArray(src[k])) {
        target[k] = deepMerge(target[k] ? { ...target[k] } : {}, src[k]);
      } else target[k] = src[k];
    }
    return target;
  }

  /* -------------------------------------------------- DOM helpers */
  const SVGNS = "http://www.w3.org/2000/svg";
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    applyAttrs(node, attrs);
    appendChildren(node, children);
    return node;
  }
  function svg(tag, attrs = {}, children = []) {
    const node = document.createElementNS(SVGNS, tag);
    applyAttrs(node, attrs, true);
    appendChildren(node, children);
    return node;
  }
  function applyAttrs(node, attrs, isSvg) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null) continue;
      if (k === "class") node.setAttribute("class", v);
      else if (k === "text") node.textContent = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "dataset") for (const d in v) node.dataset[d] = v[d];
      else node.setAttribute(k, v);
    }
  }
  function appendChildren(node, children) {
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null || c === false) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
  }
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* -------------------------------------------------- color helpers */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function readableText(hex) {
    if (!hex || hex[0] !== "#") return "#000";
    const c = hex.length === 4 ? hex.replace(/#(.)(.)(.)/, "#$1$1$2$2$3$3") : hex;
    const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#1c2430" : "#ffffff";
  }

  /* -------------------------------------------------- toast */
  let toastTimer;
  function toast(message, kind = "") {
    const t = document.getElementById("toast");
    if (!t) return;
    t.className = "toast" + (kind ? " toast--" + kind : "");
    t.textContent = message;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  /* -------------------------------------------------- file download */
  function download(filename, content, mime = "application/octet-stream") {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
  }

  DD.util = {
    uid, clamp, round, dist, lerp, bbox, unionBox, rectsIntersect, pointInRect,
    debounce, throttle, raf, clone, deepMerge,
    el, svg, $, $$, SVGNS, escapeHtml, readableText, toast, download,
  };
})();
