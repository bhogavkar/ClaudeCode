CREATE OR REPLACE PACKAGE XX_AP_EXPENSE_OUTBOUND_PKG AS
/******************************************************************************
 *  Package      : XX_AP_EXPENSE_OUTBOUND_PKG
 *  Purpose      : Outbound integration from Oracle EBS R12 (AP) to Workday.
 *                 Extracts successfully paid AP expense invoices, formats the
 *                 data into a pipe-delimited (PSP) file containing DH (Data
 *                 Header) and DL (Data Line) records and writes the file to
 *                 the Oracle DIRECTORY XX_OUTBOUND_DIR using UTL_FILE.
 *
 *  Module       : Oracle Payables (AP)
 *  EBS Version  : R12 (12.2.x)
 *  DB Version   : Oracle 19c
 *  Multi-Org    : Yes (MOAC enabled - uses MO_GLOBAL.SET_POLICY_CONTEXT)
 *
 *  File Naming  : WORKDAY_PAY_YYYYMMDD_HH24MISS.txt
 *  Directory    : XX_OUTBOUND_DIR (Oracle Database Directory)
 *  Delimiter    : Pipe ( | )
 *
 *  Record Layout:
 *      DH|Invoice_Num|Supplier_Name|Payment_Amount|Payment_Date|Currency|Org_ID
 *      DL|Line_No|Expense_Type|Description|Amount|CCID
 *
 *  Revision History
 *  ----------------------------------------------------------------------------
 *  Ver     Date         Author             Description
 *  ----    -----------  -----------------  ------------------------------------
 *  1.0     04-MAY-2026  AP Integration     Initial Version
 ******************************************************************************/

    -- Public global constants
    g_directory_name  CONSTANT VARCHAR2(30)  := 'XX_OUTBOUND_DIR';
    g_file_prefix     CONSTANT VARCHAR2(30)  := 'WORKDAY_PAY_';
    g_file_extension  CONSTANT VARCHAR2(10)  := '.txt';
    g_delimiter       CONSTANT VARCHAR2(1)   := '|';
    g_program_short   CONSTANT VARCHAR2(30)  := 'XX_AP_EXP_OUT';

    -- Public exception
    e_processing_error EXCEPTION;

    /*--------------------------------------------------------------------------
     *  Procedure : INIT_CONTEXT
     *  Purpose   : Initialize FND_GLOBAL and MOAC context for the run so that
     *              all VPD-protected (_ALL) tables return rows for the requested
     *              operating unit.
     *------------------------------------------------------------------------*/
    PROCEDURE init_context (p_user_name   IN VARCHAR2 DEFAULT NULL,
                            p_resp_name   IN VARCHAR2 DEFAULT NULL,
                            p_org_id      IN NUMBER);

    /*--------------------------------------------------------------------------
     *  Procedure : FORMAT_DH_RECORD
     *  Purpose   : Build a single pipe-delimited DH (Data Header) string.
     *------------------------------------------------------------------------*/
    FUNCTION format_dh_record (p_invoice_num     IN VARCHAR2,
                               p_supplier_name   IN VARCHAR2,
                               p_payment_amount  IN NUMBER,
                               p_payment_date    IN DATE,
                               p_currency        IN VARCHAR2,
                               p_org_id          IN NUMBER) RETURN VARCHAR2;

    /*--------------------------------------------------------------------------
     *  Procedure : FORMAT_DL_RECORD
     *  Purpose   : Build a single pipe-delimited DL (Data Line) string.
     *------------------------------------------------------------------------*/
    FUNCTION format_dl_record (p_line_no       IN NUMBER,
                               p_expense_type  IN VARCHAR2,
                               p_description   IN VARCHAR2,
                               p_amount        IN NUMBER,
                               p_ccid          IN NUMBER) RETURN VARCHAR2;

    /*--------------------------------------------------------------------------
     *  Procedure : LOG_OUTPUT
     *  Purpose   : Log success/error counts and messages to FND_LOG / DBMS_OUTPUT.
     *------------------------------------------------------------------------*/
    PROCEDURE log_output (p_success_count IN NUMBER,
                          p_error_count   IN NUMBER,
                          p_file_name     IN VARCHAR2);

    /*--------------------------------------------------------------------------
     *  Procedure : MAIN_PROCESS
     *  Purpose   : Entry point. Drives the full extraction and file generation.
     *              x_retcode :  0 = Success, 1 = Warning, 2 = Error
     *------------------------------------------------------------------------*/
    PROCEDURE main_process (x_errbuf       OUT NOCOPY VARCHAR2,
                            x_retcode      OUT NOCOPY VARCHAR2,
                            p_org_id       IN  NUMBER,
                            p_from_date    IN  VARCHAR2 DEFAULT NULL,
                            p_to_date      IN  VARCHAR2 DEFAULT NULL,
                            p_debug_flag   IN  VARCHAR2 DEFAULT 'N');

END XX_AP_EXPENSE_OUTBOUND_PKG;
/
