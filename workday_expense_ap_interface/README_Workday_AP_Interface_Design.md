# Workday Expense → Oracle EBS R12 AP Invoice Open Interface

**Package:** `XXTJX_WD_EXP_AP_IMPORT_PKG`
**Scope:** Load validated Workday Expense Reports from the custom staging tables into the
Oracle Payables Open Interface tables (`AP_INVOICES_INTERFACE`, `AP_INVOICE_LINES_INTERFACE`).
**Out of scope:** Payables Open Interface Import submission, invoice creation, approval, workflow.

> Design philosophy: keep the seeded `AP_WEB_EXPORT_ER` *derivation logic* (employee → person →
> vendor → vendor site, create-supplier-if-missing, create-payee) but discard the seeded report
> rendering, prepayment, credit-card and multi-source complexity. The result is a small, set-based,
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
   1. Validate Employee Number is present and exists in HR.
   2. Validate / derive Operating Unit (`org_id`) — parameter if supplied, else file OU name.
   3. Derive `person_id`, `full_name`, `party_id` resolving to a single active primary assignment.
   4. Get the existing employee supplier + pay site for the OU; if none, **create** supplier + site + payee.
   5. Bulk-collect the invoice’s lines.
   6. Insert one `AP_INVOICES_INTERFACE` row + bulk-insert `AP_INVOICE_LINES_INTERFACE` rows.
   7. Stamp staging `PROCESS_STATUS = 'T'` (transferred) or `'E'` (error + message).
4. Commit per bulk batch; write a run-log summary row; set `errbuf`/`retcode`.

A record that fails any step is marked `'E'` with a meaningful message and the loop continues —
one bad expense report never aborts the run.

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
├── Constants & run-time globals
├── debug / log_line / out_line          -- logging helpers
├── write_run_log            (AUTONOMOUS) -- statistics row
├── mark_record                           -- stamp staging status/error
├── validate_employee_number
├── derive_person_details
├── validate_operating_unit
├── get_employee_supplier
├── create_payee             (private)    -- IBY external payee
├── create_employee_supplier
├── insert_invoice_header    (private)    -- 1 row → AP_INVOICES_INTERFACE
├── insert_invoice_lines     (private)    -- FORALL → AP_INVOICE_LINES_INTERFACE
└── import_expenses          (main)       -- orchestrates the above in sequence
```

---

## 6. Procedure Responsibilities

| Routine | Responsibility | Key inputs → outputs |
|---|---|---|
| `import_expenses` | Orchestrate; loop staging; commit; summarise. | params → errbuf/retcode |
| `validate_employee_number` | Mandatory + existence check. | emp_no → bool/msg |
| `derive_person_details` | Single active primary assignment → person/party. | emp_no, org → rec/msg |
| `validate_operating_unit` | Resolve OU param/name → org_id. | ou_name, org → org_id/msg |
| `get_employee_supplier` | Existing supplier (by party) + pay site (by OU). | party, org → vendor_rec |
| `create_employee_supplier` | `AP_VENDOR_PUB_PKG` create vendor + site + payee. | emp_rec, org → vendor_rec |
| `insert_invoice_header` | Map staging header → `AP_INVOICES_INTERFACE`. | hdr,vendor → invoice_id |
| `insert_invoice_lines` | FORALL map staging lines → `AP_INVOICE_LINES_INTERFACE`. | lines, invoice_id |
| `mark_record` | Update staging `PROCESS_STATUS` + `ERROR_MESSAGE`. | inv_num, batch, status |
| `write_run_log` | Autonomous insert into `XXTJX_WD_EXP_AP_LOG`. | counts, timings |

---

## 7. Validation Matrix

| # | Validation | Rule | Error message |
|---|---|---|---|
| 1 | Source | Parameter not null | `Parameter Source is mandatory.` |
| 2 | Employee Number present | Header value not null | `Missing mandatory field: Employee Number` |
| 3 | Employee exists | Row in `per_all_people_f` effective today | `Employee not found in HR for Employee Number …` |
| 4 | Operating Unit valid | `hr_operating_units` by param or file name | `Invalid Operating Unit …` / `Ambiguous …` |
| 5 | Active assignment | ≥1 active primary effective assignment | `No active primary assignment found …` |
| 6 | Single employee | Exactly one distinct person | `Multiple active employees found …` |
| 7 | Vendor resolvable | Existing supplier OR create-flag = Y | `Vendor not found and "Create Employee as Supplier" is disabled` |
| 8 | Vendor site | Pay site in OU OR created | `Vendor site creation failed …` |
| 9 | Payee | IBY payee exists/created | `Payee creation failed …` |
| 10 | Lines present | ≥1 NEW line for the invoice | `No lines found for invoice …` |
| 11 | Payables periods/options | `ap_system_parameters_all` row exists | `No Payables system parameters for org_id …` |

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

* **Per-record isolation** — each invoice runs inside its own block; failures are caught, the record
  is flagged `'E'` with a message, and processing continues.
* **Typed, meaningful messages** — every validation returns a human-readable reason (see §7), stored
  in `ERROR_MESSAGE` on **both** the header and its lines and echoed to the concurrent OUTPUT.
* **Custom error numbers** — `-20001..-20005` map to employee / OU / person / vendor / lines so the
  failing stage is obvious from the message.
* **Fatal guard** — the outer `WHEN OTHERS` rolls back the current batch, logs
  `DBMS_UTILITY.format_error_backtrace`, writes a `FATAL` run-log row, and returns `retcode = 2`.
* **Logging never breaks the run** — `write_run_log` is `AUTONOMOUS_TRANSACTION` and swallows its own
  errors.

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
4. **Header/line amount reconciliation** — assert Σ(line amount) = header amount before transfer.
5. **Duplicate-invoice guard** — pre-check `INVOICE_NUM` against `ap_invoices_all` for the vendor.
6. **Parameterised supplier site code** (HOME vs OFFICE) driven by a Workday reimbursement-type field.
7. **`xxtjx_audit_pkg` integration** for enterprise-standard audit/notification.

---

## File Inventory

| File | Description |
|---|---|
| `01_XXTJX_WD_EXP_AP_STG_TABLES.sql` | Staging/replica tables, run-log table, sequence |
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
