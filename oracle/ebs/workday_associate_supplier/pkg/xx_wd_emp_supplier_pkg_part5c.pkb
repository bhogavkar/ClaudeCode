-- ============================================================================
-- PART 5c OF 5 - START (FINAL part of package body)
-- File   : xx_wd_emp_supplier_pkg_part5c.pkb
-- Content: MAIN orchestrator + END package body.
-- Concat : Append immediately after PART 5b. THIS PART CLOSES THE PACKAGE.
-- ============================================================================

    -- =========================================================================
    -- ensure_employee_and_supplier
    --   Helper used by MAIN. For one validated XX_WD_EMPLOYEE_STG row:
    --     - if person already exists, increment EMP_EXISTING and return its IDs
    --     - else create person + supplier + site + verify external payee
    --   Owns its own savepoint so a single bad row doesn't poison the batch.
    -- =========================================================================
    PROCEDURE ensure_employee_and_supplier
    (
        p_stg_id      IN  NUMBER,
        x_person_id   OUT NOCOPY NUMBER,
        x_vendor_id   OUT NOCOPY NUMBER,
        x_party_id    OUT NOCOPY NUMBER,
        x_site_id     OUT NOCOPY NUMBER
    )
    IS
        r            XX_WD_EMPLOYEE_STG%ROWTYPE;
        l_bg_id      NUMBER;
        l_org_id     NUMBER;
        l_asg_id     NUMBER;
        l_payee_id   NUMBER;
        l_msg        VARCHAR2(4000);
    BEGIN
        SAVEPOINT before_employee;
        SELECT * INTO r FROM XX_WD_EMPLOYEE_STG WHERE STG_ID = p_stg_id;

        l_bg_id := resolve_business_group_id(r.BUSINESS_GROUP_NAME);
        IF l_bg_id IS NULL THEN
            RAISE_APPLICATION_ERROR(-20003,
                'Cannot resolve business group: '||r.BUSINESS_GROUP_NAME);
        END IF;

        -- Pick a default OU based on BG (US/CA). Adjust names to your install.
        BEGIN
            SELECT organization_id INTO l_org_id
              FROM hr_operating_units
             WHERE name = CASE UPPER(r.BUSINESS_GROUP_NAME)
                              WHEN 'US' THEN 'US Operations'
                              WHEN 'CA' THEN 'CA Operations'
                          END;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                RAISE_APPLICATION_ERROR(-20003,
                    'Default OU lookup failed for BG '||r.BUSINESS_GROUP_NAME);
        END;

        x_person_id := get_existing_person_id(r.EMPLOYEE_NUMBER, l_bg_id);

        IF x_person_id IS NOT NULL THEN
            -- Employee already in EBS - per requirement: do NOT re-create or
            -- update; just locate the matching supplier so expense reports
            -- can be loaded against it.
            g_emp_existing := g_emp_existing + 1;
            x_vendor_id := get_existing_vendor_id(x_person_id);

            IF x_vendor_id IS NULL THEN
                -- Edge case: HR person exists but no employee-supplier yet.
                -- Create just the supplier + site (HR step skipped).
                create_employee_supplier(p_stg_id, x_person_id, x_vendor_id, x_party_id, l_msg);
                create_supplier_site   (p_stg_id, x_vendor_id, l_org_id,
                                        r.BUSINESS_GROUP_NAME,
                                        x_site_id, x_party_id, l_msg);
                ensure_external_payee  (x_party_id, x_vendor_id, x_site_id, l_org_id,
                                        r.PAYMENT_METHOD, l_payee_id, l_msg);
                g_sup_created := g_sup_created + 1;
            ELSE
                SELECT MAX(vendor_site_id) INTO x_site_id
                  FROM ap_supplier_sites_all
                 WHERE vendor_id = x_vendor_id
                   AND org_id    = l_org_id
                   AND NVL(pay_site_flag,'N') = 'Y'
                   AND NVL(inactive_date, SYSDATE+1) > SYSDATE;
                SELECT party_id INTO x_party_id
                  FROM ap_suppliers WHERE vendor_id = x_vendor_id;
            END IF;

            UPDATE XX_WD_EMPLOYEE_STG
               SET PROCESS_STATUS    = G_ST_SUCCESS,
                   EBS_PERSON_ID     = x_person_id,
                   EBS_VENDOR_ID     = x_vendor_id,
                   EBS_VENDOR_SITE_ID = x_site_id,
                   EBS_PARTY_ID      = x_party_id,
                   ERROR_MESSAGE     = NULL,
                   PROCESSED_DATE    = SYSDATE,
                   LAST_UPDATE_DATE  = SYSDATE
             WHERE STG_ID = p_stg_id;

            log_message(G_LVL_INFO,'ensure_employee_and_supplier',
                'Existing employee re-used person_id='||x_person_id||
                ' vendor_id='||x_vendor_id,
                'EMPLOYEE', r.EMPLOYEE_NUMBER);
            RETURN;
        END IF;

        -- ---------------- Create flow ----------------
        create_employee_in_hrms(p_stg_id, l_bg_id,
                                x_person_id, l_asg_id, l_msg);
        g_emp_created := g_emp_created + 1;

        create_employee_supplier(p_stg_id, x_person_id,
                                 x_vendor_id, x_party_id, l_msg);
        create_supplier_site   (p_stg_id, x_vendor_id, l_org_id,
                                r.BUSINESS_GROUP_NAME,
                                x_site_id, x_party_id, l_msg);
        ensure_external_payee  (x_party_id, x_vendor_id, x_site_id, l_org_id,
                                r.PAYMENT_METHOD, l_payee_id, l_msg);
        g_sup_created := g_sup_created + 1;

        UPDATE XX_WD_EMPLOYEE_STG
           SET PROCESS_STATUS     = G_ST_SUCCESS,
               EBS_PERSON_ID      = x_person_id,
               EBS_VENDOR_ID      = x_vendor_id,
               EBS_VENDOR_SITE_ID = x_site_id,
               EBS_PARTY_ID       = x_party_id,
               ERROR_MESSAGE      = NULL,
               PROCESSED_DATE     = SYSDATE,
               LAST_UPDATE_DATE   = SYSDATE
         WHERE STG_ID = p_stg_id;
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK TO before_employee;
            g_emp_failed := g_emp_failed + 1;
            UPDATE XX_WD_EMPLOYEE_STG
               SET PROCESS_STATUS = G_ST_API_ERR,
                   ERROR_MESSAGE  = SUBSTR(SQLERRM,1,4000),
                   LAST_UPDATE_DATE = SYSDATE
             WHERE STG_ID = p_stg_id;
            x_person_id := NULL; x_vendor_id := NULL;
            x_party_id  := NULL; x_site_id   := NULL;
            log_message(G_LVL_ERROR,'ensure_employee_and_supplier',
                'Aborted: '||SQLERRM,
                'EMPLOYEE',
                NVL((SELECT EMPLOYEE_NUMBER FROM XX_WD_EMPLOYEE_STG
                      WHERE STG_ID = p_stg_id),
                    TO_CHAR(p_stg_id)),
                SQLERRM);
    END ensure_employee_and_supplier;

    -- =========================================================================
    -- MAIN - concurrent-program entry point. Orchestrates the full pipeline:
    --   1. init_run.
    --   2. Validate every NEW row in employee + expense staging tables.
    --   3. RUN_MODE in (INS, BOTH): for each VALIDATED employee row,
    --      ensure_employee_and_supplier.
    --   4. RUN_MODE in (UPD, BOTH): for each VALIDATED expense header,
    --      lazily ensure the employee+supplier exist (covers expense rows
    --      whose employee was not in the employee CSV but already lives in
    --      EBS), then process_one_expense_report.
    --   5. Submit Payables Open Interface Import (per OU).
    --   6. write_summary_report + finalize_run.
    -- =========================================================================
    PROCEDURE main
    (
        errbuf              OUT NOCOPY VARCHAR2,
        retcode             OUT NOCOPY NUMBER,
        p_business_group_id IN  NUMBER   DEFAULT NULL,
        p_run_mode          IN  VARCHAR2 DEFAULT 'BOTH',
        p_batch_id          IN  VARCHAR2 DEFAULT NULL,
        p_debug             IN  VARCHAR2 DEFAULT 'N'
    )
    IS
        l_person_id NUMBER;
        l_vendor_id NUMBER;
        l_party_id  NUMBER;
        l_site_id   NUMBER;
        l_ap_req    NUMBER;
    BEGIN
        retcode := 0;
        init_run(FND_GLOBAL.CONC_REQUEST_ID, p_batch_id, p_run_mode,
                 p_business_group_id, p_debug);

        -- Apps init - ensure FND context is wired even if invoked from SQL*Plus.
        IF g_user_id <= 0 THEN
            FND_GLOBAL.apps_initialize(
                user_id      => NVL(FND_GLOBAL.user_id,1318),
                resp_id      => NVL(FND_GLOBAL.resp_id,50559),
                resp_appl_id => NVL(FND_GLOBAL.resp_appl_id,200));
        END IF;

        -- ---------------- Step 1: validate employee staging ----------------
        FOR e IN
        (
            SELECT STG_ID FROM XX_WD_EMPLOYEE_STG
             WHERE PROCESS_STATUS = G_ST_NEW
               AND (g_batch_id IS NULL OR BATCH_ID = g_batch_id)
        )
        LOOP
            g_emp_total := g_emp_total + 1;
            validate_employee_row(e.STG_ID);
        END LOOP;
        COMMIT;

        -- ---------------- Step 2: validate expense staging ----------------
        FOR h IN
        (
            SELECT STG_HDR_ID FROM XX_WD_EXP_HDR_STG
             WHERE PROCESS_STATUS = G_ST_NEW
               AND (g_batch_id IS NULL OR BATCH_ID = g_batch_id)
        )
        LOOP
            g_exp_total := g_exp_total + 1;
            validate_expense_header(h.STG_HDR_ID);
        END LOOP;
        COMMIT;

        SELECT COUNT(*) INTO g_exp_val_err FROM XX_WD_EXP_HDR_STG
         WHERE REQUEST_ID = g_request_id AND PROCESS_STATUS = G_ST_VAL_ERR;

        -- ---------------- Step 3: create employees + suppliers ----------------
        IF g_run_mode IN (G_MODE_INSERT, G_MODE_BOTH) THEN
            FOR e IN
            (
                SELECT STG_ID FROM XX_WD_EMPLOYEE_STG
                 WHERE PROCESS_STATUS = G_ST_VALIDATED
                   AND (g_batch_id IS NULL OR BATCH_ID = g_batch_id)
            )
            LOOP
                ensure_employee_and_supplier(e.STG_ID,
                    l_person_id, l_vendor_id, l_party_id, l_site_id);
                COMMIT;
            END LOOP;
        END IF;

        -- ---------------- Step 4: load expense reports ----------------
        IF g_run_mode IN (G_MODE_UPDATE, G_MODE_BOTH) THEN
            FOR h IN
            (
                SELECT eh.STG_HDR_ID, eh.EMPLOYEE_NUMBER, eh.BUSINESS_GROUP_NAME
                  FROM XX_WD_EXP_HDR_STG eh
                 WHERE eh.PROCESS_STATUS = G_ST_VALIDATED
                   AND (g_batch_id IS NULL OR eh.BATCH_ID = g_batch_id)
            )
            LOOP
                -- Lazy ensure: covers expense rows whose worker already exists
                -- in EBS but had no row in the employee CSV today.
                IF get_existing_person_id(h.EMPLOYEE_NUMBER,
                       resolve_business_group_id(h.BUSINESS_GROUP_NAME)) IS NULL
                THEN
                    -- find the matching employee staging row for this empnum
                    DECLARE l_emp_stg NUMBER;
                    BEGIN
                        SELECT MAX(STG_ID) INTO l_emp_stg
                          FROM XX_WD_EMPLOYEE_STG
                         WHERE EMPLOYEE_NUMBER = h.EMPLOYEE_NUMBER
                           AND PROCESS_STATUS  IN (G_ST_VALIDATED, G_ST_SUCCESS);
                        IF l_emp_stg IS NOT NULL THEN
                            ensure_employee_and_supplier(l_emp_stg,
                                l_person_id, l_vendor_id, l_party_id, l_site_id);
                            COMMIT;
                        ELSE
                            UPDATE XX_WD_EXP_HDR_STG
                               SET PROCESS_STATUS = G_ST_REJECTED,
                                   ERROR_MESSAGE  = 'Employee not in EBS and not '||
                                       'present in employee CSV - cannot import'
                             WHERE STG_HDR_ID = h.STG_HDR_ID;
                            g_exp_failed := g_exp_failed + 1;
                            COMMIT;
                            CONTINUE;
                        END IF;
                    END;
                END IF;

                process_one_expense_report(h.STG_HDR_ID);
                COMMIT;
            END LOOP;

            -- ---------------- Step 5: submit AP Open Interface Import per OU
            FOR ou IN
            (
                SELECT DISTINCT hou.organization_id, hou.name
                  FROM XX_WD_EXP_HDR_STG eh
                  JOIN hr_operating_units hou ON hou.name = eh.OPERATING_UNIT_NAME
                 WHERE eh.PROCESS_STATUS       = G_ST_SUCCESS
                   AND eh.INVOICE_INTERFACE_ID IS NOT NULL
                   AND eh.REQUEST_ID           = g_request_id
            )
            LOOP
                BEGIN
                    submit_ap_open_interface_import(
                        p_org_id     => ou.organization_id,
                        p_source     => 'WORKDAY_EXPENSES',
                        p_group_id   => g_group_id,
                        x_request_id => l_ap_req);
                EXCEPTION
                    WHEN OTHERS THEN
                        log_message(G_LVL_ERROR,'main',
                            'AP import submit failed for OU '||ou.name||': '||SQLERRM);
                END;
            END LOOP;
        END IF;

        -- ---------------- Step 6: report + finalize ----------------
        write_summary_report;
        finalize_run(g_request_id);

        IF (g_emp_failed + g_sup_failed + g_exp_failed) > 0 THEN
            retcode := 1;       -- WARNING
            errbuf  := 'Completed with errors. See log.';
        ELSIF (g_emp_total + g_exp_total) = 0 THEN
            retcode := 1;
            errbuf  := 'No data to process.';
        ELSE
            retcode := 0;
            errbuf  := 'Success.';
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            retcode := 2;       -- ERROR
            errbuf  := SUBSTR('Fatal: '||SQLERRM,1,240);
            log_message(G_LVL_ERROR,'main','Fatal: '||SQLERRM, NULL, NULL, SQLERRM);
            BEGIN write_summary_report; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN finalize_run(g_request_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END main;

END XX_WD_EMP_SUPPLIER_PKG;
/
SHOW ERRORS PACKAGE BODY XX_WD_EMP_SUPPLIER_PKG

-- ============================================================================
-- PART 5c OF 5 - END  (END OF PACKAGE BODY)
-- After concatenation the assembled file is xx_wd_emp_supplier_pkg.pkb.
-- ============================================================================
