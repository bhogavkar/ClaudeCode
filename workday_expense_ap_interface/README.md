# Workday Expense → Oracle AP Invoice Open Interface (Oracle EBS R12)

A simple, modular, production-ready PL/SQL solution that loads **Workday Expense
Reports** into the **Oracle Payables Invoice Open Interface**
(`AP_INVOICES_INTERFACE` / `AP_INVOICE_LINES_INTERFACE`).

> **Scope ends at interface population.** This solution does **not** run the
> Payables Open Interface Import, create/validate/approve invoices, or run any
> workflow. Those are handled by the standard Oracle programs downstream.

## Components

| # | File | Object | Purpose |
|---|------|--------|---------|
| 1 | `01_XXTJX_WD_EXP_STG.sql` | `XXTJX_WD_EXP_STG` (+ seq, indexes, synonym, grants) | The **single** staging table. Header (`DH`) and line (`DL`) records flattened, linked by `BATCH_ID + INVOICE_NUM`. |
| 2 | `02_XXTJX_WD_EXP.ctl` | SQL\*Loader control file | Loads the pipe-delimited file directly into staging. `DH`→header columns, `DL`→line columns; `H`/`T` skipped. |
| 3 | `03_XXTJX_WD_EXP_AP_IMP_PKG.pks` | Package spec | Constants + `MAIN` + granular procedures. |
| 4 | `04_XXTJX_WD_EXP_AP_IMP_PKG.pkb` | Package body | Set-based validation, derivation, bulk interface insert. |

## Processing flow

```
SQL*Loader (XXTJX_WD_EXP.ctl) ── file ──► XXTJX_WD_EXP_STG (status 'N')
                                                │
        MAIN ─► validate_mandatory ─► derive_person ─► validate_assignment
             ─► validate_org ─► derive_supplier ─► validate_expense
             ─► insert_intf_headers ─► insert_intf_lines ─► update_stg_status
                                                │
                          AP_INVOICES_INTERFACE / AP_INVOICE_LINES_INTERFACE
                                       (STATUS = 'NEW')
```

Each validation is a single set-based `UPDATE … WHERE` that both detects and
records its failure (`ERROR_FLAG` / `ERROR_MESSAGE`); a header in error cascades
to its lines. Interface inserts use `FORALL … SAVE EXCEPTIONS` so one bad row
never kills the batch.

## Concurrent program parameters

| Parameter | Req | Notes |
|-----------|-----|-------|
| `p_org_id` | N | OU override; if null, derived from the file's Operating Unit Name. |
| `p_source` | Y | e.g. `TJXWD_EXP US`. |
| `p_batch_id` | Y | The batch loaded by SQL\*Loader to process. |
| `p_gl_date` | N | `YYYY/MM/DD` GL date override; defaults to invoice date. |
| `p_commit_limit` | N | Bulk chunk size (default 1000). |
| `p_validate_only` | N | `Y` = validate and stop before interface insert. |
| `p_debug_flag` | N | `Y` = verbose `FND_FILE.LOG`. |

`retcode`: `0` success · `1` warning (some rows errored) · `2` fatal.

## Key derivations (mirror seeded `AP_WEB_EXPORT_ER`)

- **Person** — `employee_number` → `per_all_people_f.person_id` (effective-dated).
- **Assignment** — exactly one active, primary, effective assignment in the OU;
  `>1` raises *"Multiple active employees found"*.
- **Supplier** — `ap_suppliers.employee_id = person_id` → `vendor_id`; active pay
  site in the OU → `vendor_site_id`.
- **Distribution** — 6-segment COA string → `gl_code_combinations.code_combination_id`.

## Deploy

```sql
@01_XXTJX_WD_EXP_STG.sql
@03_XXTJX_WD_EXP_AP_IMP_PKG.pks
@04_XXTJX_WD_EXP_AP_IMP_PKG.pkb
-- register 02_XXTJX_WD_EXP.ctl as a SQL*Loader concurrent program,
-- then XXTJX_WD_EXP_AP_IMP_PKG.MAIN as a PL/SQL concurrent program.
```

## Design constraints honoured

- Exactly **one** staging table — no temp / mapping / control / audit tables.
- Modular, reusable procedures; constants (no hardcoding); `%TYPE` / `%ROWTYPE`.
- `BULK COLLECT` / `FORALL`; set-based single-pass validation; bounded commits.
- Errors stored back on the staging row; lightweight `FND_FILE` logging.
- Idempotent re-run by `p_batch_id` (only `N`/`E` rows reprocessed).
