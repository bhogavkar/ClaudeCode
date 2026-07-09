# 01 — Solution Architecture

## 1. Purpose & scope

Production-grade, idempotent, restartable Oracle EBS **inbound** integration
that ingests Accounts Payable invoices delivered by **OpenText** (sourced from
the Polish **KSeF** portal) as **one JSON file per invoice** over **SFTP**,
creates the invoice in **Oracle Payables** via the **Open Interface Import
(APXIIMPT)**, and attaches the invoice **PDF** to the created invoice header
via **Oracle FND Attachments**.

- Oracle DB 19c · EBS 12.2.12 · PL/SQL · native JSON · SecureFile LOB
- Enhances (does **not** replace) the existing TJX SFTP→TMP→PROCESS→ARCHIVE
  loader framework.

## 2. Guiding principles

| Principle          | How it is realised                                                        |
|--------------------|---------------------------------------------------------------------------|
| Auditability       | Immutable raw-JSON repository (`XXTJX_KSEF_FILES`) + autonomous log        |
| Idempotency        | File hash UK, KSeF UK-in-fact, business-key UK, live-AP duplicate probe    |
| Restartability     | Status-driven phases; per-file/per-invoice COMMIT checkpoints             |
| Separation of layers | 9 packages, one responsibility each; JSON coupling isolated to parser   |
| Performance        | `JSON_TABLE`, `BULK COLLECT`, `FORALL`, SecureFile, targeted indexes      |
| Operability        | Business-friendly errors, summary report, matrices, purge, monitoring     |
| Security           | File-name allow-list, JSON/MIME/size/signature screening, EBS grants       |

## 3. Layered component model

```
                       ┌──────────────────────────────────────────────┐
   KSeF Portal ─► OpenText ─► JSON (1 invoice) ─► SFTP ─► TMP ─► PROCESS│ (existing TJX framework)
                       └───────────────┬──────────────────────────────┘
                                       │  (enhancement starts here)
   ┌───────────────────────────────────▼─────────────────────────────────────────┐
   │  XXTJX_KSEF_LOADER_PKG   read · name-check · hash · dedup · store raw · archive│
   ├───────────────────────────────────┬─────────────────────────────────────────┤
   │  XXTJX_KSEF_PARSER_PKG   native JSON_TABLE → HDR_STG / LINE_STG / attach stub  │  ◄ only JSON-coupled layer
   ├───────────────────────────────────┼─────────────────────────────────────────┤
   │  XXTJX_KSEF_VALID_PKG    26 business + master-data validations → PASS/FAIL     │
   ├───────────────────────────────────┼─────────────────────────────────────────┤
   │  XXTJX_KSEF_IMPORT_PKG   AP_INVOICES_INTERFACE/LINES → APXIIMPT → reconcile    │
   ├───────────────────────────────────┼─────────────────────────────────────────┤
   │  XXTJX_KSEF_ATTACH_PKG   decode · validate PDF · SecureFile BLOB · FND attach  │
   ├───────────────────────────────────┼─────────────────────────────────────────┤
   │  XXTJX_KSEF_MAIN_PKG     orchestrator + professional summary (post processor)  │
   └───────────────────────────────────┴─────────────────────────────────────────┘
   Cross-cutting:  XXTJX_KSEF_CONS_PKG (constants) · XXTJX_KSEF_LOG_PKG (autonomous log)
                   XXTJX_KSEF_UTIL_PKG (date/base64/hash/COA/file) · XXTJX_KSEF_PURGE_PKG
```

## 4. Package responsibilities

| Package                  | Type       | Responsibility                                              |
|--------------------------|------------|-------------------------------------------------------------|
| `XXTJX_KSEF_CONS_PKG`    | spec only  | All constants, statuses, error codes, tolerances            |
| `XXTJX_KSEF_LOG_PKG`     | spec+body  | Autonomous logging, FND_FILE / FND_LOG mirroring, metrics   |
| `XXTJX_KSEF_UTIL_PKG`    | spec+body  | MMDDYYYY dates, SHA-256, base64→BLOB, PDF sig, CCID, file IO |
| `XXTJX_KSEF_LOADER_PKG`  | spec+body  | File acquisition, raw store, dedup, archive/quarantine (CP) |
| `XXTJX_KSEF_PARSER_PKG`  | spec+body  | Native JSON parse → staging (**only JSON-coupled layer**)   |
| `XXTJX_KSEF_VALID_PKG`   | spec+body  | Validation framework, business-friendly messages            |
| `XXTJX_KSEF_IMPORT_PKG`  | spec+body  | Interface population, APXIIMPT submit/wait, reconciliation   |
| `XXTJX_KSEF_ATTACH_PKG`  | spec+body  | Decode/validate/store PDF, FND attachment link              |
| `XXTJX_KSEF_MAIN_PKG`    | spec+body  | Orchestrator (CP) + post-processor summary report           |
| `XXTJX_KSEF_PURGE_PKG`   | spec+body  | Retention / purge (CP)                                      |

## 5. Data stores

| Object                    | Role                                                      |
|---------------------------|-----------------------------------------------------------|
| `XXTJX_KSEF_FILES`        | Immutable raw-JSON audit repository (SecureFile CLOB)     |
| `XXTJX_KSEF_AP_HDR_STG`   | Header staging = `AP_INVOICES_INTERFACE` replica + control |
| `XXTJX_KSEF_AP_LINE_STG`  | Line staging = `AP_INVOICE_LINES_INTERFACE` replica + ctl  |
| `XXTJX_AP_ATTACHMENTS`    | Decoded PDF repository (SecureFile BLOB) + FND linkage    |
| `XXTJX_KSEF_LOG`          | Enterprise log (autonomous)                               |
| `AP_INVOICES_INTERFACE` / `AP_INVOICE_LINES_INTERFACE` | Oracle standard open interface |
| `AP_INVOICES_ALL` / `AP_INVOICE_LINES_ALL` | Oracle base tables (result)              |
| `FND_LOBS` / `FND_DOCUMENTS` / `FND_ATTACHED_DOCUMENTS` | FND attachment target     |

## 6. Status lifecycle (the backbone of restart + idempotency)

```
XXTJX_KSEF_FILES.process_status:
  NEW → LOADED → PARSED → (VALIDATED per hdr) → IMPORTED → COMPLETED
                   └────────────► ERROR / DUPLICATE / REJECTED (terminal-for-run)

HDR_STG:  validation_status  PENDING → PASS | FAIL
          interface_status   PENDING → LOADED → IMPORTED | REJECTED
ATTACH:   upload_status      PENDING → DECODED → ATTACHED | ATTACH_ERROR | DECODE_ERROR
```
Each phase only picks up rows in the correct predecessor status, so a crash
mid-run is resumed by simply re-running: already-advanced rows are skipped.

## 7. Concurrency & scheduling

- **`TJX KSeF AP Invoice Import`** (`XXTJX_KSEF_AP_IMPORT`) — master pipeline CP,
  parameter `P_PHASE` (ALL/LOAD/PARSE/VALIDATE/IMPORT/ATTACH/REPORT). Scheduled
  every N minutes.
- Loader commits per file; parser/validation/attach commit per invoice; import
  commits per OU batch. Two concurrent executions are safe because each row is
  claimed by status transition under row locks, and the file-hash UK + business
  UK prevent double insert.

## 8. Key design decisions

1. **Base64 is never persisted** outside the immutable raw JSON. The parser
   stores only PDF *metadata*; the attach phase re-reads `fileContent` from the
   raw JSON, decodes to a SecureFile BLOB, and discards the base64.
2. **Attachment is post-import and non-fatal.** A PDF failure sets
   `ATTACH_ERROR` and is retried on the next run; the invoice is never rolled
   back.
3. **Vendor is resolved by `vendorSiteId`** (the schema's primary vendor key);
   `vendorId` is derived and cross-checked.
4. **One JSON-coupled package.** Any schema revision touches only
   `XXTJX_KSEF_PARSER_PKG` PATH strings — the documented reconciliation point.
