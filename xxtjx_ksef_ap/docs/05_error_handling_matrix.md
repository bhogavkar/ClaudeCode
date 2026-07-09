# 05 — Error Handling Matrix

## 1. Principles

- **Every** exception handler captures `SQLCODE`, `SQLERRM`,
  `DBMS_UTILITY.FORMAT_ERROR_BACKTRACE`, package, procedure, file, invoice,
  KSeF, and request id — via `XXTJX_KSEF_LOG_PKG` (autonomous, survives rollback).
- Failures are **isolated to the smallest unit** (file / invoice / attachment)
  so one bad record never blocks the batch.
- Statuses make every failure **recoverable** without data loss and without
  duplicate creation.
- Logging failure never propagates (the logger swallows its own errors).

## 2. Matrix

| Scenario                        | Detected in            | Code     | Action                                                              | Recovery                                  |
|---------------------------------|------------------------|----------|---------------------------------------------------------------------|-------------------------------------------|
| Invalid file name               | Loader                 | KSEF-001 | Move to ERROR dir, no DB row                                        | Rename + re-drop                          |
| Duplicate file (hash)           | Loader                 | KSEF-002 | Mark DUPLICATE, archive `.dup`, skip                                | None needed (idempotent)                  |
| Malformed JSON                  | Loader                 | KSEF-003 | Store row status ERROR, move file to ERROR dir                      | Fix source, re-drop                       |
| Trailer/line mismatch           | Parser                 | KSEF-034 | File ERROR, no staging committed                                    | Fix source, re-drop                       |
| Parse exception                 | Parser                 | KSEF-003 | File ERROR + SQLERRM in error_message                               | Investigate log, re-drop                  |
| Mandatory field missing         | Validation             | KSEF-010 | HDR_STG FAIL                                                        | Correct source, re-send                   |
| Supplier/site invalid           | Validation             | KSEF-011/012 | HDR_STG FAIL                                                    | Fix supplier master or payload            |
| OU/LE/BU invalid                | Validation             | KSEF-013/026/027 | HDR_STG FAIL                                                | Setup fix or payload fix                  |
| Currency invalid                | Validation             | KSEF-014 | HDR_STG FAIL                                                        | Enable currency / fix payload             |
| Period not open                 | Validation             | KSEF-016 | HDR_STG FAIL                                                        | Open period, re-run VALIDATE+IMPORT       |
| Duplicate invoice               | Validation             | KSEF-017 | HDR_STG FAIL (no second invoice)                                    | Expected on replay; none                  |
| Balance mismatch                | Validation             | KSEF-024 | HDR_STG FAIL                                                        | Fix source amounts                        |
| PO not approved/open            | Validation             | KSEF-020 | HDR_STG FAIL                                                        | Approve PO, re-run                        |
| Bad distribution account        | Validation             | KSEF-021 | HDR_STG FAIL                                                        | Fix COA/payload                           |
| Bad base64 / PDF / MIME / size  | Validation & Attach    | KSEF-029/030/031/032/033 | FAIL (pre-import) or ATTACH_ERROR (post)            | Fix attachment, re-send / re-run ATTACH   |
| AP interface rejection          | Import reconcile       | KSEF-040 | interface_status REJECTED + reasons from AP_INTERFACE_REJECTIONS    | Fix cause, clear interface, re-run IMPORT |
| APXIIMPT submit returns 0       | Import                 | KSEF-040 | Log FND message, phase returns; run retcode WARNING                 | Check conc manager, re-run IMPORT         |
| Attachment/FND failure          | Attach                 | KSEF-050 | ATTACH_ERROR; **invoice NOT rolled back**                           | Re-run ATTACH phase (idempotent retry)    |
| Unexpected exception            | Any                    | KSEF-999 | Row ERROR + full backtrace logged; phase continues                  | Investigate log, re-drive                 |

## 3. Transaction & commit boundaries

| Phase      | Commit granularity      | On error                                              |
|------------|-------------------------|-------------------------------------------------------|
| Loader     | per file                | that file quarantined; others continue                |
| Parser     | per file                | that file ERROR (staging for it rolled back); continue|
| Validation | per invoice             | that invoice FAIL; others continue                    |
| Import     | per OU batch            | reconcile marks rejected rows; imported rows kept     |
| Attach     | per attachment          | that attachment ATTACH_ERROR; invoice untouched       |

Because each unit commits independently, a mid-phase crash leaves completed
units done and the rest re-drivable — no manual cleanup, no duplicates.

## 4. Exception context captured (every ERROR row + log)

```
package_name · procedure_name · file_id · file_name · invoice_number ·
ksef_number · request_id · sql_code · sql_errm · error_backtrace · message
```
