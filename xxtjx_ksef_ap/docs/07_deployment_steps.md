# 07 — Deployment Steps

## 1. Prerequisites / sign-offs

- [ ] Custom schema `XXTJX` exists with quota on `APPS_TS_TX_DATA`,
      `APPS_TS_TX_IDX`, and a media tablespace (`APPS_TS_MEDIA`).
- [ ] Custom application **XXTJX** registered in AOL (for CP registration).
- [ ] SFTP landing + TMP/PROCESS/ARCHIVE/ERROR/LOG directories exist on the DB
      server filesystem and are readable/writable by the DB OS user.
- [ ] FND attachment category **Supplier** exists (seeded with AP).
- [ ] Payables periods open for the go-live window.
- [ ] Vendor/site master (incl. `vendorSiteId` values) loaded and pay-site
      flagged.
- [ ] CAB / change ticket approved.

## 2. Object build order (see `install/install_all.sql`)

1. **[SYS/DBA]** `install/00_directories_and_grants.sql` — directory objects +
   `DBMS_CRYPTO`, `UTL_ENCODE`, `UTL_RAW`, `UTL_FILE`, listing grants.
2. **[XXTJX]** DDL: `ddl/01_sequences.sql` → `ddl/06_*` (tables) →
   `ddl/07_constraints.sql` → `ddl/08_indexes.sql`.
   *(each table script grants to APPS + creates the APPS synonym).*
3. **[APPS]** Package **specs** (constants first), then **bodies**:
   cons → log → util → loader → parser → valid → import → attach → main → purge.
4. **[APPS]** `install/01_ap_source_lookup.sql` — register SOURCE `TJX E-Invoice`.
5. **[APPS]** `install/02_value_sets.sql` — parameter value sets.
6. **[APPS]** `install/03_concurrent_program.sql` — executables, programs,
   parameters, request-group assignment.
7. **[APPS]** Recompile invalids (the installer does this and lists any left).

One-shot (from `install/`):
```bash
sqlplus apps/**** @install_all.sql
```
> Run step 1 separately as a DBA; comment it out of `install_all.sql` if your
> DBA runs it by hand.

## 3. Post-install verification

```sql
-- objects valid
SELECT object_name, object_type, status FROM all_objects
 WHERE owner='APPS' AND object_name LIKE 'XXTJX_KSEF%' AND status='INVALID';   -- expect none

-- source registered
SELECT lookup_code FROM ap_lookup_codes WHERE lookup_type='SOURCE' AND lookup_code='TJX E-Invoice';

-- CP present
SELECT user_concurrent_program_name FROM fnd_concurrent_programs_vl
 WHERE concurrent_program_name IN ('XXTJX_KSEF_AP_IMPORT','XXTJX_KSEF_LOADER');

-- directory objects
SELECT directory_name FROM all_directories WHERE directory_name LIKE 'XXTJX_KSEF%';
```

## 4. Responsibility & security wiring

- [ ] Add **TJX KSeF AP Invoice Import** and **TJX KSeF JSON Loader** to the AP
      responsibility's request group (script adds to `SQLAP` "All Reports";
      adjust to your custom group).
- [ ] Grant the running responsibility access to both KSeF operating units.
- [ ] Confirm the concurrent manager work-shift can run APXIIMPT (child request).

## 5. Scheduling

- [ ] Schedule **TJX KSeF AP Invoice Import** `P_PHASE=ALL` every 10–15 min
      (align to the existing TJX SFTP poll).
- [ ] Schedule **XXTJX_KSEF_PURGE** monthly (retention: staging 90d, log 180d,
      raw ~7y).

## 6. Smoke test (post-deploy, non-prod-like)

1. Place `docs/sample_payload.json` renamed to
   `TJX_E-INVOICE_AP_INV_20260710124530.json` in the PROCESS directory.
2. Submit **TJX KSeF AP Invoice Import** `P_PHASE=ALL`.
3. Confirm: invoice `FV/2025/00042` in AP, PDF on the paperclip, file
   `COMPLETED`, report shows 1 imported / 1 attached / 100%.

## 7. Rollback plan

- Code is additive (custom schema/packages). Rollback = drop custom objects,
  disable the CPs, and end-date the SOURCE lookup. No standard EBS object is
  modified.
- In-flight data: rows sit in staging with status; disabling the CP halts
  processing without data loss. Nothing to un-import unless invoices were
  created (those are normal AP invoices, handled through standard AP cancel).

## 8. Environments path

DEV → build & UT → SIT (integrated) → UAT (business sign-off) → PROD.
Promote via the same numbered scripts; keep `install/` under version control.
