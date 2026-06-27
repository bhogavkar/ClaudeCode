/* =====================================================================
   connectors.js — Connector routing + arrowhead geometry.
   Pure geometry (no DOM). The canvas consumes routePath() & arrowHead().
   ===================================================================== */
(function () {
  "use strict";
  const DD = window.DD;
  const { store } = DD;

  /* ---------------------------------------------- endpoint resolution */
  /** Absolute point + outward side for a connector endpoint. */
  function resolveEndpoint(ep, fallback) {
    if (!ep) return fallback || { x: 0, y: 0, side: "e" };
    if (ep.shapeId) {
      const s = store.getShape(ep.shapeId);
      if (s) {
        const ports = DD.shapes.ports(s);
        const port = ports.find((p) => p.id === ep.port) || ports[0];
        return toWorld(s, port);
      }
    }
    return { x: ep.x || 0, y: ep.y || 0, side: ep.side || "e" };
  }

  /** Transform a local port to world coords, honoring rotation. */
  function toWorld(s, port) {
    const cx = s.w / 2, cy = s.h / 2;
    let px = port.x, py = port.y;
    if (s.rotation) {
      const a = s.rotation * Math.PI / 180, dx = px - cx, dy = py - cy;
      px = cx + dx * Math.cos(a) - dy * Math.sin(a);
      py = cy + dx * Math.sin(a) + dy * Math.cos(a);
    }
    return { x: s.x + px, y: s.y + py, side: portSide(port.id) };
  }
  const portSide = (id) => ({ n: "n", s: "s", e: "e", w: "w", ne: "n", nw: "n", se: "s", sw: "s" }[id] || "e");

  /* ---------------------------------------------- routing */
  /** Returns {d, a, b, midAngleStart, midAngleEnd, mid} for the connector. */
  function routePath(conn) {
    const a = resolveEndpoint(conn.from);
    const b = resolveEndpoint(conn.to, { x: a.x + 120, y: a.y, side: "w" });
    const routing = conn.routing || "orthogonal";
    let d, pts;
    if (conn.points && conn.points.length >= 2 && routing === "manual") {
      pts = conn.points;
      d = pts.map((p, i) => (i ? "L" : "M") + p.x + " " + p.y).join(" ");
    } else if (routing === "straight") {
      d = `M${a.x} ${a.y} L${b.x} ${b.y}`; pts = [a, b];
    } else if (routing === "curved" || routing === "bezier") {
      const dx = (b.x - a.x) * 0.5;
      const c1 = sideOffset(a, Math.abs(dx) + 30), c2 = sideOffset(b, Math.abs(dx) + 30);
      d = `M${a.x} ${a.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`; pts = [a, b];
    } else { // orthogonal / elbow (default)
      pts = orthRoute(a, b);
      d = pts.map((p, i) => (i ? "L" : "M") + p.x + " " + p.y).join(" ");
    }
    // angle of last/first segment for arrowheads
    const segEnd = pts.slice(-2);
    const segStart = pts.slice(0, 2);
    const angEnd = Math.atan2(b.y - segEnd[0].y, b.x - segEnd[0].x);
    const angStart = Math.atan2(a.y - segStart[1].y, a.x - segStart[1].x);
    const mid = pts[Math.floor(pts.length / 2)] || a;
    return { d, a, b, points: pts, angleEnd: angEnd, angleStart: angStart, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }

  function sideOffset(p, dist) {
    const off = { n: [0, -dist], s: [0, dist], e: [dist, 0], w: [-dist, 0] }[p.side] || [dist, 0];
    return { x: p.x + off[0], y: p.y + off[1] };
  }

  /** Orthogonal route with a single mid-bend, respecting exit sides. */
  function orthRoute(a, b) {
    const gap = 24;
    const sa = sideOffset(a, gap), sb = sideOffset(b, gap);
    const horizA = a.side === "e" || a.side === "w";
    const horizB = b.side === "e" || b.side === "w";
    let mids;
    if (horizA && horizB) {
      const mx = (sa.x + sb.x) / 2;
      mids = [{ x: mx, y: sa.y }, { x: mx, y: sb.y }];
    } else if (!horizA && !horizB) {
      const my = (sa.y + sb.y) / 2;
      mids = [{ x: sa.x, y: my }, { x: sb.x, y: my }];
    } else if (horizA) {
      mids = [{ x: sb.x, y: sa.y }];
    } else {
      mids = [{ x: sa.x, y: sb.y }];
    }
    return [a, sa, ...mids, sb, b];
  }

  /* ---------------------------------------------- arrowheads */
  const ARROWS = ["none", "filled", "open", "triangle", "diamond", "circle", "block", "half", "crowfoot", "one", "many"];

  /** Build arrowhead path 'd' (in local space, tip at origin pointing +X) + meta. */
  function arrowHead(type, size = 11) {
    const s = size;
    switch (type) {
      case "open": return { d: `M${-s} ${-s * 0.6} L0 0 L${-s} ${s * 0.6}`, fill: false };
      case "triangle":
      case "filled": return { d: `M0 0 L${-s} ${-s * 0.55} L${-s} ${s * 0.55} Z`, fill: true };
      case "block": return { d: `M0 0 L${-s} ${-s * 0.5} L${-s} ${s * 0.5} Z`, fill: true };
      case "diamond": return { d: `M0 0 L${-s * 0.6} ${-s * 0.5} L${-s * 1.2} 0 L${-s * 0.6} ${s * 0.5} Z`, fill: true };
      case "circle": return { d: `M${-s * 0.6} 0 m${-s * 0.5} 0 a${s * 0.5} ${s * 0.5} 0 1 0 ${s} 0 a${s * 0.5} ${s * 0.5} 0 1 0 ${-s} 0`, fill: true };
      case "half": return { d: `M0 0 L${-s} ${-s * 0.55} L${-s} 0 Z`, fill: true };
      case "crowfoot":
      case "many": return { d: `M${-s} ${-s * 0.6} L0 0 L${-s} ${s * 0.6} M0 0 L${-s} 0`, fill: false };
      case "one": return { d: `M${-s * 0.5} ${-s * 0.6} L${-s * 0.5} ${s * 0.6}`, fill: false };
      default: return null;
    }
  }

  /* ---------------------------------------------- hit testing */
  function nearestPort(shape, wx, wy) {
    const ports = DD.shapes.ports(shape);
    let best = null, bd = Infinity;
    for (const p of ports) {
      const wp = toWorld(shape, p);
      const dd = DD.util.dist(wx, wy, wp.x, wp.y);
      if (dd < bd) { bd = dd; best = { port: p.id, ...wp, d: dd }; }
    }
    return best;
  }

  DD.connectors = { routePath, resolveEndpoint, toWorld, arrowHead, ARROWS, nearestPort };
})();
