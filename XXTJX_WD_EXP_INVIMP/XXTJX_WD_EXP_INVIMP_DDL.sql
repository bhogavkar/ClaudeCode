SET DEFINE OFF;
/**************************************************************************
*
* FILE NAME
*   XXTJX_WD_EXP_INVIMP_DDL.sql
*
* DESCRIPTION
*   Supporting objects for the WD Expense Report -> AP Invoice Import.
*
*   1. Control columns on the custom staging tables (replicas of
*      AP_INVOICES_ALL / AP_INVOICE_LINES_ALL).
*   2. Custom log table + sequence.
*   3. Custom error table + sequence.
*
* HISTORY
* =======
* VERSION DATE        AUTHOR(S)       DESCRIPTION
* ------- ----------- --------------- ------------------------------------
* 1.0     25-JUN-2026 <Author>        Initial version.
*************************************************************************/

----------------------------------------------------------------------------
-- 1. Add process-control columns to the existing custom staging tables.
--    (Run only if these columns are not already present.)
----------------------------------------------------------------------------
ALTER TABLE xxtjx_ap_invoices_interface ADD
(
   process_status_flag   VARCHAR2 (20)    DEFAULT 'NEW'
 , error_message         VARCHAR2 (2000)
);

ALTER TABLE xxtjx_ap_inv_lines_interface ADD
(
   process_status_flag   VARCHAR2 (20)    DEFAULT 'NEW'
 , error_message         VARCHAR2 (2000)
);

----------------------------------------------------------------------------
-- 2. Custom log table (captures Request Id / File / Employee / Invoice /
--    Vendor / Site / Message / Timestamp as per logging requirement).
----------------------------------------------------------------------------
CREATE TABLE xxtjx_wd_exp_inv_log
(
   log_id            NUMBER (15)        NOT NULL
 , request_id        NUMBER (15)
 , file_name         VARCHAR2 (240)
 , batch_id          VARCHAR2 (30)
 , employee_number   VARCHAR2 (30)
 , invoice_number    VARCHAR2 (50)
 , line_number       NUMBER (15)
 , vendor_id         NUMBER (15)
 , vendor_site_id    NUMBER (15)
 , message_type      VARCHAR2 (60)
 , error_message     VARCHAR2 (4000)
 , processing_date   TIMESTAMP
 , created_by        NUMBER (15)
 , creation_date     DATE
);

CREATE SEQUENCE xxtjx_wd_exp_inv_log_s START WITH 1 INCREMENT BY 1 NOCACHE;

----------------------------------------------------------------------------
-- 3. Custom error table (field / record level validation failures).
----------------------------------------------------------------------------
CREATE TABLE xxtjx_wd_exp_inv_err
(
   error_id          NUMBER (15)        NOT NULL
 , request_id        NUMBER (15)
 , batch_id          VARCHAR2 (30)
 , record_type       VARCHAR2 (10)      -- HEADER / LINE
 , invoice_number    VARCHAR2 (50)
 , line_number       NUMBER (15)
 , employee_number   VARCHAR2 (30)
 , error_code        VARCHAR2 (60)
 , error_message     VARCHAR2 (2000)
 , creation_date     DATE
 , created_by        NUMBER (15)
);

CREATE SEQUENCE xxtjx_wd_exp_inv_err_s START WITH 1 INCREMENT BY 1 NOCACHE;

----------------------------------------------------------------------------
-- NOTE
-- Employee Number arrives only in the file and is transient (used to derive
-- the supplier). It is staged in XXTJX_AP_INVOICES_INTERFACE.ATTRIBUTE1
-- (header) / XXTJX_AP_INV_LINES_INTERFACE.ATTRIBUTE1 (line), following the
-- existing convention of holding custom payload in ATTRIBUTE columns
-- (e.g. asset key in ATTRIBUTE2 in XXTJX_TMS_INVIMP_ASSETKEY_PKG).
-- The 6-segment distribution account is staged in
-- XXTJX_AP_INV_LINES_INTERFACE.DIST_CODE_CONCATENATED.
----------------------------------------------------------------------------
