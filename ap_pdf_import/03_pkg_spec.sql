-- =============================================================================
-- File        : 03_pkg_spec.sql
-- Description : Package specification for AP PDF Import utility.
-- Module      : Oracle Payables (AP) - R12
-- =============================================================================

CREATE OR REPLACE PACKAGE XXCUST_AP_PDF_PKG
AUTHID CURRENT_USER
AS

    -- =========================================================================
    -- Package constants
    -- =========================================================================
    G_PKG_NAME          CONSTANT VARCHAR2(30)  := 'XXCUST_AP_PDF_PKG';
    G_APPL_SHORT_NAME   CONSTANT VARCHAR2(10)  := 'SQLAP';         -- AP module short name
    G_ENTITY_NAME       CONSTANT VARCHAR2(40)  := 'AP_INVOICES';   -- FND entity for AP invoice header
    G_CATEGORY_NAME     CONSTANT VARCHAR2(30)  := 'FROM_SUPPLIER'; -- FND document category
    G_PDF_DIR           CONSTANT VARCHAR2(30)  := 'AP_PDF_DIR';    -- Oracle Directory alias
    G_MAX_FILE_BYTES    CONSTANT NUMBER        := 52428800;        -- 50 MB guard
    G_KSEF_DIGITS       CONSTANT NUMBER        := 35;              -- Expected K-Sef number length
    G_DATATYPE_FILE     CONSTANT NUMBER        := 6;               -- FND_DOCUMENT_DATATYPES: binary file
    G_STORAGE_LOB       CONSTANT NUMBER        := 1;               -- FND_DOCUMENTS: DB/LOB storage

    -- Processing status literals
    G_STS_NEW           CONSTANT VARCHAR2(20)  := 'NEW';
    G_STS_LOADING       CONSTANT VARCHAR2(20)  := 'LOADING';
    G_STS_PROCESSED     CONSTANT VARCHAR2(20)  := 'PROCESSED';
    G_STS_ATTACHED      CONSTANT VARCHAR2(20)  := 'ATTACHED';
    G_STS_ERROR         CONSTANT VARCHAR2(20)  := 'ERROR';
    G_STS_ATTACH_ERR    CONSTANT VARCHAR2(20)  := 'ATTACH_ERROR';

    -- =========================================================================
    -- Public API
    -- =========================================================================

    /*
     * PROCEDURE: load_pdf_to_staging
     * -----------------------------------------------------------------------
     * Reads a PDF file from the Oracle Directory AP_PDF_DIR and persists its
     * binary content as a BLOB in XXCUST_AP_PDF_STAGING.
     *
     * Parameters:
     *   p_file_name   - Full file name on disk, e.g. '12345...890.pdf'
     *                   The stem (without .pdf) must be exactly 35 digits.
     *   p_invoice_num - Optional: AP invoice number to associate at load time.
     *   x_staging_id  - OUT: Surrogate PK of the newly created staging row.
     *   x_status      - OUT: Final status (PROCESSED | ERROR).
     *   x_message     - OUT: Human-readable result or error detail.
     */
    PROCEDURE load_pdf_to_staging(
        p_file_name     IN  VARCHAR2,
        p_invoice_num   IN  VARCHAR2 DEFAULT NULL,
        x_staging_id    OUT NUMBER,
        x_status        OUT VARCHAR2,
        x_message       OUT VARCHAR2
    );

    /*
     * PROCEDURE: attach_pdf_to_invoice
     * -----------------------------------------------------------------------
     * Reads the BLOB from a PROCESSED staging row and creates a standard FND
     * attachment on the AP Invoice Header (entity = AP_INVOICES) using the
     * "From Supplier" document category.
     *
     * Parameters:
     *   p_staging_id  - Staging row to attach (must be in PROCESSED status).
     *   p_invoice_num - AP invoice number to attach to.
     *   x_status      - OUT: Final status (ATTACHED | ATTACH_ERROR).
     *   x_message     - OUT: Human-readable result or error detail.
     */
    PROCEDURE attach_pdf_to_invoice(
        p_staging_id    IN  NUMBER,
        p_invoice_num   IN  VARCHAR2,
        x_status        OUT VARCHAR2,
        x_message       OUT VARCHAR2
    );

    /*
     * PROCEDURE: process_pdf
     * -----------------------------------------------------------------------
     * Orchestrator: calls load_pdf_to_staging then attach_pdf_to_invoice in
     * sequence.  This is the single entry point for end-to-end processing.
     *
     * Parameters:
     *   p_file_name   - PDF file name on the OS directory.
     *   p_invoice_num - AP invoice number to attach to.
     *   x_status      - OUT: Final status from the last step.
     *   x_message     - OUT: Human-readable result or error detail.
     */
    PROCEDURE process_pdf(
        p_file_name     IN  VARCHAR2,
        p_invoice_num   IN  VARCHAR2,
        x_status        OUT VARCHAR2,
        x_message       OUT VARCHAR2
    );

    /*
     * PROCEDURE: process_pdf_cp
     * -----------------------------------------------------------------------
     * Concurrent Program entry point. Wraps process_pdf with the mandatory
     * Oracle EBS CP framework signature (ERRBUF + RETCODE as first two OUT
     * parameters). This is the procedure registered in the CP executable.
     *
     * RETCODE mapping:
     *   '0' = Success  (status = ATTACHED)
     *   '1' = Warning  (status = ATTACH_ERROR — BLOB loaded but FND step failed)
     *   '2' = Error    (status = ERROR — load phase failed or unhandled exception)
     *
     * Parameters:
     *   errbuf        - OUT: Error/completion message (Oracle CP requirement).
     *   retcode       - OUT: Completion code '0'|'1'|'2' (Oracle CP requirement).
     *   p_file_name   - IN:  PDF file name (K-Sef number + .pdf extension).
     *   p_invoice_num - IN:  AP invoice number to attach to.
     */
    PROCEDURE process_pdf_cp(
        errbuf        OUT VARCHAR2,
        retcode       OUT VARCHAR2,
        p_file_name   IN  VARCHAR2,
        p_invoice_num IN  VARCHAR2
    );

END XXCUST_AP_PDF_PKG;
/

SHOW ERRORS PACKAGE XXCUST_AP_PDF_PKG;

PROMPT Package spec XXCUST_AP_PDF_PKG created. Run 04_pkg_body.sql next.
