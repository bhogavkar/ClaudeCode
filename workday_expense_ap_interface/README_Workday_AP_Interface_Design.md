# Workday Expense → Oracle EBS R12 AP Invoice Open Interface

**Package:** `XXTJX_WD_EXP_AP_IMPORT_PKG`
**Scope:** Load validated Workday Expense Reports from the custom staging tables into the
Oracle Payables Open Interface tables (`AP_INVOICES_INTERFACE`, `AP_INVOICE_LINES_INTERFACE`).
**Out of scope:** Payables Open Interface Import submission, invoice creation, approval, workflow.

> Design philosophy: keep the seeded `AP_WEB_EXPORT_ER` *derivation logic* (employee → person →
> vendor → vendor site, create-supplier-if-missing, create-payee) but discard the seeded report
> rendering, prepayment, credit-card and multi-source complexity. The **validation and
> error-staging method is modelled on the in-house `XXTJXAP_STND_INV_IMP_PKG`** framework:
> one modular BOOLEAN function per check, each gated by a config toggle; all checks run per record
> so every problem is reported in one pass; failures are accumulated into a collection and a
> source-data error table while the staging row is flagged. The result is a small, set-based,
> modular package that a new developer can read top-to-bottom in one sitting.

---

## 1. High-Level Solution Architecture

```
 Workday  ──(flat file: H/DH/DL/T)──►  SQL*Loader / Inbound
                                            │
                                            ▼
              XXTJX_AP_INVOICES_INTERFACE  (header staging / replica)
              XXTJX_AP_INV_LINES_INTERFACE (line   staging / replica)
                                            │
                    (optional) XXTJX_TMS_INVIMP_ASSETKEY_PKG  ── derives asset_category_id / asset_key
                                            │
                                            ▼
                 ┌─────────────────────────────────────────────┐
                 │   XXTJX_WD_EXP_AP_IMPORT_PKG.import_expenses  │  ◄── THIS PACKAGE
                 │   validate → derive → insert → mark status    │
                 └─────────────────────────────────────────────┘
                                            │
                                            ▼
                 AP_INVOICES_INTERFACE  +  AP_INVOICE_LINES_INTERFACE   (Oracle seeded)
                                            │
                                            ▼
                 Payables Open Interface Import  (separate, standard concurrent program)
```

* **Staging = replica:** `XXTJX_AP_INVOICES_INTERFACE` / `XXTJX_AP_INV_LINES_INTERFACE` mirror the
  seeded interface tables column-for-column (subset) plus a few control columns
  (`BATCH_ID`, `EMPLOYEE_NUMBER`, `OPERATING_UNIT_NAME`, `PROCESS_STATUS`, `ERROR_MESSAGE`).
  These names are deliberately identical to the tables already read by
  `XXTJX_TMS_INVIMP_ASSETKEY_PKG`, so the existing asset-key step keeps working.
* **This package never reads the flat file.** SQL*Loader (or an OIC/SOA inbound) lands the file in
  staging. The package operates purely on rows where `PROCESS_STATUS = 'N'`.

---

## 2. End-to-End Processing Flow

1. File arrives → SQL*Loader loads `H/DH` → header staging, `DL` → line staging, with
   `PROCESS_STATUS = 'N'` and the file `Batch Id` stamped into `BATCH_ID`.
2. (Optional) Asset-key derivation populates `ASSET_CATEGORY_ID` / asset key on the line staging.
3. `import_expenses` is launched as a concurrent program. For each **NEW** header:
   1. **Run every header validation** (mandatory fields, employee, currency, invoice type,
      header-vs-line amount, operating unit) — failures are *accumulated*, not short-circuited.
   2. Derive `org_id`, then `person_id` / `party_id` (single active primary assignment).
   3. Get the existing employee supplier + pay site for the OU; if none, **create** supplier + site + payee.
   4. Duplicate-invoice check (within batch + already in `ap_invoices_all` for the vendor).
   5. Bulk-collect the invoice’s lines and validate each line type.
   6. **Only if the record is clean**, insert one `AP_INVOICES_INTERFACE` row + bulk-insert
      `AP_INVOICE_LINES_INTERFACE` rows and stamp staging `PROCESS_STATUS = 'T'`.
   7. Otherwise every failure was staged via `stage_inv_error` (in-memory collection +
      `PROCESS_STATUS='E'` + `ERROR_MESSAGE`).
4. Per bulk batch: `flush_errors` bulk-inserts the collection into `XXTJX_WD_EXP_AP_ERRORS`, then commit.
5. Write a run-log summary row; set `errbuf`/`retcode`.

A record that fails any check is flagged `'E'` with **all** its failure reasons and the loop
continues — one bad expense report never aborts the run. Only a missing mandatory **Source
parameter** stops the program up front (critical error).

---

## 3. Package Design

| Concern | Decision |
|---|---|
| Granularity | One public main proc + one public function per validation/derivation concern. |
| Reuse | Validation/derivation functions are **public** so they can be unit-tested and reused. |
| Set processing | Headers fetched with `BULK COLLECT ... LIMIT 500`; lines inserted with `FORALL`. |
| Error isolation | Each invoice wrapped in its own `BEGIN/EXCEPTION` block (`process_one_invoice`). |
| Commit strategy | One `COMMIT` per bulk batch — never per row, never one giant transaction. |
| Constants | Statuses, lookup codes, bulk size, return codes all declared as `CONSTANT`. |
| No hardcoding | Source / OU / group passed as parameters; Payables options read from `ap_system_parameters_all`. |

---

## 4. Package Specification

See `02_XXTJX_WD_EXP_AP_IMPORT_PKG.pks`. Public surface:

| Object | Type | Purpose |
|---|---|---|
| `employee_rec_type` | RECORD | person_id, full_name, party_id, org_id |
| `vendor_rec_type` | RECORD | vendor + site + terms/pay-group/liability |
| `import_expenses` | PROCEDURE | Concurrent-program entry point (main) |
| `validate_employee_number` | FUNCTION | Employee present + known in HR |
| `derive_person_details` | FUNCTION | Resolve to one active primary assignment |
| `validate_operating_unit` | FUNCTION | OU name/param → org_id |
| `get_employee_supplier` | FUNCTION | Existing supplier + pay site |
| `create_employee_supplier` | FUNCTION | Create supplier + site + payee |

---

## 5. Package Body Structure

```
XXTJX_WD_EXP_AP_IMPORT_PKG (body)
├── Constants, validation toggles (g_chk_*), run-time globals, error collection
├── debug / log_line / out_line           -- logging helpers
├── load_config              (private)    -- load validation toggles per source
├── stage_inv_error          (private)    -- accumulate failure + flag staging
├── flush_errors             (private)    -- FORALL → XXTJX_WD_EXP_AP_ERRORS
├── mark_transferred         (private)    -- stamp staging 'T'
├── validate_mandatory_fields             -- all required header fields
├── validate_employee_number
├── validate_operating_unit
├── validate_invoice_currency
├── validate_invoice_type
├── validate_invoice_line_type
├── validate_invoice_num                  -- dup-in-batch + dup-in-AP
├── validate_invoice_amounts              -- header = Σ(lines)
├── derive_person_details
├── get_employee_supplier
├── create_payee             (private)    -- IBY external payee
├── create_employee_supplier
├── insert_invoice_header    (private)    -- 1 row → AP_INVOICES_INTERFACE
├── insert_invoice_lines     (private)    -- FORALL → AP_INVOICE_LINES_INTERFACE
└── import_expenses          (main)       -- run-all-validations loop + transfer
       └── fail()            (local)      -- one-call "flag + stage + report"
```

Every `validate_*` function returns `BOOLEAN` and begins with `IF NVL(g_chk_x,'NO')<>'YES' THEN
RETURN TRUE` — exactly the `XXTJXAP_STND_INV_IMP_PKG` toggle idiom — so any check can be switched
off per source by `load_config` without touching the orchestration.

---

## 6. Procedure Responsibilities

| Routine | Responsibility | Key inputs → outputs |
|---|---|---|
| `import_expenses` | Orchestrate; run all validations; transfer clean records; commit; summarise. | params → errbuf/retcode |
| `load_config` | Load validation toggles for the source (default ON). | source |
| `validate_mandatory_fields` | All required header fields present (per file layout). | fields → bool/msg |
| `validate_employee_number` | Employee present + known in HR. | emp_no → bool/msg |
| `validate_operating_unit` | Resolve OU param/name → org_id and confirm active. | ou_name, org → org_id/msg |
| `validate_invoice_currency` | Currency active/enabled. | curr → bool/msg |
| `validate_invoice_type` | Invoice type lookup valid. | type → bool/msg |
| `validate_invoice_line_type` | Line type lookup valid. | type → bool/msg |
| `validate_invoice_num` | Dup within batch + dup already in `ap_invoices_all`. | inv,batch,vendor → bool/msg |
| `validate_invoice_amounts` | Header amount = Σ(line amounts) within tolerance. | inv,batch,amt → bool/msg |
| `derive_person_details` | Single active primary assignment → person/party. | emp_no, org → rec/msg |
| `get_employee_supplier` | Existing supplier (by party) + pay site (by OU). | party, org → vendor_rec |
| `create_employee_supplier` | `AP_VENDOR_PUB_PKG` create vendor + site + payee. | emp_rec, org → vendor_rec |
| `insert_invoice_header` | Map staging header → `AP_INVOICES_INTERFACE`. | hdr,vendor → invoice_id |
| `insert_invoice_lines` | FORALL map staging lines → `AP_INVOICE_LINES_INTERFACE`. | lines, invoice_id |
| `stage_inv_error` | Accumulate failure into collection + flag staging row(s). | source,inv,msg |
| `flush_errors` | FORALL insert error collection → `XXTJX_WD_EXP_AP_ERRORS`. | (collection) |
| `mark_transferred` | Stamp staging `PROCESS_STATUS='T'`. | inv_num, batch |

---

## 7. Validation Matrix

| # | Validation | Toggle | Rule | Error message |
|---|---|---|---|---|
| 0 | Source (critical) | — | Parameter not null | `Parameter Source is mandatory.` (stops run) |
| 1 | Mandatory fields | `g_chk_mandatory` | Inv#/Date/Amount/Currency/Desc/Emp#/OU present | `Missing mandatory field(s): …` |
| 2 | Employee exists | `g_chk_employee` | Row in `per_all_people_f` effective today | `Employee not found in HR …` |
| 3 | Operating Unit valid | `g_chk_ou` | `hr_operating_units` by param/name, active dates | `Invalid Operating Unit …` / `Ambiguous …` |
| 4 | Currency | `g_chk_currency` | Active, enabled in `fnd_currencies` | `Invalid or inactive currency: …` |
| 5 | Invoice type | `g_chk_inv_type` | Valid `INVOICE TYPE` lookup | `Invalid invoice type lookup code: …` |
| 6 | Line type | `g_chk_line_type` | Valid `INVOICE LINE TYPE` lookup | `Invalid invoice line type lookup code: …` |
| 7 | Header = Σ lines | `g_chk_hdr_line_amt` | `|header − Σ(lines)| ≤ 0.01` | `Header amount (…) does not equal sum of line amounts (…)` |
| 8 | Dup in batch | `g_chk_dup_batch` | inv# not repeated in staging batch | `Duplicate invoice number within batch: …` |
| 9 | Dup in Payables | `g_chk_dup_exists` | inv# not already in `ap_invoices_all` for vendor | `Invoice number already exists in Payables: …` |
| 10 | Active assignment | — | ≥1 active primary effective assignment | `No active primary assignment found …` |
| 11 | Single employee | — | Exactly one distinct person | `Multiple active employees found …` |
| 12 | Vendor resolvable | — | Existing supplier OR create-flag = Y | `Vendor not found and "Create Employee as Supplier" is disabled` |
| 13 | Vendor site / payee | — | Pay site in OU + IBY payee (created if needed) | `Vendor site creation failed …` / `Payee creation failed …` |
| 14 | Lines present | — | ≥1 NEW line for the invoice | `No lines found for invoice …` |

All record-level checks run in a single pass; a record accumulates **every** reason it failed
before being flagged `'E'`. Each toggle defaults to `'YES'` in `load_config` and can be wired to a
setup lookup to enable/disable a check per source without code changes.

---

## 8. Employee & Supplier Derivation Logic

**Employee (mirrors seeded `c_party_id` / HR resolution, simplified):**

```
per_all_people_f  (employee_number, current, effective today)
        └─ per_all_assignments_f (assignment_type='E', primary_flag='Y', effective today)
                └─ per_assignment_status_types (per_system_status='ACTIVE_ASSIGN')
COUNT(DISTINCT person_id):  0 → reject ; >1 → reject ; 1 → fetch person_id, full_name, party_id
```

**Supplier (mirrors seeded `GetVendorInfo`):**

```
ap_suppliers WHERE party_id = <employee party>  AND vendor_type_lookup_code = 'EMPLOYEE'
   found    → use vendor_id, terms, pay_group, liability ccid
   not found→ check ap_system_parameters_all.create_employee_vendor_flag = 'Y'
              → AP_VENDOR_PUB_PKG.create_vendor (vendor_type='EMPLOYEE')
ap_supplier_sites_all WHERE vendor_id=… AND org_id=… AND pay_site_flag='Y' AND active
   found    → use vendor_site_id / party_site_id
   not found→ AP_VENDOR_PUB_PKG.create_vendor_site (site_code='OFFICE', pay_site_flag='Y')
IBY_EXTERNAL_PAYEES_ALL exists?  no → IBY_DISBURSEMENT_SETUP_PUB.Create_External_Payee
```

> Simplification vs. seeded: Workday reimburses employees only (no “Both Pay”/credit-card
> supplier branches), so the duplicate-vendor, contingent-worker and home/office matrix collapse to
> a single `EMPLOYEE` supplier + one `OFFICE` pay site per OU.

---

## 9. Organization Validation Logic

* The file always carries **Operating Unit Name** (constant `The TJX Companies – US`).
* If the concurrent **Operating Unit** parameter is supplied it takes precedence (single-OU run);
  otherwise the `org_id` is derived per record from the OU Name — matching the seeded program where
  the OU parameter is optional.
* The OU must exist in `hr_operating_units`. The employee must have an active assignment, and the
  employee’s supplier **pay site must belong to the same OU** (`ap_supplier_sites_all.org_id`),
  which is the practical enforcement that the expense is being booked in the right operating unit.

---

## 10. AP Interface Mapping

**Workday file → `AP_INVOICES_INTERFACE` (header)**

| Workday field (DH) | Staging column | AP interface column |
|---|---|---|
| Invoice Number | `INVOICE_NUM` | `INVOICE_NUM` |
| Invoice Type (`STANDARD`) | `INVOICE_TYPE_LOOKUP_CODE` | `INVOICE_TYPE_LOOKUP_CODE` |
| Invoice Date (MMDDYYYY) | `INVOICE_DATE` | `INVOICE_DATE` |
| Invoice Amount | `INVOICE_AMOUNT` | `INVOICE_AMOUNT` |
| Currency | `INVOICE_CURRENCY_CODE` | `INVOICE_CURRENCY_CODE` |
| Invoice Description | `DESCRIPTION` | `DESCRIPTION` |
| Operating Unit Name | `OPERATING_UNIT_NAME` → org_id | `ORG_ID` |
| Employee Number | `EMPLOYEE_NUMBER` → vendor | `VENDOR_ID`, `VENDOR_SITE_ID`, `PARTY_ID`, `PARTY_SITE_ID` |
| Source param | — | `SOURCE` |
| Group param | — | `GROUP_ID` |
| Batch Id | `BATCH_ID` | `REFERENCE_KEY1` |
| (derived) | — | `TERMS_ID`, `PAY_GROUP_LOOKUP_CODE`, `ACCTS_PAY_CODE_COMBINATION_ID` |

**Workday file → `AP_INVOICE_LINES_INTERFACE` (line)**

| Workday field (DL) | Staging column | AP interface column |
|---|---|---|
| Line Number | `LINE_NUMBER` | `LINE_NUMBER` |
| Line Type (`ITEM`) | `LINE_TYPE_LOOKUP_CODE` | `LINE_TYPE_LOOKUP_CODE` |
| Amount | `AMOUNT` | `AMOUNT` |
| Line Description | `DESCRIPTION` | `DESCRIPTION` |
| Distribution Account (6-seg COA) | `DIST_CODE_CONCATENATED` | `DIST_CODE_CONCATENATED` |
| Tax Classification Code | `TAX_CLASSIFICATION_CODE` | `TAX_CLASSIFICATION_CODE` |
| (asset-key pkg) | `ASSET_CATEGORY_ID` | `ASSET_CATEGORY_ID` |
| (asset-key pkg) | `ATTRIBUTE2` (asset key) | `ATTRIBUTE2` |
| — | — | `INVOICE_ID` (FK to header), `ORG_ID` |

`STATUS` on the header is left NULL so the standard Payables Import will pick the rows up.

---

## 11. Exception Handling Framework

* **Accumulate, don’t short-circuit** — all checks run for each record; `stage_inv_error` records
  each failure (with an `ERROR_CODE` such as `MANDATORY`, `CURRENCY`, `HDR_LINE_AMT`, `DUP_INV`)
  into the in-memory `gt_errors` collection and flags the staging row(s). The user sees every reason
  a record was rejected, not just the first.
* **Per-record isolation** — each invoice runs inside its own block; an unexpected error is caught,
  staged as `UNEXPECTED`, and processing continues with the next record.
* **Critical vs record-level** — a missing **Source** parameter is a critical error that stops the
  run up front; data problems are always record-level.
* **Two error sinks** — `ERROR_MESSAGE` on the header + its lines (for the source system) **and**
  `XXTJX_WD_EXP_AP_ERRORS` (one row per failure, bulk-inserted by `flush_errors`).
* **Fatal guard** — the outer `WHEN OTHERS` rolls back the current batch, logs
  `DBMS_UTILITY.format_error_backtrace`, and returns `retcode = 2`.
* **Logging never breaks the run** — the run-log insert is `AUTONOMOUS_TRANSACTION` and swallows its
  own errors.

---

## 12. Logging Framework

Two complementary, lightweight channels (Oracle-standard, no heavyweight framework):

1. **Concurrent log/output** via `FND_FILE`:
   * LOG — run header (request id, module, source, OU, batch), per-stage debug (when `p_debug_flag='Y'`),
     and the final Total/Transferred/Errors summary.
   * OUTPUT — a one-line-per-invoice audit report (Invoice / Employee / Status / Message).
2. **`XXTJX_WD_EXP_AP_LOG` table** (autonomous) capturing exactly the requested fields:
   Request Id, Module Name, Procedure Name, Source, Batch, Record Count, Success Count,
   Failure Count, Start/End Time, **Processing Time** (elapsed seconds), Status, Message.
3. **`XXTJX_WD_EXP_AP_ERRORS` table** — one row per validation failure (Request Id, Batch, Source,
   Invoice#, Vendor#, Employee#, Line#, Error Code, Error Msg) for easy reporting / re-work.

> The package is decoupled from `xxtjx_audit_pkg`; if standardised auditing is preferred, the three
> `log_line/out_line/write_run_log` helpers are the single place to redirect.

---

## 13. Performance Considerations

* `BULK COLLECT ... LIMIT 500` on the header driver — bounded memory, no full-table PL/SQL load.
* `FORALL` for all line inserts — one context switch per invoice instead of one per line.
* **Limited commits** — one commit per bulk batch (≈500 headers), not per row.
* **Single-pass validation** — each derivation is one indexed query; no repeated lookups inside loops.
* Index `XXTJX_AP_INV_LINES_IFACE_N1 (BATCH_ID, INVOICE_NUM, PROCESS_STATUS)` supports the line fetch.
* Sequences (`ap_invoices_interface_s`, `ap_invoice_lines_interface_s`) avoid `MAX()+1` contention.

---

## 14. Oracle Best Practices Applied

* `%ROWTYPE` / `%TYPE` everywhere — no literal datatypes that can drift from the schema.
* `NOCOPY` on `OUT` record parameters to avoid large copies.
* Public, side-effect-free validation **functions** returning `BOOLEAN` + message.
* Constants instead of magic strings; meaningful identifiers.
* Standard concurrent-program signature (`errbuf OUT`, `retcode OUT`) with 0/1/2 return codes.
* Uses public Oracle APIs (`AP_VENDOR_PUB_PKG`, `IBY_DISBURSEMENT_SETUP_PUB`) — never direct DML on
  base supplier/payee tables.
* Re-runnable: only `PROCESS_STATUS='N'` rows are picked up; errored rows can be corrected and reset.

---

## 15. Future Enhancement Recommendations

1. **Tax / multi-currency** — extend mapping for non-USD OUs (exchange rate, tax regime/status already
   present as optional WD fields).
2. **CCID pre-validation** — resolve `DIST_CODE_CONCATENATED` to `DIST_CODE_COMBINATION_ID` and reject
   invalid/disabled combinations and **closed GL periods** before transfer (the “On Periods” check).
3. **Auto-submit Payables Import** — optional `p_submit_import='Y'` parameter to chain
   `AP_IMPORT_INVOICES_PKG` after a successful load (kept out of scope today by design).
4. **Externalise validation toggles** — point `load_config` at a setup lookup/table (the
   `XXTJXAP_STND_INV_IMP_PKG` uses an XML definition per source) so checks are config-driven.
5. **Parameterised supplier site code** (HOME vs OFFICE) driven by a Workday reimbursement-type field.
6. **Email error notification** — mail `XXTJX_WD_EXP_AP_ERRORS` for a batch (the standard package
   has `EmailErrors` config; the hook points are already here).
7. **`xxtjx_audit_pkg` integration** for enterprise-standard audit/notification.

> Already implemented from the standard-package method: header-vs-line amount reconciliation,
> duplicate-invoice guard (in-batch + in-Payables), and currency / invoice-type / line-type lookup
> validation.

---

## File Inventory

| File | Description |
|---|---|
| `01_XXTJX_WD_EXP_AP_STG_TABLES.sql` | Staging/replica tables, run-log table, error table, sequence |
| `02_XXTJX_WD_EXP_AP_IMPORT_PKG.pks` | Package specification |
| `03_XXTJX_WD_EXP_AP_IMPORT_PKG.pkb` | Package body |
| `README_Workday_AP_Interface_Design.md` | This design document |

## Concurrent Program Parameters

| # | Parameter | Token | Req? | Notes |
|---|---|---|---|---|
| 1 | Source | `P_SOURCE` | **Yes** | AP interface SOURCE, e.g. `TJXWD_EXP US` |
| 2 | Operating Unit | `P_ORG_ID` | No | Restrict to one OU; else derived from file |
| 3 | Batch Name | `P_BATCH_NAME` | No | Workday Batch Id; NULL = all NEW |
| 4 | Group Id | `P_GROUP_ID` | No | Stamped on AP rows for grouped import |
| 5 | Debug Flag | `P_DEBUG_FLAG` | No | `Y` = verbose log |
