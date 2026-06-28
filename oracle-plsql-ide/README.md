# Oracle PL/SQL IDE — Enterprise Edition

A purpose-built, browser-based IDE for **Oracle SQL, PL/SQL and Oracle E-Business
Suite (EBS)** development. It pairs the Monaco editor (the engine behind VS Code)
with an Oracle-aware language layer: smart IntelliSense, EBS object awareness,
live linting, a PL/SQL formatter, an offline AI assistant, a CSV grid editor and
a full enterprise panel layout.

No build step, no install — open `index.html` in a modern browser.

---

## Quick start

```bash
# from this folder, serve it (any static server works)
python3 -m http.server 8080
#   → open http://localhost:8080/

# …or simply open index.html directly in Chrome/Edge/Firefox
```

The Monaco editor engine ships **vendored** in `vendor/monaco/` (TypeScript/CSS/
HTML language services removed to keep it lean), so the IDE runs **fully offline
with no CDN dependency**. The loader uses the local copy first and only falls
back to a CDN if the vendored files are missing.

---

## What's implemented

### Smart PL/SQL engine
- **Context-aware completion** — type `SELECT *` then space and `FROM` is
  predicted; `OPEN` → `FETCH`; `EXCEPTION` → `WHEN`; etc.
- **EBS-aware suggestions** — type `FROM AP_` and get `AP_INVOICES_ALL`,
  `AP_SUPPLIERS`, `AP_CHECKS_ALL`, … Package member completion after `FND_FILE.`,
  `DBMS_OUTPUT.`, etc.
- **Smart block closing** — pressing Enter after `BEGIN`, `LOOP`, `IF … THEN`,
  `CASE` auto-inserts the matching `END;` / `END LOOP;` / `END IF;` / `END CASE;`
  (only when typing at the end of the buffer, so it never disturbs existing code).
- **Snippets** — `beginblock`, `declareblock`, `ifelse`, `cursorloop`,
  `bulkcollect`, `forall`, `procedure`, `function`, `packagespec`, `packagebody`,
  `trigger`, plus EBS ones (`ebsinit`, `submitreq`, `ebslog`).
- **Hover docs + signature help** for built-in packages, functions and EBS tables.
- **Project learning** — identifiers you declare are added to completion.

### IntelliSense knowledge base
Oracle keywords, datatypes, 90+ built-in functions, supplied packages
(`DBMS_*`, `UTL_*`, `APEX_UTIL`), predefined exceptions, pseudocolumns, and a
curated Oracle **EBS** catalog across FND, AP, AR, GL, PO, INV, HRMS, OM, WIP,
BOM, FA and custom (XXCUST) — seeded tables **and** public APIs.

### Live error detection (Problems panel + inline markers)
Unterminated `BEGIN`/`IF`/`LOOP`/`CASE`, `IF` missing `THEN`, `UPDATE`/`DELETE`
without `WHERE`, `= NULL` comparisons, `SELECT *`, `COMMIT`/`ROLLBACK` inside
loops, `EXECUTE IMMEDIATE` with concatenation (**SQL-injection risk**), hardcoded
literals in EBS queries, unused variables, `GOTO`, stray `DBMS_OUTPUT`, and more —
each with a severity (error / warning / hint), a code, and click-to-navigate.

### Formatter (Ctrl+Shift+F)
Uppercases keywords, re-indents blocks, breaks major SQL clauses onto their own
lines, and preserves strings/comments/numeric literals exactly.

### Offline AI assistant
Explain · Review · Optimize · Document · Generate · Explain-Oracle-error.
Generates procedures, functions, packages, bodies, triggers, cursors,
`BULK COLLECT` / `FORALL`, exception blocks and EBS concurrent programs.
Runs **entirely offline** (rule-based). To plug in a real LLM, set
`window.AIConfig = { endpoint: '…', headers: {…} }` and calls are delegated there.

### Workbench
- Activity bar + dockable side views: Project Explorer, Database Explorer,
  Search, Debug/Run, Source Control, Code Quality, AI.
- Tabbed multi-file editing, breadcrumb (with enclosing PROCEDURE/FUNCTION),
  minimap, sticky scroll, resizable splitters.
- Bottom panel: **Problems**, **Output**, **DBMS Output**, **Explain Plan**.
- 14 themes (Oracle Dark/Light, Dracula, Monokai, One Dark Pro, GitHub,
  Solarized ×2, Nord, Night Owl, VS Dark/Light, Material Dark, High Contrast) —
  the whole IDE chrome re-skins with the editor theme. Custom themes supported
  via `OracleThemes.defineCustom(...)`.
- **Command palette** (Ctrl+Shift+P), configurable shortcuts, session
  persistence + restore (localStorage), breakpoint gutter.
- **CSV/DAT grid editor** — delimiter auto-detect, quoted fields, sort, filter,
  inline edit, add row/column, export.
- Supported file types: `.sql .pks .pkb .pls .prc .fnc .trg .typ .tps .vw
  .csv .xml .json .txt .log .ctl .dat`.

### Run / Compile / Explain Plan
Run script (F5), run selection (Ctrl+Enter), compile object (F9), and a
simulated explain plan. Execution is **simulated** in-browser — it surfaces
compile errors from the linter, statement/row summaries and captured
`DBMS_OUTPUT`. Wire a backend to execute against a live database (see below).

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| IntelliSense | `Ctrl+Space` |
| Format | `Ctrl+Shift+F` |
| Command palette | `Ctrl+Shift+P` |
| Comment / uncomment | `Ctrl+/` |
| Duplicate line | `Ctrl+D` |
| Delete line | `Ctrl+Shift+K` |
| Find / Replace | `Ctrl+F` / `Ctrl+H` |
| Run script / selection | `F5` / `Ctrl+Enter` |
| Compile object | `F9` |
| New / Open / Save | `Ctrl+N` / `Ctrl+O` / `Ctrl+S` |
| Go to line / symbol | `Ctrl+G` / palette |

## Architecture

```
oracle-plsql-ide/
├── index.html              # shell + resilient Monaco loader
├── css/main.css            # theme-driven IDE chrome
└── js/
    ├── data/oracle-data.js     # Oracle + EBS knowledge base
    ├── lang/oracle-monaco.js   # tokenizer, completion, hover, signatures
    ├── lang/themes.js          # 14 editor + chrome themes
    ├── core/formatter.js       # PL/SQL pretty-printer
    ├── core/linter.js          # live static analysis
    ├── core/ai.js              # offline AI assistant (+ optional remote)
    ├── core/csv.js             # CSV grid editor
    ├── core/files.js           # file types, samples, persistence
    └── app.js                  # controller: tabs, panels, palette, wiring
```

Pure vanilla JS — the only third-party dependency is Monaco.

## Live database connectivity (extending this build)

This is a front-end. Connections, the Database Explorer metadata, execution and
compilation are **illustrative/simulated** so the IDE is useful with zero setup.
To make them real, add a small backend (e.g. Node + `oracledb`, or ORDS) and:

1. Replace the simulated `runScript` / `compileObject` in `app.js` with `fetch`
   calls to your endpoint.
2. Populate the Database Explorer from `ALL_OBJECTS` / `ALL_TAB_COLUMNS`.
3. Point `window.AIConfig.endpoint` at an LLM service for richer AI.

## Offline / CDN

Monaco is **already vendored** at `vendor/monaco/min/vs`, and the loader checks
that path **first** — so the IDE runs with no network at all. If those files are
ever removed, the loader falls back to CDNs (jsDelivr → cdnjs → unpkg); if none
is reachable, a clear on-screen message explains how to restore it:

```bash
npm pack monaco-editor@0.45.0
# extract package/min/vs  →  oracle-plsql-ide/vendor/monaco/min/vs
```

## Notes & limitations

- Execution, compilation and explain-plan output are simulated client-side.
- The formatter is a pragmatic re-indenter, not a full SQL grammar formatter.
- The linter is heuristic static analysis (no server-side parse).
- Tested logic (formatter, linter, CSV, AI) ships with reproducible checks.
