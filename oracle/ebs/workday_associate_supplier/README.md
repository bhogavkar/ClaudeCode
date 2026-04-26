# Workday → Oracle EBS R12.2.12 — Associate / Supplier / Expense Report Integration

## What this does

Daily inbound integration that takes a CSV dropped by Workday (via MoveIT
Central → `/tmp` on the EBS node) and:

1. **Loads** the CSV into custom staging tables (handled by your existing
   Data Loader job + SQL\*Loader; this package starts at the staging tables).
2. **Validates** every staged row.
3. **Creates the HRMS employee** (`HR_EMPLOYEE_API.create_employee`) only if
   one with the same `EMPLOYEE_NUMBER` does not already exist in the matching
   business group (US / CA).
4. **Creates the matching employee-supplier**
   (`AP_VENDOR_PUB_PKG.Create_Vendor` with `vendor_type_lookup_code = 'EMPLOYEE'`
   and `employee_id = person_id`) plus an OU-level pay-only site, and verifies
   `IBY_EXTERNAL_PAYEES_ALL` (creating it via
   `IBY_DISBURSEMENT_SETUP_PUB.Create_External_Payee` if a patch left it
   missing).
5. **Imports the approved expense report** into
   `AP_INVOICES_INTERFACE` / `AP_INVOICE_LINES_INTERFACE`
   (`invoice_type_lookup_code = 'EXPENSE REPORT'`) and submits the standard
   **Payables Open Interface Import** (`SQLAP / APXIIMPT`), one submission
   per Operating Unit, scoped by a unique `GROUP_ID`.

> Per requirement: if the employee already exists in EBS, we do **not**
> recreate or update them — we just reuse their record and move straight to
> the expense report import.

---

## Directory layout

```
oracle/ebs/workday_associate_supplier/
├── README.md
├── install_all.sql                       ← master installer
├── ddl/
│   ├── 01_xx_wd_employee_stg.sql         ← employee staging
│   ├── 02_xx_wd_exp_hdr_stg.sql          ← expense report header staging
│   ├── 03_xx_wd_exp_line_stg.sql         ← expense report line staging
│   ├── 04_xx_wd_integration_log.sql      ← detail log + run summary
│   └── 05_sequences.sql                  ← surrogate-key sequences
├── pkg/
│   ├── xx_wd_emp_supplier_pkg.pks        ← package spec
│   ├── xx_wd_emp_supplier_pkg.pkb        ← assembled body (1 file)
│   └── xx_wd_emp_supplier_pkg_part{1..5c}.pkb
│         ↑ optional 7-part split. Concatenate
│           1 → 2 → 3 → 4 → 5a → 5b → 5c
│           to reproduce the .pkb.
├── cp/
│   └── xx_wd_concurrent_program.sql      ← FND executable + program + params
└── sqlldr_reference/
    ├── xx_wd_employee.ctl                ← reference SQL*Loader CTLs;
    ├── xx_wd_expense_hdr.ctl              your Data Loader team owns the
    └── xx_wd_expense_line.ctl             production versions.
```

---

## Tables created

| Table                       | Purpose                                                |
|-----------------------------|--------------------------------------------------------|
| `XX_WD_EMPLOYEE_STG`        | Workday employee/associate staging (loaded from CSV)   |
| `XX_WD_EXP_HDR_STG`         | Workday expense-report header staging                  |
| `XX_WD_EXP_LINE_STG`        | Workday expense-report line staging                    |
| `XX_WD_INTEGRATION_LOG`     | Per-event log (DEBUG/INFO/WARN/ERROR)                  |
| `XX_WD_RUN_SUMMARY`         | One row per concurrent-program run                     |

`PROCESS_STATUS` lifecycle on every staging row:

```
NEW → VALIDATED → PROCESSING → SUCCESS
                            └→ VALIDATION_ERROR | API_ERROR | REJECTED | SKIPPED
```

---

## Concurrent program parameters

| Token                 | Required | Default | Notes                                                   |
|-----------------------|----------|---------|---------------------------------------------------------|
| `P_BUSINESS_GROUP_ID` | N        |  NULL   | NULL = derive per-row from `BUSINESS_GROUP_NAME` (US/CA)|
| `P_RUN_MODE`          | Y        | `BOTH`  | `INS` = employees only · `UPD` = expenses only · `BOTH` |
| `P_BATCH_ID`          | N        |  NULL   | NULL = process all `NEW` rows                            |
| `P_DEBUG`             | Y        | `N`     | `Y` writes DEBUG rows to `XX_WD_INTEGRATION_LOG`         |

Return codes: `0=Success`, `1=Warning (NO_DATA or partial errors)`, `2=Error`.

---

## Package architecture

```
XX_WD_EMP_SUPPLIER_PKG
├── log_message                       (autonomous; writes to log + concurrent log)
├── init_run / finalize_run           (creates / closes XX_WD_RUN_SUMMARY)
├── resolve_business_group_id         (US/CA → business_group_id)
├── get_existing_person_id            (PER_ALL_PEOPLE_F lookup by employee_number)
├── get_existing_vendor_id            (AP_SUPPLIERS lookup by employee_id)
├── validate_employee_row             (field-level + cross-field checks)
├── validate_expense_header           (header + lines + sum reconciliation)
├── create_employee_in_hrms           (HR_EMPLOYEE_API.create_employee +
│                                      HR_PERSON_ADDRESS_API.create_person_address)
├── create_employee_supplier          (AP_VENDOR_PUB_PKG.Create_Vendor)
├── create_supplier_site              (AP_VENDOR_PUB_PKG.Create_Vendor_Site)
├── ensure_external_payee             (verify or create IBY_EXTERNAL_PAYEES_ALL)
├── ensure_employee_and_supplier      (orchestrator: create-or-reuse decision)
├── process_one_expense_report        (header + lines → AP interface tables)
├── submit_ap_open_interface_import   (FND_REQUEST → SQLAP/APXIIMPT)
├── write_summary_report              (concurrent OUTPUT — readable summary)
└── main                              (concurrent program entry point)
```

### Error / transaction model

* Logging procedure is `PRAGMA AUTONOMOUS_TRANSACTION` — log rows survive
  any rollback.
* Each per-record handler (`ensure_employee_and_supplier`,
  `process_one_expense_report`) opens a `SAVEPOINT` so a single bad row never
  poisons the batch.
* Failures land on the staging row as
  `PROCESS_STATUS = VALIDATION_ERROR / API_ERROR` with the FND message stack
  drained into `ERROR_MESSAGE`.
* Run-level counters seed `XX_WD_RUN_SUMMARY` — used by both
  `write_summary_report` and the OAM "Diagnostics" tile.

### Idempotency

* `XX_WD_EXP_HDR_STG.WD_EXPENSE_REPORT_ID` is **UNIQUE**. Duplicates inside a
  batch are caught by `validate_expense_header`. Re-running the program won't
  re-import already-`SUCCESS` reports because we filter on
  `PROCESS_STATUS = NEW / VALIDATED`.
* The AP interface gets a per-run `GROUP_ID` (`WD_<timestamp>_<request_id>`)
  so APXIIMPT only picks up rows from THIS run.

---

## Install

```sh
# 1. Install all DB objects
sqlplus apps/<pwd> @install_all.sql

# 2. Verify
SELECT object_name, object_type, status
  FROM user_objects
 WHERE object_name LIKE 'XX_WD%';

# 3. Confirm concurrent program shows up under the relevant request group:
#    Sysadmin → Concurrent → Program → Define
#    Short Name: XX_WD_EMP_SUP_IMPORT
```

The concurrent program registration assumes a custom application short name
of `XXCUST`. If yours differs (`XXHR`, `XX`, etc.), edit
`cp/xx_wd_concurrent_program.sql` before running.

---

## Operations

* **Frequency:** scheduled daily by Workflow / FND scheduler. Volume target:
  100–300 expense reports + a handful of new associates per run.
* **Monitoring queries:**

  ```sql
  -- Today's runs
  SELECT * FROM xx_wd_run_summary
   WHERE TRUNC(creation_date) = TRUNC(SYSDATE)
   ORDER BY summary_id DESC;

  -- Errored rows in last run
  SELECT employee_number, process_status, error_message
    FROM xx_wd_employee_stg
   WHERE request_id = &request_id
     AND process_status NOT IN ('SUCCESS','SKIPPED');

  SELECT wd_expense_report_id, employee_number, process_status, error_message
    FROM xx_wd_exp_hdr_stg
   WHERE request_id = &request_id
     AND process_status NOT IN ('SUCCESS','SKIPPED');

  -- Detailed event log
  SELECT logged_date, log_level, log_source, entity_key, message, oracle_error
    FROM xx_wd_integration_log
   WHERE request_id = &request_id
   ORDER BY logged_date;
  ```

* **Re-runs:** flip `PROCESS_STATUS` back to `NEW` on the rows you want to
  re-attempt and resubmit the program. SUCCESS rows are immutable on re-run.

* **Purge / retention:** detailed log retained 90 days; staging retained
  365 days. Add a separate purge concurrent program when convenient.

---

## Known caveats / setup prerequisites

* `EMPLOYEE_NUMBER` generation method on each Business Group must be
  **Manual** so we can pass the Workday-supplied number into
  `HR_EMPLOYEE_API.create_employee`.
* Default OU lookup in `ensure_employee_and_supplier` uses the names
  `'US Operations'` / `'CA Operations'` — change these to match your install.
* Country mapping currently handles `'United States'/'USA'/'US'` and
  `'Canada'/'CA'`. Extend the `CASE` if more countries appear.
* `IBY_EXTERNAL_PAYEES_ALL` rows are normally auto-created by
  `Create_Vendor_Site` in 12.2.12. The explicit fallback in
  `ensure_external_payee` is defensive — used when patches block the
  auto-creation.
