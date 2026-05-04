-- ============================================================================
-- Sample artefacts for XX_AP_EXPENSE_OUTBOUND_PKG
--
--   1) Oracle Directory creation (one-time DBA step, included for reference)
--   2) Run-control table & sequence (used for incremental / idempotent runs)
--   3) Anonymous block to invoke the package outside of a concurrent program
--   4) Sample output file content (PSP / pipe-delimited)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) ORACLE DIRECTORY  (run as a DBA once per environment)
-- ----------------------------------------------------------------------------
-- CREATE OR REPLACE DIRECTORY XX_OUTBOUND_DIR AS '/u01/app/oracle/outbound/workday';
-- GRANT READ, WRITE ON DIRECTORY XX_OUTBOUND_DIR TO APPS;


-- ----------------------------------------------------------------------------
-- 2) RUN CONTROL TABLE & SEQUENCE
--    Captures last_run_date so each invocation extracts only new payments.
-- ----------------------------------------------------------------------------
CREATE TABLE xx_ap_outbound_run_ctl (
    run_id                NUMBER          NOT NULL,
    program_short_name    VARCHAR2(30)    NOT NULL,
    org_id                NUMBER          NOT NULL,
    from_date             DATE,
    last_run_date         DATE            NOT NULL,
    status                VARCHAR2(15)    NOT NULL,
    file_name             VARCHAR2(200),
    success_count         NUMBER          DEFAULT 0,
    error_count           NUMBER          DEFAULT 0,
    request_id            NUMBER,
    created_by            NUMBER          NOT NULL,
    creation_date         DATE            NOT NULL,
    last_updated_by       NUMBER          NOT NULL,
    last_update_date      DATE            NOT NULL,
    CONSTRAINT xx_ap_outbound_run_ctl_pk PRIMARY KEY (run_id)
);

CREATE INDEX xx_ap_outbound_run_ctl_n1
    ON xx_ap_outbound_run_ctl (program_short_name, org_id, status);

CREATE SEQUENCE xx_ap_outbound_run_ctl_s START WITH 1 INCREMENT BY 1 NOCACHE;


-- ----------------------------------------------------------------------------
-- 3) SAMPLE EXECUTION BLOCK
--    Use SQL*Plus or any client connected as APPS.
-- ----------------------------------------------------------------------------
SET SERVEROUTPUT ON SIZE UNLIMITED;

DECLARE
    l_errbuf   VARCHAR2(4000);
    l_retcode  VARCHAR2(10);
BEGIN
    -- Pre-set apps context if not running from a concurrent program
    FND_GLOBAL.apps_initialize (user_id      => 1318,    -- e.g. SYSADMIN
                                resp_id      => 50559,   -- Payables Manager
                                resp_appl_id => 200);    -- AP

    XX_AP_EXPENSE_OUTBOUND_PKG.main_process (
        x_errbuf      => l_errbuf,
        x_retcode     => l_retcode,
        p_org_id      => 204,                  -- Vision Operations
        p_from_date   => NULL,                 -- NULL = use last successful run
        p_to_date     => NULL,                 -- NULL = SYSDATE
        p_debug_flag  => 'Y');

    DBMS_OUTPUT.put_line ('Retcode : ' || l_retcode);
    DBMS_OUTPUT.put_line ('Errbuf  : ' || l_errbuf);
END;
/


-- ----------------------------------------------------------------------------
-- 4) SAMPLE GENERATED FILE CONTENT
--    Filename : WORKDAY_PAY_20260504_153012.txt
--    Layout   : DH|Invoice_Num|Supplier_Name|Payment_Amount|Payment_Date|Currency|Org_ID
--               DL|Line_No|Expense_Type|Description|Amount|CCID
-- ----------------------------------------------------------------------------
/*
DH|EXP-1001|JOHN SMITH|524.75|2026-04-30|USD|204
DL|1|ITEM|Hotel - Boston Conference|410.00|10234
DL|2|ITEM|Taxi from airport|44.75|10234
DL|3|ITEM|Client dinner|70.00|10234
DH|EXP-1002|JANE DOE|185.40|2026-04-30|USD|204
DL|1|ITEM|Office supplies|185.40|10250
DH|EXP-1003|ACME OFFICE SUPPLIES|2300.00|2026-05-01|USD|204
DL|1|ITEM|Quarterly stationery order|1800.00|10250
DL|2|ITEM|Printer toner|500.00|10250
*/
