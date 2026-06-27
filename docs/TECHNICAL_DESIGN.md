# Technical Design Document — Enterprise Diagram Designer

Version 1.0.0 · Status: Implemented (v1)

---

## 1. Goals & constraints

- **Zero-infrastructure**: runs from `file://` by opening `index.html` — no server,
  database, build step, or install.
- **Native only**: HTML5, CSS3, ES2024, SVG, Canvas, Web APIs. No frameworks.
- **Enterprise quality**: modular, documented, extensible, accessible, performant.
- **Offline-first**: PWA service worker + local persistence.

These constraints drive two key decisions: (1) an **SVG-based** rendering engine
(vector fidelity, hit-testing, easy export) and (2) **classic scripts + a global
`DD` namespace** instead of ES-module imports (which `file://` blocks).

---

## 2. Application architecture

Event-driven **MVVM**. The Model (`store`) is the single source of truth; Views
(canvas + panels) render from it and request mutations through it; the **EventBus**
broadcasts change notifications.

```
┌──────────────────────── Presentation (View / ViewModel) ─────────────────────┐
│  canvas.js   sidebar.js   toolbar.js   properties.js   layers.js   app.js     │
└───────────▲───────────────────────────────────────────────────────┬──────────┘
            │ subscribe (DD.bus events)                   request mutations
            │                                                         ▼
┌───────────┴───────────── Domain / State ─────────────────────────────────────┐
│  store.js (document model, selection)   history.js (undo/redo memento)        │
│  shapes.js (factory/registry)           connectors.js (routing/arrow geometry)│
└───────────▲───────────────────────────────────────────────────────┬──────────┘
            │                                                         ▼
┌───────────┴───────────── Infrastructure / Services ──────────────────────────┐
│  storage.js (LocalStorage + IndexedDB)  export.js  import.js  utils.js  sw.js │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Component responsibilities

| Component | Responsibility |
|---|---|
| `utils` | Namespace, DOM/SVG builders, math/geometry, color, files, toast. |
| `eventbus` | Pub/sub; canonical event names in `DD.EV`. |
| `store` | Document model, selection, all mutating operations. |
| `history` | Snapshot-based undo/redo with coalescing & transactions. |
| `shapes` | Shape definitions, factory, ports; shared by canvas & export. |
| `connectors` | Endpoint resolution, routing strategies, arrowhead geometry, hit. |
| `canvas` | Viewport (pan/zoom), grid, render, selection handles, interaction FSM, snapping, smart guides, minimap, drag-drop. |
| `sidebar` | Shape palette: categories, search, drag-to-canvas, previews. |
| `toolbar` | Tools + quick actions + top menus. |
| `properties` | Context-aware inspector + document settings. |
| `layers` | Layer manager + inspector tab switching. |
| `templates` | Built-in templates + gallery + insertion. |
| `storage` | Autosave, recovery, recent files, IndexedDB persistence. |
| `export` / `import` | Format strategies (JSON/SVG/PNG/HTML/Print, JSON/SVG/Draw.io/CSV). |
| `shortcuts` | Keyboard map → actions. |
| `app` | Controller/glue: clipboard, align/distribute, grouping, text editing, menus, command palette, modals, status bar. |

---

## 3. Sequence diagrams (textual)

### 3.1 Add a shape via drag-drop
```
User → Palette: dragstart(type)
User → Canvas: drop(x,y)
Canvas → Store: addShape(create(type, snappedXY))    [inside history.transaction]
Store → Bus: SHAPE_ADDED
Bus → Canvas: refreshObject(id)                      (incremental render)
Bus → Properties/Status: update
History: commit "Add <label>"
```

### 3.2 Move a selection (drag)
```
pointerdown → Canvas: mode=moving, capture origins
pointermove → Canvas: compute dx/dy, snap, smartGuides → mutate shape coords,
              update group transforms + reroute attached connectors (no full render)
pointerup   → History.commit("Move"); Store.markDirty()
              Bus → Storage: debounced autosave
```

### 3.3 Undo
```
User: Ctrl+Z → History.undo()
History: pop entry → Store.load(entry.before, silent)
History → Bus: DOC_LOADED → Canvas.renderAll(); panels refresh
```

---

## 4. Rendering engine

- **Surface**: one root `<svg>` with a `#viewport` group transformed by
  `translate(tx,ty) scale(s)`. Pan/zoom mutate this transform only.
- **Layers (z)**: three groups — connectors, shapes, overlay (handles/marquee/
  guides). Document layers map to z-order + visibility/opacity/lock.
- **Shapes**: each is a `<g>` positioned by `translate + rotate(about center)`;
  styling (`fill/stroke/width/opacity/dasharray/filter`) is set on the group so
  geometry inherits — keeping renderers tiny.
- **Text**: `<text>` with greedy word-wrapping into `<tspan>` lines, vertical
  alignment, and rich styling (bold/italic/underline/strike/align/color).
- **Connectors**: `routePath()` yields a path plus segment angles; arrowheads are
  drawn as oriented paths at each end (full control over color/size/fill).
- **Handles**: drawn in world space but sized as `k/scale` so they stay constant
  on screen at any zoom; `vector-effect: non-scaling-stroke` keeps outlines crisp.
- **Grid**: rendered as a CSS background-image (dot/line) on the host element,
  offset by the pan and scaled by zoom — far cheaper than DOM grid lines.
- **Incremental updates**: an `id → element` index enables single-element refresh
  during interaction; only attached connectors reroute.

---

## 5. Interaction state machine

`canvas.mode ∈ { idle, panning, marquee, moving, resizing, rotating, connecting }`.
`pointerdown` classifies the hit (port / handle / shape / connector / canvas) and
the active tool/modifiers to choose a mode; `pointermove` dispatches; `pointerup`
finalizes and commits a history step. Touch adds a two-pointer pinch-zoom path.

---

## 6. Snapping & smart guides

- **Grid snap**: positions rounded to `gridSize` when enabled.
- **Smart guides**: while moving, the selection's union box edges/centers are
  compared against other shapes' edges/centers within a tolerance; on a match the
  selection is nudged to align and a red guide line is drawn.

---

## 7. Data model & storage design

- **Model**: plain serializable JSON (Section 2 of the Dev Guide). Forward-
  compatible loading via `_migrate()` fills missing fields from defaults.
- **Persistence tiers**:
  1. **LocalStorage** — fast autosave of the current document + recent-files index.
  2. **IndexedDB** (`dd-diagrams/docs`) — durable, larger-capacity document store.
  3. **File export/import** — portable JSON for backups and version control.
- **Autosave** is debounced (1.5 s) on every change; **recovery** restores the last
  document on load; `beforeunload` warns on unsaved changes.

---

## 8. Undo/redo design

A **memento stack** of `{ label, before, after }` document snapshots. Rapid bursts
(drag/typing) are **coalesced** by an idle timer so each gesture is one step;
explicit `transaction(label, fn)` wraps discrete operations. Undo/redo reload
snapshots and restore selection where ids still exist. Default depth: 200.

---

## 9. Export pipeline

`buildSVG()` serializes the model to a standalone SVG with **concrete colors**
(theme-independent). PNG renders that SVG through an `<img>` onto a `<canvas>` at a
chosen scale (2×/4×/transparent). HTML wraps the SVG in a viewer page; Print opens
a print-optimized window for PDF output. All formats derive from one serializer.

---

## 10. Accessibility

ARIA roles/labels on landmarks and controls, full keyboard operation (tools,
editing, navigation, command palette), a dedicated **high-contrast** theme,
`prefers-reduced-motion` support, and visible focus styling.

---

## 11. Performance characteristics

- O(1) incremental shape updates via the element index.
- CSS-painted grid (no per-line DOM).
- Coalesced history & debounced autosave reduce churn.
- Throttled pointer-coordinate readouts and minimap refresh.
- **Scale path for 10k+ nodes**: add viewport culling in `renderAll()` (render only
  intersecting bboxes) and optional `OffscreenCanvas`/Web-Worker rasterization for
  export of very large scenes — designed-for, not yet enabled.

---

## 12. Security & privacy

Fully client-side; no network calls, telemetry, or uploads. Imported text is
parsed defensively (DOMParser, `try/catch`) and user text is escaped where injected
as HTML.

---

## 13. Future enhancements

1. **Multi-page** documents with page thumbnails.
2. **Viewport virtualization** for very large diagrams.
3. **Real-time collaboration** (WebRTC + CRDT/Yjs-style merge).
4. **AI-assisted generation** (text → diagram, auto-layout via graph algorithms).
5. **Plugin marketplace** & richer cloud stencil packs (full AWS/Azure/GCP/OCI sets).
6. **`.vsdx` / compressed `.drawio`** import; **multi-page PDF** & batch export.
7. **Auto-layout** engines (layered/tree/force-directed).

Each maps to an existing seam: rendering (`canvas`), model (`store`), services
(`storage/export/import`), or registries (`shapes/templates`).
