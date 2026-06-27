# User Manual — Enterprise Diagram Designer

Version 1.0.0

---

## 1. Installation

There is nothing to install. The application is a self-contained set of static
files.

1. Obtain the project folder (download or `git clone`).
2. Open `index.html` by double-clicking it, or drag it into a browser tab.
3. Use any modern browser: Chrome, Edge, Firefox, or Safari (current versions).

**Optional — run as an installable offline app (PWA):** serve the folder over
HTTP and the service worker will cache it for full offline use:

```bash
# any static server works, e.g.:
python3 -m http.server 8080
# then visit http://localhost:8080
```

When served over HTTP you can use your browser's **Install app** option to add it
to your desktop/start menu.

---

## 2. Overview of the interface

| Area | Purpose |
|---|---|
| **Top bar** | Menus (File/Edit/View/Arrange/Help), document name, theme, command palette, Export. |
| **Toolbar** | Tools (Select/Pan/Connector), undo/redo, duplicate/delete/group, z-order, align/distribute, grid, templates. |
| **Left sidebar** | Searchable shape library, grouped by category. |
| **Canvas** | The infinite drawing surface with grid, zoom controls and minimap. |
| **Right inspector** | Properties (context-aware), Layers, and Document settings tabs. |
| **Status bar** | Selection info, pointer coordinates, object count, save status. |

---

## 3. Creating a diagram

- **New**: File → New (`Ctrl`-discard prompt if unsaved).
- **From a template**: Toolbar → Templates, or `Ctrl+K` → "Template: …".
- The app **autosaves** continuously to your browser, and restores your last
  diagram automatically when you reopen it.

---

## 4. Adding shapes

- **Drag** a shape from the left palette onto the canvas.
- **Double-click** a palette item to drop it at the canvas center.
- **Double-click** empty canvas to quickly add a process box and start typing.
- **Search** the palette using the box at the top of the sidebar.
- **Command palette** (`Ctrl+K`) → type "Add: …".

### Editing text
Double-click a shape (or press `F2`) to edit its label inline. `Enter` commits,
`Shift+Enter` adds a line, `Esc` cancels.

---

## 5. Using connectors

1. Choose the **Connector** tool (toolbar or press `C`).
2. Hover a shape — blue **connection ports** appear.
3. Drag from a port to another shape/port to create a link.

With the **Select** tool you can also hover a shape and drag straight from a port.
Select a connector to change its **routing** (orthogonal/straight/curved/bezier),
**arrowheads** (both ends), color, width, line style, label, and animation in the
Properties panel.

---

## 6. Formatting

Select one or more objects, then use the **Properties** panel:

- **Position & Size** — X/Y/W/H, rotation, flip H/V.
- **Text** — label, font family/size, bold/italic/underline/strike, alignment, color.
- **Fill & Border** — fill color, gradient, border color/width/style, opacity, shadow.
- **Connector** — routing, arrowheads, color, width, dashed/dotted, animated flow.

Multi-selection applies edits to every selected object at once.

---

## 7. Arranging

- **Align**: left/center/right/top/middle/bottom (toolbar or Arrange menu).
- **Distribute**: even horizontal/vertical spacing (3+ shapes).
- **Z-order**: bring to front/forward, send backward/to back (`[` / `]`).
- **Group / Ungroup**: `Ctrl+G` / `Ctrl+Shift+G` — grouped shapes select together.
- **Nudge**: arrow keys (1px), `Shift`+arrows (10px).

---

## 8. Layers

Open the **Layers** tab. You can add, rename (double-click), reorder (▲▼),
toggle visibility (👁), lock (🔒), and delete layers. The active layer (highlighted)
receives newly added shapes. Assign selected objects to a layer in the Properties
panel's *Arrange → Layer* dropdown.

---

## 9. Templates

Toolbar → **Templates** opens a gallery with live previews:
Oracle EBS AP Invoice Flow, Oracle Integration Cloud architecture, approval
flowchart, swimlane, ER diagram, AWS architecture, mind map, and org chart.
Click a card to insert it (replaces an empty canvas, otherwise appends).

---

## 10. Saving & opening

- **Save** (`Ctrl+S`) — persists to the browser (LocalStorage + IndexedDB) and
  records the file in *File → Open recent*.
- **Save as JSON** — downloads a portable `.json` project file.
- **Open file** (`Ctrl+O`) — load a `.json`, `.svg`, `.drawio/.xml`, or `.csv`.
- **Autosave & recovery** — your work is saved automatically and restored on
  reload, even after an accidental close.

---

## 11. Importing

| Format | Behavior |
|---|---|
| **JSON** | Full fidelity (native project format). |
| **Draw.io XML** | Vertices → shapes, edges → connectors (export *uncompressed* XML from draw.io). |
| **SVG** | Embedded as an image reference. |
| **CSV** | Each row → a node; optional `parent` column builds a tree. |

---

## 12. Exporting

`Ctrl+E` (or the **Export** button) offers:

- **PNG** (2×), **High-res PNG** (4×), **Transparent PNG**
- **SVG** (true vector)
- **JSON** (project)
- **HTML** (standalone viewer)
- **Print / PDF** (`Ctrl+P` → print to PDF)

Exports are generated from the model with concrete colors, so they look identical
everywhere regardless of your current theme.

---

## 13. Printing

File → Print / PDF (`Ctrl+P`) opens a print-ready page. In the print dialog set
landscape/portrait, scaling, and margins, then choose **Save as PDF** or a printer.

---

## 14. Keyboard shortcuts

See **Help → Keyboard shortcuts** in the app for the complete, always-current
list. The most-used ones are in the README table.

---

## 15. Themes & accessibility

Cycle themes with the **Theme** button or `T`: Light, Dark, Oracle, Microsoft,
**High-Contrast**. The UI is fully keyboard-navigable, uses ARIA roles/labels,
respects `prefers-reduced-motion`, and the high-contrast theme aids low-vision use.

---

## 16. Tips & tricks

- Hold `Shift` while resizing a corner to keep aspect ratio.
- Hold `Shift` while rotating to snap to 15° increments.
- `Space`+drag pans from any tool; the mouse wheel zooms toward the cursor.
- Smart guides snap edges/centers to nearby shapes — toggle in Document settings.
- Use the minimap (bottom-right): click to jump the viewport.

---

## 17. Troubleshooting

| Symptom | Fix |
|---|---|
| Blank page when opening `index.html` | Ensure the whole folder (css/js/assets) is present; don't open a single file in isolation. |
| Export PNG looks blurry | Use High-res (4×). |
| Draw.io import fails | Re-export from draw.io as **uncompressed** XML. |
| Lost work | Reopen the app — autosave restores your last diagram. Also check *File → Open recent*. |
| Print dialog blocked | Allow popups for the page. |

---

## 18. FAQ

**Does my data leave my machine?** No. Everything runs locally in your browser;
nothing is uploaded.

**Where is my work stored?** In your browser's LocalStorage and IndexedDB for the
current origin. Export to JSON for portable backups.

**Can I use it offline?** Yes — fully offline. Serve it over HTTP once to enable
the PWA service worker, then it works with no connection.

**How many objects can it handle?** Comfortably thousands; the renderer performs
incremental updates during interaction.

---

## 19. Best practices

- Keep related elements on dedicated **layers** (e.g., background, flow, annotations).
- Use **templates** as starting points for standard Oracle EBS / OIC patterns.
- Export the **SVG** for documentation (crisp at any zoom) and **PNG** for slides.
- Commit exported **JSON** files to version control for diagram history.
