# Developer Guide — Enterprise Diagram Designer

This guide explains the architecture and how to extend the application.

---

## 1. Architecture at a glance

The app follows a lightweight **MVVM / event-driven** architecture with a single
global namespace `DD` and a central **EventBus** decoupling every module.

```
                 ┌───────────────┐
   user input →  │   canvas.js   │  (View + interaction state machine)
                 └──────┬────────┘
                        │ mutations
                 ┌──────▼────────┐      emits      ┌───────────────┐
                 │   store.js    │ ───────────────▶│  eventbus.js  │
                 │ (Model/state) │                 └──────┬────────┘
                 └──────┬────────┘                        │ events
                        │ snapshots                       ▼
                 ┌──────▼────────┐     ┌────────────────────────────────┐
                 │  history.js   │     │ sidebar / toolbar / properties  │
                 └───────────────┘     │ layers / app  (ViewModels/View) │
                                       └────────────────────────────────┘
```

**Design patterns used**

| Pattern | Where |
|---|---|
| **Observer / Pub-Sub** | `eventbus.js` (`DD.bus`) — all cross-module communication. |
| **Factory + Registry** | `shapes.js` (`DD.shapes.create`, `registry`). |
| **Command / Memento** | `history.js` — `transaction()` + snapshot stack. |
| **Strategy** | `connectors.js` routing modes; `export.js` per-format strategies. |
| **Singleton** | Each module exposes one instance on `DD.*`. |
| **MVVM** | `store` = Model; `properties/layers/sidebar` = ViewModels; DOM = View. |

SOLID/DRY/KISS are applied throughout: single-responsibility modules, shared
helpers in `utils.js`, and no duplicated rendering logic (canvas and export both
drive off the same shape renderers).

---

## 2. Module load order & the `DD` namespace

Browsers block ES-module `import` over `file://`, which would break the
"just open `index.html`" guarantee. So each file is an **IIFE** that augments the
global `DD` object, loaded in dependency order from `index.html`:

```
utils → eventbus → store → history → shapes → connectors → canvas
      → sidebar → toolbar → properties → layers → templates
      → storage → export → import → shortcuts → app
```

To convert to true ES modules later, replace each IIFE's `DD.x = ...` with
`export`, and the consumers' `DD.x` with `import` — the boundaries already match.

---

## 3. Folder structure

See the README. Rule of thumb: **one concern per file**, UI styles split into
`theme` (tokens), `layout` (structure), `components` (widgets), `animations`.

---

## 4. The data model

A document is plain JSON (see `store.newDocument`):

```js
{
  id, name, created, modified, schema,
  settings: { gridType, gridSize, snap, smartGuides, theme, background, ... },
  layers:   [{ id, name, visible, locked, opacity }],
  shapes:   [{ id, type, x, y, w, h, rotation, flipH, flipV, text,
               textStyle:{...}, style:{...}, layerId, groupId, locked }],
  connectors:[{ id, from:{shapeId,port}|{x,y}, to:{...}, routing,
               arrowStart, arrowEnd, label, style:{...}, layerId }]
}
```

All mutations go through `DD.store` methods so events fire and history stays
consistent. **Never mutate `store.doc` directly outside a `store` method or a
`DD.history.transaction(...)`.**

---

## 5. Adding a shape

Open `js/shapes.js` and call `define()` inside (or after) the relevant
`defineCategory()`:

```js
define({
  type: "my-gear",          // unique id
  label: "Gear",            // palette label
  cat: "basic",             // category id (must exist)
  w: 90, h: 90,             // default size
  defaults: { text: "", style: { fill: "#eef" } },   // optional
  render: (s) => svgHelper(`M... ${s.w} ${s.h} ...`), // draw in LOCAL coords 0..w / 0..h
  ports: (s) => [...],      // optional custom connection ports (defaults to 8-box)
});
```

Render functions draw in **local coordinates** (origin top-left, extent `w`×`h`).
Return one SVG element or an array. Do **not** set `fill`/`stroke` on geometry —
the canvas applies styling on the group so it inherits; use `fill="none"` for
decorative strokes (separators). The palette preview and SVG export reuse the same
`render` function automatically.

---

## 6. Adding a template

In `js/templates.js`, add to `TEMPLATES` using the `builder()` DSL:

```js
myFlow: {
  name: "My Flow",
  build() {
    const b = builder();
    const a = b.node("fc-start", 100, 40, "Start");
    const c = b.node("fc-process", 90, 140, "Do thing");
    b.link(a, c);                    // default: a.south → c.north, filled arrow
    b.link(c, x, { fromPort:"e", toPort:"w", label:"yes", routing:"curved" });
    return b;                        // returns { shapes, connectors }
  },
}
```

It appears automatically in the gallery and command palette.

---

## 7. Adding icons / stencils

Cloud/infra icons are generated procedurally (`iconBadge`) in `shapes.js`. To use
custom SVG art, add an entry whose `render` returns your `<path>`/`<g>` art (local
coords). Drop reusable raw assets in `assets/icons/`.

---

## 8. Custom connectors & arrowheads

- **Routing**: add a branch in `connectors.routePath()` and an option in the
  Properties `routing` select. Return a path `d` plus the endpoint points.
- **Arrowheads**: add a case to `connectors.arrowHead(type, size)` returning
  `{ d, fill }` (tip at origin, pointing +X) and add the name to `ARROWS`.

---

## 9. Export / Import engines

- `export.js` builds a **standalone SVG** from the model (`buildSVG`) with concrete
  colors, then derives PNG (via `<canvas>`), HTML and Print from it. Add a new
  format by adding a method to the `Export` object and an entry in
  `app.openExportMenu()`.
- `import.js` dispatches by extension in `Import.file()`. Add a parser method and
  a dispatch case. Always wrap in `DD.history.transaction(...)`.

---

## 10. Performance notes

- The canvas keeps an **element index** (`_elIndex: id → group`) and performs
  **incremental updates** (`refreshObject`) during interaction rather than full
  re-renders.
- Connectors attached to a moving shape are rerouted individually.
- History snapshots are **coalesced** (400 ms idle) so a drag is one undo step.
- The grid is painted via a CSS background (GPU-friendly), not thousands of nodes.
- For very large documents, consider viewport culling (render only shapes whose
  bbox intersects the viewport) — a natural extension point in `renderAll()`.

---

## 11. Creating plugins

Because everything hangs off `DD` and the `bus`, a plugin is just another script
that runs after `app.js`:

```html
<script src="plugins/my-plugin.js"></script>
```

```js
// my-plugin.js
DD.bus.on(DD.EV.SELECTION, (sel) => { /* react */ });
DD.shapes && DD.shapes /* register shapes */;
DD.app.commands /* extend palette by wrapping */;
```

Recommended extension points: `DD.shapes.define`, `DD.templates.list`,
`DD.bus` events, and the command palette (`app.commands()`).

---

## 12. Coding standards

- ES2024, `"use strict"`, no external dependencies.
- One IIFE per file, attach exactly one object to `DD`.
- Prefer pure helpers in `utils.js`; keep DOM creation via `el()`/`svg()`.
- Emit events for state changes; never let views mutate the model directly.
- Name events through `DD.EV` constants.
- Keep functions small and single-purpose; comment the "why", not the "what".

---

## 13. Testing

A headless smoke test (Playwright) loads the app, asserts zero console errors,
exercises add/select/duplicate/undo, applies a template, and validates SVG
export. Run any static server and point a browser at `index.html` for manual QA.

---

## 14. Extension ideas

Multi-page documents, viewport virtualization for 10k+ nodes, `.vsdx` import,
real-time collaboration via CRDT, AI text-to-diagram, and a stencil marketplace.
See the Technical Design Document for the roadmap and where each would slot in.
