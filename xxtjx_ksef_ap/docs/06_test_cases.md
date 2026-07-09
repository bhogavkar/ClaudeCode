# 06 — Test Cases (Unit / SIT / UAT)

Traceability: each case cites the validation/error code or component it proves.
Data based on `docs/sample_payload.json` (invoice `FV/2025/00042`,
vendorSiteId `55501`, OU `PL (431) TJX TK MAXX POLAND OU`, PLN 12300, 2 lines,
1 PDF).

## A. Unit test cases (developer, per package)

| UT#  | Component                | Scenario                                              | Expected                                             |
|------|--------------------------|-------------------------------------------------------|------------------------------------------------------|
| UT-01| UTIL.to_date_mmddyyyy    | `'07012025'`                                          | 01-JUL-2025                                          |
| UT-02| UTIL.is_valid_mmddyyyy   | `'13322025'` (bad month/day)                          | FALSE                                                |
| UT-03| UTIL.to_date_mmddyyhhmi  | batchId `'070925143022'`                              | 09-JUL-2025 14:30:22                                 |
| UT-04| UTIL.sha256_clob         | known text                                            | matches external SHA-256                             |
| UT-05| UTIL.base64_to_blob      | sample PDF base64                                     | BLOB length > 0, `%PDF` header                       |
| UT-06| UTIL.is_pdf_signature    | decoded sample PDF                                    | TRUE                                                 |
| UT-07| UTIL.is_pdf_signature    | non-PDF bytes                                         | FALSE                                                |
| UT-08| UTIL.get_ccid            | `128.1280575.3131.806502.000.0000`                    | valid CCID (>0) when segments enabled                |
| UT-09| LOADER.load_one_file     | bad file name                                         | REJECTED, file in ERROR dir, no DB row               |
| UT-10| LOADER.load_one_file     | valid new file                                        | LOADED, row in XXTJX_KSEF_FILES, archived            |
| UT-11| LOADER.load_one_file     | same bytes again                                      | DUPLICATE, `.dup` archive, no new row                |
| UT-12| LOADER.is_valid_json     | truncated JSON                                        | FALSE → ERROR                                        |
| UT-13| PARSER.parse_file        | sample payload                                        | 1 HDR row, 2 LINE rows, 1 attach stub                |
| UT-14| PARSER trailer check     | lineCount=3 but 2 lines                               | file ERROR KSEF-034                                  |
| UT-15| VALID mandatory          | null invoiceNumber                                    | FAIL KSEF-010                                        |
| UT-16| VALID currency scope     | currency=EUR                                          | FAIL KSEF-014                                        |
| UT-17| VALID balance            | lines sum 12000 vs header 12300                       | FAIL KSEF-024                                        |
| UT-18| VALID duplicate          | ksefNumber already IMPORTED                            | FAIL KSEF-017                                        |
| UT-19| VALID credit sign        | CREDIT with positive amount                           | FAIL KSEF-018                                        |
| UT-20| VALID happy path         | sample payload with valid masters                     | PASS, status VALIDATED                               |
| UT-21| IMPORT build_interface   | 1 PASS invoice                                        | 1 AII + 2 AILI rows, GROUP_ID set                    |
| UT-22| IMPORT reconcile         | APXIIMPT success                                      | ap_invoice_id set, IMPORTED                          |
| UT-23| IMPORT reconcile         | APXIIMPT rejects                                      | REJECTED + reason text                               |
| UT-24| ATTACH attach_one        | imported invoice + valid PDF                          | ATTACHED, FND rows created                           |
| UT-25| ATTACH failure isolation | force FND error                                       | ATTACH_ERROR, invoice intact                         |
| UT-26| POST post_process        | mixed run                                             | correct counts + success %                           |
| UT-27| PURGE                    | old COMPLETED rows                                    | staging purged, raw kept within legal window         |
| UT-28| LOG autonomous           | error inside a rolled-back txn                        | log row persists                                     |

### Unit test harness (anonymous block example)

```sql
-- UT-13: parse the sample file already loaded as file_id :fid
DECLARE l_status VARCHAR2(30);
BEGIN
  xxtjx_ksef_parser_pkg.parse_file(:fid, l_status);
  DBMS_OUTPUT.put_line('status='||l_status);
END;
/
SELECT COUNT(*) hdr FROM xxtjx_ksef_ap_hdr_stg  WHERE file_id=:fid;   -- expect 1
SELECT COUNT(*) lin FROM xxtjx_ksef_ap_line_stg WHERE file_id=:fid;   -- expect 2
```

## B. System Integration Test (SIT) cases (end-to-end, integrated instance)

| SIT# | Scenario                                              | Expected outcome                                                  |
|------|-------------------------------------------------------|--------------------------------------------------------------------|
| SIT-01| Drop 1 valid file, run pipeline ALL                  | Invoice in AP, PDF attached, file COMPLETED, report 100%           |
| SIT-02| Drop 1 valid PO-matched invoice                      | Matches PO, imported, attached                                     |
| SIT-03| Drop CREDIT memo (negative amounts)                  | CREDIT invoice created, balances                                   |
| SIT-04| Drop invoice for OU 432                              | Imported under correct OU context                                  |
| SIT-05| Drop file with validation error (bad site)           | FAIL, no interface row, report shows validation error             |
| SIT-06| Drop file that APXIIMPT rejects                      | REJECTED with AP reason captured                                   |
| SIT-07| Re-drop an already-imported file (same bytes)        | DUPLICATE, no second invoice                                       |
| SIT-08| Re-drop byte-changed variant of imported invoice     | Validation KSEF-017 duplicate, no second invoice                   |
| SIT-09| Valid invoice, corrupt base64                        | Validation FAIL KSEF-029, not imported                            |
| SIT-10| Valid invoice, valid import, FND category missing    | Invoice imported, ATTACH_ERROR; fix category, re-run ATTACH → OK   |
| SIT-11| Kill session mid-import, re-run                      | Resumes; no duplicate invoice                                      |
| SIT-12| 2 concurrent pipeline requests, 50 files             | All processed once, no duplicates, no deadlocks                    |
| SIT-13| Closed GL period                                     | FAIL KSEF-016; open period + re-run VALIDATE/IMPORT → imported     |
| SIT-14| Mixed batch of 100 (90 good, 10 bad)                 | 90 imported+attached, 10 errored, report accurate                 |
| SIT-15| Large PDF (~15 MB)                                   | Attached; performance within SLA                                   |
| SIT-16| Oversized PDF (>20 MB)                               | FAIL KSEF-031                                                     |
| SIT-17| Run PHASE=REPORT only                                | Summary regenerated from current data                             |
| SIT-18| Purge program                                        | Old rows removed, audit retained                                  |

## C. User Acceptance Test (UAT) cases (business, per role)

| UAT# | Role         | Scenario                                                | Acceptance criteria                                              |
|------|--------------|---------------------------------------------------------|------------------------------------------------------------------|
| UAT-01| AP Clerk     | Import a real supplier e-invoice from KSeF              | Invoice visible in Invoice Workbench with correct header/lines   |
| UAT-02| AP Clerk     | Open the imported invoice attachment                    | PDF opens from the paperclip; matches the KSeF document          |
| UAT-03| AP Clerk     | Import a credit memo                                     | Negative invoice created and matches source                     |
| UAT-04| AP Clerk     | PO-matched invoice                                      | Matched to PO, distributions correct                            |
| UAT-05| AP Supervisor| Review a rejected invoice                               | Rejection reason is clear and actionable in the report          |
| UAT-06| AP Supervisor| Re-send a corrected file                                | Corrected invoice imports; original error cleared               |
| UAT-07| AP Supervisor| Duplicate submission                                    | System prevents duplicate; report flags it                      |
| UAT-08| Controller   | Month-end period control                                | Invoices only post to open periods                              |
| UAT-09| Auditor      | Trace an invoice back to source                         | Raw JSON retrievable + checksum + log trail                     |
| UAT-10| AP Manager   | Read the summary report                                 | Counts, success %, and exceptions are understandable            |

## D. Exit criteria

- 100% UT pass; 0 open Sev-1/Sev-2 SIT defects; all UAT cases signed off.
- Reconciliation: count(AP invoices created) = count(files COMPLETED) for the
  test window; attachment success ≥ agreed SLA (e.g. ≥ 99%).
