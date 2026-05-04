--==============================================================================
-- File         : 04_sample_execution.sql
-- Purpose      : Sample execution + sample test data for the
--                XX_AP_EXPENSE_IMPORT_PKG package.
--
-- Run as       : APPS  (or any schema with the synonyms in place)
-- Pre-requisite:
--                Oracle EBS R12 environment with at least one valid
--                operating unit, an active employee and a valid GL CCID.
--==============================================================================
SET SERVEROUTPUT ON SIZE UNLIMITED
WHENEVER SQLERROR EXIT FAILURE ROLLBACK

--------------------------------------------------------------------------------
-- 1. Seed sample staging data  (replace the &org_id, &emp_id, &ccid prompts
--    with values from the target instance).
--------------------------------------------------------------------------------
DEFINE p_org_id   = 204
DEFINE p_emp_id   = 32593
DEFINE p_ccid     = 1001
DEFINE p_currency = 'USD'

PROMPT Loading sample data into XX_AP_EXP_STG_HDR / XX_AP_EXP_STG_LINE ...

DECLARE
   l_record_id  NUMBER;
BEGIN
   -- Header
   l_record_id := xx_ap_exp_stg_hdr_s.NEXTVAL;

   INSERT INTO xx_ap_exp_stg_hdr
      ( record_id, employee_id, employee_name, email_id
      , invoice_num, invoice_date, invoice_amount, currency_code
      , org_id, status )
   VALUES
      ( l_record_id, &p_emp_id, 'John Doe', 'john.doe@example.com'
      , 'WD-EXP-'||TO_CHAR(SYSDATE,'YYYYMMDDHH24MI')
      , TRUNC(SYSDATE), 250.00, '&p_currency'
      , &p_org_id, 'NEW' );

   -- Lines (sum = 250.00 to match header)
   INSERT INTO xx_ap_exp_stg_line
      ( record_id, line_number, expense_type, description
      , amount, ccid, status )
   VALUES
      ( l_record_id, 1, 'AIRFARE',  'Flight to NYC client visit'
      , 175.00, &p_ccid, 'NEW' );

   INSERT INTO xx_ap_exp_stg_line
      ( record_id, line_number, expense_type, description
      , amount, ccid, status )
   VALUES
      ( l_record_id, 2, 'MEALS',    'Client dinner'
      , 75.00, &p_ccid, 'NEW' );

   COMMIT;

   dbms_output.put_line('Seeded staging record_id = '||l_record_id);
END;
/

--------------------------------------------------------------------------------
-- 2. Run the import
--------------------------------------------------------------------------------
PROMPT Running XX_AP_EXPENSE_IMPORT_PKG.MAIN_PROCESS ...

DECLARE
   l_errbuf  VARCHAR2(4000);
   l_retcode NUMBER;
BEGIN
   xx_ap_expense_import_pkg.main_process
      ( errbuf       => l_errbuf
      , retcode      => l_retcode
      , p_org_id     => &p_org_id
      , p_debug_flag => 'Y' );

   dbms_output.put_line('retcode = '||l_retcode);
   dbms_output.put_line('errbuf  = '||l_errbuf);
END;
/

--------------------------------------------------------------------------------
-- 3. Inspect the results
--------------------------------------------------------------------------------
PROMPT Staging headers after run:

SELECT record_id, invoice_num, status, vendor_id, vendor_site_id
     , error_message
  FROM xx_ap_exp_stg_hdr
 WHERE org_id = &p_org_id
 ORDER BY record_id DESC;

PROMPT Error log:

SELECT log_id, record_id, stage, error_message, created_date
  FROM xx_ap_exp_error_log
 WHERE record_id IN (SELECT record_id
                       FROM xx_ap_exp_stg_hdr
                      WHERE org_id = &p_org_id)
 ORDER BY log_id DESC;

PROMPT AP Open Interface (this run):

SELECT invoice_num, vendor_id, vendor_site_id, invoice_amount, source, group_id
  FROM ap_invoices_interface
 WHERE source = 'WORKDAY_EXPENSE'
   AND org_id = &p_org_id
 ORDER BY invoice_id DESC;

--------------------------------------------------------------------------------
-- 4. Next step (manual): submit the standard
--      "Payables Open Interface Import"
--    concurrent program with:
--       Source           = WORKDAY_EXPENSE
--       Group            = <group_id printed above>
--       Hold/Release     = (as required)
--    The standard program will create AP_INVOICES_ALL / AP_INVOICE_DISTRIBUTIONS_ALL
--    rows from the rows we just inserted into the open interface.
--------------------------------------------------------------------------------
