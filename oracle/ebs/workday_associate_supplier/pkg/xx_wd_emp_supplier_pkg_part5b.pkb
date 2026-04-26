-- ============================================================================
-- PART 5b OF 5 - START
-- File   : xx_wd_emp_supplier_pkg_part5b.pkb
-- Content: submit_ap_open_interface_import + write_summary_report.
-- Concat : Append immediately after PART 5a.
-- ============================================================================

    -- =========================================================================
    -- submit_ap_open_interface_import
    --   Submits the standard "Payables Open Interface Import" concurrent
    --   program (SQLAP / APXIIMPT) for the rows we just inserted, scoped by
    --   our run-specific GROUP_ID. Caller has already set the OU policy
    --   context via MO_GLOBAL.
    --
    --   Standard parameter order for APXIIMPT in 12.2.x:
    --     1=Operating Unit, 2=Source, 3=Group, 4=Batch, 5=Hold name,
    --     6=Hold reason, 7=GL Date, 8=Purge, 9=Trace, 10=Debug,
    --     11=Summarize Report, 12=Commit Batch Size.
    -- =========================================================================
    PROCEDURE submit_ap_open_interface_import
    (
        p_org_id     IN  NUMBER,
        p_source     IN  VARCHAR2,
        p_group_id   IN  VARCHAR2,
        x_request_id OUT NOCOPY NUMBER
    )
    IS
    BEGIN
        MO_GLOBAL.set_policy_context('S', p_org_id);
        FND_REQUEST.set_org_id(p_org_id);

        x_request_id := FND_REQUEST.submit_request
        (
            application => 'SQLAP',
            program     => 'APXIIMPT',
            description => 'Workday Expense Reports Import (group='||p_group_id||')',
            start_time  => NULL,
            sub_request => FALSE,
            argument1   => p_org_id,            -- Operating Unit
            argument2   => p_source,            -- Source
            argument3   => p_group_id,          -- Group
            argument4   => NULL,                -- Batch Name
            argument5   => NULL,                -- Hold Name
            argument6   => NULL,                -- Hold Reason
            argument7   => NULL,                -- GL Date
            argument8   => 'N',                 -- Purge
            argument9   => 'N',                 -- Trace
            argument10  => CASE WHEN g_debug THEN 'Y' ELSE 'N' END,  -- Debug
            argument11  => 'N',                 -- Summarize Report
            argument12  => 1000                 -- Commit Batch Size
        );

        IF NVL(x_request_id,0) = 0 THEN
            log_message(G_LVL_ERROR,'submit_ap_open_interface_import',
                'FND_REQUEST.submit_request returned 0: '||FND_MESSAGE.get);
            RAISE EX_API_FAILED;
        ELSE
            log_message(G_LVL_INFO,'submit_ap_open_interface_import',
                'Submitted APXIIMPT request_id='||x_request_id||
                ' org_id='||p_org_id||' source='||p_source||' group='||p_group_id);
            UPDATE XX_WD_RUN_SUMMARY
               SET AP_IMPORT_REQUEST_ID = x_request_id
             WHERE SUMMARY_ID = g_summary_id;
            COMMIT;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            log_message(G_LVL_ERROR,'submit_ap_open_interface_import',
                'Failed to submit APXIIMPT: '||SQLERRM, NULL, NULL, SQLERRM);
            RAISE EX_API_FAILED;
    END submit_ap_open_interface_import;

    -- =========================================================================
    -- write_summary_report
    --   Emits the formatted end-of-run report to the concurrent OUTPUT file
    --   (visible in OAM "View Output"). Reads from XX_WD_RUN_SUMMARY plus
    --   per-row staging tables for the success/failure breakdown.
    -- =========================================================================
    PROCEDURE write_summary_report
    IS
        l_line VARCHAR2(200);
        l_sep  VARCHAR2(120) := RPAD('-',110,'-');
    BEGIN
        FND_FILE.put_line(FND_FILE.OUTPUT, l_sep);
        FND_FILE.put_line(FND_FILE.OUTPUT,
            '              WORKDAY -> EBS  ASSOCIATE / SUPPLIER / EXPENSE REPORT  INTEGRATION SUMMARY');
        FND_FILE.put_line(FND_FILE.OUTPUT, l_sep);
        FND_FILE.put_line(FND_FILE.OUTPUT,
            'Request ID         : '||g_request_id);
        FND_FILE.put_line(FND_FILE.OUTPUT,
            'Batch ID           : '||NVL(g_batch_id,'<ALL_NEW>'));
        FND_FILE.put_line(FND_FILE.OUTPUT,
            'Run Mode           : '||g_run_mode);
        FND_FILE.put_line(FND_FILE.OUTPUT,
            'Group ID           : '||g_group_id);
        FND_FILE.put_line(FND_FILE.OUTPUT,
            'Run Time           : '||TO_CHAR(SYSTIMESTAMP,'YYYY-MM-DD HH24:MI:SS'));
        FND_FILE.put_line(FND_FILE.OUTPUT, l_sep);

        FND_FILE.put_line(FND_FILE.OUTPUT, 'EMPLOYEE / ASSOCIATE');
        FND_FILE.put_line(FND_FILE.OUTPUT,
            '  Total in scope   : '||g_emp_total);
        FND_FILE.put_line(FND_FILE.OUTPUT,
            '  Already existed  : '||g_emp_existing);
        FND_FILE.put_line(FND_FILE.OUTPUT,
            '  Newly created    : '||g_emp_created);
        FND_FILE.put_line(FND_FILE.OUTPUT,
            '  Failed           : '||g_emp_failed);

        FND_FILE.put_line(FND_FILE.OUTPUT, 'EMPLOYEE-SUPPLIER');
        FND_FILE.put_line(FND_FILE.OUTPUT,
            '  Newly created    : '||g_sup_created);
        FND_FILE.put_line(FND_FILE.OUTPUT,
            '  Failed           : '||g_sup_failed);

        FND_FILE.put_line(FND_FILE.OUTPUT, 'EXPENSE REPORTS');
        FND_FILE.put_line(FND_FILE.OUTPUT,
            '  Total in scope   : '||g_exp_total);
        FND_FILE.put_line(FND_FILE.OUTPUT,
            '  Loaded to AP IF  : '||g_exp_loaded);
        FND_FILE.put_line(FND_FILE.OUTPUT,
            '  Validation errs  : '||g_exp_val_err);
        FND_FILE.put_line(FND_FILE.OUTPUT,
            '  API errs         : '||g_exp_failed);

        FND_FILE.put_line(FND_FILE.OUTPUT, l_sep);
        FND_FILE.put_line(FND_FILE.OUTPUT, 'FAILED RECORDS DETAIL');
        FND_FILE.put_line(FND_FILE.OUTPUT, l_sep);

        -- Failed employees
        FOR f IN
        (
            SELECT EMPLOYEE_NUMBER, PROCESS_STATUS, ERROR_MESSAGE
              FROM XX_WD_EMPLOYEE_STG
             WHERE REQUEST_ID = g_request_id
               AND PROCESS_STATUS IN (G_ST_VAL_ERR, G_ST_API_ERR)
             ORDER BY EMPLOYEE_NUMBER
        )
        LOOP
            FND_FILE.put_line(FND_FILE.OUTPUT,
                'EMPLOYEE  '||RPAD(f.EMPLOYEE_NUMBER,15)||
                RPAD(f.PROCESS_STATUS,20)||SUBSTR(f.ERROR_MESSAGE,1,180));
        END LOOP;

        -- Failed expense reports
        FOR f IN
        (
            SELECT WD_EXPENSE_REPORT_ID, EMPLOYEE_NUMBER, PROCESS_STATUS, ERROR_MESSAGE
              FROM XX_WD_EXP_HDR_STG
             WHERE REQUEST_ID = g_request_id
               AND PROCESS_STATUS IN (G_ST_VAL_ERR, G_ST_API_ERR, G_ST_REJECTED)
             ORDER BY WD_EXPENSE_REPORT_ID
        )
        LOOP
            FND_FILE.put_line(FND_FILE.OUTPUT,
                'EXP_REP   '||RPAD(f.WD_EXPENSE_REPORT_ID,18)||
                RPAD(f.EMPLOYEE_NUMBER,12)||
                RPAD(f.PROCESS_STATUS,20)||SUBSTR(f.ERROR_MESSAGE,1,160));
        END LOOP;

        FND_FILE.put_line(FND_FILE.OUTPUT, l_sep);
        SELECT 'AP Import Request : '||NVL(TO_CHAR(AP_IMPORT_REQUEST_ID),'(not submitted)')
          INTO l_line
          FROM XX_WD_RUN_SUMMARY WHERE SUMMARY_ID = g_summary_id;
        FND_FILE.put_line(FND_FILE.OUTPUT, l_line);
        FND_FILE.put_line(FND_FILE.OUTPUT, l_sep);
    EXCEPTION
        WHEN OTHERS THEN
            log_message(G_LVL_WARN,'write_summary_report',
                'Failed to write summary: '||SQLERRM);
    END write_summary_report;

-- ============================================================================
-- PART 5b OF 5 - END
-- (still inside PACKAGE BODY - part 5c contains MAIN + END)
-- ============================================================================
