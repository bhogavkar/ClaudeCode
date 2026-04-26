-- ============================================================================
-- PART 5a OF 5 - START
-- File   : xx_wd_emp_supplier_pkg_part5a.pkb
-- Content: process_one_expense_report (header + lines -> AP interface tables).
-- Concat : Append immediately after PART 4. Parts 5b and 5c follow this.
-- ============================================================================

    -- =========================================================================
    -- process_one_expense_report
    --   For one validated XX_WD_EXP_HDR_STG row:
    --     1. Resolves the EBS vendor_id / vendor_site_id for the employee.
    --     2. Inserts one AP_INVOICES_INTERFACE row
    --        (invoice_type_lookup_code = 'EXPENSE REPORT').
    --     3. Inserts one AP_INVOICE_LINES_INTERFACE row per stg line.
    --   Status transitions on the staging row drive the run summary counters.
    -- =========================================================================
    PROCEDURE process_one_expense_report(p_stg_hdr_id IN NUMBER)
    IS
        h               XX_WD_EXP_HDR_STG%ROWTYPE;
        l_org_id        NUMBER;
        l_person_id     NUMBER;
        l_vendor_id     NUMBER;
        l_site_id       NUMBER;
        l_iface_inv_id  NUMBER;
        l_terms_id      NUMBER;
        l_lines_inserted NUMBER := 0;
        l_lines_failed   NUMBER := 0;
    BEGIN
        SAVEPOINT before_expense;

        SELECT * INTO h FROM XX_WD_EXP_HDR_STG WHERE STG_HDR_ID = p_stg_hdr_id FOR UPDATE;

        UPDATE XX_WD_EXP_HDR_STG
           SET PROCESS_STATUS = G_ST_PROCESSING, REQUEST_ID = g_request_id
         WHERE STG_HDR_ID = p_stg_hdr_id;

        -- Resolve OU
        SELECT organization_id INTO l_org_id
          FROM hr_operating_units WHERE name = h.OPERATING_UNIT_NAME;

        -- Resolve employee + employee-supplier
        l_person_id := get_existing_person_id(
                           h.EMPLOYEE_NUMBER,
                           resolve_business_group_id(h.BUSINESS_GROUP_NAME));
        IF l_person_id IS NULL THEN
            RAISE_APPLICATION_ERROR(-20002,
                'Employee '||h.EMPLOYEE_NUMBER||' not present in EBS HRMS');
        END IF;

        l_vendor_id := get_existing_vendor_id(l_person_id);
        IF l_vendor_id IS NULL THEN
            RAISE_APPLICATION_ERROR(-20002,
                'Employee-supplier missing for person_id='||l_person_id);
        END IF;

        SELECT MAX(vendor_site_id) INTO l_site_id
          FROM ap_supplier_sites_all
         WHERE vendor_id = l_vendor_id
           AND org_id    = l_org_id
           AND NVL(pay_site_flag,'N') = 'Y'
           AND NVL(inactive_date, SYSDATE+1) > SYSDATE;
        IF l_site_id IS NULL THEN
            RAISE_APPLICATION_ERROR(-20002,
                'No active pay site for vendor_id='||l_vendor_id||' org_id='||l_org_id);
        END IF;

        -- Resolve payment terms (best-effort)
        BEGIN
            SELECT term_id INTO l_terms_id
              FROM ap_terms
             WHERE name = NVL(h.PAYMENT_TERMS,'IMMEDIATE')
               AND NVL(enabled_flag,'Y') = 'Y'
               AND ROWNUM = 1;
        EXCEPTION WHEN NO_DATA_FOUND THEN l_terms_id := NULL;
        END;

        -- ---------------------------------------------- header interface row --
        SELECT ap_invoices_interface_s.NEXTVAL INTO l_iface_inv_id FROM dual;

        INSERT INTO AP_INVOICES_INTERFACE
        (
            INVOICE_ID, INVOICE_NUM, INVOICE_TYPE_LOOKUP_CODE,
            VENDOR_ID, VENDOR_SITE_ID,
            INVOICE_DATE, GL_DATE,
            INVOICE_AMOUNT, INVOICE_CURRENCY_CODE,
            EXCHANGE_RATE_TYPE, EXCHANGE_RATE, EXCHANGE_DATE,
            DESCRIPTION, SOURCE, GROUP_ID, ORG_ID,
            TERMS_ID, PAY_GROUP_LOOKUP_CODE, PAYMENT_METHOD_CODE,
            ATTRIBUTE_CATEGORY, ATTRIBUTE1, ATTRIBUTE2,
            STATUS,
            CREATED_BY, CREATION_DATE,
            LAST_UPDATED_BY, LAST_UPDATE_DATE, LAST_UPDATE_LOGIN
        )
        VALUES
        (
            l_iface_inv_id,
            NVL(h.INVOICE_NUM, h.WD_EXPENSE_REPORT_ID),
            'EXPENSE REPORT',
            l_vendor_id, l_site_id,
            h.REPORT_DATE, NVL(h.GL_DATE, h.REPORT_DATE),
            h.REPORT_TOTAL_AMOUNT, h.CURRENCY_CODE,
            h.EXCHANGE_RATE_TYPE, h.EXCHANGE_RATE, h.EXCHANGE_DATE,
            SUBSTR(NVL(h.REPORT_DESCRIPTION, h.PURPOSE),1,240),
            NVL(h.SOURCE,'WORKDAY_EXPENSES'), g_group_id, l_org_id,
            l_terms_id, NVL(h.PAY_GROUP_LOOKUP_CODE,'EMPLOYEE'),
            NVL(h.PAYMENT_METHOD_CODE,'CHECK'),
            'WORKDAY', h.WD_EXPENSE_REPORT_ID, h.BATCH_ID,
            NULL,
            g_user_id, SYSDATE, g_user_id, SYSDATE, g_login_id
        );

        -- ---------------------------------------------- line interface rows --
        FOR ln IN
        (
            SELECT * FROM XX_WD_EXP_LINE_STG
             WHERE STG_HDR_ID = p_stg_hdr_id
             ORDER BY LINE_NUMBER
        )
        LOOP
            BEGIN
                INSERT INTO AP_INVOICE_LINES_INTERFACE
                (
                    INVOICE_ID, INVOICE_LINE_ID, LINE_NUMBER,
                    LINE_TYPE_LOOKUP_CODE, AMOUNT, ACCOUNTING_DATE,
                    DESCRIPTION,
                    DIST_CODE_CONCATENATED, DIST_CODE_COMBINATION_ID,
                    PROJECT_ID_FLAG,
                    PA_EXPENDITURE_ITEM_DATE,
                    EXPENDITURE_TYPE,
                    ORG_ID,
                    ATTRIBUTE_CATEGORY, ATTRIBUTE1, ATTRIBUTE2,
                    CREATED_BY, CREATION_DATE,
                    LAST_UPDATED_BY, LAST_UPDATE_DATE, LAST_UPDATE_LOGIN
                )
                VALUES
                (
                    l_iface_inv_id, ap_invoice_lines_interface_s.NEXTVAL, ln.LINE_NUMBER,
                    'ITEM', ln.LINE_AMOUNT, NVL(ln.EXPENSE_DATE, h.REPORT_DATE),
                    SUBSTR(NVL(ln.LINE_DESCRIPTION, ln.EXPENSE_TYPE),1,240),
                    ln.DIST_CODE_COMBINATION, ln.DIST_CCID,
                    CASE WHEN ln.PROJECT_NUMBER IS NOT NULL THEN 'Y' ELSE 'N' END,
                    ln.EXPENSE_DATE,
                    ln.EXPENDITURE_TYPE,
                    l_org_id,
                    'WORKDAY', ln.WD_LINE_ID, ln.EXPENSE_TYPE,
                    g_user_id, SYSDATE, g_user_id, SYSDATE, g_login_id
                );

                UPDATE XX_WD_EXP_LINE_STG
                   SET PROCESS_STATUS = G_ST_SUCCESS,
                       INVOICE_LINE_INTERFACE_ID =
                           (SELECT MAX(invoice_line_id)
                              FROM ap_invoice_lines_interface
                             WHERE invoice_id = l_iface_inv_id
                               AND line_number = ln.LINE_NUMBER),
                       LAST_UPDATE_DATE = SYSDATE
                 WHERE STG_LINE_ID = ln.STG_LINE_ID;

                l_lines_inserted := l_lines_inserted + 1;
            EXCEPTION
                WHEN OTHERS THEN
                    l_lines_failed := l_lines_failed + 1;
                    UPDATE XX_WD_EXP_LINE_STG
                       SET PROCESS_STATUS = G_ST_API_ERR,
                           ERROR_MESSAGE  = SUBSTR(SQLERRM,1,4000)
                     WHERE STG_LINE_ID = ln.STG_LINE_ID;
                    log_message(G_LVL_ERROR,'process_one_expense_report',
                        'Line insert failed line='||ln.LINE_NUMBER||' '||SQLERRM,
                        'EXPENSE_LINE', h.WD_EXPENSE_REPORT_ID||':'||ln.LINE_NUMBER);
            END;
        END LOOP;

        IF l_lines_failed > 0 THEN
            ROLLBACK TO before_expense;
            UPDATE XX_WD_EXP_HDR_STG
               SET PROCESS_STATUS = G_ST_API_ERR,
                   ERROR_MESSAGE  = SUBSTR('Aborted: '||l_lines_failed||
                                           ' line(s) failed to insert',1,4000),
                   LAST_UPDATE_DATE = SYSDATE
             WHERE STG_HDR_ID = p_stg_hdr_id;
            g_exp_failed := g_exp_failed + 1;
            log_message(G_LVL_ERROR,'process_one_expense_report',
                'Expense report rolled back due to line failures',
                'EXPENSE', h.WD_EXPENSE_REPORT_ID);
        ELSE
            UPDATE XX_WD_EXP_HDR_STG
               SET PROCESS_STATUS       = G_ST_SUCCESS,
                   INVOICE_INTERFACE_ID = l_iface_inv_id,
                   PROCESSED_DATE       = SYSDATE,
                   ERROR_MESSAGE        = NULL,
                   LAST_UPDATE_DATE     = SYSDATE
             WHERE STG_HDR_ID = p_stg_hdr_id;
            g_exp_loaded := g_exp_loaded + 1;
            log_message(G_LVL_INFO,'process_one_expense_report',
                'Loaded into AP_INVOICES_INTERFACE invoice_id='||l_iface_inv_id||
                ' lines='||l_lines_inserted,
                'EXPENSE', h.WD_EXPENSE_REPORT_ID);
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK TO before_expense;
            UPDATE XX_WD_EXP_HDR_STG
               SET PROCESS_STATUS = G_ST_API_ERR,
                   ERROR_MESSAGE  = SUBSTR(SQLERRM,1,4000),
                   LAST_UPDATE_DATE = SYSDATE
             WHERE STG_HDR_ID = p_stg_hdr_id;
            UPDATE XX_WD_EXP_LINE_STG
               SET PROCESS_STATUS = G_ST_API_ERR,
                   ERROR_MESSAGE  = SUBSTR('Header failed: '||SQLERRM,1,4000)
             WHERE STG_HDR_ID = p_stg_hdr_id;
            g_exp_failed := g_exp_failed + 1;
            log_message(G_LVL_ERROR,'process_one_expense_report',
                'Failed: '||SQLERRM,
                'EXPENSE',
                NVL((SELECT WD_EXPENSE_REPORT_ID FROM XX_WD_EXP_HDR_STG
                      WHERE STG_HDR_ID = p_stg_hdr_id),
                    TO_CHAR(p_stg_hdr_id)),
                SQLERRM);
    END process_one_expense_report;

-- ============================================================================
-- PART 5a OF 5 - END
-- (still inside PACKAGE BODY - parts 5b and 5c to follow)
-- ============================================================================
