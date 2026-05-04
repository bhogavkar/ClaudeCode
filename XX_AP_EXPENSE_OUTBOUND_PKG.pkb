CREATE OR REPLACE PACKAGE BODY XX_AP_EXPENSE_OUTBOUND_PKG AS
/******************************************************************************
 *  Package Body : XX_AP_EXPENSE_OUTBOUND_PKG
 *  See package specification for description and revision history.
 ******************************************************************************/

    --------------------------------------------------------------------------
    -- Private constants & package globals
    --------------------------------------------------------------------------
    g_dh_marker        CONSTANT VARCHAR2(2)  := 'DH';
    g_dl_marker        CONSTANT VARCHAR2(2)  := 'DL';
    g_date_fmt_file    CONSTANT VARCHAR2(20) := 'YYYYMMDD_HH24MISS';
    g_date_fmt_data    CONSTANT VARCHAR2(20) := 'YYYY-MM-DD';

    g_file_handle      UTL_FILE.FILE_TYPE;
    g_run_id           NUMBER;
    g_request_id       NUMBER;
    g_debug_flag       VARCHAR2(1) := 'N';

    --------------------------------------------------------------------------
    -- Private helper: write line to FND log/concurrent log + DBMS_OUTPUT
    --------------------------------------------------------------------------
    PROCEDURE write_log (p_msg IN VARCHAR2) IS
    BEGIN
        IF FND_GLOBAL.conc_request_id > 0 THEN
            FND_FILE.put_line (FND_FILE.LOG, p_msg);
        END IF;
        IF g_debug_flag = 'Y' THEN
            DBMS_OUTPUT.put_line (p_msg);
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            NULL;  -- never let logging break the main flow
    END write_log;

    --------------------------------------------------------------------------
    -- Private helper: scrub the pipe character (and CR/LF) from a string so
    -- it does not collide with the field delimiter.
    --------------------------------------------------------------------------
    FUNCTION clean_value (p_value IN VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        IF p_value IS NULL THEN
            RETURN NULL;
        END IF;

        RETURN TRIM (
                 REPLACE (
                   REPLACE (
                     REPLACE (p_value, g_delimiter, ' '),
                     CHR(13), ' '),
                   CHR(10), ' ')
               );
    END clean_value;

    --------------------------------------------------------------------------
    -- Private helper: get the last successful run timestamp for incremental
    -- extraction. Falls back to SYSDATE - 1 if no prior run exists.
    --------------------------------------------------------------------------
    FUNCTION get_last_run_date (p_org_id IN NUMBER) RETURN DATE IS
        l_last_run DATE;
    BEGIN
        SELECT NVL (MAX (last_run_date), SYSDATE - 1)
          INTO l_last_run
          FROM xx_ap_outbound_run_ctl
         WHERE program_short_name = g_program_short
           AND org_id             = p_org_id
           AND status             = 'SUCCESS';

        RETURN l_last_run;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RETURN SYSDATE - 1;
        WHEN OTHERS THEN
            -- If the control table does not exist or any other issue, default
            -- to a 1-day window so the program is still usable.
            write_log ('get_last_run_date warning: ' || SQLERRM);
            RETURN SYSDATE - 1;
    END get_last_run_date;

    --------------------------------------------------------------------------
    -- Private helper: stamp control table with current run details
    --------------------------------------------------------------------------
    PROCEDURE stamp_run_control (p_org_id        IN NUMBER,
                                 p_from_date     IN DATE,
                                 p_to_date       IN DATE,
                                 p_status        IN VARCHAR2,
                                 p_file_name     IN VARCHAR2,
                                 p_success_count IN NUMBER,
                                 p_error_count   IN NUMBER) IS
        PRAGMA AUTONOMOUS_TRANSACTION;
    BEGIN
        INSERT INTO xx_ap_outbound_run_ctl (
            run_id,
            program_short_name,
            org_id,
            from_date,
            last_run_date,
            status,
            file_name,
            success_count,
            error_count,
            request_id,
            created_by,
            creation_date,
            last_updated_by,
            last_update_date)
        VALUES (
            xx_ap_outbound_run_ctl_s.NEXTVAL,
            g_program_short,
            p_org_id,
            p_from_date,
            p_to_date,
            p_status,
            p_file_name,
            p_success_count,
            p_error_count,
            g_request_id,
            FND_GLOBAL.user_id,
            SYSDATE,
            FND_GLOBAL.user_id,
            SYSDATE);

        COMMIT;
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            write_log ('stamp_run_control warning: ' || SQLERRM);
    END stamp_run_control;

    --------------------------------------------------------------------------
    -- INIT_CONTEXT
    --------------------------------------------------------------------------
    PROCEDURE init_context (p_user_name   IN VARCHAR2 DEFAULT NULL,
                            p_resp_name   IN VARCHAR2 DEFAULT NULL,
                            p_org_id      IN NUMBER) IS
        l_user_id   NUMBER;
        l_resp_id   NUMBER;
        l_appl_id   NUMBER;
    BEGIN
        -- When called from a concurrent program FND_GLOBAL is already set;
        -- only re-initialize if the caller passed user/responsibility names.
        IF p_user_name IS NOT NULL AND p_resp_name IS NOT NULL THEN
            SELECT user_id INTO l_user_id
              FROM fnd_user
             WHERE user_name = UPPER (p_user_name);

            SELECT responsibility_id, application_id
              INTO l_resp_id, l_appl_id
              FROM fnd_responsibility_vl
             WHERE responsibility_name = p_resp_name
               AND ROWNUM = 1;

            FND_GLOBAL.apps_initialize (user_id      => l_user_id,
                                        resp_id      => l_resp_id,
                                        resp_appl_id => l_appl_id);
        END IF;

        -- Set MOAC policy context to the requested operating unit so that
        -- queries against AP _ALL tables return only rows for this OU.
        MO_GLOBAL.set_policy_context (p_access_mode => 'S',
                                      p_org_id      => p_org_id);

        write_log ('Context initialized for ORG_ID = ' || p_org_id);
    EXCEPTION
        WHEN OTHERS THEN
            write_log ('init_context error: ' || SQLERRM);
            RAISE;
    END init_context;

    --------------------------------------------------------------------------
    -- FORMAT_DH_RECORD
    --------------------------------------------------------------------------
    FUNCTION format_dh_record (p_invoice_num     IN VARCHAR2,
                               p_supplier_name   IN VARCHAR2,
                               p_payment_amount  IN NUMBER,
                               p_payment_date    IN DATE,
                               p_currency        IN VARCHAR2,
                               p_org_id          IN NUMBER) RETURN VARCHAR2 IS
    BEGIN
        RETURN g_dh_marker
            || g_delimiter || clean_value (p_invoice_num)
            || g_delimiter || clean_value (p_supplier_name)
            || g_delimiter || TO_CHAR (NVL (p_payment_amount, 0), 'FM999999999990.00')
            || g_delimiter || TO_CHAR (p_payment_date, g_date_fmt_data)
            || g_delimiter || clean_value (p_currency)
            || g_delimiter || TO_CHAR (p_org_id);
    END format_dh_record;

    --------------------------------------------------------------------------
    -- FORMAT_DL_RECORD
    --------------------------------------------------------------------------
    FUNCTION format_dl_record (p_line_no       IN NUMBER,
                               p_expense_type  IN VARCHAR2,
                               p_description   IN VARCHAR2,
                               p_amount        IN NUMBER,
                               p_ccid          IN NUMBER) RETURN VARCHAR2 IS
    BEGIN
        RETURN g_dl_marker
            || g_delimiter || TO_CHAR (p_line_no)
            || g_delimiter || clean_value (p_expense_type)
            || g_delimiter || clean_value (p_description)
            || g_delimiter || TO_CHAR (NVL (p_amount, 0), 'FM999999999990.00')
            || g_delimiter || TO_CHAR (p_ccid);
    END format_dl_record;

    --------------------------------------------------------------------------
    -- LOG_OUTPUT
    --------------------------------------------------------------------------
    PROCEDURE log_output (p_success_count IN NUMBER,
                          p_error_count   IN NUMBER,
                          p_file_name     IN VARCHAR2) IS
    BEGIN
        write_log ('===========================================================');
        write_log ('  XX_AP_EXPENSE_OUTBOUND_PKG - Run Summary                 ');
        write_log ('===========================================================');
        write_log ('  File generated         : ' || p_file_name);
        write_log ('  Successful records     : ' || p_success_count);
        write_log ('  Errored  records       : ' || p_error_count);
        write_log ('  Total processed        : ' || (p_success_count + p_error_count));
        write_log ('  Run completed at       : ' || TO_CHAR (SYSDATE, 'DD-MON-YYYY HH24:MI:SS'));
        write_log ('===========================================================');
    END log_output;

    --------------------------------------------------------------------------
    -- GENERATE_FILE  (private)
    --   Drives the cursor over eligible invoices, opens the file once, writes
    --   one DH per invoice followed by N DL lines, and closes the file.
    --------------------------------------------------------------------------
    PROCEDURE generate_file (p_org_id        IN  NUMBER,
                             p_from_date     IN  DATE,
                             p_to_date       IN  DATE,
                             x_file_name     OUT NOCOPY VARCHAR2,
                             x_success_count OUT NOCOPY NUMBER,
                             x_error_count   OUT NOCOPY NUMBER) IS

        ----------------------------------------------------------------------
        -- Header cursor : one row per successfully paid invoice/payment
        --   - Joins AP_INVOICES_ALL -> AP_INVOICE_PAYMENTS_ALL -> AP_CHECKS_ALL
        --   - Restricts to expense-type invoices that are fully paid
        --   - Restricts payment status to CLEARED or NEGOTIABLE
        --   - Incremental filter on payment last_update_date
        ----------------------------------------------------------------------
        CURSOR c_header IS
            SELECT  ai.invoice_id,
                    ai.invoice_num,
                    ai.invoice_currency_code            currency_code,
                    ai.org_id,
                    aps.vendor_name                     supplier_name,
                    ac.check_id,
                    ac.check_number,
                    ac.amount                           payment_amount,
                    ac.check_date                       payment_date,
                    ac.status_lookup_code               payment_status
              FROM  ap_invoices_all          ai,
                    ap_invoice_payments_all  aip,
                    ap_checks_all            ac,
                    ap_suppliers             aps,
                    ap_supplier_sites_all    apss
             WHERE  ai.invoice_id            = aip.invoice_id
               AND  aip.check_id             = ac.check_id
               AND  ai.vendor_id             = aps.vendor_id
               AND  ai.vendor_site_id        = apss.vendor_site_id
               AND  ai.org_id                = p_org_id
               AND  ai.invoice_type_lookup_code IN ('EXPENSE REPORT','STANDARD')
               AND  NVL (ai.payment_status_flag,'N') = 'Y'
               AND  ac.status_lookup_code    IN ('CLEARED','NEGOTIABLE')
               AND  aip.last_update_date    >= p_from_date
               AND  aip.last_update_date    <  p_to_date
             ORDER BY ai.invoice_id;

        ----------------------------------------------------------------------
        -- Distribution cursor : one row per expense distribution for the
        -- current invoice. We stream this with a FOR loop per parent row.
        ----------------------------------------------------------------------
        CURSOR c_lines (cp_invoice_id NUMBER) IS
            SELECT  aid.distribution_line_number,
                    aid.line_type_lookup_code     expense_type,
                    aid.description,
                    aid.amount,
                    aid.dist_code_combination_id  ccid
              FROM  ap_invoice_distributions_all aid
             WHERE  aid.invoice_id = cp_invoice_id
               AND  NVL (aid.reversal_flag,'N') <> 'Y'
             ORDER BY aid.distribution_line_number;

        l_file_name      VARCHAR2(200);
        l_dh_string      VARCHAR2(4000);
        l_dl_string      VARCHAR2(4000);
        l_line_no        PLS_INTEGER;
        l_success        PLS_INTEGER := 0;
        l_errors         PLS_INTEGER := 0;

    BEGIN
        --------------------------------------------------------------------
        -- Build the timestamped file name and open the file for write
        --------------------------------------------------------------------
        l_file_name := g_file_prefix
                    || TO_CHAR (SYSDATE, g_date_fmt_file)
                    || g_file_extension;

        write_log ('Opening file ' || l_file_name || ' in directory ' || g_directory_name);

        g_file_handle := UTL_FILE.fopen (location     => g_directory_name,
                                         filename     => l_file_name,
                                         open_mode    => 'W',
                                         max_linesize => 32767);

        --------------------------------------------------------------------
        -- Iterate eligible invoices/payments
        --------------------------------------------------------------------
        FOR r_hdr IN c_header LOOP
            BEGIN
                -- Build & write the DH record
                l_dh_string := format_dh_record (
                                  p_invoice_num    => r_hdr.invoice_num,
                                  p_supplier_name  => r_hdr.supplier_name,
                                  p_payment_amount => r_hdr.payment_amount,
                                  p_payment_date   => r_hdr.payment_date,
                                  p_currency       => r_hdr.currency_code,
                                  p_org_id         => r_hdr.org_id);

                UTL_FILE.put_line (g_file_handle, l_dh_string);

                -- Build & write each DL record with sequential line number
                l_line_no := 0;
                FOR r_dist IN c_lines (r_hdr.invoice_id) LOOP
                    l_line_no := l_line_no + 1;
                    l_dl_string := format_dl_record (
                                      p_line_no      => l_line_no,
                                      p_expense_type => r_dist.expense_type,
                                      p_description  => r_dist.description,
                                      p_amount       => r_dist.amount,
                                      p_ccid         => r_dist.ccid);

                    UTL_FILE.put_line (g_file_handle, l_dl_string);
                END LOOP;

                l_success := l_success + 1;

            EXCEPTION
                WHEN OTHERS THEN
                    -- Per-invoice failure: log and keep going
                    l_errors := l_errors + 1;
                    write_log ('ERROR processing invoice_id ' || r_hdr.invoice_id
                              || ' (' || r_hdr.invoice_num || '): ' || SQLERRM);
            END;
        END LOOP;

        --------------------------------------------------------------------
        -- Always flush & close the file
        --------------------------------------------------------------------
        UTL_FILE.fflush (g_file_handle);
        UTL_FILE.fclose (g_file_handle);

        x_file_name     := l_file_name;
        x_success_count := l_success;
        x_error_count   := l_errors;

    EXCEPTION
        WHEN UTL_FILE.invalid_path THEN
            IF UTL_FILE.is_open (g_file_handle) THEN
                UTL_FILE.fclose (g_file_handle);
            END IF;
            write_log ('UTL_FILE.invalid_path - check directory ' || g_directory_name);
            RAISE;
        WHEN UTL_FILE.invalid_operation THEN
            IF UTL_FILE.is_open (g_file_handle) THEN
                UTL_FILE.fclose (g_file_handle);
            END IF;
            write_log ('UTL_FILE.invalid_operation - check file privileges');
            RAISE;
        WHEN OTHERS THEN
            IF UTL_FILE.is_open (g_file_handle) THEN
                UTL_FILE.fclose (g_file_handle);
            END IF;
            write_log ('generate_file fatal error: ' || SQLERRM);
            RAISE;
    END generate_file;

    --------------------------------------------------------------------------
    -- MAIN_PROCESS
    --------------------------------------------------------------------------
    PROCEDURE main_process (x_errbuf       OUT NOCOPY VARCHAR2,
                            x_retcode      OUT NOCOPY VARCHAR2,
                            p_org_id       IN  NUMBER,
                            p_from_date    IN  VARCHAR2 DEFAULT NULL,
                            p_to_date      IN  VARCHAR2 DEFAULT NULL,
                            p_debug_flag   IN  VARCHAR2 DEFAULT 'N') IS

        l_from_date     DATE;
        l_to_date       DATE;
        l_file_name     VARCHAR2(200);
        l_success_cnt   NUMBER := 0;
        l_error_cnt     NUMBER := 0;
    BEGIN
        g_debug_flag := NVL (p_debug_flag, 'N');
        g_request_id := FND_GLOBAL.conc_request_id;

        write_log ('XX_AP_EXPENSE_OUTBOUND_PKG.main_process started.');
        write_log ('  ORG_ID      = ' || p_org_id);
        write_log ('  Request ID  = ' || g_request_id);

        ----------------------------------------------------------------------
        -- 1) Initialize context
        ----------------------------------------------------------------------
        init_context (p_org_id => p_org_id);

        ----------------------------------------------------------------------
        -- 2) Resolve incremental window
        --    - If caller did not supply p_from_date, use last successful run.
        --    - p_to_date defaults to SYSDATE.
        ----------------------------------------------------------------------
        IF p_from_date IS NULL THEN
            l_from_date := get_last_run_date (p_org_id);
        ELSE
            l_from_date := TO_DATE (p_from_date, 'YYYY/MM/DD HH24:MI:SS');
        END IF;

        IF p_to_date IS NULL THEN
            l_to_date := SYSDATE;
        ELSE
            l_to_date := TO_DATE (p_to_date, 'YYYY/MM/DD HH24:MI:SS');
        END IF;

        write_log ('  From Date   = ' || TO_CHAR (l_from_date, 'DD-MON-YYYY HH24:MI:SS'));
        write_log ('  To Date     = ' || TO_CHAR (l_to_date,   'DD-MON-YYYY HH24:MI:SS'));

        IF l_from_date >= l_to_date THEN
            x_retcode := '1';
            x_errbuf  := 'No window to process: from_date >= to_date';
            write_log (x_errbuf);
            RETURN;
        END IF;

        ----------------------------------------------------------------------
        -- 3) Generate the file
        ----------------------------------------------------------------------
        generate_file (p_org_id        => p_org_id,
                       p_from_date     => l_from_date,
                       p_to_date       => l_to_date,
                       x_file_name     => l_file_name,
                       x_success_count => l_success_cnt,
                       x_error_count   => l_error_cnt);

        ----------------------------------------------------------------------
        -- 4) Persist run control & emit summary
        ----------------------------------------------------------------------
        stamp_run_control (p_org_id        => p_org_id,
                           p_from_date     => l_from_date,
                           p_to_date       => l_to_date,
                           p_status        => CASE
                                                WHEN l_error_cnt = 0 THEN 'SUCCESS'
                                                WHEN l_success_cnt > 0 THEN 'WARNING'
                                                ELSE 'ERROR'
                                              END,
                           p_file_name     => l_file_name,
                           p_success_count => l_success_cnt,
                           p_error_count   => l_error_cnt);

        log_output (p_success_count => l_success_cnt,
                    p_error_count   => l_error_cnt,
                    p_file_name     => l_file_name);

        ----------------------------------------------------------------------
        -- 5) Return concurrent program retcode
        ----------------------------------------------------------------------
        IF l_error_cnt = 0 THEN
            x_retcode := '0';
            x_errbuf  := 'Completed Successfully';
        ELSIF l_success_cnt > 0 THEN
            x_retcode := '1';
            x_errbuf  := 'Completed with warnings - see log for failed invoices';
        ELSE
            x_retcode := '2';
            x_errbuf  := 'Completed with errors - no invoices written';
        END IF;

    EXCEPTION
        WHEN OTHERS THEN
            x_retcode := '2';
            x_errbuf  := 'Unhandled exception: ' || SQLERRM;
            write_log (x_errbuf);
            write_log (DBMS_UTILITY.format_error_backtrace);
            -- best-effort run-control stamp on hard failure
            stamp_run_control (p_org_id        => p_org_id,
                               p_from_date     => l_from_date,
                               p_to_date       => l_to_date,
                               p_status        => 'ERROR',
                               p_file_name     => l_file_name,
                               p_success_count => l_success_cnt,
                               p_error_count   => l_error_cnt);
    END main_process;

END XX_AP_EXPENSE_OUTBOUND_PKG;
/
