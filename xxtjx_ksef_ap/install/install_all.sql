-- =====================================================================
--  install_all.sql  |  Master installer (run from the install/ folder)
--  Order matters. Review 00 paths first. Run DDL as XXTJX, code as APPS.
-- =====================================================================
SET DEFINE OFF
SET SERVEROUTPUT ON SIZE UNLIMITED
WHENEVER SQLERROR CONTINUE

PROMPT ==========================================================
PROMPT  TJX KSeF AP Invoice Integration - Installation
PROMPT ==========================================================

PROMPT --- [SYS/DBA] Directories + grants ---
@@00_directories_and_grants.sql

PROMPT --- [XXTJX] Sequences ---
@@../ddl/01_sequences.sql
PROMPT --- [XXTJX] Tables ---
@@../ddl/02_tbl_xxtjx_ksef_files.sql
@@../ddl/03_tbl_xxtjx_ksef_ap_hdr_stg.sql
@@../ddl/04_tbl_xxtjx_ksef_ap_line_stg.sql
@@../ddl/05_tbl_xxtjx_ap_attachments.sql
@@../ddl/06_tbl_xxtjx_ksef_log.sql
PROMPT --- [XXTJX] Constraints + indexes ---
@@../ddl/07_constraints.sql
@@../ddl/08_indexes.sql

PROMPT --- [APPS] Package specs ---
@@../packages/xxtjx_ksef_cons_pkg.pks
@@../packages/xxtjx_ksef_log_pkg.pks
@@../packages/xxtjx_ksef_util_pkg.pks
@@../packages/xxtjx_ksef_loader_pkg.pks
@@../packages/xxtjx_ksef_parser_pkg.pks
@@../packages/xxtjx_ksef_valid_pkg.pks
@@../packages/xxtjx_ksef_import_pkg.pks
@@../packages/xxtjx_ksef_attach_pkg.pks
@@../packages/xxtjx_ksef_main_pkg.pks

PROMPT --- [APPS] Package bodies ---
@@../packages/xxtjx_ksef_log_pkg.pkb
@@../packages/xxtjx_ksef_util_pkg.pkb
@@../packages/xxtjx_ksef_loader_pkg.pkb
@@../packages/xxtjx_ksef_parser_pkg.pkb
@@../packages/xxtjx_ksef_valid_pkg.pkb
@@../packages/xxtjx_ksef_import_pkg.pkb
@@../packages/xxtjx_ksef_attach_pkg.pkb
@@../packages/xxtjx_ksef_main_pkg.pkb
@@../packages/xxtjx_ksef_purge_pkg.pks
@@../packages/xxtjx_ksef_purge_pkg.pkb

PROMPT --- [APPS] AOL objects ---
@@01_ap_source_lookup.sql
@@02_value_sets.sql
@@03_concurrent_program.sql

PROMPT --- Recompile / validate ---
BEGIN
  FOR o IN (SELECT object_name, object_type FROM all_objects
             WHERE owner='APPS' AND object_name LIKE 'XXTJX_KSEF%'
               AND status='INVALID')
  LOOP
    BEGIN
      EXECUTE IMMEDIATE 'ALTER '||o.object_type||' apps.'||o.object_name||' COMPILE';
    EXCEPTION WHEN OTHERS THEN
      DBMS_OUTPUT.put_line('INVALID: '||o.object_name||' '||SQLERRM);
    END;
  END LOOP;
END;
/

PROMPT ==========================================================
PROMPT  Installation complete. Review the log for INVALID objects.
PROMPT ==========================================================
