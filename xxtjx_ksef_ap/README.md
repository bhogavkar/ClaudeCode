# TJX KSeF / OpenText → Oracle EBS AP Invoice Inbound Integration

Production-ready Oracle EBS 12.2.12 / DB 19c inbound integration that imports
Accounts Payable invoices from **OpenText** (KSeF portal source) — one JSON file
per invoice over SFTP — into **Oracle Payables** via the **Open Interface Import
(APXIIMPT)**, and attaches the invoice **PDF** to the created invoice header via
**Oracle FND Attachments**. It enhances (does not replace) the existing TJX
SFTP→TMP→PROCESS→ARCHIVE loader framework.

> **Interface source of truth:** `docs/ksef_ap_invoice.schema.json` +
> `docs/sample_payload.json`. All field mappings and the JSON PATH coupling are
> documented in `docs/09_interface_contract.md`. The only package coupled to the
> physical JSON is `XXTJX_KSEF_PARSER_PKG` — the single reconciliation point.

## Repository layout

```
xxtjx_ksef_ap/
├── README.md                         ← this file (deliverables index)
├── docs/
│   ├── 01_solution_architecture.md
│   ├── 02_flow_and_sequence_diagrams.md   (Mermaid flow/sequence/state)
│   ├── 03_data_model.md                   (tables, index strategy, constraints)
│   ├── 04_validation_matrix.md            (34 validations)
│   ├── 05_error_handling_matrix.md
│   ├── 06_test_cases.md                    (Unit / SIT / UAT)
│   ├── 07_deployment_steps.md
│   ├── 08_operations_support.md            (logging, restart, purge, readiness, support, future)
│   ├── 09_interface_contract.md            (JSON↔EBS mapping)
│   ├── ksef_ap_invoice.schema.json         (contract)
│   └── sample_payload.json                 (sample)
├── ddl/
│   ├── 01_sequences.sql
│   ├── 02_tbl_xxtjx_ksef_files.sql
│   ├── 03_tbl_xxtjx_ksef_ap_hdr_stg.sql
│   ├── 04_tbl_xxtjx_ksef_ap_line_stg.sql
│   ├── 05_tbl_xxtjx_ap_attachments.sql
│   ├── 06_tbl_xxtjx_ksef_log.sql
│   ├── 07_constraints.sql
│   └── 08_indexes.sql
├── packages/
│   ├── xxtjx_ksef_cons_pkg.pks             (constants)
│   ├── xxtjx_ksef_log_pkg.pks/.pkb         (logging)
│   ├── xxtjx_ksef_util_pkg.pks/.pkb        (date/base64/hash/COA/file)
│   ├── xxtjx_ksef_loader_pkg.pks/.pkb      (loader CP)
│   ├── xxtjx_ksef_parser_pkg.pks/.pkb      (native JSON parser)
│   ├── xxtjx_ksef_valid_pkg.pks/.pkb       (validation framework)
│   ├── xxtjx_ksef_import_pkg.pks/.pkb      (AP interface + APXIIMPT)
│   ├── xxtjx_ksef_attach_pkg.pks/.pkb      (PDF decode + FND attach)
│   ├── xxtjx_ksef_main_pkg.pks/.pkb        (orchestrator + post processor)
│   └── xxtjx_ksef_purge_pkg.pks/.pkb       (retention/purge CP)
└── install/
    ├── 00_directories_and_grants.sql
    ├── 01_ap_source_lookup.sql
    ├── 02_value_sets.sql
    ├── 03_concurrent_program.sql
    └── install_all.sql
```

## Deliverables map (all 26)

| # | Deliverable                         | Where                                                        |
|---|-------------------------------------|--------------------------------------------------------------|
| 1 | Complete Solution Architecture      | `docs/01_solution_architecture.md`                           |
| 2 | Processing Flow Diagram             | `docs/02_flow_and_sequence_diagrams.md` §1                   |
| 3 | Sequence Diagram                    | `docs/02_...` §2–3 (+ state §4)                              |
| 4 | Table Designs                       | `ddl/02–06`, `docs/03_data_model.md`                        |
| 5 | Index Strategy                      | `ddl/08_indexes.sql`, `docs/03` §4                           |
| 6 | Constraints                         | `ddl/07_constraints.sql`, `docs/03` §3                       |
| 7 | Package Specification               | `packages/*.pks`                                             |
| 8 | Package Body                        | `packages/*.pkb`                                             |
| 9 | Modular Procedure Design            | 10 packages, one responsibility each (`docs/01` §4)          |
| 10| Concurrent Program Registration     | `install/03_concurrent_program.sql`                          |
| 11| Value Sets                          | `install/02_value_sets.sql`                                  |
| 12| Executable Definition               | `install/03_concurrent_program.sql` (fnd_program.executable) |
| 13| Validation Matrix                   | `docs/04_validation_matrix.md`                               |
| 14| Error Handling Matrix               | `docs/05_error_handling_matrix.md`                           |
| 15| Logging Framework                   | `xxtjx_ksef_log_pkg`, `ddl/06`, `docs/08` §1                 |
| 16| Attachment Framework                | `xxtjx_ksef_attach_pkg`, `ddl/05`, `docs/08`                 |
| 17| Performance Considerations          | `docs/08` §5 (+ inline BULK/FORALL/JSON_TABLE)               |
| 18| Restart Strategy                    | `docs/08` §2                                                 |
| 19| Purge Strategy                      | `xxtjx_ksef_purge_pkg`, `docs/08` §4                         |
| 20| Deployment Steps                    | `docs/07_deployment_steps.md`, `install/install_all.sql`     |
| 21| Unit Test Cases                     | `docs/06_test_cases.md` §A                                   |
| 22| SIT Test Cases                      | `docs/06_test_cases.md` §B                                   |
| 23| UAT Test Cases                      | `docs/06_test_cases.md` §C                                   |
| 24| Production Readiness Checklist      | `docs/08` §7                                                 |
| 25| Support Documentation               | `docs/08` §8 (runbook)                                       |
| 26| Future Enhancement Recommendations  | `docs/08` §9                                                 |

Cross-cutting requirements also covered: **Idempotent Processing** (`docs/08`
§3 + UKs), **Security** (`docs/08` §6), **Coding Standards** (packages only,
constants pkg, instrumentation, non-ANSI SQL, modular).

## Concurrent programs

| Program                        | Short name           | Entry point                    |
|--------------------------------|----------------------|--------------------------------|
| TJX KSeF AP Invoice Import     | `XXTJX_KSEF_AP_IMPORT` | `XXTJX_KSEF_MAIN_PKG.RUN`      |
| TJX KSeF JSON Loader           | `XXTJX_KSEF_LOADER`   | `XXTJX_KSEF_LOADER_PKG.MAIN`   |
| TJX KSeF Purge                 | `XXTJX_KSEF_PURGE`*   | `XXTJX_KSEF_PURGE_PKG.MAIN`    |

*Register the purge program with the same `fnd_program` pattern as the others.*

## Quick start

```bash
cd install
# (DBA) run 00_directories_and_grants.sql first, then:
sqlplus apps/**** @install_all.sql
# Smoke test: drop a renamed sample into the PROCESS dir and submit
#   'TJX KSeF AP Invoice Import' with P_PHASE=ALL.
```

## Important assumptions to confirm before go-live

1. Custom schema `XXTJX` + application short name `XXTJX`, tablespaces
   `APPS_TS_TX_DATA` / `APPS_TS_TX_IDX` / `APPS_TS_MEDIA` — adjust to site
   standards.
2. Directory paths in `install/00_...` are placeholders for the real SFTP mount.
3. `list_files` uses a native `DBMS_BACKUP_RESTORE.searchFiles` listing; if site
   policy blocks `x$` access, swap in the existing TJX framework's listing
   routine (single-point change in `XXTJX_KSEF_UTIL_PKG`).
4. FND attachment `fnd_lobs`/`fnd_documents`/`fnd_attached_documents` direct
   inserts are the version-stable 12.2 method; verify against your instance's
   patch level in SIT.
5. APXIIMPT parameter order matches the standard Payables Open Interface Import;
   confirm on the target instance.
