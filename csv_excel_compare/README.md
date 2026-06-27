# ◧ DataDiff — CSV / Excel comparison tool

A small, dependency-light command-line tool that compares **two CSV or Excel
files** and produces a clear picture of what changed between them:

- ✅ **Total row counts** for each file
- 🔁 **Cell-level changes** — every value that differs, shown as `old → new`
- ➖ **Rows only in the first file** (removed)
- ➕ **Rows only in the second file** (added)
- 🧱 **Column changes** — columns added or removed
- 🖥️ A colourful **terminal summary**, plus
- 🌐 A self-contained, beautifully styled **HTML report** you can open in any browser

It works with `.csv`, `.txt`, `.xlsx`, `.xls`, and `.xlsm` files.

There are **two ways to use it**:

1. **`datadiff.html`** — a zero-install web page. Just open it in a browser,
   drop in two files, and view the comparison. Everything runs locally; nothing
   is uploaded anywhere.
2. **`compare.py`** — a command-line tool for scripting and automation.

---

## Option 1 — the browser tool (no install)

Open **`datadiff.html`** in any modern browser (double-click it, or
`File ▸ Open`). Then:

1. Drop or pick **File 1** (baseline) and **File 2** (compared).
2. Choose how to match rows — by **key column(s)** (recommended) or by
   **row position**.
3. Click **Compare files**.
4. Use **Download report (HTML)** to save a standalone copy of the result.

Keep the `vendor/` folder next to `datadiff.html` — it contains the bundled
spreadsheet reader (SheetJS) so the page works fully offline. If you move the
HTML on its own, it falls back to loading that library from a CDN.

---

## Option 2 — the command-line tool

### Installation

```bash
pip install -r requirements.txt
```

(Only `pandas` and `openpyxl` are required.)

---

## Usage

```bash
python compare.py FILE1 FILE2 [options]
```

| Option | Description |
| ------ | ----------- |
| `-k`, `--key`   | Comma-separated key column(s) used to match rows, e.g. `--key id` or `--key order_id,line`. **Recommended.** If omitted, rows are matched by position. |
| `-s`, `--sheet` | Excel sheet name to read (default: first sheet). |
| `-o`, `--output`| Path for the HTML report (default: `datadiff_report.html`). Pass `-o ''` to skip writing HTML. |
| `--no-open`     | Don't print the "open in browser" hint. |

### How rows are matched

- **Key-based (recommended):** pass `--key`. Rows in the two files are paired by
  their key value(s), so reordering rows or inserting/deleting rows is handled
  correctly. Differences are reported as added rows, removed rows, and changed cells.
- **Positional:** if you don't pass `--key`, row *N* in file 1 is compared with
  row *N* in file 2. Useful when the files have no natural key.

### Exit codes

- `0` — files are identical
- `1` — differences were found

This makes the tool easy to use in scripts and CI pipelines.

---

## Examples

```bash
# Match rows on the "id" column and write an HTML report
python compare.py old.csv new.csv --key id

# Compare two Excel files on a specific sheet, using two key columns
python compare.py old.xlsx new.xlsx --key order_id,line --sheet Orders

# No key columns — compare row-by-row by position
python compare.py old.csv new.csv

# Choose where the report is written
python compare.py a.csv b.csv --key id --output report.html
```

### Try it with the included sample data

```bash
python compare.py sample_data/employees_old.csv sample_data/employees_new.csv --key id
```

Expected summary:

```
  Row counts
    Rows in file 1 .......... 6
    Rows in file 2 .......... 7
    Matched / compared ...... 5
    Unchanged ............... 1
    Changed (rows) .......... 4
    Only in file 1 (removed)  1
    Only in file 2 (added) .. 2
```

Then open `datadiff_report.html` in your browser for the full visual diff.

---

## What the HTML report shows

- **Summary cards** — row counts per file, unchanged / changed rows, and rows
  added / removed at a glance.
- **Changed cells table** — every differing value, colour-coded red (old) → green (new).
- **Column changes** — any columns added or removed between the two files.
- **Rows only in File 1 / File 2** — the full removed and added rows.

---

## Notes

- Values are compared as trimmed text, so `" 100 "` and `"100"` are treated as equal.
- Empty cells are shown as `∅`.
- Column names are stripped of surrounding whitespace before matching.
