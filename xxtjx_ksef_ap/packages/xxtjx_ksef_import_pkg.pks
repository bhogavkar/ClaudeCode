CREATE OR REPLACE PACKAGE apps.xxtjx_ksef_import_pkg
AS
  -- ===================================================================
  --  XXTJX_KSEF_IMPORT_PKG : Oracle Payables Open Interface layer.
  --  Populates AP_INVOICES_INTERFACE / AP_INVOICE_LINES_INTERFACE for
  --  validation-PASS invoices, submits Payables Open Interface Import
  --  (APXIIMPT), waits for completion, and captures the created
  --  invoice_id + AP_INTERFACE_REJECTIONS back into staging.
  -- ===================================================================

  -- Build interface rows for all VALIDATED invoices, submit import,
  -- reconcile results. Returns counts and the child request id.
  PROCEDURE import_validated ( p_imported   OUT NUMBER
                             , p_rejected   OUT NUMBER
                             , p_group_id   OUT VARCHAR2
                             , p_child_req  OUT NUMBER );

END xxtjx_ksef_import_pkg;
/
