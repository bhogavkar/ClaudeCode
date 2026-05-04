# Workday → Oracle EBS R12 Expense Report Inbound Integration

PL/SQL package that imports approved & payment-ready Workday expense reports
into Oracle Payables (AP) by feeding the standard *Payables Open Interface
Import* program.

## Files

| # | File | Contents |
|---|------|----------|
| 1 | `01_create_tables.sql` | DDL for staging + error-log tables, sequences, grants/synonyms template |
| 2 | `02_xx_ap_expense_import_pkg_spec.sql` | Package specification |
| 3 | `03_xx_ap_expense_import_pkg_body.sql` | Package body (full implementation) |
| 4 | `04_sample_execution.sql` | Test-data seed + sample run + result queries |

## Object Inventory

### Tables
- `XX_AP_EXP_STG_HDR`   – header staging
- `XX_AP_EXP_STG_LINE`  – line staging
- `XX_AP_EXP_ERROR_LOG` – error log

### Sequences
- `XX_AP_EXP_STG_HDR_S`
- `XX_AP_EXP_ERROR_LOG_S`
- `XX_AP_EXP_GROUP_ID_S`

### Package – `XX_AP_EXPENSE_IMPORT_PKG`
| Procedure | Purpose |
|-----------|---------|
| `INIT_CONTEXT` | Initialise `FND_GLOBAL` + `MO_GLOBAL` (MOAC) |
| `VALIDATE_DATA` | All business + Oracle-standard validations |
| `CREATE_SUPPLIER_IF_NEEDED` | Look up / create employee-supplier (`AP_VENDOR_PUB_PKG`) |
| `LOAD_INTERFACE` | Insert into `AP_INVOICES_INTERFACE` / `AP_INVOICE_LINES_INTERFACE` |
| `LOG_ERROR` | Autonomous-transaction error logger |
| `REPORT_STATUS` | Formatted summary to `FND_FILE.OUTPUT` |
| `MAIN_PROCESS` | Concurrent-program entry point – orchestrates the flow |

## End-to-End Flow

```
MoveIT  ─►  Staging tables  ─►  XX_AP_EXPENSE_IMPORT_PKG.MAIN_PROCESS
                                       │
                                       ├── INIT_CONTEXT  (FND_GLOBAL + MOAC)
                                       ├── VALIDATE_DATA (header + line)
                                       │      └── CREATE_SUPPLIER_IF_NEEDED
                                       ├── LOAD_INTERFACE → AP_INVOICES_INTERFACE
                                       │                    AP_INVOICE_LINES_INTERFACE
                                       └── REPORT_STATUS → FND_FILE.OUTPUT
                                                            │
                                                Standard "Payables Open
                                                Interface Import" program
                                                            │
                                                AP_INVOICES_ALL +
                                                AP_INVOICE_DISTRIBUTIONS_ALL
```

## Validations Implemented

1. Required-field check (header + lines)
2. Currency must equal the OU functional currency
3. Invoice date not in the future
4. Employee must exist & be active in `PER_ALL_PEOPLE_F`
5. At least one expense line and `header_amount = SUM(line_amount)`
6. Every line CCID must exist, be enabled and detail-postable
   in `GL_CODE_COMBINATIONS`
7. Supplier mapping (auto-create if missing) and duplicate-invoice check
   against `AP_INVOICES_ALL` *and* `AP_INVOICES_INTERFACE`
   (key = `vendor_id + invoice_num + org_id` — guarantees idempotency)

## Status Lifecycle

`NEW → VALID → PROCESSED`     happy path
`NEW → ERROR`                 validation failure (re-runnable after fix)
`VALID → ERROR`               interface-load failure

## Concurrent Program Wiring (informational only)

> Out of scope per task instructions, but the entry-point signature matches
> the EBS contract:
>
> ```sql
> xx_ap_expense_import_pkg.main_process
>    ( errbuf, retcode, p_org_id, p_debug_flag );
> ```
>
> Register an executable of type **PL/SQL Stored Procedure** pointing at
> `XX_AP_EXPENSE_IMPORT_PKG.MAIN_PROCESS`.

## Deployment

```sql
-- as XXCUST
@01_create_tables.sql
-- run the GRANTs at the bottom of that file, then as APPS create the synonyms

-- as APPS
@02_xx_ap_expense_import_pkg_spec.sql
@03_xx_ap_expense_import_pkg_body.sql

-- smoke test
@04_sample_execution.sql
```

## Design Notes

- **MOAC** – `MO_GLOBAL.set_policy_context('S', p_org_id)` is called from
  `INIT_CONTEXT`, so every implicit query against `_ALL` views (e.g.
  `AP_SUPPLIER_SITES_ALL`) is automatically scoped to the OU being processed.
- **Idempotency** – duplicate invoices are detected before insert; ERROR rows
  remain in the staging table so the integration can be retried after the
  data is fixed by Workday.
- **Autonomous error logging** – `LOG_ERROR` uses
  `PRAGMA AUTONOMOUS_TRANSACTION` so audit rows survive a `ROLLBACK` of the
  parent transaction.
- **Row-by-row loops** – validation and interface loading walk the staging
  tables with explicit cursor loops as requested. For very high volumes a
  bulk-collect rewrite is straightforward and isolated to the cursor-driven
  procedures.
- **Supplier creation** – uses the same logic the standard *Expense Report
  Export* concurrent program follows: `VENDOR_TYPE_LOOKUP_CODE = 'EMPLOYEE'`,
  `EMPLOYEE_ID = PER_ALL_PEOPLE_F.PERSON_ID`, default pay group `EMPLOYEE`,
  and one `PAY` site per OU. Creation is performed via the supported public
  API `AP_VENDOR_PUB_PKG.create_vendor` / `create_vendor_site`.
