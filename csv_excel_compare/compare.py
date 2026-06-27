#!/usr/bin/env python3
"""
DataDiff — a friendly tool to compare two CSV / Excel files.

It tells you, in a beautiful way:
  * how many rows are in each file,
  * which rows exist only in the first file,
  * which rows exist only in the second file,
  * exactly which cell values changed (old value -> new value),
  * which columns were added or removed.

Comparison can be done in two ways:
  * key-based  : rows are matched on one or more "key" columns (recommended).
  * positional : rows are matched by their position (row 1 vs row 1, ...).

Outputs:
  * a colourful summary printed to the terminal, and
  * a self-contained, nicely styled HTML report you can open in any browser.

Usage examples
--------------
    # match rows on the "id" column, write an HTML report
    python compare.py old.csv new.csv --key id

    # compare two Excel files using a specific sheet, two key columns
    python compare.py old.xlsx new.xlsx --key order_id,line --sheet Sheet1

    # no key columns: compare row-by-row by position
    python compare.py old.csv new.csv

    # choose where the report is written
    python compare.py a.csv b.csv --key id --output my_report.html
"""

from __future__ import annotations

import argparse
import html
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

try:
    import pandas as pd
except ImportError:  # pragma: no cover
    sys.exit(
        "This tool needs pandas (and openpyxl for Excel).\n"
        "Install them with:  pip install -r requirements.txt"
    )


# --------------------------------------------------------------------------- #
# Terminal colours (ANSI). Disabled automatically when output is not a TTY.    #
# --------------------------------------------------------------------------- #
class C:
    enabled = sys.stdout.isatty()

    @classmethod
    def _w(cls, code: str, text: str) -> str:
        return f"\033[{code}m{text}\033[0m" if cls.enabled else text

    @classmethod
    def bold(cls, t):    return cls._w("1", t)
    @classmethod
    def dim(cls, t):     return cls._w("2", t)
    @classmethod
    def red(cls, t):     return cls._w("31", t)
    @classmethod
    def green(cls, t):   return cls._w("32", t)
    @classmethod
    def yellow(cls, t):  return cls._w("33", t)
    @classmethod
    def blue(cls, t):    return cls._w("34", t)
    @classmethod
    def cyan(cls, t):    return cls._w("36", t)


# --------------------------------------------------------------------------- #
# Result containers                                                            #
# --------------------------------------------------------------------------- #
@dataclass
class CellChange:
    key: str
    column: str
    old: str
    new: str


@dataclass
class ComparisonResult:
    file1: str
    file2: str
    keys: list[str]
    mode: str                          # "key" or "positional"

    rows_file1: int = 0
    rows_file2: int = 0

    columns_file1: list[str] = field(default_factory=list)
    columns_file2: list[str] = field(default_factory=list)
    added_columns: list[str] = field(default_factory=list)
    removed_columns: list[str] = field(default_factory=list)
    common_columns: list[str] = field(default_factory=list)

    only_in_file1: list[dict] = field(default_factory=list)   # removed rows
    only_in_file2: list[dict] = field(default_factory=list)   # added rows
    changed_cells: list[CellChange] = field(default_factory=list)

    matched_rows: int = 0
    unchanged_rows: int = 0

    @property
    def changed_rows(self) -> int:
        return len({c.key for c in self.changed_cells})


# --------------------------------------------------------------------------- #
# Loading                                                                      #
# --------------------------------------------------------------------------- #
def load_file(path: str, sheet: Optional[str]) -> pd.DataFrame:
    if not os.path.exists(path):
        sys.exit(f"File not found: {path}")

    ext = os.path.splitext(path)[1].lower()
    try:
        if ext in (".csv", ".txt"):
            df = pd.read_csv(path, dtype=str, keep_default_na=False)
        elif ext in (".xlsx", ".xls", ".xlsm"):
            sheet_arg = sheet if sheet is not None else 0
            df = pd.read_excel(path, sheet_name=sheet_arg, dtype=str)
            df = df.fillna("")
        else:
            sys.exit(
                f"Unsupported file type '{ext}' for {path}. "
                "Use .csv, .txt, .xlsx, .xls or .xlsm."
            )
    except Exception as exc:  # pragma: no cover
        sys.exit(f"Could not read {path}: {exc}")

    # Normalise: strip column names, everything as strings for stable compares.
    df.columns = [str(c).strip() for c in df.columns]
    return df.astype(str).apply(lambda col: col.str.strip())


# --------------------------------------------------------------------------- #
# Comparison                                                                   #
# --------------------------------------------------------------------------- #
def compare(
    df1: pd.DataFrame,
    df2: pd.DataFrame,
    file1: str,
    file2: str,
    keys: list[str],
) -> ComparisonResult:
    mode = "key" if keys else "positional"
    res = ComparisonResult(file1=file1, file2=file2, keys=keys, mode=mode)

    res.rows_file1 = len(df1)
    res.rows_file2 = len(df2)
    res.columns_file1 = list(df1.columns)
    res.columns_file2 = list(df2.columns)

    cols1, cols2 = set(df1.columns), set(df2.columns)
    res.added_columns = [c for c in df2.columns if c not in cols1]
    res.removed_columns = [c for c in df1.columns if c not in cols2]
    res.common_columns = [c for c in df1.columns if c in cols2]

    if keys:
        _compare_by_key(df1, df2, keys, res)
    else:
        _compare_by_position(df1, df2, res)

    return res


def _row_to_dict(row: pd.Series) -> dict:
    return {k: ("" if pd.isna(v) else str(v)) for k, v in row.items()}


def _compare_by_key(df1, df2, keys, res: ComparisonResult) -> None:
    missing = [k for k in keys if k not in df1.columns or k not in df2.columns]
    if missing:
        sys.exit(
            f"Key column(s) not found in both files: {', '.join(missing)}\n"
            f"  File 1 columns: {', '.join(res.columns_file1)}\n"
            f"  File 2 columns: {', '.join(res.columns_file2)}"
        )

    def key_of(row) -> str:
        return " | ".join(str(row[k]) for k in keys)

    idx1 = {key_of(r): r for _, r in df1.iterrows()}
    idx2 = {key_of(r): r for _, r in df2.iterrows()}

    keys1, keys2 = set(idx1), set(idx2)
    compare_cols = [c for c in res.common_columns if c not in keys]

    # Rows only in file 1 (removed)
    for k in [key_of(r) for _, r in df1.iterrows() if key_of(r) not in keys2]:
        res.only_in_file1.append(_row_to_dict(idx1[k]))

    # Rows only in file 2 (added)
    for k in [key_of(r) for _, r in df2.iterrows() if key_of(r) not in keys1]:
        res.only_in_file2.append(_row_to_dict(idx2[k]))

    # Rows present in both -> look for cell-level changes
    for k in (key_of(r) for _, r in df1.iterrows()):
        if k not in keys2:
            continue
        res.matched_rows += 1
        r1, r2 = idx1[k], idx2[k]
        row_changed = False
        for col in compare_cols:
            v1 = "" if pd.isna(r1[col]) else str(r1[col])
            v2 = "" if pd.isna(r2[col]) else str(r2[col])
            if v1 != v2:
                res.changed_cells.append(CellChange(k, col, v1, v2))
                row_changed = True
        if not row_changed:
            res.unchanged_rows += 1


def _compare_by_position(df1, df2, res: ComparisonResult) -> None:
    compare_cols = res.common_columns
    n = min(len(df1), len(df2))

    for i in range(n):
        res.matched_rows += 1
        r1, r2 = df1.iloc[i], df2.iloc[i]
        row_changed = False
        for col in compare_cols:
            v1 = "" if pd.isna(r1[col]) else str(r1[col])
            v2 = "" if pd.isna(r2[col]) else str(r2[col])
            if v1 != v2:
                res.changed_cells.append(CellChange(f"Row {i + 1}", col, v1, v2))
                row_changed = True
        if not row_changed:
            res.unchanged_rows += 1

    # Extra rows in the longer file
    for i in range(n, len(df1)):
        res.only_in_file1.append(_row_to_dict(df1.iloc[i]))
    for i in range(n, len(df2)):
        res.only_in_file2.append(_row_to_dict(df2.iloc[i]))


# --------------------------------------------------------------------------- #
# Terminal report                                                              #
# --------------------------------------------------------------------------- #
def print_terminal_report(res: ComparisonResult) -> None:
    line = "=" * 64
    print()
    print(C.bold(C.cyan(line)))
    print(C.bold(C.cyan("  DataDiff — comparison summary")))
    print(C.bold(C.cyan(line)))
    print(f"  {C.dim('File 1:')} {res.file1}")
    print(f"  {C.dim('File 2:')} {res.file2}")
    print(f"  {C.dim('Match mode:')} {res.mode}"
          + (f"  (keys: {', '.join(res.keys)})" if res.keys else ""))
    print()

    print(C.bold("  Row counts"))
    print(f"    Rows in file 1 .......... {C.blue(str(res.rows_file1))}")
    print(f"    Rows in file 2 .......... {C.blue(str(res.rows_file2))}")
    print(f"    Matched / compared ...... {res.matched_rows}")
    print(f"    Unchanged ............... {C.green(str(res.unchanged_rows))}")
    print(f"    Changed (rows) .......... {C.yellow(str(res.changed_rows))}")
    print(f"    Only in file 1 (removed)  {C.red(str(len(res.only_in_file1)))}")
    print(f"    Only in file 2 (added) .. {C.green(str(len(res.only_in_file2)))}")
    print()

    if res.added_columns or res.removed_columns:
        print(C.bold("  Column changes"))
        if res.removed_columns:
            print(f"    Removed columns: {C.red(', '.join(res.removed_columns))}")
        if res.added_columns:
            print(f"    Added columns:   {C.green(', '.join(res.added_columns))}")
        print()

    if res.changed_cells:
        print(C.bold(f"  Changed cells ({len(res.changed_cells)})"))
        shown = res.changed_cells[:25]
        for ch in shown:
            print(f"    {C.dim(ch.key)}  [{C.cyan(ch.column)}]  "
                  f"{C.red(ch.old or '∅')} {C.dim('→')} {C.green(ch.new or '∅')}")
        if len(res.changed_cells) > len(shown):
            print(C.dim(f"    ... and {len(res.changed_cells) - len(shown)} more "
                        f"(see HTML report)"))
        print()

    print(C.bold(C.cyan(line)))


# --------------------------------------------------------------------------- #
# HTML report                                                                  #
# --------------------------------------------------------------------------- #
def _esc(v) -> str:
    return html.escape("" if v is None else str(v))


def _rows_table(rows: list[dict], columns: list[str], css_class: str) -> str:
    if not rows:
        return "<p class='empty'>None 🎉</p>"
    head = "".join(f"<th>{_esc(c)}</th>" for c in columns)
    body = []
    for r in rows:
        cells = "".join(f"<td>{_esc(r.get(c, ''))}</td>" for c in columns)
        body.append(f"<tr>{cells}</tr>")
    return (f"<table class='data {css_class}'><thead><tr>{head}</tr></thead>"
            f"<tbody>{''.join(body)}</tbody></table>")


def build_html(res: ComparisonResult) -> str:
    generated = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # changed-cells table
    if res.changed_cells:
        rows = []
        for ch in res.changed_cells:
            rows.append(
                f"<tr><td class='key'>{_esc(ch.key)}</td>"
                f"<td class='col'>{_esc(ch.column)}</td>"
                f"<td class='old'>{_esc(ch.old) or '<span class=nil>∅</span>'}</td>"
                f"<td class='arrow'>→</td>"
                f"<td class='new'>{_esc(ch.new) or '<span class=nil>∅</span>'}</td></tr>"
            )
        changed_table = (
            "<table class='data changes'><thead><tr>"
            "<th>Key</th><th>Column</th><th>File&nbsp;1 (old)</th>"
            "<th></th><th>File&nbsp;2 (new)</th></tr></thead>"
            f"<tbody>{''.join(rows)}</tbody></table>"
        )
    else:
        changed_table = "<p class='empty'>No cell-level changes 🎉</p>"

    col_changes = ""
    if res.added_columns or res.removed_columns:
        items = ""
        for c in res.removed_columns:
            items += f"<li class='removed'>− {_esc(c)} (removed)</li>"
        for c in res.added_columns:
            items += f"<li class='added'>+ {_esc(c)} (added)</li>"
        col_changes = f"<ul class='collist'>{items}</ul>"
    else:
        col_changes = "<p class='empty'>Columns are identical in both files.</p>"

    keys_label = ", ".join(res.keys) if res.keys else "— (matched by row position)"

    def card(value, label, cls):
        return (f"<div class='card {cls}'><div class='num'>{value}</div>"
                f"<div class='lbl'>{label}</div></div>")

    cards = "".join([
        card(res.rows_file1, "Rows in File 1", "neutral"),
        card(res.rows_file2, "Rows in File 2", "neutral"),
        card(res.unchanged_rows, "Unchanged rows", "good"),
        card(res.changed_rows, "Changed rows", "warn"),
        card(len(res.only_in_file1), "Only in File 1", "bad"),
        card(len(res.only_in_file2), "Only in File 2", "add"),
    ])

    only1 = _rows_table(res.only_in_file1, res.columns_file1, "removed")
    only2 = _rows_table(res.only_in_file2, res.columns_file2, "added")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>DataDiff Report</title>
<style>
  :root {{
    --bg:#0f172a; --panel:#1e293b; --panel2:#172033; --text:#e2e8f0;
    --muted:#94a3b8; --line:#334155;
    --good:#22c55e; --warn:#f59e0b; --bad:#ef4444; --add:#38bdf8; --accent:#818cf8;
  }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,
          Helvetica,Arial,sans-serif; background:var(--bg); color:var(--text);
          line-height:1.5; }}
  .wrap {{ max-width:1100px; margin:0 auto; padding:32px 20px 64px; }}
  header h1 {{ margin:0 0 4px; font-size:28px; }}
  header h1 .logo {{ color:var(--accent); }}
  .meta {{ color:var(--muted); font-size:14px; margin-bottom:24px; }}
  .meta code {{ background:var(--panel); padding:2px 6px; border-radius:5px;
               color:var(--text); }}
  .filebar {{ display:flex; gap:16px; flex-wrap:wrap; margin:16px 0 28px; }}
  .filebar .f {{ flex:1; min-width:240px; background:var(--panel); border:1px solid var(--line);
                border-radius:12px; padding:14px 16px; }}
  .filebar .f .tag {{ font-size:12px; letter-spacing:.08em; text-transform:uppercase;
                     color:var(--muted); }}
  .filebar .f .name {{ font-size:15px; word-break:break-all; margin-top:4px; }}
  .cards {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
           gap:14px; margin-bottom:36px; }}
  .card {{ background:var(--panel); border:1px solid var(--line); border-radius:14px;
          padding:18px; text-align:center; border-top:4px solid var(--line); }}
  .card .num {{ font-size:34px; font-weight:700; }}
  .card .lbl {{ color:var(--muted); font-size:13px; margin-top:4px; }}
  .card.good {{ border-top-color:var(--good); }} .card.good .num {{ color:var(--good); }}
  .card.warn {{ border-top-color:var(--warn); }} .card.warn .num {{ color:var(--warn); }}
  .card.bad  {{ border-top-color:var(--bad);  }} .card.bad  .num {{ color:var(--bad);  }}
  .card.add  {{ border-top-color:var(--add);  }} .card.add  .num {{ color:var(--add);  }}
  .card.neutral .num {{ color:var(--accent); }}
  h2 {{ font-size:19px; margin:36px 0 12px; padding-bottom:8px;
       border-bottom:1px solid var(--line); }}
  h2 .count {{ color:var(--muted); font-size:14px; font-weight:400; }}
  .empty {{ color:var(--muted); background:var(--panel2); padding:14px 16px;
           border-radius:10px; }}
  .scroll {{ overflow:auto; border:1px solid var(--line); border-radius:12px; }}
  table.data {{ border-collapse:collapse; width:100%; font-size:14px; }}
  table.data th {{ background:var(--panel2); text-align:left; padding:10px 12px;
                  position:sticky; top:0; color:var(--muted); font-weight:600;
                  white-space:nowrap; }}
  table.data td {{ padding:9px 12px; border-top:1px solid var(--line);
                  vertical-align:top; }}
  table.changes td.key {{ color:var(--accent); font-family:ui-monospace,monospace; }}
  table.changes td.col {{ color:var(--muted); }}
  table.changes td.old {{ color:var(--bad); background:rgba(239,68,68,.08); }}
  table.changes td.new {{ color:var(--good); background:rgba(34,197,94,.10); }}
  table.changes td.arrow {{ color:var(--muted); text-align:center; }}
  .nil {{ color:var(--muted); font-style:italic; }}
  table.removed tbody tr:hover {{ background:rgba(239,68,68,.06); }}
  table.added   tbody tr:hover {{ background:rgba(56,189,248,.06); }}
  footer {{ margin-top:48px; color:var(--muted); font-size:13px; text-align:center; }}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1><span class="logo">◧ DataDiff</span> comparison report</h1>
    <div class="meta">
      Generated {generated} · Match mode: <code>{res.mode}</code> ·
      Keys: <code>{_esc(keys_label)}</code>
    </div>
  </header>

  <div class="filebar">
    <div class="f"><div class="tag">File 1 (baseline)</div>
        <div class="name">{_esc(res.file1)}</div></div>
    <div class="f"><div class="tag">File 2 (compared)</div>
        <div class="name">{_esc(res.file2)}</div></div>
  </div>

  <div class="cards">{cards}</div>

  <h2>Changed cells <span class="count">({len(res.changed_cells)} cell(s) across
      {res.changed_rows} row(s))</span></h2>
  <div class="scroll">{changed_table}</div>

  <h2>Column changes</h2>
  {col_changes}

  <h2>Rows only in File 1 <span class="count">— removed
      ({len(res.only_in_file1)})</span></h2>
  <div class="scroll">{only1}</div>

  <h2>Rows only in File 2 <span class="count">— added
      ({len(res.only_in_file2)})</span></h2>
  <div class="scroll">{only2}</div>

  <footer>Generated by DataDiff · {_esc(res.file1)} ↔ {_esc(res.file2)}</footer>
</div>
</body>
</html>"""


# --------------------------------------------------------------------------- #
# CLI                                                                          #
# --------------------------------------------------------------------------- #
def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Compare two CSV/Excel files and produce a beautiful diff report.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument("file1", help="First file (baseline) — .csv/.txt/.xlsx/.xls")
    p.add_argument("file2", help="Second file (compared) — .csv/.txt/.xlsx/.xls")
    p.add_argument("-k", "--key", default="",
                   help="Comma-separated key column(s) used to match rows. "
                        "If omitted, rows are matched by position.")
    p.add_argument("-s", "--sheet", default=None,
                   help="Excel sheet name (default: first sheet).")
    p.add_argument("-o", "--output", default="datadiff_report.html",
                   help="Path for the HTML report (default: datadiff_report.html). "
                        "Use '' to skip writing HTML.")
    p.add_argument("--no-open", action="store_true",
                   help="Do not print the path hint to open the report.")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    keys = [k.strip() for k in args.key.split(",") if k.strip()]

    df1 = load_file(args.file1, args.sheet)
    df2 = load_file(args.file2, args.sheet)

    res = compare(df1, df2, args.file1, args.file2, keys)

    print_terminal_report(res)

    if args.output:
        html_doc = build_html(res)
        with open(args.output, "w", encoding="utf-8") as fh:
            fh.write(html_doc)
        abspath = os.path.abspath(args.output)
        print(C.bold(C.green(f"\n  ✔ HTML report written to: {abspath}")))
        if not args.no_open:
            print(C.dim(f"    Open it in your browser:  file://{abspath}\n"))

    # Exit code: 0 if files are identical, 1 if differences were found.
    differs = bool(res.changed_cells or res.only_in_file1
                   or res.only_in_file2 or res.added_columns
                   or res.removed_columns)
    return 1 if differs else 0


if __name__ == "__main__":
    raise SystemExit(main())
