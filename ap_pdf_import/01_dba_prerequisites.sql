-- =============================================================================
-- File        : 01_dba_prerequisites.sql
-- Description : DBA-only setup for AP PDF Import solution.
--               Must be run as SYS or a DBA-privileged user BEFORE
--               deploying the package.
-- Module      : Oracle Payables (AP) - R12
-- =============================================================================

-- Step 1: Create Oracle Directory object pointing to the PDF inbox.
--         The OS path must exist and the Oracle OS user (typically 'oracle')
--         must have read permission on it.
--
--   OS command (run as root or oracle user on DB server):
--     chmod 755 /tjx/ebsdev/applbin/fs_ne/custom/data/ap/in/xxtjxopentext/pdf
--
CREATE OR REPLACE DIRECTORY AP_PDF_DIR
    AS '/tjx/ebsdev/applbin/fs_ne/custom/data/ap/in/xxtjxopentext/pdf';

-- Step 2: Grant read/write on the directory to the APPS schema.
GRANT READ, WRITE ON DIRECTORY AP_PDF_DIR TO APPS;

-- Step 3: Verify directory creation.
SELECT directory_name,
       directory_path
FROM   dba_directories
WHERE  directory_name = 'AP_PDF_DIR';

-- Step 4: Grant any additional object privileges if the custom table
--         is owned by a custom schema (adjust schema name as needed).
-- GRANT SELECT, INSERT, UPDATE ON <custom_schema>.XXCUST_AP_PDF_STAGING TO APPS;
-- GRANT SELECT ON <custom_schema>.XXCUST_AP_PDF_STG_S TO APPS;

PROMPT DBA prerequisites complete. Run 02_staging_table.sql next (as APPS).
