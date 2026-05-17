# Workday -> Oracle EBS R12.2.12 Employee Supplier Integration

## Deployment Guide

Module      : Oracle EBS R12.2.12 - Accounts Payable
Custom App  : Custom application (XXWD) or registered under SQLAP
Owner       : XX Development Team
Version     : 1.0

---

## 1. Pre-requisites

1. Oracle EBS R12.2.12 with Online Patching enabled (edition-based redefinition).
2. Custom schema (e.g. `XXWD`) created with synonyms and grants to `APPS`.
3. Profile option `HR: Generate Employee Number` set per business needs.
4. Profile option `HR_EMPLOYEE_TO_VENDOR` reviewed and set as required.
5. `AP_PRODUCT_SETUP.SUPPLIER_NUMBERING_METHOD` configured (Automatic / Manual).
6. Value sets `XX_OPERATING_UNITS` and `XX_YES_NO` exist (or replace in the LDT
   with `FND_NUMBER` / `FND_CHAR1` etc).
7. SSH access to the EBS application tier as `applmgr`.

---

## 2. File checklist

| Path                                                  | Purpose                       |
| ----------------------------------------------------- | ----------------------------- |
| `ddl/XXWD_EMP_SUP_STG.sql`                            | Header staging table          |
| `ddl/XXWD_EMP_BANK_STG.sql`                           | Bank staging table            |
| `ddl/XXWD_EMP_SUP_LOG.sql`                            | Centralised log table         |
| `package/XXWD_EMP_SUPPLIER_PKG.pks`                   | Package specification         |
| `package/XXWD_EMP_SUPPLIER_PKG.pkb`                   | Package body                  |
| `concurrent_program/XXWD_EMP_SUP_CP.sql`              | FND_PROGRAM registration (alt)|
| `ldt/XXWD_EMP_SUP_PRG.ldt`                            | FNDLOAD definition            |

---

## 3. Deployment Steps

### Step 1 - Online patching session start (R12.2.x only)

```bash
$ adop phase=prepare
```

### Step 2 - Connect to APPS

```bash
$ sqlplus apps/<apps_password>@<EBS_TWO_TASK>
```

### Step 3 - Create staging and log tables in custom schema

Run as schema owner (`XXWD`) then grant to `APPS` and create synonyms.

```sql
-- As XXWD:
@ddl/XXWD_EMP_SUP_STG.sql
@ddl/XXWD_EMP_BANK_STG.sql
@ddl/XXWD_EMP_SUP_LOG.sql

GRANT SELECT, INSERT, UPDATE, DELETE ON XXWD_EMP_SUP_STG  TO APPS;
GRANT SELECT, INSERT, UPDATE, DELETE ON XXWD_EMP_BANK_STG TO APPS;
GRANT SELECT, INSERT, UPDATE, DELETE ON XXWD_EMP_SUP_LOG  TO APPS;
GRANT SELECT ON XXWD_EMP_SUP_STG_S  TO APPS;
GRANT SELECT ON XXWD_EMP_BANK_STG_S TO APPS;
GRANT SELECT ON XXWD_EMP_SUP_LOG_S  TO APPS;

-- As APPS:
CREATE OR REPLACE SYNONYM APPS.XXWD_EMP_SUP_STG    FOR XXWD.XXWD_EMP_SUP_STG;
CREATE OR REPLACE SYNONYM APPS.XXWD_EMP_BANK_STG   FOR XXWD.XXWD_EMP_BANK_STG;
CREATE OR REPLACE SYNONYM APPS.XXWD_EMP_SUP_LOG    FOR XXWD.XXWD_EMP_SUP_LOG;
CREATE OR REPLACE SYNONYM APPS.XXWD_EMP_SUP_STG_S  FOR XXWD.XXWD_EMP_SUP_STG_S;
CREATE OR REPLACE SYNONYM APPS.XXWD_EMP_BANK_STG_S FOR XXWD.XXWD_EMP_BANK_STG_S;
CREATE OR REPLACE SYNONYM APPS.XXWD_EMP_SUP_LOG_S  FOR XXWD.XXWD_EMP_SUP_LOG_S;
```

### Step 4 - Create the package (run twice during edition prep on R12.2)

```sql
-- As APPS:
@package/XXWD_EMP_SUPPLIER_PKG.pks
@package/XXWD_EMP_SUPPLIER_PKG.pkb

SELECT object_name, status
  FROM all_objects
 WHERE object_name = 'XXWD_EMP_SUPPLIER_PKG'
   AND owner       = 'APPS';
```

Both spec and body must be `VALID`.

### Step 5 - Register Concurrent Program

Two options, choose ONE:

**Option A - FNDLOAD (recommended for source control)**

```bash
$ FNDLOAD apps/<apps_pwd> 0 Y UPLOAD \
    $FND_TOP/patch/115/import/afcpprog.lct \
    ldt/XXWD_EMP_SUP_PRG.ldt
```

**Option B - PL/SQL registration**

```sql
@concurrent_program/XXWD_EMP_SUP_CP.sql
```

### Step 6 - Add to Request Group

Assign the concurrent program `Workday Employee Supplier Inbound` to the request
group that the user responsibilities use (e.g. `Payables All`,
`Payables Inbound Interfaces`).

```sql
EXEC FND_PROGRAM.add_to_group( 'XXWD_EMP_SUP_PRG', 'SQLAP',
                               'Payables Inbound Interfaces', 'SQLAP');
```

### Step 7 - Edition-aware compile (R12.2 only)

```bash
$ adop phase=apply patchtop=$PATCH_TOP/customizations
$ adop phase=finalize
$ adop phase=cutover
$ adop phase=cleanup
```

### Step 8 - Smoke test

1. Insert a couple of test rows in `XXWD_EMP_SUP_STG` (and matching
   `XXWD_EMP_BANK_STG` rows).
2. Submit the concurrent program `Workday Employee Supplier Inbound` from the
   Payables responsibility with `Debug Flag = Y`.
3. Inspect the OUTPUT for the summary report (success then error sections).
4. Inspect the LOG file and `XXWD_EMP_SUP_LOG` for full step-by-step trace.

---

## 4. Rollback

```sql
-- Disable concurrent program
EXEC FND_PROGRAM.delete_program('XXWD_EMP_SUP_PRG', 'SQLAP');
EXEC FND_PROGRAM.delete_executable('XXWD_EMP_SUP_EXEC', 'SQLAP');

-- Drop package
DROP PACKAGE APPS.XXWD_EMP_SUPPLIER_PKG;

-- Drop staging objects (only if data is not required)
DROP TABLE XXWD.XXWD_EMP_SUP_LOG  PURGE;
DROP TABLE XXWD.XXWD_EMP_BANK_STG PURGE;
DROP TABLE XXWD.XXWD_EMP_SUP_STG  PURGE;
DROP SEQUENCE XXWD.XXWD_EMP_SUP_STG_S;
DROP SEQUENCE XXWD.XXWD_EMP_BANK_STG_S;
DROP SEQUENCE XXWD.XXWD_EMP_SUP_LOG_S;
```

---

## 5. Operational Notes

### Status codes

| Status     | Meaning                                                  |
| ---------- | -------------------------------------------------------- |
| NEW        | Awaiting processing                                      |
| VALIDATED  | Validations passed; ready for API calls                  |
| PROCESSING | Currently being processed                                |
| SUCCESS    | Supplier/site/bank/account created                       |
| ERROR      | Failed - see `error_message` and `XXWD_EMP_SUP_LOG`      |
| RETRY      | Marked for re-attempt on next run                        |

### Re-processing

Run the program with `Reprocess Errors? = Y` after fixing the underlying issue.
Each ERROR row that matches the filters is re-attempted with a fresh savepoint.

### Diagnosing failures

```sql
SELECT module_name, step_name, message_type, message_text,
       sql_code, sql_errm, creation_date
  FROM xxwd_emp_sup_log
 WHERE employee_number = '&emp_no'
 ORDER BY log_id;
```

---

## 6. Sample test data

```sql
INSERT INTO XXWD_EMP_SUP_STG
  ( row_id, batch_id, employee_number, employee_name, first_name, last_name,
    email_address, org_id, address_line1, city, state, postal_code,
    country_code, currency_code, status )
VALUES
  ( xxwd_emp_sup_stg_s.NEXTVAL, 1001, 'EMP0001', 'Jane A. Doe',
    'Jane', 'Doe', 'jane.doe@example.com', 204, '1 High Street',
    'Boston', 'MA', '02110', 'US', 'USD', 'NEW' );

INSERT INTO XXWD_EMP_BANK_STG
  ( row_id, parent_row_id, employee_number, bank_name, bank_number,
    bank_country_code, branch_name, branch_number, branch_type, bic_code,
    bank_account_number, bank_account_name, bank_account_type,
    currency_code, country_code, primary_account_flag, status )
VALUES
  ( xxwd_emp_bank_stg_s.NEXTVAL,
    (SELECT MAX(row_id) FROM xxwd_emp_sup_stg WHERE employee_number='EMP0001'),
    'EMP0001', 'Bank of America', '026009593', 'US',
    'Boston Main', '0119', 'ABA', 'BOFAUS3N',
    '000123456789', 'Jane Doe', 'CHECKING',
    'USD', 'US', 'Y', 'NEW' );

COMMIT;
```
