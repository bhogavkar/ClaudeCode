CREATE OR REPLACE PACKAGE xxtjx_wd_exp_ap_imp_pkg AS
/****************************************************************************
 * PACKAGE  : XXTJX_WD_EXP_AP_IMP_PKG
 *
 * PURPOSE  : Validate the staged Workday Expense data (loaded by SQL*Loader
 *            into XXTJX_WD_EXP_STG) and populate the Oracle AP Invoice Open
 *            Interface tables:
 *               - AP_INVOICES_INTERFACE
 *               - AP_INVOICE_LINES_INTERFACE
 *
 * SCOPE    : The package responsibility ENDS once rows are inserted into the
 *            interface tables with STATUS = 'NEW'. It does NOT:
 *               - submit Payables Open Interface Import
 *               - create / validate / approve AP invoices
 *               - run any workflow
 *
 * DESIGN   : One staging table. Set-based, single-pass validation. Bulk
 *            insert (FORALL SAVE EXCEPTIONS). Errors are written back to the
 *            staging row. Re-runnable by batch id (idempotent).
 *
 * HISTORY  : VER  DATE         AUTHOR     DESCRIPTION
 *            1.0  27-Jun-2026  Architect  Initial version
 ***************************************************************************/

   --------------------------------------------------------------------
   -- Public constants (avoid hardcoding in the body / callers)
   --------------------------------------------------------------------
   gc_rec_header   CONSTANT VARCHAR2(2)  := 'DH';
   gc_rec_line     CONSTANT VARCHAR2(2)  := 'DL';
   gc_st_new       CONSTANT VARCHAR2(1)  := 'N';
   gc_st_valid     CONSTANT VARCHAR2(1)  := 'V';
   gc_st_success   CONSTANT VARCHAR2(1)  := 'S';
   gc_st_error     CONSTANT VARCHAR2(1)  := 'E';
   gc_intf_status  CONSTANT VARCHAR2(10) := 'NEW';     -- AP interface STATUS
   gc_inv_type     CONSTANT VARCHAR2(25) := 'STANDARD';
   gc_line_type    CONSTANT VARCHAR2(25) := 'ITEM';
   gc_yes          CONSTANT VARCHAR2(1)  := 'Y';
   gc_no           CONSTANT VARCHAR2(1)  := 'N';
   gc_product_tab  CONSTANT VARCHAR2(30) := 'XXTJX_WD_EXP_STG';

   --------------------------------------------------------------------
   -- Concurrent-program entry point
   --   retcode : 0 = success, 1 = warning (some rows errored), 2 = fatal
   --------------------------------------------------------------------
   PROCEDURE main
     ( errbuf          OUT NOCOPY VARCHAR2
     , retcode         OUT NOCOPY NUMBER
     , p_org_id        IN  NUMBER                  -- OU override (optional)
     , p_source        IN  VARCHAR2                -- e.g. 'TJXWD_EXP US'
     , p_batch_id      IN  VARCHAR2                -- batch loaded by SQL*Loader
     , p_gl_date       IN  VARCHAR2 DEFAULT NULL   -- 'YYYY/MM/DD' GL date override
     , p_commit_limit  IN  NUMBER   DEFAULT 1000
     , p_validate_only IN  VARCHAR2 DEFAULT 'N'    -- 'Y' = stop before insert
     , p_debug_flag    IN  VARCHAR2 DEFAULT 'N'
     );

   --------------------------------------------------------------------
   -- Granular, reusable procedures (public for unit testing)
   --------------------------------------------------------------------
   PROCEDURE reconcile_batch    (p_batch_id IN VARCHAR2, p_trailer_cnt IN NUMBER);
   PROCEDURE validate_mandatory (p_batch_id IN VARCHAR2, p_source IN VARCHAR2);
   PROCEDURE derive_person      (p_batch_id IN VARCHAR2);
   PROCEDURE validate_assignment(p_batch_id IN VARCHAR2);
   PROCEDURE validate_org       (p_batch_id IN VARCHAR2, p_org_id IN NUMBER);
   PROCEDURE derive_supplier    (p_batch_id IN VARCHAR2);
   PROCEDURE validate_expense   (p_batch_id IN VARCHAR2);
   PROCEDURE insert_intf_headers(p_batch_id IN VARCHAR2, p_source IN VARCHAR2,
                                 p_gl_date IN DATE);
   PROCEDURE insert_intf_lines  (p_batch_id IN VARCHAR2);
   PROCEDURE update_stg_status  (p_batch_id IN VARCHAR2);

END xxtjx_wd_exp_ap_imp_pkg;
/
