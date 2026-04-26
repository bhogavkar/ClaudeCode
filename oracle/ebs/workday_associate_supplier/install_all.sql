--------------------------------------------------------------------------------
-- File   : install_all.sql
-- Purpose: Master installer for the Workday Associate/Supplier/Expense Report
--          integration. Run from sqlplus connected as APPS:
--              sqlplus apps/<pwd> @install_all.sql
--          The concurrent program script must be run separately AFTER this
--          if you customize XXCUST application registration.
-- EBS    : 12.2.12
--------------------------------------------------------------------------------
SET DEFINE OFF
SET ECHO ON
SET FEEDBACK ON
SET TIMING ON
WHENEVER SQLERROR EXIT FAILURE ROLLBACK

PROMPT =============================================================
PROMPT  Workday -> EBS Integration installer
PROMPT =============================================================

PROMPT --- Sequences ---
@@ddl/05_sequences.sql

PROMPT --- Tables ---
@@ddl/01_xx_wd_employee_stg.sql
@@ddl/02_xx_wd_exp_hdr_stg.sql
@@ddl/03_xx_wd_exp_line_stg.sql
@@ddl/04_xx_wd_integration_log.sql

PROMPT --- Package spec ---
@@pkg/xx_wd_emp_supplier_pkg.pks

PROMPT --- Package body (assembled) ---
@@pkg/xx_wd_emp_supplier_pkg.pkb

PROMPT --- Concurrent program registration ---
@@cp/xx_wd_concurrent_program.sql

PROMPT =============================================================
PROMPT  Install complete. Verify package status:
PROMPT     SELECT object_name, status FROM user_objects
PROMPT      WHERE object_name = 'XX_WD_EMP_SUPPLIER_PKG';
PROMPT =============================================================
EXIT;
