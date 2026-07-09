CREATE OR REPLACE PACKAGE apps.xxtjx_ksef_cons_pkg
AS
  -- ===================================================================
  --  XXTJX_KSEF_CONS_PKG : Central constants for the KSeF AP integration
  --  No executable code. Single source of truth for literals.
  -- ===================================================================

  gc_source_system      CONSTANT VARCHAR2(30)  := 'OPENTEXT';
  gc_document_type      CONSTANT VARCHAR2(30)  := 'AP_INVOICE';
  gc_ap_source          CONSTANT VARCHAR2(80)  := 'TJX E-Invoice';   -- AP lookup SOURCE
  gc_file_name_regex    CONSTANT VARCHAR2(100) := '^TJX_E-INVOICE_AP_INV_[0-9]{14}\.json$';

  -- ---- File / process statuses (XXTJX_KSEF_FILES.process_status) ----
  gc_st_new             CONSTANT VARCHAR2(30) := 'NEW';
  gc_st_loaded          CONSTANT VARCHAR2(30) := 'LOADED';
  gc_st_parsing         CONSTANT VARCHAR2(30) := 'PARSING';
  gc_st_parsed          CONSTANT VARCHAR2(30) := 'PARSED';
  gc_st_validating      CONSTANT VARCHAR2(30) := 'VALIDATING';
  gc_st_validated       CONSTANT VARCHAR2(30) := 'VALIDATED';
  gc_st_importing       CONSTANT VARCHAR2(30) := 'IMPORTING';
  gc_st_imported        CONSTANT VARCHAR2(30) := 'IMPORTED';
  gc_st_attaching       CONSTANT VARCHAR2(30) := 'ATTACHING';
  gc_st_completed       CONSTANT VARCHAR2(30) := 'COMPLETED';
  gc_st_error           CONSTANT VARCHAR2(30) := 'ERROR';
  gc_st_duplicate       CONSTANT VARCHAR2(30) := 'DUPLICATE';
  gc_st_rejected        CONSTANT VARCHAR2(30) := 'REJECTED';

  -- ---- Validation statuses ----
  gc_val_pending        CONSTANT VARCHAR2(30) := 'PENDING';
  gc_val_pass           CONSTANT VARCHAR2(30) := 'PASS';
  gc_val_fail           CONSTANT VARCHAR2(30) := 'FAIL';
  gc_val_warn           CONSTANT VARCHAR2(30) := 'WARN';

  -- ---- Interface statuses ----
  gc_if_pending         CONSTANT VARCHAR2(30) := 'PENDING';
  gc_if_loaded          CONSTANT VARCHAR2(30) := 'LOADED';
  gc_if_imported        CONSTANT VARCHAR2(30) := 'IMPORTED';
  gc_if_rejected        CONSTANT VARCHAR2(30) := 'REJECTED';

  -- ---- Attachment statuses ----
  gc_att_pending        CONSTANT VARCHAR2(30) := 'PENDING';
  gc_att_decoded        CONSTANT VARCHAR2(30) := 'DECODED';
  gc_att_validated      CONSTANT VARCHAR2(30) := 'VALIDATED';
  gc_att_attached       CONSTANT VARCHAR2(30) := 'ATTACHED';
  gc_att_attach_error   CONSTANT VARCHAR2(30) := 'ATTACH_ERROR';
  gc_att_decode_error   CONSTANT VARCHAR2(30) := 'DECODE_ERROR';

  -- ---- Invoice / line types ----
  gc_inv_standard       CONSTANT VARCHAR2(25) := 'STANDARD';
  gc_inv_credit         CONSTANT VARCHAR2(25) := 'CREDIT';
  gc_line_item          CONSTANT VARCHAR2(25) := 'ITEM';
  gc_line_freight       CONSTANT VARCHAR2(25) := 'FREIGHT';
  gc_line_tax           CONSTANT VARCHAR2(25) := 'TAX';

  -- ---- Currency / OU enums (per schema) ----
  gc_currency_pln       CONSTANT VARCHAR2(15) := 'PLN';
  gc_ou_431             CONSTANT VARCHAR2(240):= 'PL (431) TJX TK MAXX POLAND OU';
  gc_ou_432             CONSTANT VARCHAR2(240):= 'PL (432) TJX EURO DISTRIBUTION OU';

  -- ---- Attachment framework ----
  gc_att_mime_pdf       CONSTANT VARCHAR2(240):= 'application/pdf';
  gc_att_extension      CONSTANT VARCHAR2(10) := 'pdf';
  gc_att_category       CONSTANT VARCHAR2(60) := 'Supplier';      -- FND category
  gc_att_entity         CONSTANT VARCHAR2(60) := 'AP_INVOICES';   -- AP invoice header
  gc_att_datatype_file  CONSTANT NUMBER       := 6;               -- FND datatype File
  gc_pdf_magic          CONSTANT VARCHAR2(8)  := '%PDF';          -- PDF signature
  gc_pdf_eof            CONSTANT VARCHAR2(8)  := '%%EOF';
  gc_att_min_bytes      CONSTANT NUMBER       := 100;             -- reject empty/stub
  gc_att_max_bytes      CONSTANT NUMBER       := 20971520;        -- 20 MB cap

  -- ---- Tolerances ----
  gc_amount_tolerance   CONSTANT NUMBER       := 0.01;   -- header vs. line sum
  gc_future_date_days   CONSTANT NUMBER       := 1;      -- invoice date future tol

  -- ---- Directory objects (DB) ----
  gc_dir_tmp            CONSTANT VARCHAR2(30) := 'XXTJX_KSEF_TMP';
  gc_dir_process        CONSTANT VARCHAR2(30) := 'XXTJX_KSEF_PROCESS';
  gc_dir_archive        CONSTANT VARCHAR2(30) := 'XXTJX_KSEF_ARCHIVE';
  gc_dir_error          CONSTANT VARCHAR2(30) := 'XXTJX_KSEF_ERROR';
  gc_dir_log            CONSTANT VARCHAR2(30) := 'XXTJX_KSEF_LOG';

  -- ---- Error codes (business friendly grouping) ----
  gc_err_bad_filename   CONSTANT VARCHAR2(30) := 'KSEF-001';
  gc_err_dup_file       CONSTANT VARCHAR2(30) := 'KSEF-002';
  gc_err_invalid_json   CONSTANT VARCHAR2(30) := 'KSEF-003';
  gc_err_mandatory      CONSTANT VARCHAR2(30) := 'KSEF-010';
  gc_err_supplier       CONSTANT VARCHAR2(30) := 'KSEF-011';
  gc_err_site           CONSTANT VARCHAR2(30) := 'KSEF-012';
  gc_err_ou             CONSTANT VARCHAR2(30) := 'KSEF-013';
  gc_err_currency       CONSTANT VARCHAR2(30) := 'KSEF-014';
  gc_err_inv_date       CONSTANT VARCHAR2(30) := 'KSEF-015';
  gc_err_gl_date        CONSTANT VARCHAR2(30) := 'KSEF-016';
  gc_err_dup_invoice    CONSTANT VARCHAR2(30) := 'KSEF-017';
  gc_err_amount         CONSTANT VARCHAR2(30) := 'KSEF-018';
  gc_err_line_amount    CONSTANT VARCHAR2(30) := 'KSEF-019';
  gc_err_po             CONSTANT VARCHAR2(30) := 'KSEF-020';
  gc_err_dist_acct      CONSTANT VARCHAR2(30) := 'KSEF-021';
  gc_err_tax            CONSTANT VARCHAR2(30) := 'KSEF-022';
  gc_err_inv_type       CONSTANT VARCHAR2(30) := 'KSEF-023';
  gc_err_balance        CONSTANT VARCHAR2(30) := 'KSEF-024';
  gc_err_ksef           CONSTANT VARCHAR2(30) := 'KSEF-025';
  gc_err_bu             CONSTANT VARCHAR2(30) := 'KSEF-026';
  gc_err_le             CONSTANT VARCHAR2(30) := 'KSEF-027';
  gc_err_source         CONSTANT VARCHAR2(30) := 'KSEF-028';
  gc_err_base64         CONSTANT VARCHAR2(30) := 'KSEF-029';
  gc_err_pdf_sig        CONSTANT VARCHAR2(30) := 'KSEF-030';
  gc_err_pdf_size       CONSTANT VARCHAR2(30) := 'KSEF-031';
  gc_err_att_mime       CONSTANT VARCHAR2(30) := 'KSEF-032';
  gc_err_att_missing    CONSTANT VARCHAR2(30) := 'KSEF-033';
  gc_err_trailer        CONSTANT VARCHAR2(30) := 'KSEF-034';
  gc_err_ap_interface   CONSTANT VARCHAR2(30) := 'KSEF-040';
  gc_err_attach_create  CONSTANT VARCHAR2(30) := 'KSEF-050';
  gc_err_unexpected     CONSTANT VARCHAR2(30) := 'KSEF-999';

  -- ---- Concurrent request return codes ----
  gc_ret_success        CONSTANT NUMBER := 0;
  gc_ret_warning        CONSTANT NUMBER := 1;
  gc_ret_error          CONSTANT NUMBER := 2;

END xxtjx_ksef_cons_pkg;
/
