# Changelog

All notable changes to the Enterprise Diagram Designer are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/) and this
project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-06-27

### Added — initial production release
- **Rendering engine**: SVG-based infinite canvas with smooth pan, wheel & pinch
  zoom, dot/line/none grids, snap-to-grid, smart alignment guides, and a live
  minimap with click-to-pan.
- **Shape library**: 88+ shapes across 7 categories — Basic, Flowchart, UML,
  BPMN 2.0, Database/ERD, Cloud & Infra (Oracle/AWS/Azure/GCP/K8s/Docker/network),
  and Containers — all drawn from a single factory/registry.
- **Connector engine**: orthogonal, straight, curved and bezier routing;
  connection ports with magnetic attach; labels; dashed/dotted lines; animated flow.
- **Arrow library**: 11 arrowhead styles (filled, open, triangle, block, diamond,
  circle, half, crow's-foot, UML one/many) with per-end configuration.
- **Editing**: multi-select, marquee, move, resize (aspect-lock), rotate (15°
  snap), flip, align, distribute, group/ungroup, z-order, duplicate, copy/cut/paste,
  inline text editing, nudging.
- **Inspector**: context-aware Properties panel (geometry, rich text, fill/border/
  gradient/opacity/shadow, connector styling), Layers manager, Document settings.
- **History**: unlimited (capped) undo/redo with gesture coalescing and labelled
  transactions.
- **Templates**: Oracle EBS AP Invoice Flow, Oracle Integration Cloud architecture,
  approval flowchart, swimlane, ER diagram, AWS architecture, mind map, org chart —
  with a live-preview gallery.
- **Import**: JSON, SVG, Draw.io (mxGraph) XML, CSV.
- **Export**: JSON, SVG, PNG (2×/4×/transparent), HTML, Print/PDF.
- **Persistence**: autosave + recovery via LocalStorage and IndexedDB, recent files.
- **Themes**: Light, Dark, Oracle, Microsoft, High-Contrast.
- **Productivity**: command palette (Ctrl+K), full keyboard shortcuts, context menus.
- **Platform**: PWA with offline service-worker cache; responsive layout; touch
  support; accessibility (ARIA, keyboard nav, reduced-motion, high contrast).
- **Documentation**: README, User Manual, Developer Guide, Technical Design
  Document, this changelog, and MIT license.

### Notes
- Loads as ordered classic scripts attaching to a global `DD` namespace so the app
  runs directly from `file://` with no build step (browsers block ES-module imports
  over `file://`).

## [1.0.2] — 2026-06-27

### Added
- **Connectors & Arrows palette** — a dedicated sidebar section with 12 draggable
  arrow/line presets (arrow, line, bi-directional, open, dashed, dotted, curved,
  straight, UML inheritance/composition, ERD one-to-many, animated flow). Drag one
  onto the canvas to create a connector, or drop it on a shape to anchor one end.
- **Interactive connector endpoints** — selecting a connector now shows draggable
  endpoint handles; drag an end onto any shape and it snaps to the nearest
  connection port (handle turns green when attached) and re-routes live.

### Fixed
- Connector target detection now uses geometry (`_shapeAt`) instead of the DOM
  event target, so dragging reliably snaps onto shapes/ports under the cursor.

## [1.0.1] — 2026-06-27

### Fixed
- Pointer/mouse interactions were blocked by the hidden modal overlay (its CSS
  `display:flex` overrode the `hidden` attribute). Added a global
  `[hidden] { display: none !important; }` so every overlay truly hides and the
  canvas receives clicks/drags.

## [Unreleased]
- Multi-page documents, viewport virtualization for 10k+ nodes, real-time
  collaboration, AI-assisted generation, expanded cloud stencil packs, `.vsdx` and
  compressed `.drawio` import, multi-page/batch PDF export, auto-layout engines.
