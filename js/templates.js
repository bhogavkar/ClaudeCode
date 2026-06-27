/* =====================================================================
   templates.js — Ready-made diagram templates + gallery modal.
   Each template returns a partial document {shapes, connectors, name}.
   ===================================================================== */
(function () {
  "use strict";
  const DD = window.DD;
  const { el, svg, $ } = DD.util;
  const { store } = DD;

  /* small DSL for authoring templates */
  function builder() {
    const shapes = [], connectors = [];
    const node = (type, x, y, text, opts = {}) => {
      const def = DD.shapes.get(type);
      const s = Object.assign(DD.shapes.create(type, x, y), { id: DD.util.uid("s"), text: text || "" }, opts);
      if (opts.style) s.style = Object.assign({}, def.defaults && def.defaults.style, opts.style);
      shapes.push(s); return s;
    };
    const link = (a, b, opts = {}) => {
      connectors.push(Object.assign({ id: DD.util.uid("c"), from: { shapeId: a.id, port: opts.fromPort || "s" }, to: { shapeId: b.id, port: opts.toPort || "n" }, routing: opts.routing || "orthogonal", arrowEnd: opts.arrowEnd || "filled", arrowStart: opts.arrowStart || "none", label: opts.label || "", style: opts.style || {} }, {}));
    };
    return { shapes, connectors, node, link };
  }

  const TEMPLATES = {
    blank: { name: "Blank Diagram", build: () => ({ shapes: [], connectors: [] }) },

    flowchart: {
      name: "Approval Flowchart",
      build() {
        const b = builder();
        const a = b.node("fc-start", 360, 40, "Start", { style: { fill: "#e3f5e9", stroke: "#1f9d57" } });
        const c = b.node("fc-process", 350, 140, "Submit Request");
        const d = b.node("fc-decision", 360, 250, "Approved?", { style: { fill: "#fff4d6", stroke: "#c8861a" } });
        const e = b.node("fc-process", 350, 390, "Process Order");
        const f = b.node("fc-process", 130, 250, "Notify Rejection", { style: { fill: "#fde4e2", stroke: "#d1453b" } });
        const g = b.node("fc-start", 360, 500, "End", { style: { fill: "#e3f5e9", stroke: "#1f9d57" } });
        b.link(a, c); b.link(c, d); b.link(d, e, { label: "Yes" });
        b.link(d, f, { fromPort: "w", toPort: "n", label: "No" }); b.link(e, g);
        return b;
      },
    },

    ebsApInvoice: {
      name: "Oracle EBS — AP Invoice Flow",
      build() {
        const b = builder();
        const s = b.node("fc-start", 380, 30, "Invoice Received", { style: { fill: "#fce8e6", stroke: "#c74634" } });
        const enter = b.node("fc-process", 360, 130, "Enter Invoice (AP)");
        const match = b.node("fc-decision", 370, 235, "PO Match?", { style: { fill: "#fff4d6", stroke: "#c8861a" } });
        const po = b.node("fc-process", 130, 235, "3-Way Match\nto PO/Receipt");
        const val = b.node("fc-process", 360, 375, "Invoice Validation");
        const hold = b.node("fc-decision", 370, 480, "Holds?", { style: { fill: "#fff4d6", stroke: "#c8861a" } });
        const res = b.node("fc-process", 620, 480, "Resolve Holds");
        const appr = b.node("fc-process", 360, 615, "Invoice Approval\n(AME Workflow)");
        const acct = b.node("fc-process", 360, 715, "Create Accounting");
        const pay = b.node("fc-process", 360, 815, "Payment (AP)");
        const gl = b.node("cloud-oracleebs", 360, 915, "Transfer to GL", { style: { fill: "#fce8e6", stroke: "#c74634" } });
        b.link(s, enter); b.link(enter, match);
        b.link(match, po, { fromPort: "w", label: "Yes" }); b.link(po, val, { fromPort: "s", toPort: "w" });
        b.link(match, val, { label: "No" }); b.link(val, hold);
        b.link(hold, res, { fromPort: "e", label: "Yes" }); b.link(res, val, { fromPort: "n", toPort: "e" });
        b.link(hold, appr, { label: "No" }); b.link(appr, acct); b.link(acct, pay); b.link(pay, gl);
        return b;
      },
    },

    oicIntegration: {
      name: "Oracle Integration Cloud — Architecture",
      build() {
        const b = builder();
        const src = b.node("cloud-oracleebs", 60, 220, "Oracle EBS", { style: { fill: "#fce8e6", stroke: "#c74634" } });
        const ftp = b.node("cloud-storage", 60, 360, "SFTP Server", { style: { fill: "#eef4ff", stroke: "#1f6feb" } });
        const oic = b.node("cloud-oracleintegration", 330, 250, "OIC Integration\n(App Driven)", { w: 180, h: 110, style: { fill: "#fce8e6", stroke: "#c74634" } });
        const map = b.node("fc-process", 360, 410, "Mapping &\nEnrichment");
        const lookup = b.node("erd-table", 360, 110, "DVM Lookups");
        const tgt = b.node("cloud-oraclecloud", 640, 200, "Fusion ERP\nREST API", { style: { fill: "#fce8e6", stroke: "#c74634" } });
        const err = b.node("cloud-loadbalancer", 640, 360, "Error\nNotification", { style: { fill: "#fde4e2", stroke: "#d1453b" } });
        b.link(src, oic, { fromPort: "e", toPort: "w" });
        b.link(ftp, oic, { fromPort: "e", toPort: "w" });
        b.link(lookup, oic, { fromPort: "s", toPort: "n" });
        b.link(oic, map, { fromPort: "s", toPort: "n" });
        b.link(oic, tgt, { fromPort: "e", toPort: "w", arrowEnd: "filled" });
        b.link(oic, err, { fromPort: "e", toPort: "w", style: { strokeStyle: "dashed", stroke: "#d1453b" }, label: "on error" });
        return b;
      },
    },

    swimlane: {
      name: "Swimlane Process",
      build() {
        const b = builder();
        b.node("swimlane", 40, 60, "Customer", { w: 760, h: 110, style: { fill: "transparent" } });
        b.node("swimlane", 40, 180, "Sales", { w: 760, h: 110, style: { fill: "transparent" } });
        b.node("swimlane", 40, 300, "Fulfilment", { w: 760, h: 110, style: { fill: "transparent" } });
        const a = b.node("fc-start", 120, 95, "Order", { style: { fill: "#e3f5e9", stroke: "#1f9d57" } });
        const c = b.node("fc-process", 300, 210, "Validate");
        const d = b.node("fc-process", 500, 210, "Invoice");
        const e = b.node("fc-process", 500, 330, "Ship");
        const f = b.node("fc-start", 700, 330, "Done", { style: { fill: "#e3f5e9", stroke: "#1f9d57" } });
        b.link(a, c, { fromPort: "s", toPort: "w" }); b.link(c, d, { fromPort: "e", toPort: "w" });
        b.link(d, e, { fromPort: "s", toPort: "n" }); b.link(e, f, { fromPort: "e", toPort: "w" });
        return b;
      },
    },

    erDiagram: {
      name: "ER Diagram",
      build() {
        const b = builder();
        const cust = b.node("erd-table", 80, 80, "CUSTOMERS\nid PK\nname\nemail", { h: 110 });
        const ord = b.node("erd-table", 380, 80, "ORDERS\nid PK\ncustomer_id FK\ntotal", { h: 110 });
        const item = b.node("erd-table", 380, 280, "ORDER_ITEMS\nid PK\norder_id FK\nproduct_id FK", { h: 110 });
        const prod = b.node("erd-table", 80, 280, "PRODUCTS\nid PK\nname\nprice", { h: 110 });
        b.link(cust, ord, { fromPort: "e", toPort: "w", arrowEnd: "many", arrowStart: "one" });
        b.link(ord, item, { fromPort: "s", toPort: "n", arrowEnd: "many", arrowStart: "one" });
        b.link(prod, item, { fromPort: "e", toPort: "w", arrowEnd: "many", arrowStart: "one" });
        return b;
      },
    },

    awsArch: {
      name: "AWS Architecture",
      build() {
        const b = builder();
        const u = b.node("uml-actor", 60, 200, "User");
        const cf = b.node("cloud-apigateway", 200, 190, "CloudFront", { style: { fill: "#fff3e0", stroke: "#ff9900" } });
        const alb = b.node("cloud-loadbalancer", 360, 190, "ALB", { style: { fill: "#fff3e0", stroke: "#ff9900" } });
        const ec2 = b.node("cloud-server", 530, 100, "EC2 / ECS", { style: { fill: "#fff3e0", stroke: "#ff9900" } });
        const ec2b = b.node("cloud-server", 530, 280, "EC2 / ECS", { style: { fill: "#fff3e0", stroke: "#ff9900" } });
        const db = b.node("db-postgresql", 730, 190, "RDS", { style: { fill: "#eef4ff", stroke: "#1f6feb" } });
        b.link(u, cf, { fromPort: "e", toPort: "w" }); b.link(cf, alb, { fromPort: "e", toPort: "w" });
        b.link(alb, ec2, { fromPort: "e", toPort: "w" }); b.link(alb, ec2b, { fromPort: "e", toPort: "w" });
        b.link(ec2, db, { fromPort: "e", toPort: "n" }); b.link(ec2b, db, { fromPort: "e", toPort: "s" });
        return b;
      },
    },

    mindmap: {
      name: "Mind Map",
      build() {
        const b = builder();
        const c = b.node("ellipse", 360, 240, "Project", { w: 130, h: 70, style: { fill: "#1f6feb", stroke: "#1a5fd0" }, textStyle: { color: "#fff", bold: true } });
        const branches = [["Scope", 120, 80], ["Timeline", 620, 80], ["Budget", 120, 400], ["Team", 620, 400]];
        branches.forEach(([t, x, y]) => {
          const n = b.node("rounded", x, y, t, { w: 120, h: 56, style: { fill: "#e3ecfa", stroke: "#1f6feb" } });
          b.link(c, n, { fromPort: "e", toPort: "w", routing: "curved", arrowEnd: "none", style: { strokeWidth: 2 } });
        });
        return b;
      },
    },

    orgchart: {
      name: "Org Chart",
      build() {
        const b = builder();
        const ceo = b.node("rounded", 350, 40, "CEO", { style: { fill: "#1f6feb", stroke: "#1a5fd0" }, textStyle: { color: "#fff", bold: true } });
        const roles = [["VP Eng", 160], ["VP Sales", 350], ["VP Ops", 540]];
        roles.forEach(([t, x]) => {
          const n = b.node("rounded", x, 180, t, { style: { fill: "#e3ecfa", stroke: "#1f6feb" } });
          b.link(ceo, n, { routing: "orthogonal", arrowEnd: "none" });
          for (let i = 0; i < 2; i++) {
            const c = b.node("rectangle", x - 10 + i * 70, 300, "Team " + (i + 1), { w: 70, h: 44 });
            b.link(n, c, { routing: "orthogonal", arrowEnd: "none" });
          }
        });
        return b;
      },
    },
  };

  /* mini preview for the gallery card */
  function preview(tpl) {
    const doc = tpl.build();
    const all = doc.shapes;
    const box = DD.util.unionBox(all) || { x: 0, y: 0, w: 100, h: 100 };
    const wrap = svg("svg", { viewBox: `${box.x - 20} ${box.y - 20} ${box.w + 40} ${box.h + 40}` });
    doc.connectors.forEach((c) => {
      const fa = all.find((s) => s.id === c.from.shapeId), fb = all.find((s) => s.id === c.to.shapeId);
      if (fa && fb) wrap.appendChild(svg("line", { x1: fa.x + fa.w / 2, y1: fa.y + fa.h / 2, x2: fb.x + fb.w / 2, y2: fb.y + fb.h / 2, stroke: "#9aa6b2", "stroke-width": 2 }));
    });
    all.forEach((s) => {
      const def = DD.shapes.get(s.type); let geom = def.render(s); geom = Array.isArray(geom) ? geom : [geom];
      const g = svg("g", { transform: `translate(${s.x} ${s.y})`, fill: (s.style && s.style.fill) || "#fff", stroke: (s.style && s.style.stroke) || "#1c2430", "stroke-width": 1.4 });
      geom.forEach((e) => g.appendChild(e)); wrap.appendChild(g);
    });
    return wrap;
  }

  const Templates = {
    list: TEMPLATES,
    apply(key, { replace = false } = {}) {
      const tpl = TEMPLATES[key]; if (!tpl) return;
      const doc = tpl.build();
      DD.history.transaction("Apply template: " + tpl.name, () => {
        if (replace) { store.doc.shapes = []; store.doc.connectors = []; store.selection.clear(); store.doc.name = tpl.name; $("#docName").value = tpl.name; }
        doc.shapes.forEach((s) => store.shapes.push(s));
        doc.connectors.forEach((c) => store.connectors.push(c));
        store.markDirty();
      });
      DD.bus.emit(DD.EV.DOC_LOADED, store.doc);
      store.select(doc.shapes.map((s) => s.id));
      setTimeout(() => DD.canvas.fit(), 30);
    },
    openGallery() {
      const grid = el("div", { class: "tpl-grid" });
      Object.entries(TEMPLATES).forEach(([key, tpl]) => {
        const card = el("div", { class: "tpl-card" }, [preview(tpl), el("div", { class: "tpl-name", text: tpl.name })]);
        card.addEventListener("click", () => { DD.app.closeModal(); this.apply(key, { replace: store.shapes.length === 0 }); DD.util.toast("Inserted: " + tpl.name); });
        grid.appendChild(card);
      });
      DD.app.modal("Templates", grid);
    },
  };

  DD.templates = Templates;
})();
