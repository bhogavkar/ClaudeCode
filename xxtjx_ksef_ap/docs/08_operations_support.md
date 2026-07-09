# 08 — Operations: Logging, Restart, Idempotency, Purge, Readiness, Support

## 1. Logging framework

- Table `XXTJX_KSEF_LOG`, written by `XXTJX_KSEF_LOG_PKG` via an
  **autonomous transaction** — log survives a rollback of the business txn.
- Levels: `DEBUG` (only when AOL statement logging is on), `INFO`, `WARN`,
  `ERROR`, `METRIC`.
- Every log row carries: request_id, phase, package, procedure, file_id,
  file_name, invoice_number, ksef_number, message, and for errors `sql_code`,
  `sql_errm`, `error_backtrace`.
- Mirrored to the concurrent request log (`FND_FILE.LOG`) for at-a-glance ops.
- What is logged: program start/end, per-phase counts, JSON parse, validation
  results, interface build, APXIIMPT submit/complete, attachment creation, and
  every exception (with backtrace), plus per-phase elapsed `METRIC` rows.

Useful queries:
```sql
-- everything for a run
SELECT log_date, log_level, log_phase, procedure_name, message, sql_errm
  FROM xxtjx_ksef_log WHERE request_id = :req ORDER BY log_id;

-- errors only, last 24h
SELECT * FROM xxtjx_ksef_log
 WHERE log_level='ERROR' AND log_date > SYSTIMESTAMP - 1 ORDER BY log_date DESC;

-- phase timings
SELECT procedure_name, message, elapsed_ms FROM xxtjx_ksef_log
 WHERE log_level='METRIC' AND request_id = :req;
```

## 2. Restart strategy

- **Status-driven, checkpointed.** Each phase selects only rows in its
  predecessor status and commits per unit (file/invoice/attachment).
- To resume after any failure: **just re-run** `P_PHASE=ALL`. Completed units
  are skipped by status; only unfinished units are re-driven. Never restart
  "from scratch".
- To re-drive a fixed error: set the item's status back to the phase entry
  status (e.g. `ERROR`→`LOADED` to re-parse, or clear `validation_status` to
  `PENDING`) and run the specific phase. A controlled re-drive script pattern:
```sql
-- re-validate a corrected invoice
UPDATE xxtjx_ksef_ap_hdr_stg
   SET process_status='PARSED', validation_status='PENDING',
       error_code=NULL, error_message=NULL
 WHERE hdr_stg_id = :id;
```
- Phase-level recovery: `P_PHASE=IMPORT` or `ATTACH` re-run only that stage.

## 3. Idempotency & concurrency guarantees

| Threat                | Guard                                                                 |
|-----------------------|------------------------------------------------------------------------|
| Same file re-sent     | `file_hash` UK → DUPLICATE, no reload                                   |
| Byte-changed re-send  | Business UK (site,invoice,ksef) + live-AP duplicate check → KSEF-017    |
| Server/session crash  | Per-unit COMMIT; re-run resumes from status                            |
| Concurrent executions | Row claimed by status transition under lock; UKs prevent double insert |
| Partial import        | GROUP_ID batch + reconcile marks only truly-created invoices IMPORTED  |
| Scheduler restart     | No in-memory state; everything is table/status driven                  |

Duplicate detection key (per requirement): **Supplier + Supplier Site +
Invoice Number + KSeF Number**, with `ksefNumber` as the primary globally-unique
replay guard.

## 4. Purge strategy

`XXTJX_KSEF_PURGE_PKG.main` (CP), monthly, defaults:

| Data                         | Retention | Rule                                                   |
|------------------------------|-----------|--------------------------------------------------------|
| Attachments (ATTACHED)       | 90 days   | only when parent file COMPLETED                        |
| Header/line staging (IMPORTED)| 90 days  | only fully-imported rows                               |
| Log rows                     | 180 days  | all levels                                             |
| Raw JSON (COMPLETED)         | ~7 years  | legal/audit retention; **never** purge un-completed    |

Never purges: ERROR/REJECTED/DUPLICATE rows (kept for investigation) and raw
JSON inside the legal window. Consider partition-drop purge at high volume
(see data-model doc §6).

## 5. Performance considerations

- Native `JSON_TABLE` parse; `BULK COLLECT` + `FORALL` for line inserts —
  minimal PL/SQL↔SQL context switching.
- SecureFile LOBs (compressed, in-row for small payloads); base64 decoded in
  5,700-char (÷4) chunks to bound PGA.
- Set-based validation lookups; CCID resolution cached per COA.
- Lean, targeted indexes on every phase driver (data-model doc §4).
- APXIIMPT `commit batch size` 1000; one submit per OU per run.
- Scales horizontally by running the CP more frequently and/or per-OU; scales
  to partitioning for multi-million-file volumes.
- Suggested SLA envelope: ~1–3k invoices per run within minutes; validate under
  load in SIT-14/15 before committing an SLA.

## 6. Security

- File-name allow-list regex (rejects anything unexpected → ERROR dir).
- JSON syntax gate + `documentType` routing guard.
- Attachment: MIME allow-list (`application/pdf`), extension check, base64
  pattern, PDF signature (`%PDF`/`%%EOF`), min/max size (anti-zip-bomb / stub).
- SHA-256 file + PDF checksums for integrity + tamper evidence.
- No external Java, no shell, no dynamic SQL on payload data.
- Standard EBS grants/synonyms; base64 never persisted outside immutable audit.
- Directory objects scoped read/write to XXTJX/APPS only.

## 7. Production readiness checklist

- [ ] All packages VALID; installer reported 0 invalids.
- [ ] SOURCE `TJX E-Invoice` registered + enabled.
- [ ] FND category `Supplier` present.
- [ ] Directory objects point at the real SFTP mount; permissions verified.
- [ ] Both OUs (431/432) configured with default legal entity + open periods.
- [ ] Vendor sites loaded with correct `vendorSiteId` + pay-site flag.
- [ ] CP scheduled; purge scheduled.
- [ ] Monitoring alert on `XXTJX_KSEF_LOG` ERROR rate + files stuck in ERROR.
- [ ] Reconciliation report signed off in UAT.
- [ ] Runbook (this doc) handed to L1/L2 support.
- [ ] Rollback plan reviewed.
- [ ] Volume/performance validated in SIT.
- [ ] DR: objects + directories included in backup/refresh scripts.

## 8. Support / runbook (L1 → L3)

| Symptom                              | First check                                             | Action                                                        |
|--------------------------------------|---------------------------------------------------------|----------------------------------------------------------------|
| Files not picked up                  | Are they in PROCESS? name matches regex?                | Fix name/placement; check loader CP scheduled                  |
| File in ERROR dir                    | `XXTJX_KSEF_FILES` error_message / log                  | Fix source, re-drop in PROCESS                                 |
| Invoice not created                  | HDR_STG validation_status/error_message                 | Correct per code (matrix 04/05), re-drive VALIDATE/IMPORT      |
| Invoice created, no PDF              | `XXTJX_AP_ATTACHMENTS.upload_status`                    | Fix cause (category/size), re-run `P_PHASE=ATTACH`             |
| APXIIMPT rejection                   | `AP_INTERFACE_REJECTIONS` + HDR_STG error_message       | Clear interface, fix, re-run IMPORT                           |
| Duplicate concern                    | ksef_number in HDR_STG / AP_INVOICES_ALL                | Confirm idempotency working; no action                        |
| Performance degradation              | METRIC log rows; staging row counts                     | Run purge; check index health; consider partitioning          |
| Stuck in IMPORTING/ATTACHING         | Any child request hung?                                 | Re-run phase; status-driven resume is safe                    |

Escalation: L1 (monitoring/re-drop) → L2 (re-drive phases, read log/matrices)
→ L3 (code/parser reconciliation, APXIIMPT/setup issues).

## 9. Future enhancement recommendations

1. **Real-time ingestion** via OpenText webhook / AQ instead of SFTP polling.
2. **BI Publisher** formatted exception report + email bursting to AP teams.
3. **Auto-supplier resolution** (fuzzy NIP/tax-id match) with an approval queue.
4. **Tax engine integration** (EBTax/`calculateTaxDuringImport`) for full VAT.
5. **OpenText round-trip status** — post import/attachment status back to KSeF.
6. **Table partitioning** on `XXTJX_KSEF_FILES`/`_LOG` for multi-year scale.
7. **Multi-document payloads** (files[] > 1) already supported; extend UI.
8. **Reconciliation dashboard** (OAF/APEX) over the log + staging.
9. **Schema-version negotiation** using `jsonVersion` for backward compatibility.
10. **Digital-signature (KSeF) verification** of the PDF beyond structural checks.
