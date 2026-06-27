/* =====================================================================
   shapes.js — Shape library (Factory + Registry pattern)
   Each definition renders in LOCAL coordinates (0,0)→(w,h). The canvas
   places/rotates the group, and applies fill/stroke on the group so simple
   geometry inherits styling. Decorative strokes opt out with fill="none".
   ===================================================================== */
(function () {
  "use strict";
  const DD = window.DD;
  const { svg } = DD.util;

  /** type → definition. */
  const registry = new Map();
  /** ordered category metadata for the palette. */
  const categories = [];

  function defineCategory(id, label) {
    if (!categories.find((c) => c.id === id)) categories.push({ id, label, items: [] });
  }
  function define(def) {
    registry.set(def.type, def);
    const cat = categories.find((c) => c.id === def.cat);
    if (cat) cat.items.push(def.type);
  }

  /* ----------------------------------------------------------- helpers */
  const P = (d, extra = {}) => svg("path", { d, ...extra });
  const RECT = (x, y, w, h, rx = 0) => svg("rect", { x, y, width: w, height: h, rx });
  const ELL = (cx, cy, rx, ry) => svg("ellipse", { cx, cy, rx, ry });
  const LINE = (x1, y1, x2, y2) => svg("line", { x1, y1, x2, y2, fill: "none" });

  /** Default 8 connection ports around the bounding box (local coords). */
  function boxPorts(s) {
    const { w, h } = s;
    return [
      { id: "n", x: w / 2, y: 0 }, { id: "s", x: w / 2, y: h },
      { id: "e", x: w, y: h / 2 }, { id: "w", x: 0, y: h / 2 },
      { id: "ne", x: w, y: 0 }, { id: "nw", x: 0, y: 0 },
      { id: "se", x: w, y: h }, { id: "sw", x: 0, y: h },
    ];
  }

  /* =================================================================
     BASIC SHAPES
     ================================================================= */
  defineCategory("basic", "Basic Shapes");
  define({ type: "rectangle", label: "Rectangle", cat: "basic", w: 120, h: 70, render: (s) => RECT(0, 0, s.w, s.h) });
  define({ type: "rounded", label: "Rounded", cat: "basic", w: 120, h: 70, render: (s) => RECT(0, 0, s.w, s.h, Math.min(18, s.h / 3)) });
  define({ type: "square", label: "Square", cat: "basic", w: 90, h: 90, render: (s) => RECT(0, 0, s.w, s.h) });
  define({ type: "circle", label: "Circle", cat: "basic", w: 90, h: 90, render: (s) => ELL(s.w / 2, s.h / 2, s.w / 2, s.h / 2) });
  define({ type: "ellipse", label: "Ellipse", cat: "basic", w: 120, h: 76, render: (s) => ELL(s.w / 2, s.h / 2, s.w / 2, s.h / 2) });
  define({ type: "triangle", label: "Triangle", cat: "basic", w: 100, h: 86, render: (s) => P(`M${s.w / 2} 0 L${s.w} ${s.h} L0 ${s.h} Z`) });
  define({ type: "diamond", label: "Diamond", cat: "basic", w: 110, h: 80, render: (s) => P(`M${s.w / 2} 0 L${s.w} ${s.h / 2} L${s.w / 2} ${s.h} L0 ${s.h / 2} Z`) });
  define({ type: "pentagon", label: "Pentagon", cat: "basic", w: 100, h: 92, render: (s) => poly(s, 5, -90) });
  define({ type: "hexagon", label: "Hexagon", cat: "basic", w: 110, h: 92, render: (s) => poly(s, 6, 0) });
  define({ type: "octagon", label: "Octagon", cat: "basic", w: 100, h: 100, render: (s) => poly(s, 8, 22.5) });
  define({ type: "star", label: "Star", cat: "basic", w: 100, h: 96, render: (s) => star(s, 5) });
  define({ type: "parallelogram", label: "Parallelogram", cat: "basic", w: 130, h: 70, render: (s) => { const k = s.w * 0.22; return P(`M${k} 0 L${s.w} 0 L${s.w - k} ${s.h} L0 ${s.h} Z`); } });
  define({ type: "trapezoid", label: "Trapezoid", cat: "basic", w: 130, h: 70, render: (s) => { const k = s.w * 0.2; return P(`M${k} 0 L${s.w - k} 0 L${s.w} ${s.h} L0 ${s.h} Z`); } });
  define({
    type: "cylinder", label: "Cylinder", cat: "basic", w: 90, h: 110, render: (s) => {
      const ry = Math.min(16, s.h * 0.16);
      return [P(`M0 ${ry} A${s.w / 2} ${ry} 0 0 0 ${s.w} ${ry} L${s.w} ${s.h - ry} A${s.w / 2} ${ry} 0 0 1 0 ${s.h - ry} Z`),
      P(`M0 ${ry} A${s.w / 2} ${ry} 0 0 1 ${s.w} ${ry}`, { fill: "none" })];
    }
  });
  define({
    type: "cube", label: "Cube", cat: "basic", w: 110, h: 90, render: (s) => {
      const d = Math.min(s.w, s.h) * 0.22;
      return [RECT(0, d, s.w - d, s.h - d),
      P(`M0 ${d} L${d} 0 L${s.w} 0 L${s.w - d} ${d} Z`, { fill: "none" }),
      P(`M${s.w - d} ${d} L${s.w} 0 L${s.w} ${s.h - d} L${s.w - d} ${s.h} Z`, { fill: "none" })];
    }
  });
  define({
    type: "cloud", label: "Cloud", cat: "basic", w: 130, h: 84, render: (s) => {
      const W = s.w, H = s.h;
      return P(`M${.25 * W} ${.95 * H} C${.05 * W} ${.95 * H} ${.02 * W} ${.62 * H} ${.18 * W} ${.55 * H} C${.12 * W} ${.28 * H} ${.42 * W} ${.18 * H} ${.5 * W} ${.38 * H} C${.58 * W} ${.12 * H} ${.92 * W} ${.2 * H} ${.85 * W} ${.5 * H} C${1.02 * W} ${.55 * H} ${.98 * W} ${.95 * H} ${.78 * W} ${.95 * H} Z`);
    }
  });
  define({ type: "document", label: "Document", cat: "basic", w: 120, h: 80, render: (s) => P(`M0 0 L${s.w} 0 L${s.w} ${s.h * 0.82} C${s.w * 0.75} ${s.h * 1.05} ${s.w * 0.25} ${s.h * 0.62} 0 ${s.h * 0.85} Z`) });
  define({
    type: "note", label: "Note", cat: "basic", w: 100, h: 100, render: (s) => {
      const f = Math.min(s.w, s.h) * 0.28;
      return [P(`M0 0 L${s.w - f} 0 L${s.w} ${f} L${s.w} ${s.h} L0 ${s.h} Z`),
      P(`M${s.w - f} 0 L${s.w - f} ${f} L${s.w} ${f}`, { fill: "none" })];
    }
  });
  define({
    type: "callout", label: "Callout", cat: "basic", w: 130, h: 90, render: (s) => {
      const r = 10, bh = s.h * 0.74;
      return P(`M${r} 0 L${s.w - r} 0 Q${s.w} 0 ${s.w} ${r} L${s.w} ${bh - r} Q${s.w} ${bh} ${s.w - r} ${bh} L${s.w * 0.4} ${bh} L${s.w * 0.2} ${s.h} L${s.w * 0.25} ${bh} L${r} ${bh} Q0 ${bh} 0 ${bh - r} L0 ${r} Q0 0 ${r} 0 Z`);
    }
  });
  define({ type: "folder", label: "Folder", cat: "basic", w: 120, h: 86, render: (s) => { const t = s.h * 0.22; return P(`M0 ${t} L${s.w * 0.4} ${t} L${s.w * 0.5} 0 L${s.w} 0 L${s.w} ${s.h} L0 ${s.h} Z`); } });

  /* =================================================================
     FLOWCHART
     ================================================================= */
  defineCategory("flow", "Flowchart");
  define({ type: "fc-start", label: "Start / End", cat: "flow", w: 120, h: 56, defaults: { text: "Start" }, render: (s) => RECT(0, 0, s.w, s.h, s.h / 2) });
  define({ type: "fc-process", label: "Process", cat: "flow", w: 130, h: 64, defaults: { text: "Process" }, render: (s) => RECT(0, 0, s.w, s.h) });
  define({ type: "fc-decision", label: "Decision", cat: "flow", w: 120, h: 90, defaults: { text: "Decision?" }, render: (s) => P(`M${s.w / 2} 0 L${s.w} ${s.h / 2} L${s.w / 2} ${s.h} L0 ${s.h / 2} Z`) });
  define({ type: "fc-io", label: "Input/Output", cat: "flow", w: 130, h: 64, defaults: { text: "Data" }, render: (s) => { const k = s.w * 0.18; return P(`M${k} 0 L${s.w} 0 L${s.w - k} ${s.h} L0 ${s.h} Z`); } });
  define({ type: "fc-manual", label: "Manual Input", cat: "flow", w: 130, h: 64, render: (s) => P(`M0 ${s.h * 0.28} L${s.w} 0 L${s.w} ${s.h} L0 ${s.h} Z`) });
  define({ type: "fc-prep", label: "Preparation", cat: "flow", w: 130, h: 64, render: (s) => { const k = s.w * 0.16; return P(`M${k} 0 L${s.w - k} 0 L${s.w} ${s.h / 2} L${s.w - k} ${s.h} L${k} ${s.h} L0 ${s.h / 2} Z`); } });
  define({ type: "fc-display", label: "Display", cat: "flow", w: 130, h: 70, render: (s) => P(`M0 ${s.h / 2} L${s.w * 0.15} 0 L${s.w * 0.85} 0 Q${s.w} 0 ${s.w} ${s.h / 2} Q${s.w} ${s.h} ${s.w * 0.85} ${s.h} L${s.w * 0.15} ${s.h} Z`) });
  define({ type: "fc-delay", label: "Delay", cat: "flow", w: 120, h: 64, render: (s) => P(`M0 0 L${s.w * 0.6} 0 Q${s.w} 0 ${s.w} ${s.h / 2} Q${s.w} ${s.h} ${s.w * 0.6} ${s.h} L0 ${s.h} Z`) });
  define({ type: "fc-manualop", label: "Manual Op", cat: "flow", w: 130, h: 64, render: (s) => { const k = s.w * 0.16; return P(`M0 0 L${s.w} 0 L${s.w - k} ${s.h} L${k} ${s.h} Z`); } });
  define({ type: "fc-predef", label: "Predefined", cat: "flow", w: 130, h: 64, render: (s) => { const k = s.w * 0.12; return [RECT(0, 0, s.w, s.h), LINE(k, 0, k, s.h), LINE(s.w - k, 0, s.w - k, s.h)]; } });
  define({ type: "fc-storeddata", label: "Stored Data", cat: "flow", w: 120, h: 70, render: (s) => P(`M${s.w * 0.16} 0 L${s.w} 0 Q${s.w * 0.84} ${s.h / 2} ${s.w} ${s.h} L${s.w * 0.16} ${s.h} Q0 ${s.h / 2} ${s.w * 0.16} 0 Z`) });
  define({ type: "fc-database", label: "Database", cat: "flow", w: 90, h: 100, render: registry.get("cylinder").render });
  define({ type: "fc-merge", label: "Merge", cat: "flow", w: 100, h: 80, render: (s) => P(`M0 0 L${s.w} 0 L${s.w / 2} ${s.h} Z`) });
  define({ type: "fc-or", label: "Connector", cat: "flow", w: 64, h: 64, render: (s) => [ELL(s.w / 2, s.h / 2, s.w / 2, s.h / 2), LINE(0, s.h / 2, s.w, s.h / 2), LINE(s.w / 2, 0, s.w / 2, s.h)] });
  define({ type: "fc-offpage", label: "Off-page", cat: "flow", w: 100, h: 80, render: (s) => P(`M0 0 L${s.w} 0 L${s.w} ${s.h * 0.6} L${s.w / 2} ${s.h} L0 ${s.h * 0.6} Z`) });

  /* =================================================================
     UML
     ================================================================= */
  defineCategory("uml", "UML");
  define({
    type: "uml-class", label: "Class", cat: "uml", w: 160, h: 110, defaults: { text: "ClassName" },
    render: (s) => [RECT(0, 0, s.w, s.h), LINE(0, s.h * 0.3, s.w, s.h * 0.3), LINE(0, s.h * 0.66, s.w, s.h * 0.66)],
    compartments: true,
  });
  define({ type: "uml-interface", label: "Interface", cat: "uml", w: 150, h: 90, defaults: { text: "«interface»" }, render: (s) => RECT(0, 0, s.w, s.h) });
  define({ type: "uml-package", label: "Package", cat: "uml", w: 150, h: 100, render: (s) => { const tw = s.w * 0.4, th = 22; return [P(`M0 ${th} L0 0 L${tw} 0 L${tw} ${th}`, { fill: "none" }), RECT(0, th, s.w, s.h - th)]; } });
  define({ type: "uml-component", label: "Component", cat: "uml", w: 150, h: 90, render: (s) => [RECT(14, 0, s.w - 14, s.h), RECT(0, s.h * 0.2, 28, 16), RECT(0, s.h * 0.55, 28, 16)] });
  define({ type: "uml-node", label: "Node", cat: "uml", w: 130, h: 90, render: registry.get("cube").render });
  define({ type: "uml-actor", label: "Actor", cat: "uml", w: 60, h: 110, render: (s) => { const cx = s.w / 2, r = s.w * 0.22; return [ELL(cx, r, r, r), LINE(cx, r * 2, cx, s.h * 0.62), LINE(cx - r * 1.4, s.h * 0.4, cx + r * 1.4, s.h * 0.4), LINE(cx, s.h * 0.62, cx - r * 1.3, s.h), LINE(cx, s.h * 0.62, cx + r * 1.3, s.h)]; } });
  define({ type: "uml-usecase", label: "Use Case", cat: "uml", w: 140, h: 70, render: (s) => ELL(s.w / 2, s.h / 2, s.w / 2, s.h / 2) });
  define({ type: "uml-state", label: "State", cat: "uml", w: 130, h: 70, render: (s) => RECT(0, 0, s.w, s.h, 18) });
  define({ type: "uml-object", label: "Object", cat: "uml", w: 150, h: 70, defaults: { text: "obj : Class" }, render: (s) => [RECT(0, 0, s.w, s.h), LINE(0, s.h * 0.4, s.w, s.h * 0.4)] });

  /* =================================================================
     BPMN
     ================================================================= */
  defineCategory("bpmn", "BPMN 2.0");
  define({ type: "bpmn-start", label: "Start Event", cat: "bpmn", w: 56, h: 56, render: (s) => ELL(s.w / 2, s.h / 2, s.w / 2, s.h / 2) });
  define({ type: "bpmn-end", label: "End Event", cat: "bpmn", w: 56, h: 56, render: (s) => ELL(s.w / 2, s.h / 2, s.w / 2 - 1, s.h / 2 - 1), strokeBoost: 3 });
  define({ type: "bpmn-intermediate", label: "Intermediate", cat: "bpmn", w: 56, h: 56, render: (s) => [ELL(s.w / 2, s.h / 2, s.w / 2, s.h / 2), ELL(s.w / 2, s.h / 2, s.w / 2 - 5, s.h / 2 - 5)] });
  define({ type: "bpmn-task", label: "Task", cat: "bpmn", w: 140, h: 80, defaults: { text: "Task" }, render: (s) => RECT(0, 0, s.w, s.h, 10) });
  define({ type: "bpmn-subprocess", label: "Sub-Process", cat: "bpmn", w: 150, h: 90, defaults: { text: "Sub-Process" }, render: (s) => [RECT(0, 0, s.w, s.h, 10), RECT(s.w / 2 - 8, s.h - 18, 16, 16), LINE(s.w / 2 - 4, s.h - 14, s.w / 2 + 4, s.h - 14), LINE(s.w / 2, s.h - 18, s.w / 2, s.h - 6)] });
  define({ type: "bpmn-gateway", label: "Gateway", cat: "bpmn", w: 64, h: 64, render: (s) => [P(`M${s.w / 2} 0 L${s.w} ${s.h / 2} L${s.w / 2} ${s.h} L0 ${s.h / 2} Z`), P(`M${s.w * 0.32} ${s.h * 0.32} L${s.w * 0.68} ${s.h * 0.68} M${s.w * 0.68} ${s.h * 0.32} L${s.w * 0.32} ${s.h * 0.68}`, { fill: "none" })] });
  define({ type: "bpmn-gateway-parallel", label: "Parallel GW", cat: "bpmn", w: 64, h: 64, render: (s) => [P(`M${s.w / 2} 0 L${s.w} ${s.h / 2} L${s.w / 2} ${s.h} L0 ${s.h / 2} Z`), P(`M${s.w / 2} ${s.h * 0.25} L${s.w / 2} ${s.h * 0.75} M${s.w * 0.25} ${s.h / 2} L${s.w * 0.75} ${s.h / 2}`, { fill: "none" })] });
  define({ type: "bpmn-datastore", label: "Data Store", cat: "bpmn", w: 80, h: 90, render: registry.get("cylinder").render });
  define({ type: "bpmn-pool", label: "Pool / Lane", cat: "bpmn", w: 420, h: 160, defaults: { text: "Pool" }, render: (s) => [RECT(0, 0, s.w, s.h), RECT(0, 0, 28, s.h)], container: true });

  /* =================================================================
     DATABASE / ERD
     ================================================================= */
  defineCategory("data", "Database & ERD");
  define({ type: "erd-entity", label: "Entity", cat: "data", w: 150, h: 90, defaults: { text: "Entity" }, render: (s) => [RECT(0, 0, s.w, s.h), LINE(0, 26, s.w, 26)], compartments: true });
  define({ type: "erd-table", label: "Table", cat: "data", w: 170, h: 120, defaults: { text: "table_name" }, render: (s) => [RECT(0, 0, s.w, s.h, 4), RECT(0, 0, s.w, 26, 4), LINE(0, 26, s.w, 26)] });
  define({ type: "erd-rel", label: "Relationship", cat: "data", w: 110, h: 70, render: (s) => P(`M${s.w / 2} 0 L${s.w} ${s.h / 2} L${s.w / 2} ${s.h} L0 ${s.h / 2} Z`) });
  define({ type: "erd-attr", label: "Attribute", cat: "data", w: 110, h: 56, render: (s) => ELL(s.w / 2, s.h / 2, s.w / 2, s.h / 2) });
  ["Oracle", "SQL Server", "MySQL", "PostgreSQL", "MongoDB", "Redis", "Snowflake", "DynamoDB"].forEach((db) => {
    define({ type: "db-" + db.toLowerCase().replace(/\s+/g, ""), label: db, cat: "data", w: 90, h: 100, defaults: { text: db }, render: registry.get("cylinder").render });
  });

  /* =================================================================
     CLOUD & INFRA (Oracle / AWS / Azure / GCP / network)
     ================================================================= */
  defineCategory("cloud", "Cloud & Infra");
  const cloudIcons = [
    "Oracle Cloud", "Oracle Integration", "Oracle EBS", "AWS", "Azure", "Google Cloud",
    "Kubernetes", "Docker", "OpenShift", "VMware", "Linux", "Windows",
    "Firewall", "Switch", "Router", "Server", "Load Balancer", "Storage", "API Gateway",
  ];
  cloudIcons.forEach((name) => {
    define({
      type: "cloud-" + name.toLowerCase().replace(/\s+/g, ""), label: name, cat: "cloud", w: 110, h: 80,
      defaults: { text: name, style: { fill: "#eef4ff", stroke: "#1f6feb" } },
      render: (s) => [RECT(0, 0, s.w, s.h, 8), iconBadge(s, name[0])],
    });
  });

  /* =================================================================
     CONTAINERS / MISC
     ================================================================= */
  defineCategory("misc", "Containers & Misc");
  define({ type: "container", label: "Container", cat: "misc", w: 260, h: 180, defaults: { text: "Container", style: { fill: "transparent" } }, render: (s) => RECT(0, 0, s.w, s.h, 8), container: true });
  define({ type: "frame", label: "Frame", cat: "misc", w: 260, h: 180, defaults: { text: "Frame", style: { fill: "transparent" } }, render: (s) => [RECT(0, 0, s.w, s.h), RECT(0, 0, 80, 24)], container: true });
  define({ type: "swimlane", label: "Swimlane", cat: "misc", w: 480, h: 120, defaults: { text: "Lane", style: { fill: "transparent" } }, render: (s) => [RECT(0, 0, s.w, s.h), RECT(0, 0, 30, s.h)], container: true });
  define({ type: "text", label: "Text", cat: "misc", w: 120, h: 40, defaults: { text: "Text", style: { fill: "transparent", stroke: "transparent" } }, render: (s) => RECT(0, 0, s.w, s.h) });

  /* ----------------------------------------------------------- polygon utils */
  function poly(s, n, startDeg) {
    const cx = s.w / 2, cy = s.h / 2, rx = s.w / 2, ry = s.h / 2;
    let d = "";
    for (let i = 0; i < n; i++) {
      const a = (startDeg + i * 360 / n) * Math.PI / 180;
      d += (i ? "L" : "M") + (cx + rx * Math.cos(a)).toFixed(2) + " " + (cy + ry * Math.sin(a)).toFixed(2) + " ";
    }
    return P(d + "Z");
  }
  function star(s, points) {
    const cx = s.w / 2, cy = s.h / 2, ro = Math.min(cx, cy), ri = ro * 0.42;
    let d = "";
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 ? ri : ro;
      const a = (-90 + i * 180 / points) * Math.PI / 180;
      d += (i ? "L" : "M") + (cx + r * Math.cos(a)).toFixed(2) + " " + (cy + r * Math.sin(a)).toFixed(2) + " ";
    }
    return P(d + "Z");
  }
  function iconBadge(s, letter) {
    const g = svg("g", { fill: "none" });
    g.appendChild(svg("circle", { cx: 18, cy: 18, r: 12, fill: "rgba(255,255,255,.65)", stroke: "currentColor", "stroke-width": 1.2 }));
    g.appendChild(svg("text", { x: 18, y: 22, "text-anchor": "middle", "font-size": 13, "font-weight": "bold", fill: "currentColor", stroke: "none" }, letter));
    return g;
  }

  /* ----------------------------------------------------------- public API */
  const Shapes = {
    registry, categories,
    get: (type) => registry.get(type) || registry.get("rectangle"),
    has: (type) => registry.has(type),
    list: () => [...registry.values()],
    ports: (s) => { const def = Shapes.get(s.type); return (def.ports || boxPorts)(s); },
    /** Build a new shape instance for a type, merging type defaults. */
    create(type, x, y) {
      const def = Shapes.get(type);
      const base = { type, x, y, w: def.w, h: def.h };
      const d = def.defaults || {};
      const inst = Object.assign(base, { text: d.text || "", style: Object.assign({}, d.style) });
      return inst;
    },
  };
  DD.shapes = Shapes;
})();
