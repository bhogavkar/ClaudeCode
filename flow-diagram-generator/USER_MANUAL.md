# FlowForge — Flow Diagram Generator · User Manual

A complete, browser-based flow-diagram editor — a focused "draw.io / Lucidchart-class"
tool that runs entirely in your browser with no install, no server, and no account.

---

## 1. What this tool is & how to open it

**FlowForge** lets you build professional flowcharts, swimlane architectures, and
decision flows using an SVG drawing surface (so everything stays crisp and exports as
vector). It is a single self-contained file.

**To open it:** double-click `index.html`. It opens in your default browser using the
`file://` protocol — no web server required.

**Browser requirements:** any current version of Chrome, Edge, Firefox, or Safari.
Clipboard-image copy requires a Chromium-based browser.

**Offline behaviour:** the tool works fully offline. The only external resource is the
Google Fonts stylesheet (Inter + JetBrains Mono). If fonts can't load, the tool
automatically falls back to your system fonts and keeps every feature working.

**Privacy / persistence:** nothing is sent anywhere and nothing is stored in the
browser (no cookies, no localStorage). Your work lives in memory until you **Save** it
to a JSON file on your computer.

---

## 2. Interface tour

```
 ┌───────────────────────────────────────────────────────────────────┐
 │ TOP TOOLBAR:  File · Edit · Arrange · View · Theme · Help          │
 ├──────────┬─────────────────────────────────────────┬──────────────┤
 │  LEFT    │                                          │   RIGHT      │
 │ PALETTE  │            SVG  CANVAS                    │  INSPECTOR   │
 │ (shapes) │     (build your diagram here)            │ (properties) │
 │          │                                          │              │
 ├──────────┴─────────────────────────────────────────┴──────────────┤
 │ STATUS BAR:  zoom · cursor x/y · selection · grid/snap · LEGEND    │
 └───────────────────────────────────────────────────────────────────┘
```

- **Top toolbar** — grouped controls: *File* (New, Open, Save, Export), *Edit* (Undo,
  Redo, Duplicate, Delete), *Arrange* (front/back, Align, Distribute, Group), *View*
  (zoom, fit, grid, snap, legend), the *Theme* switcher and *Help*.
- **Left palette** — collapsible categories of shapes (Flowchart, Data, Containers,
  Annotations) with a search box. Click a shape to drop it on the canvas, or drag it
  to a precise spot.
- **Canvas** — the SVG drawing surface. Pan, zoom, select, and edit here.
- **Right inspector** — context-sensitive properties for whatever is selected: a node,
  an edge, a lane, a group, or (when nothing is selected) the whole diagram.
- **Status bar** — live zoom %, cursor coordinates, selection summary, grid/snap
  indicators, and the auto-generated **legend**.

Collapse the left/right panels with the small `‹` / `›` buttons in their headers to
maximise canvas space.

---

## 3. Your first diagram in 5 minutes

1. **Start fresh.** Click **New** → **Blank canvas**.
2. **Add a Start.** Press `T` (or drag *Terminator* from the palette). A blue START
   pill appears. Double-click it and type `START`.
3. **Add a process.** Press `R`. A rectangle appears. Double-click it; the first line
   becomes the **title**, following lines the **body**. Type `Validate input`.
4. **Add a decision.** Press `D` to drop a diamond. Rename it `Valid?`.
5. **Connect them.** Hover over the START pill — blue **ports** appear on its edges.
   Drag from the bottom port to the process. Repeat process → decision.
6. **Label & colour an edge.** Click the decision's outgoing edge. In the inspector
   pick the **Success / Yes** preset and type `Yes` in the Label field.
7. **Save.** Press `Ctrl/Cmd+S` to download a `.json` file. Use **Export ▸ PNG** for an
   image.

That's a complete flow. Everything below is detail.

---

## 4. Adding & styling shapes

**Add a shape** three ways: click it in the palette (drops at canvas center), drag it
to a spot, or use a hotkey (`R` process, `D` decision, `T` terminator, `N` note).
Double-click empty canvas to drop a quick process.

**Shape catalog:** Process, Rounded process, Decision (diamond), Terminator (pill),
Predefined process, Manual operation (trapezoid), Preparation (hexagon), Data/I-O
(parallelogram), Database (cylinder), Document (wavy bottom), Multi-document, Internal
storage, Display, Off-page connector (pentagon), Junction (dot), Circle/Ellipse,
Note/Callout, Info card, Text label.

**Node anatomy** — select a node and use the inspector to toggle/edit each part:

- **Title** (bold) + **Body** (smaller; tick *Monospace body* for SQL/code text).
- **Icon** — pick from the icon grid (clock, database, gear, warning, chart, info…),
  set its colour, or choose *none*.
- **Badge** — a coloured numbered circle in the top-right corner (the references use
  red badges 1–11). Toggle on, set value and colour.
- **Accent stripe** — the coloured vertical bar on the left edge. Toggle, recolour,
  set width.
- **Style** — Fill, Border colour/width/style (solid/dashed/dotted), corner Radius,
  Text colour, Font size, Alignment, Drop shadow.
- **Type preset** — one click sets a semantic look (Concurrent program, Data store,
  Payables, File/I-O, Orchestration, Decision, API/Package call, Reject/Error, Note,
  Start/End terminator). You can still override anything afterwards.

**Move / resize / rotate:** drag to move; drag the 8 handles to resize (hold `Shift`
to keep aspect ratio); use the Rotation slider in the inspector. Arrow keys nudge 1px,
`Shift`+arrows nudge by the grid step.

---

## 5. Connecting with arrows

- **Create:** hover a node to reveal its ports (N/S/E/W), then drag from a port to the
  target node. Or press `C` (connector tool), click the source, then click the target.
- **Edges stay attached** and **re-route automatically** when you move or resize either
  node. You can also drop an endpoint on empty canvas (a dangling edge).
- **Routing** (inspector): **Orthogonal/elbow** (default), **Straight**, or
  **Curved/bezier**. Drag a connector to reshape; *Clear waypoints* resets it.
- **Line style:** solid, dashed, dotted; set width and colour.
- **Arrowheads** — set independently for **Start** and **End**: none, filled triangle,
  open V, filled/open diamond, filled/open circle, or bar. *Reverse direction* swaps
  endpoints.
- **Labels:** type text in the Label field; it renders as a rounded **pill** on the
  line. Drag the *Position* slider (or drag the pill on canvas) to move it.
- **Semantic presets** (one click sets colour + style + head): **Sequence** (slate),
  **Success / Yes** (green), **Warning / Error / No** (red), **Async results** (grey
  dotted), **Special / Reporting** (purple).

---

## 6. Swimlanes & pools

- Add lanes from the palette (*Lane (V)* / *Lane (H)* / *Pool*) or from the Diagram
  inspector (*Add vertical/horizontal lane*).
- Each lane has a dark **header bar** with a coloured **swatch**, an uppercase
  **label**, and an optional right-aligned **sub-label** (e.g. "Application & database
  tier"). Set header colour and background tint in the inspector.
- **Resize** a lane via its W/H fields; reorder with the **Order** field.
- **Assign nodes:** drop a node inside a lane and it is automatically assigned to that
  lane (`laneId`). When you move a lane, contained nodes move with it — toggle this
  with *Move contained nodes with lane*.

---

## 7. Groups / containers

- Add a **Group** (dashed border) or **Frame** (solid border) from the palette, or
  select several nodes and press `Ctrl/Cmd+G`.
- A container has a label pill, configurable border colour/style and a faint fill.
- **Moving** a container moves its child nodes. **Ungroup** with `Ctrl/Cmd+Shift+G`.
- Containers may overlap/nest; node membership follows the container the node sits in.

---

## 8. Diagram chrome

With **nothing selected**, the inspector shows **Diagram properties** — the page
furniture that matches the reference layout:

- **Title** (rendered bold with a short red underline accent).
- **Subtitle** under the title.
- **Corner text** + **corner sub-text** (top-right, e.g. company name + "Confidential").
- **Footer caption** (italic, centered beneath the diagram).
- **Canvas** width/height, **grid** show/size, and **snap**.

---

## 9. Legend

- The **legend strip** lives in the status bar. Toggle it with the legend button or the
  Diagram inspector.
- **Auto mode** builds the legend from the node **types** and edge **presets** actually
  used — shape swatches (Concurrent program, Data store, Payables, File/I-O,
  Orchestration, Decision…) and line swatches (Sequence, Success/Yes,
  Warning/Error/No, Async results…).
- **Manual mode** lets you keep a fixed legend (edit `legend.items` in the saved JSON).

---

## 10. Themes / flavors

Use the **Theme** switcher (top-right) to restyle the whole diagram live:

1. **Light / Print** *(default — matches the references)*: white canvas, dotted grid.
2. **Deep Slate IDE**: dark canvas, light nodes.
3. **Blueprint**: deep blue, technical-drawing feel.
4. **High Contrast / Accessible**: black/white, thick borders.
5. **Pastel / Soft**: muted fills, soft shadows.
6. **Corporate**: restrained greys/blues.

A theme changes the canvas background, grid, and the **default** node fill/border/text
and edge colours. **Node-level overrides always win** — if you set a node's fill
explicitly, switching themes won't change it.

---

## 11. Save & Load

- **Save** (`Ctrl/Cmd+S`) downloads the entire diagram as a single **JSON** file named
  from the title + date.
- **Open** (`Ctrl/Cmd+O`) restores a saved JSON file. Malformed or non-diagram files
  show a clear error toast instead of crashing.
- **What's stored:** everything — meta/chrome, theme, lanes, groups, every node (all
  styling, icon, badge, accent, type, lane/group membership, rotation), every edge
  (endpoints + anchors, routing, style, arrowheads, label + position, preset,
  waypoints), imported images, and legend config. Save → Open round-trips exactly.

### Importing images & SVG files

The **Open** button (and `Ctrl/Cmd+O`) accepts more than diagram JSON — you can also
load **images**:

- **SVG** — imported as a **vector object with all graphics preserved intact** (every
  path, gradient, text, and `<defs>` is kept). It is scaled into an editable box you can
  move, resize, rotate, layer, group, and export. Nothing is lost or flattened.
- **PNG / JPG / GIF / WebP** — imported at their natural aspect ratio as an editable
  image object.

Three ways to import:

1. **Open** ▸ pick an `.svg` / `.png` / `.jpg`… file.
2. **Drag a file** from your computer straight onto the canvas — it lands where you drop
   it. You can drop several at once.
3. Re-open an **SVG you exported from FlowForge** — it comes back fully intact.

When an image is selected the inspector shows an **Image** panel: position & size,
**Restore aspect ratio**, rotation, and an optional frame (border + shadow). Imported
images are saved inside your `.json` (embedded), so Save → Open round-trips them too,
and they are included in PNG / SVG / PDF exports.

---

## 12. Export

Open the **Export ▸** menu:

- **PNG (HD):** choose scale **1× / 2× / 3×** (2× default), **transparent** or
  **themed/white** background, and **whole diagram** or **selection only**. The image
  is auto-cropped to content with a margin.
- **SVG:** a clean standalone vector file with styles inlined and a font fallback, so it
  renders correctly outside the app.
- **PDF / Print:** opens the browser print dialog with a print-optimised layout — choose
  *Save as PDF* for vector-quality output.
- **Copy image to clipboard:** copies a PNG (Chromium browsers).

---

## 13. Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Select tool | `V` |
| Pan / hand tool | `H` (or hold Space) |
| Rectangle / process | `R` |
| Decision (diamond) | `D` |
| Terminator (start/end) | `T` |
| Connector / draw arrow | `C` |
| Note / text | `N` |
| Undo / Redo | `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` |
| Copy / Cut / Paste | `Ctrl/Cmd+C` / `X` / `V` |
| Duplicate | `Ctrl/Cmd+D` |
| Delete | `Delete` or `Backspace` |
| Select all | `Ctrl/Cmd+A` |
| Group / Ungroup | `Ctrl/Cmd+G` / `Ctrl/Cmd+Shift+G` |
| Save / Open | `Ctrl/Cmd+S` / `Ctrl/Cmd+O` |
| Zoom in / out / reset | `Ctrl/Cmd +` / `−` / `0` |
| Fit to screen | `Shift+1` |
| Nudge / big nudge | Arrows / Shift+Arrows |

---

## 14. Two worked walk-throughs

### A) "Integration Architecture" (horizontal swimlane architecture)

1. **New ▸ Integration Architecture** to start from the finished template, or build it
   from blank as below.
2. **Diagram properties:** set Title `Integration Architecture`, Subtitle
   `Workday Expense Report Import → Oracle E-Business Suite · Accounts Payable
   (R12.2.12)`, Corner text `The TJX Companies, Inc.`, Corner sub `Confidential`.
3. **Add three vertical lanes** (Diagram inspector → *Add vertical lane* ×3). Label them
   `Control-M`, `Oracle E-Business Suite` (sub-label `Application & database tier`),
   `Business Users`. Give each a header swatch colour.
4. **Top row of processes** inside the EBS lane: `Request Set` (badge 1, list icon),
   `Inbound 1` (2), `Inbound 2` (3), `Common Data Loader` (4), `Delete & Archive` (6).
   Use the **Concurrent program** / **File-I/O** type presets; turn badges on. Add
   `Control-M Job` in the Control-M lane.
5. **Connect** them left-to-right with the default **Sequence** preset.
6. Add a **Document** `Expense data file`; connect it up to *Inbound 1* with a labelled
   edge `expense data file`.
7. Add a **cylinder** `Oracle Staging Table` (Data store preset, badge 5); connect
   *Common Data Loader → Staging* with the **Success** preset, label `Success`, and
   *Common Data Loader → Delete & Archive* with **Error**, label `Warning / Error`.
8. **Add a dashed container** `Invoice import & validation (Preprocessor)`. Inside it
   place `Derivation & Validation` (7, gear), a decision `Validation successful?`, and
   `Log Error` (9, Reject preset, warning icon).
9. Decision edges: **No** (red) → Log Error; **Yes** (green) → `Open Interface Table`
   (cylinder, badge 8). Add `Oracle Payables` (Payables preset, 10) → Open Interface
   Table labelled `Invoice Import`.
10. Add `Standard Invoice Import – Postprocessor` (11, bar-chart). Route grey dotted
    **Async** edges `results & logs` into it.
11. In the **Business Users** lane add a purple **Info card** and a **user** circle.
    Draw the long **Special/Reporting** purple edge `reporting & notification` into it.
12. The **legend** auto-fills. Set the **footer** to repeat the subtitle. **Export ▸
    PNG (2×)**.

### B) "Employee Supplier Derivation & Creation" (vertical decision flow)

1. **New ▸ Employee Supplier Derivation & Creation**, or build from blank.
2. Set Title + Subtitle (`TJX WorkDay Expense Report · Pre-Import Derivation · pattern
   follows AP_WEB_EXPORT_ER`). Keep the dotted grid on.
3. Drop a blue **Start** terminator `START · Employee Number + Operating Unit (Workday)`.
4. Add a **Process** `Derive PERSON_ID from Employee Number`; tick **Monospace body**
   and paste the SQL-like text; give it a blue accent stripe.
5. Add a **Decision** `Employee found and active?`. Draw a red **No** edge to a
   **Reject** box `WD_EMP_NOT_FOUND / WD_EMP_INACTIVE`; a green **Yes** edge continues
   down.
6. Continue the pattern: `Find existing employee supplier` → decision `Supplier
   exists?` with **three** outcomes — red **Many** → `WD_SUPP_DUP`; a green **dotted
   "Yes (reuse)"** edge running down the **left** side (add waypoints by dragging the
   connector); red **No (create)** continues down.
7. Decision `Create Employee as Supplier = Y…?` → red **No** → `WD_SUPP_CREATE`; green
   **Yes** continues to a purple **API** box `AP_VENDOR_PUB_PKG.create_vendor`
   (API/Package preset, monospace body).
8. `Find HOME pay site for the OU` → decision `HOME site exists?` with a green dotted
   **Yes (reuse)** left bypass and **No** down to
   `AP_VENDOR_PUB_PKG.create_vendor_site`; a red **error** edge → `WD_SITE_CREATE`.
9. `Update staging` (the reuse bypasses also feed it) → green **End** terminator
   `END · Ready for Preprocessor and open-interface load`.
10. Add a **Note** on the right titled `Transaction safety` with a red left border.
    **Export ▸ SVG** for a crisp vector copy.

---

## 15. Tips & troubleshooting

- **Performance:** the editor updates only what changes during a drag and uses
  `requestAnimationFrame`, so it stays smooth with 150+ nodes / 200+ edges. If a very
  large diagram feels heavy, hide the grid (View ▸ Grid) while editing.
- **Fonts offline:** if Inter/JetBrains Mono can't load, system fonts are used
  automatically — layout still works.
- **My theme didn't recolour a node:** that node has an explicit colour override.
  Clear the Fill/Border/Text fields (or pick a Type preset) to follow the theme again.
- **Edge won't attach:** drag *from a port* (hover the node first) and drop *on the
  target node body*, not on empty canvas.
- **Load error toast:** the file isn't valid diagram JSON. Re-export from FlowForge or
  check the file wasn't truncated.
- **Ctrl/Cmd+S saved instead of printing:** that's intended — Save downloads JSON. Use
  **Export ▸ PDF/Print** for printing.

---

## 16. (Optional) server integration

The shipped tool is 100% client-side and self-contained. At the very end of the inline
script there is a clearly-labelled, **disabled** stub (`ENABLE_SERVER = false`) showing
where an *optional* future backend save/load/share layer could be wired with **HTMX**
— e.g. POSTing the diagram JSON to a `/diagrams` endpoint and swapping in a "saved"
banner. HTMX is a server-driven hypermedia library and is deliberately **not** used for
the interactive editor core (drag, hit-testing, live SVG, undo) because that work is
inherently client-side. Leave the stub disabled to keep the tool fast, offline, and
self-contained.
