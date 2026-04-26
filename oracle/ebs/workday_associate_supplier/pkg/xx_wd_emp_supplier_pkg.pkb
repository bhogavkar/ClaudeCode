-- ============================================================================
-- PART 1 OF 5 - START
-- File   : xx_wd_emp_supplier_pkg_part1.pkb
-- Content: Package body opener, private state, logging utility,
--          init_run, finalize_run.
-- Concat : Append parts 2..5 (in order) below the END marker of this file
--          to form the complete xx_wd_emp_supplier_pkg.pkb.
-- ============================================================================
CREATE OR REPLACE PACKAGE BODY XX_WD_EMP_SUPPLIER_PKG AS

    -- ---------------------------------------------------------- private state
    g_request_id   NUMBER       := NVL(FND_GLOBAL.CONC_REQUEST_ID, -1);
    g_user_id      NUMBER       := NVL(FND_GLOBAL.USER_ID, -1);
    g_login_id     NUMBER       := NVL(FND_GLOBAL.LOGIN_ID, -1);
    g_resp_id      NUMBER       := FND_GLOBAL.RESP_ID;
    g_resp_appl_id NUMBER       := FND_GLOBAL.RESP_APPL_ID;
    g_batch_id     VARCHAR2(60);
    g_run_mode     VARCHAR2(10) := G_MODE_BOTH;
    g_bg_id        NUMBER;
    g_debug        BOOLEAN      := FALSE;
    g_summary_id   NUMBER;
    g_group_id     VARCHAR2(80);   -- AP_INVOICES_INTERFACE.GROUP_ID for this run

    -- Counters (drive the run-summary row)
    g_emp_total       NUMBER := 0;
    g_emp_created     NUMBER := 0;
    g_emp_existing    NUMBER := 0;
    g_emp_failed      NUMBER := 0;
    g_sup_created     NUMBER := 0;
    g_sup_failed      NUMBER := 0;
    g_exp_total       NUMBER := 0;
    g_exp_loaded      NUMBER := 0;
    g_exp_failed      NUMBER := 0;
    g_exp_val_err     NUMBER := 0;

    -- =========================================================================
    -- log_message
    --   Autonomous logger: writes a row to XX_WD_INTEGRATION_LOG and (when the
    --   level is INFO/WARN/ERROR) also echoes to the concurrent log so support
    --   doesn't have to query the table for the common path.
    -- =========================================================================
    PROCEDURE log_message
    (
        p_level       IN VARCHAR2,
        p_source      IN VARCHAR2,
        p_message     IN VARCHAR2,
        p_entity_type IN VARCHAR2 DEFAULT NULL,
        p_entity_key  IN VARCHAR2 DEFAULT NULL,
        p_oracle_err  IN VARCHAR2 DEFAULT NULL
    )
    IS
        PRAGMA AUTONOMOUS_TRANSACTION;
        l_emit_console BOOLEAN := (p_level <> G_LVL_DEBUG) OR g_debug;
    BEGIN
        IF p_level = G_LVL_DEBUG AND NOT g_debug THEN
            RETURN;                       -- suppress debug rows when not requested
        END IF;

        INSERT INTO XX_WD_INTEGRATION_LOG
        (
            LOG_ID, REQUEST_ID, BATCH_ID, LOG_LEVEL, LOG_SOURCE,
            ENTITY_TYPE, ENTITY_KEY, MESSAGE, ORACLE_ERROR,
            LOGGED_DATE, CREATED_BY
        )
        VALUES
        (
            XX_WD_INTEGRATION_LOG_S.NEXTVAL, g_request_id, g_batch_id, p_level, p_source,
            p_entity_type, p_entity_key, SUBSTR(p_message,1,4000), SUBSTR(p_oracle_err,1,4000),
            SYSTIMESTAMP, g_user_id
        );
        COMMIT;

        IF l_emit_console AND g_request_id > 0 THEN
            FND_FILE.PUT_LINE(
                FND_FILE.LOG,
                TO_CHAR(SYSTIMESTAMP,'HH24:MI:SS.FF3')||' ['||p_level||'] '||
                p_source||' '||
                CASE WHEN p_entity_type IS NOT NULL
                     THEN '<'||p_entity_type||':'||p_entity_key||'> '
                     ELSE NULL END||
                p_message
            );
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            -- Logging must never bring down the main run.
            ROLLBACK;
    END log_message;

    -- =========================================================================
    -- init_run - create the XX_WD_RUN_SUMMARY row and seed package state.
    -- =========================================================================
    PROCEDURE init_run
    (
        p_request_id IN NUMBER,
        p_batch_id   IN VARCHAR2,
        p_run_mode   IN VARCHAR2,
        p_bg_id      IN NUMBER,
        p_debug      IN VARCHAR2
    )
    IS
        l_bg_name VARCHAR2(60);
    BEGIN
        g_request_id := NVL(p_request_id, NVL(FND_GLOBAL.CONC_REQUEST_ID,-1));
        g_batch_id   := p_batch_id;
        g_run_mode   := UPPER(NVL(p_run_mode, G_MODE_BOTH));
        g_bg_id      := p_bg_id;
        g_debug      := (UPPER(NVL(p_debug,'N')) = 'Y');
        g_group_id   := 'WD_'||TO_CHAR(SYSDATE,'YYYYMMDDHH24MISS')||'_'||g_request_id;

        BEGIN
            SELECT name INTO l_bg_name
              FROM per_business_groups
             WHERE business_group_id = g_bg_id;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN l_bg_name := NULL;
        END;

        INSERT INTO XX_WD_RUN_SUMMARY
        (
            SUMMARY_ID, REQUEST_ID, BATCH_ID, RUN_MODE,
            BUSINESS_GROUP_ID, BUSINESS_GROUP_NAME,
            START_TIME, OVERALL_STATUS,
            CREATED_BY, CREATION_DATE
        )
        VALUES
        (
            XX_WD_RUN_SUMMARY_S.NEXTVAL, g_request_id, g_batch_id, g_run_mode,
            g_bg_id, l_bg_name,
            SYSTIMESTAMP, 'RUNNING',
            g_user_id, SYSDATE
        )
        RETURNING SUMMARY_ID INTO g_summary_id;
        COMMIT;

        log_message(G_LVL_INFO, 'init_run',
            'Started Workday integration. mode='||g_run_mode||
            ' batch='||NVL(g_batch_id,'<ALL_NEW>')||
            ' bg_id='||NVL(TO_CHAR(g_bg_id),'<per-row>')||
            ' debug='||NVL(p_debug,'N')||
            ' group_id='||g_group_id);
    END init_run;

    -- =========================================================================
    -- finalize_run - close out the run-summary row with totals + status.
    -- =========================================================================
    PROCEDURE finalize_run(p_request_id IN NUMBER)
    IS
        l_overall VARCHAR2(20);
    BEGIN
        IF (g_emp_failed + g_sup_failed + g_exp_failed + g_exp_val_err) = 0
           AND (g_emp_total + g_exp_total) > 0
        THEN
            l_overall := 'SUCCESS';
        ELSIF (g_emp_created + g_exp_loaded) > 0 THEN
            l_overall := 'PARTIAL';
        ELSIF (g_emp_total + g_exp_total) = 0 THEN
            l_overall := 'NO_DATA';
        ELSE
            l_overall := 'FAILED';
        END IF;

        UPDATE XX_WD_RUN_SUMMARY
           SET END_TIME           = SYSTIMESTAMP,
               EMP_TOTAL          = g_emp_total,
               EMP_CREATED        = g_emp_created,
               EMP_EXISTING       = g_emp_existing,
               EMP_FAILED         = g_emp_failed,
               SUP_CREATED        = g_sup_created,
               SUP_FAILED         = g_sup_failed,
               EXP_TOTAL          = g_exp_total,
               EXP_LOADED         = g_exp_loaded,
               EXP_FAILED         = g_exp_failed,
               EXP_VALIDATION_ERR = g_exp_val_err,
               OVERALL_STATUS     = l_overall
         WHERE SUMMARY_ID = g_summary_id;
        COMMIT;

        log_message(G_LVL_INFO, 'finalize_run',
            'Completed. status='||l_overall||
            ' emp_total='||g_emp_total||' emp_created='||g_emp_created||
            ' emp_existing='||g_emp_existing||' emp_failed='||g_emp_failed||
            ' sup_created='||g_sup_created||' sup_failed='||g_sup_failed||
            ' exp_total='||g_exp_total||' exp_loaded='||g_exp_loaded||
            ' exp_failed='||g_exp_failed||' exp_val_err='||g_exp_val_err);
    END finalize_run;

-- ============================================================================
-- PART 1 OF 5 - END
-- (do NOT add END package or trailing slash here - parts 2..5 continue)
-- ============================================================================
-- ============================================================================
-- PART 2 OF 5 - START
-- File   : xx_wd_emp_supplier_pkg_part2.pkb
-- Content: Existence helpers + validation procedures.
-- Concat : Append immediately after PART 1 (still inside PACKAGE BODY block).
-- ============================================================================

    -- =========================================================================
    -- get_existing_person_id - returns the active EBS person_id for the given
    --   Workday employee_number, scoped to a business group, or NULL if none.
    --   Looks at the row whose effective dates cover SYSDATE.
    -- =========================================================================
    FUNCTION get_existing_person_id
    (
        p_employee_number   IN VARCHAR2,
        p_business_group_id IN NUMBER
    ) RETURN NUMBER
    IS
        l_person_id NUMBER;
    BEGIN
        SELECT MAX(person_id)
          INTO l_person_id
          FROM per_all_people_f
         WHERE employee_number   = p_employee_number
           AND business_group_id = p_business_group_id
           AND TRUNC(SYSDATE) BETWEEN effective_start_date AND effective_end_date;
        RETURN l_person_id;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN RETURN NULL;
    END get_existing_person_id;

    -- =========================================================================
    -- get_existing_vendor_id - returns the AP_SUPPLIERS.VENDOR_ID for the
    --   employee-supplier linked to p_person_id, or NULL.
    -- =========================================================================
    FUNCTION get_existing_vendor_id(p_person_id IN NUMBER) RETURN NUMBER
    IS
        l_vendor_id NUMBER;
    BEGIN
        SELECT MAX(vendor_id)
          INTO l_vendor_id
          FROM ap_suppliers
         WHERE employee_id = p_person_id
           AND NVL(enabled_flag,'Y') = 'Y'
           AND NVL(end_date_active, SYSDATE+1) > SYSDATE;
        RETURN l_vendor_id;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN RETURN NULL;
    END get_existing_vendor_id;

    -- =========================================================================
    -- resolve_business_group_id - maps the simple BUSINESS_GROUP_NAME ('US'/'CA')
    --   coming from Workday into a real per_business_groups.business_group_id.
    --   If a global parameter was supplied to MAIN, that one wins.
    -- =========================================================================
    FUNCTION resolve_business_group_id(p_bg_name IN VARCHAR2) RETURN NUMBER
    IS
        l_id NUMBER;
        l_name VARCHAR2(60);
    BEGIN
        IF g_bg_id IS NOT NULL THEN
            RETURN g_bg_id;
        END IF;
        l_name := CASE UPPER(p_bg_name)
                       WHEN 'US' THEN 'US Business Group'
                       WHEN 'CA' THEN 'CA Business Group'
                       ELSE p_bg_name END;
        SELECT business_group_id INTO l_id
          FROM per_business_groups
         WHERE UPPER(name) = UPPER(l_name)
            OR UPPER(short_name) = UPPER(p_bg_name);
        RETURN l_id;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            log_message(G_LVL_ERROR,'resolve_bg',
                'No business group matched name='||p_bg_name);
            RETURN NULL;
    END resolve_business_group_id;

    -- =========================================================================
    -- validate_employee_row - field-level validation against XX_WD_EMPLOYEE_STG.
    --   On failure, marks PROCESS_STATUS = VALIDATION_ERROR and ERROR_MESSAGE.
    --   On success, marks PROCESS_STATUS = VALIDATED.
    -- =========================================================================
    PROCEDURE validate_employee_row(p_stg_id IN NUMBER)
    IS
        r        XX_WD_EMPLOYEE_STG%ROWTYPE;
        l_errs   VARCHAR2(4000);

        PROCEDURE add_err(msg VARCHAR2) IS
        BEGIN
            l_errs := l_errs || CASE WHEN l_errs IS NULL THEN NULL ELSE '; ' END || msg;
        END;
    BEGIN
        SELECT * INTO r FROM XX_WD_EMPLOYEE_STG WHERE STG_ID = p_stg_id FOR UPDATE;

        IF r.EMPLOYEE_NUMBER IS NULL THEN add_err('EMPLOYEE_NUMBER is null'); END IF;
        IF r.LAST_NAME       IS NULL THEN add_err('LAST_NAME is null');       END IF;
        IF r.HIRE_DATE       IS NULL THEN add_err('HIRE_DATE is null');       END IF;
        IF r.BUSINESS_GROUP_NAME NOT IN ('US','CA') THEN
            add_err('BUSINESS_GROUP_NAME must be US or CA, got '||r.BUSINESS_GROUP_NAME);
        END IF;
        IF r.GENDER IS NOT NULL AND r.GENDER NOT IN ('M','F') THEN
            add_err('GENDER must be M or F');
        END IF;
        IF r.EMAIL_ADDRESS IS NOT NULL
           AND NOT REGEXP_LIKE(r.EMAIL_ADDRESS,'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
        THEN
            add_err('EMAIL_ADDRESS not well-formed');
        END IF;
        IF r.HIRE_DATE > TRUNC(SYSDATE)+1 THEN
            add_err('HIRE_DATE is in the future ('||TO_CHAR(r.HIRE_DATE,'YYYY-MM-DD')||')');
        END IF;
        IF r.TERMINATION_DATE IS NOT NULL AND r.TERMINATION_DATE < r.HIRE_DATE THEN
            add_err('TERMINATION_DATE earlier than HIRE_DATE');
        END IF;
        IF r.PAYMENT_METHOD = 'EFT' AND
           (r.BANK_ACCOUNT_NUMBER IS NULL OR r.BANK_ROUTING_NUMBER IS NULL)
        THEN
            add_err('PAYMENT_METHOD=EFT requires BANK_ACCOUNT_NUMBER and BANK_ROUTING_NUMBER');
        END IF;
        IF r.ADDRESS_LINE1 IS NULL OR r.CITY IS NULL OR r.COUNTRY IS NULL THEN
            add_err('Address (LINE1/CITY/COUNTRY) is incomplete');
        END IF;

        IF l_errs IS NOT NULL THEN
            UPDATE XX_WD_EMPLOYEE_STG
               SET PROCESS_STATUS   = G_ST_VAL_ERR,
                   ERROR_MESSAGE    = SUBSTR(l_errs,1,4000),
                   REQUEST_ID       = g_request_id,
                   LAST_UPDATE_DATE = SYSDATE,
                   LAST_UPDATED_BY  = g_user_id
             WHERE STG_ID = p_stg_id;
            log_message(G_LVL_WARN,'validate_employee_row',
                'Validation failed: '||l_errs,
                'EMPLOYEE', r.EMPLOYEE_NUMBER);
        ELSE
            UPDATE XX_WD_EMPLOYEE_STG
               SET PROCESS_STATUS   = G_ST_VALIDATED,
                   ERROR_MESSAGE    = NULL,
                   REQUEST_ID       = g_request_id,
                   LAST_UPDATE_DATE = SYSDATE,
                   LAST_UPDATED_BY  = g_user_id
             WHERE STG_ID = p_stg_id;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            log_message(G_LVL_ERROR,'validate_employee_row',
                'Unhandled error', 'EMPLOYEE', TO_CHAR(p_stg_id), SQLERRM);
            UPDATE XX_WD_EMPLOYEE_STG
               SET PROCESS_STATUS = G_ST_VAL_ERR,
                   ERROR_MESSAGE = SUBSTR('Unhandled: '||SQLERRM,1,4000)
             WHERE STG_ID = p_stg_id;
    END validate_employee_row;

    -- =========================================================================
    -- validate_expense_header - check the header row plus its lines
    --   (sum of LINE_AMOUNT must equal REPORT_TOTAL_AMOUNT within 1 cent).
    -- =========================================================================
    PROCEDURE validate_expense_header(p_stg_hdr_id IN NUMBER)
    IS
        r          XX_WD_EXP_HDR_STG%ROWTYPE;
        l_errs     VARCHAR2(4000);
        l_line_cnt NUMBER;
        l_line_sum NUMBER;
        l_dup_cnt  NUMBER;

        PROCEDURE add_err(msg VARCHAR2) IS
        BEGIN
            l_errs := l_errs || CASE WHEN l_errs IS NULL THEN NULL ELSE '; ' END || msg;
        END;
    BEGIN
        SELECT * INTO r FROM XX_WD_EXP_HDR_STG WHERE STG_HDR_ID = p_stg_hdr_id FOR UPDATE;

        -- Mandatory fields
        IF r.WD_EXPENSE_REPORT_ID IS NULL THEN add_err('WD_EXPENSE_REPORT_ID null'); END IF;
        IF r.EMPLOYEE_NUMBER      IS NULL THEN add_err('EMPLOYEE_NUMBER null');      END IF;
        IF r.REPORT_DATE          IS NULL THEN add_err('REPORT_DATE null');          END IF;
        IF r.REPORT_TOTAL_AMOUNT  IS NULL THEN add_err('REPORT_TOTAL_AMOUNT null');  END IF;
        IF r.CURRENCY_CODE        IS NULL THEN add_err('CURRENCY_CODE null');        END IF;
        IF r.OPERATING_UNIT_NAME  IS NULL THEN add_err('OPERATING_UNIT_NAME null');  END IF;

        IF r.REPORT_TOTAL_AMOUNT IS NOT NULL AND r.REPORT_TOTAL_AMOUNT <= 0 THEN
            add_err('REPORT_TOTAL_AMOUNT must be > 0');
        END IF;

        -- Currency is real
        IF r.CURRENCY_CODE IS NOT NULL THEN
            DECLARE l_dummy NUMBER;
            BEGIN
                SELECT 1 INTO l_dummy FROM fnd_currencies
                 WHERE currency_code = r.CURRENCY_CODE
                   AND enabled_flag  = 'Y';
            EXCEPTION
                WHEN NO_DATA_FOUND THEN add_err('CURRENCY_CODE '||r.CURRENCY_CODE||' not enabled');
            END;
        END IF;

        -- Operating unit resolves
        IF r.OPERATING_UNIT_NAME IS NOT NULL THEN
            DECLARE l_dummy NUMBER;
            BEGIN
                SELECT organization_id INTO l_dummy
                  FROM hr_operating_units
                 WHERE name = r.OPERATING_UNIT_NAME;
            EXCEPTION
                WHEN NO_DATA_FOUND THEN add_err('OPERATING_UNIT_NAME '||r.OPERATING_UNIT_NAME||' not found');
            END;
        END IF;

        -- Idempotency: same WD_EXPENSE_REPORT_ID already imported successfully?
        SELECT COUNT(*) INTO l_dup_cnt
          FROM XX_WD_EXP_HDR_STG
         WHERE WD_EXPENSE_REPORT_ID = r.WD_EXPENSE_REPORT_ID
           AND PROCESS_STATUS       = G_ST_SUCCESS
           AND STG_HDR_ID           <> r.STG_HDR_ID;
        IF l_dup_cnt > 0 THEN
            add_err('Duplicate of an already-imported expense report');
        END IF;

        -- Lines exist + total reconciles
        SELECT COUNT(*), NVL(SUM(LINE_AMOUNT),0)
          INTO l_line_cnt, l_line_sum
          FROM XX_WD_EXP_LINE_STG
         WHERE STG_HDR_ID = p_stg_hdr_id;
        IF l_line_cnt = 0 THEN
            add_err('No expense lines found in XX_WD_EXP_LINE_STG');
        ELSIF r.REPORT_TOTAL_AMOUNT IS NOT NULL
              AND ABS(l_line_sum - r.REPORT_TOTAL_AMOUNT) > 0.01
        THEN
            add_err('Sum of lines ('||l_line_sum||') != REPORT_TOTAL_AMOUNT ('||r.REPORT_TOTAL_AMOUNT||')');
        END IF;

        IF l_errs IS NOT NULL THEN
            UPDATE XX_WD_EXP_HDR_STG
               SET PROCESS_STATUS   = G_ST_VAL_ERR,
                   ERROR_MESSAGE    = SUBSTR(l_errs,1,4000),
                   REQUEST_ID       = g_request_id,
                   LAST_UPDATE_DATE = SYSDATE,
                   LAST_UPDATED_BY  = g_user_id
             WHERE STG_HDR_ID = p_stg_hdr_id;
            UPDATE XX_WD_EXP_LINE_STG
               SET PROCESS_STATUS = G_ST_VAL_ERR,
                   ERROR_MESSAGE  = 'Header validation failed'
             WHERE STG_HDR_ID = p_stg_hdr_id;
            log_message(G_LVL_WARN,'validate_expense_header',
                'Validation failed: '||l_errs,
                'EXPENSE', r.WD_EXPENSE_REPORT_ID);
        ELSE
            UPDATE XX_WD_EXP_HDR_STG
               SET PROCESS_STATUS   = G_ST_VALIDATED,
                   ERROR_MESSAGE    = NULL,
                   REQUEST_ID       = g_request_id,
                   LAST_UPDATE_DATE = SYSDATE,
                   LAST_UPDATED_BY  = g_user_id
             WHERE STG_HDR_ID = p_stg_hdr_id;
            UPDATE XX_WD_EXP_LINE_STG
               SET PROCESS_STATUS = G_ST_VALIDATED,
                   ERROR_MESSAGE  = NULL
             WHERE STG_HDR_ID = p_stg_hdr_id;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            log_message(G_LVL_ERROR,'validate_expense_header',
                'Unhandled error', 'EXPENSE', TO_CHAR(p_stg_hdr_id), SQLERRM);
            UPDATE XX_WD_EXP_HDR_STG
               SET PROCESS_STATUS = G_ST_VAL_ERR,
                   ERROR_MESSAGE  = SUBSTR('Unhandled: '||SQLERRM,1,4000)
             WHERE STG_HDR_ID = p_stg_hdr_id;
    END validate_expense_header;

-- ============================================================================
-- PART 2 OF 5 - END
-- (still inside PACKAGE BODY - parts 3..5 to follow)
-- ============================================================================
-- ============================================================================
-- PART 3 OF 5 - START
-- File   : xx_wd_emp_supplier_pkg_part3.pkb
-- Content: HRMS employee creation (HR_EMPLOYEE_API.create_employee +
--          HR_PERSON_ADDRESS_API.create_person_address).
-- Concat : Append immediately after PART 2 (still inside PACKAGE BODY block).
-- ============================================================================

    -- =========================================================================
    -- create_employee_in_hrms
    --   Creates the person + default assignment in PER_ALL_PEOPLE_F /
    --   PER_ALL_ASSIGNMENTS_F, then attaches the home address. Returns the
    --   new person_id and assignment_id.
    --
    --   Idempotency: callers must check get_existing_person_id() before
    --   invoking this. We do NOT re-check here to keep the contract clean.
    --
    --   Error model: any HR_API failure raises EX_API_FAILED with a friendly
    --   x_msg containing the FND message stack. Callers do the savepoint /
    --   counter / staging-row update.
    -- =========================================================================
    PROCEDURE create_employee_in_hrms
    (
        p_stg_id         IN  NUMBER,
        p_bg_id          IN  NUMBER,
        x_person_id      OUT NOCOPY NUMBER,
        x_assignment_id  OUT NOCOPY NUMBER,
        x_msg            OUT NOCOPY VARCHAR2
    )
    IS
        r                       XX_WD_EMPLOYEE_STG%ROWTYPE;

        -- HR_EMPLOYEE_API IN/OUT params
        l_emp_num               PER_ALL_PEOPLE_F.EMPLOYEE_NUMBER%TYPE;

        -- HR_EMPLOYEE_API OUT params
        l_per_object_version    NUMBER;
        l_asg_object_version    NUMBER;
        l_per_eff_start         DATE;
        l_per_eff_end           DATE;
        l_full_name             PER_ALL_PEOPLE_F.FULL_NAME%TYPE;
        l_per_comment_id        NUMBER;
        l_assignment_sequence   NUMBER;
        l_assignment_number     PER_ALL_ASSIGNMENTS_F.ASSIGNMENT_NUMBER%TYPE;
        l_name_combo_warn       BOOLEAN;
        l_assign_payroll_warn   BOOLEAN;
        l_orig_hire_warn        BOOLEAN;

        -- HR_PERSON_ADDRESS_API params
        l_address_id            NUMBER;
        l_addr_object_version   NUMBER;

        l_msgs                  VARCHAR2(4000);
    BEGIN
        SELECT * INTO r FROM XX_WD_EMPLOYEE_STG WHERE STG_ID = p_stg_id;

        log_message(G_LVL_DEBUG,'create_employee_in_hrms',
            'Calling HR_EMPLOYEE_API.create_employee',
            'EMPLOYEE', r.EMPLOYEE_NUMBER);

        -- HR_EMPLOYEE_API requires EMPLOYEE_NUMBER as IN/OUT. We pass the
        -- Workday-supplied number (employee_number generation method must be
        -- "Manual" on the BG, which is the standard for Workday-driven HR).
        l_emp_num := r.EMPLOYEE_NUMBER;

        HR_EMPLOYEE_API.create_employee
        (
            p_validate                      => FALSE,
            p_hire_date                     => r.HIRE_DATE,
            p_business_group_id             => p_bg_id,
            p_last_name                     => r.LAST_NAME,
            p_sex                           => r.GENDER,
            p_date_of_birth                 => r.DATE_OF_BIRTH,
            p_email_address                 => r.EMAIL_ADDRESS,
            p_employee_number               => l_emp_num,        -- IN OUT
            p_first_name                    => r.FIRST_NAME,
            p_middle_names                  => r.MIDDLE_NAME,
            p_known_as                      => r.KNOWN_AS,
            p_title                         => r.TITLE,
            p_national_identifier           => r.NATIONAL_IDENTIFIER,
            p_attribute_category            => 'WORKDAY',
            p_attribute1                    => r.WD_WORKER_ID,
            p_attribute2                    => r.BATCH_ID,
            p_person_id                     => x_person_id,
            p_assignment_id                 => x_assignment_id,
            p_per_object_version_number     => l_per_object_version,
            p_asg_object_version_number     => l_asg_object_version,
            p_per_effective_start_date      => l_per_eff_start,
            p_per_effective_end_date        => l_per_eff_end,
            p_full_name                     => l_full_name,
            p_per_comment_id                => l_per_comment_id,
            p_assignment_sequence           => l_assignment_sequence,
            p_assignment_number             => l_assignment_number,
            p_name_combination_warning      => l_name_combo_warn,
            p_assign_payroll_warning        => l_assign_payroll_warn,
            p_orig_hire_warning             => l_orig_hire_warn
        );

        log_message(G_LVL_INFO,'create_employee_in_hrms',
            'HR person created person_id='||x_person_id||
            ' assignment_id='||x_assignment_id||
            ' full_name='||l_full_name||
            CASE WHEN l_name_combo_warn      THEN ' [WARN:name-combination]' END||
            CASE WHEN l_assign_payroll_warn  THEN ' [WARN:assign-payroll]'   END||
            CASE WHEN l_orig_hire_warn       THEN ' [WARN:orig-hire]'        END,
            'EMPLOYEE', r.EMPLOYEE_NUMBER);

        -- ---------------------------------------------- create home address --
        IF r.ADDRESS_LINE1 IS NOT NULL THEN
            HR_PERSON_ADDRESS_API.create_person_address
            (
                p_validate              => FALSE,
                p_effective_date        => r.HIRE_DATE,
                p_pradd_ovlapval_override => FALSE,
                p_validate_county       => FALSE,
                p_person_id             => x_person_id,
                p_primary_flag          => 'Y',
                p_address_type          => NVL(r.ADDRESS_TYPE,'HOME'),
                p_date_from             => r.HIRE_DATE,
                p_address_line1         => r.ADDRESS_LINE1,
                p_address_line2         => r.ADDRESS_LINE2,
                p_address_line3         => r.ADDRESS_LINE3,
                p_town_or_city          => r.CITY,
                p_region_2              => r.STATE_PROVINCE,
                p_postal_code           => r.POSTAL_CODE,
                p_country               => CASE UPPER(r.COUNTRY)
                                              WHEN 'UNITED STATES' THEN 'US'
                                              WHEN 'USA'           THEN 'US'
                                              WHEN 'CANADA'        THEN 'CA'
                                              ELSE UPPER(r.COUNTRY)
                                           END,
                p_style                 => CASE UPPER(r.COUNTRY)
                                              WHEN 'CANADA' THEN 'CA'
                                              ELSE 'US' END,
                p_address_id            => l_address_id,
                p_object_version_number => l_addr_object_version
            );
            log_message(G_LVL_DEBUG,'create_employee_in_hrms',
                'Address created address_id='||l_address_id,
                'EMPLOYEE', r.EMPLOYEE_NUMBER);
        END IF;

        x_msg := 'OK person_id='||x_person_id||' assignment_id='||x_assignment_id;

    EXCEPTION
        WHEN OTHERS THEN
            -- Drain any FND messages put on the stack by the HR API.
            FOR i IN 1 .. NVL(FND_MSG_PUB.count_msg,0) LOOP
                l_msgs := l_msgs || FND_MSG_PUB.get(p_msg_index => i,
                                                    p_encoded   => FND_API.G_FALSE) || ' | ';
            END LOOP;
            x_msg := SUBSTR('HR_EMPLOYEE_API failed: '||SQLERRM||' :: '||l_msgs, 1, 4000);
            log_message(G_LVL_ERROR,'create_employee_in_hrms', x_msg,
                'EMPLOYEE', NVL(r.EMPLOYEE_NUMBER,TO_CHAR(p_stg_id)), SQLERRM);
            RAISE EX_API_FAILED;
    END create_employee_in_hrms;

-- ============================================================================
-- PART 3 OF 5 - END
-- (still inside PACKAGE BODY - parts 4..5 to follow)
-- ============================================================================
-- ============================================================================
-- PART 4 OF 5 - START
-- File   : xx_wd_emp_supplier_pkg_part4.pkb
-- Content: Employee-supplier + supplier site creation, plus IBY external
--          payee verification. Uses AP_VENDOR_PUB_PKG (R12 public APIs).
-- Concat : Append immediately after PART 3 (still inside PACKAGE BODY block).
-- ============================================================================

    -- =========================================================================
    -- create_employee_supplier
    --   Creates an EMPLOYEE-typed supplier in AP_SUPPLIERS, linked to an
    --   existing per_all_people_f.person_id. The supplier number (segment1)
    --   defaults to the employee number for easy traceability.
    --
    --   This MUST be called *after* create_employee_in_hrms (or after
    --   confirming the person already exists), because the API requires a
    --   real employee_id - the user explicitly required "employee can be
    --   chosen as existing only".
    -- =========================================================================
    PROCEDURE create_employee_supplier
    (
        p_stg_id     IN  NUMBER,
        p_person_id  IN  NUMBER,
        x_vendor_id  OUT NOCOPY NUMBER,
        x_party_id   OUT NOCOPY NUMBER,
        x_msg        OUT NOCOPY VARCHAR2
    )
    IS
        r              XX_WD_EMPLOYEE_STG%ROWTYPE;
        l_vendor_rec   AP_VENDOR_PUB_PKG.r_vendor_rec_type;
        l_return_status VARCHAR2(1);
        l_msg_count    NUMBER;
        l_msg_data     VARCHAR2(4000);
        l_msgs         VARCHAR2(4000);
        l_full_name    VARCHAR2(240);
    BEGIN
        SELECT * INTO r FROM XX_WD_EMPLOYEE_STG WHERE STG_ID = p_stg_id;

        l_full_name := TRIM(BOTH ' ' FROM
                          NVL(r.FIRST_NAME,'')||' '||
                          NVL(r.MIDDLE_NAME,'')||' '||
                          r.LAST_NAME);

        -- Build the vendor record. For employee-suppliers the canonical
        -- attribute is employee_id; vendor_type_lookup_code MUST be 'EMPLOYEE'
        -- so 1099/expense reporting + Payments are wired correctly.
        l_vendor_rec.segment1                  := r.EMPLOYEE_NUMBER;
        l_vendor_rec.vendor_name               := l_full_name;
        l_vendor_rec.vendor_name_alt           := r.LAST_NAME||', '||r.FIRST_NAME;
        l_vendor_rec.vendor_type_lookup_code   := 'EMPLOYEE';
        l_vendor_rec.employee_id               := p_person_id;
        l_vendor_rec.enabled_flag              := 'Y';
        l_vendor_rec.start_date_active         := r.HIRE_DATE;
        l_vendor_rec.end_date_active           := r.TERMINATION_DATE;
        l_vendor_rec.match_option              := 'P';
        l_vendor_rec.invoice_currency_code     := NVL(r.DEFAULT_CURRENCY,
                                                      CASE UPPER(r.BUSINESS_GROUP_NAME)
                                                          WHEN 'CA' THEN 'CAD'
                                                          ELSE 'USD' END);
        l_vendor_rec.payment_currency_code     := l_vendor_rec.invoice_currency_code;
        l_vendor_rec.pay_group_lookup_code     := 'EMPLOYEE';
        l_vendor_rec.payment_method_lookup_code := NVL(r.PAYMENT_METHOD,'CHECK');
        l_vendor_rec.allow_awt_flag            := 'N';
        l_vendor_rec.attribute_category        := 'WORKDAY';
        l_vendor_rec.attribute1                := r.WD_WORKER_ID;
        l_vendor_rec.attribute2                := r.BATCH_ID;

        log_message(G_LVL_DEBUG,'create_employee_supplier',
            'Calling AP_VENDOR_PUB_PKG.Create_Vendor segment1='||r.EMPLOYEE_NUMBER||
            ' employee_id='||p_person_id,
            'SUPPLIER', r.EMPLOYEE_NUMBER);

        AP_VENDOR_PUB_PKG.Create_Vendor
        (
            p_api_version       => 1.0,
            p_init_msg_list     => FND_API.G_TRUE,
            p_commit            => FND_API.G_FALSE,
            p_validation_level  => FND_API.G_VALID_LEVEL_FULL,
            x_return_status     => l_return_status,
            x_msg_count         => l_msg_count,
            x_msg_data          => l_msg_data,
            p_vendor_rec        => l_vendor_rec,
            x_vendor_id         => x_vendor_id,
            x_party_id          => x_party_id
        );

        IF l_return_status <> FND_API.G_RET_STS_SUCCESS THEN
            FOR i IN 1 .. NVL(l_msg_count,0) LOOP
                l_msgs := l_msgs || FND_MSG_PUB.get(p_msg_index => i,
                                                    p_encoded   => FND_API.G_FALSE) || ' | ';
            END LOOP;
            x_msg := SUBSTR('Create_Vendor failed: '||l_msg_data||' :: '||l_msgs,1,4000);
            log_message(G_LVL_ERROR,'create_employee_supplier', x_msg,
                'SUPPLIER', r.EMPLOYEE_NUMBER);
            RAISE EX_API_FAILED;
        END IF;

        log_message(G_LVL_INFO,'create_employee_supplier',
            'Vendor created vendor_id='||x_vendor_id||' party_id='||x_party_id,
            'SUPPLIER', r.EMPLOYEE_NUMBER);

        x_msg := 'OK vendor_id='||x_vendor_id;
    EXCEPTION
        WHEN EX_API_FAILED THEN RAISE;
        WHEN OTHERS THEN
            x_msg := SUBSTR('Unhandled in create_employee_supplier: '||SQLERRM,1,4000);
            log_message(G_LVL_ERROR,'create_employee_supplier', x_msg,
                'SUPPLIER', NVL(r.EMPLOYEE_NUMBER,TO_CHAR(p_stg_id)), SQLERRM);
            RAISE EX_API_FAILED;
    END create_employee_supplier;

    -- =========================================================================
    -- create_supplier_site
    --   Creates the OU-level supplier site. We always create one HOME site
    --   marked pay_site_flag='Y', purchasing_site_flag='N' (employee suppliers
    --   are pay-only). Address comes from the staging row.
    -- =========================================================================
    PROCEDURE create_supplier_site
    (
        p_stg_id          IN  NUMBER,
        p_vendor_id       IN  NUMBER,
        p_org_id          IN  NUMBER,
        p_business_group  IN  VARCHAR2,
        x_vendor_site_id  OUT NOCOPY NUMBER,
        x_party_site_id   OUT NOCOPY NUMBER,
        x_msg             OUT NOCOPY VARCHAR2
    )
    IS
        r               XX_WD_EMPLOYEE_STG%ROWTYPE;
        l_site_rec      AP_VENDOR_PUB_PKG.r_vendor_site_rec_type;
        l_return_status VARCHAR2(1);
        l_msg_count     NUMBER;
        l_msg_data      VARCHAR2(4000);
        l_loc_id        NUMBER;     -- site location_id (out from API in some patches)
        l_msgs          VARCHAR2(4000);
    BEGIN
        SELECT * INTO r FROM XX_WD_EMPLOYEE_STG WHERE STG_ID = p_stg_id;

        l_site_rec.vendor_id                 := p_vendor_id;
        l_site_rec.vendor_site_code          := SUBSTR(NVL(r.ADDRESS_TYPE,'HOME'),1,15);
        l_site_rec.org_id                    := p_org_id;
        l_site_rec.address_line1             := r.ADDRESS_LINE1;
        l_site_rec.address_line2             := r.ADDRESS_LINE2;
        l_site_rec.address_line3             := r.ADDRESS_LINE3;
        l_site_rec.city                      := r.CITY;
        l_site_rec.state                     := r.STATE_PROVINCE;
        l_site_rec.zip                       := r.POSTAL_CODE;
        l_site_rec.country                   := CASE UPPER(r.COUNTRY)
                                                    WHEN 'UNITED STATES' THEN 'US'
                                                    WHEN 'USA'           THEN 'US'
                                                    WHEN 'CANADA'        THEN 'CA'
                                                    ELSE UPPER(r.COUNTRY)
                                                 END;
        l_site_rec.email_address             := r.EMAIL_ADDRESS;
        l_site_rec.pay_site_flag             := 'Y';
        l_site_rec.purchasing_site_flag      := 'N';
        l_site_rec.rfq_only_site_flag        := 'N';
        l_site_rec.payment_method_lookup_code := NVL(r.PAYMENT_METHOD,'CHECK');
        l_site_rec.pay_group_lookup_code     := 'EMPLOYEE';
        l_site_rec.invoice_currency_code     := CASE UPPER(p_business_group)
                                                    WHEN 'CA' THEN 'CAD'
                                                    ELSE 'USD' END;
        l_site_rec.payment_currency_code     := l_site_rec.invoice_currency_code;
        l_site_rec.match_option              := 'P';
        l_site_rec.attribute_category        := 'WORKDAY';
        l_site_rec.attribute1                := r.WD_WORKER_ID;

        log_message(G_LVL_DEBUG,'create_supplier_site',
            'Calling AP_VENDOR_PUB_PKG.Create_Vendor_Site vendor_id='||p_vendor_id||
            ' org_id='||p_org_id,
            'SUPPLIER', r.EMPLOYEE_NUMBER);

        AP_VENDOR_PUB_PKG.Create_Vendor_Site
        (
            p_api_version       => 1.0,
            p_init_msg_list     => FND_API.G_TRUE,
            p_commit            => FND_API.G_FALSE,
            p_validation_level  => FND_API.G_VALID_LEVEL_FULL,
            x_return_status     => l_return_status,
            x_msg_count         => l_msg_count,
            x_msg_data          => l_msg_data,
            p_vendor_site_rec   => l_site_rec,
            x_vendor_site_id    => x_vendor_site_id,
            x_party_site_id     => x_party_site_id,
            x_location_id       => l_loc_id
        );

        IF l_return_status <> FND_API.G_RET_STS_SUCCESS THEN
            FOR i IN 1 .. NVL(l_msg_count,0) LOOP
                l_msgs := l_msgs || FND_MSG_PUB.get(p_msg_index => i,
                                                    p_encoded   => FND_API.G_FALSE) || ' | ';
            END LOOP;
            x_msg := SUBSTR('Create_Vendor_Site failed: '||l_msg_data||' :: '||l_msgs,1,4000);
            log_message(G_LVL_ERROR,'create_supplier_site', x_msg,
                'SUPPLIER', r.EMPLOYEE_NUMBER);
            RAISE EX_API_FAILED;
        END IF;

        log_message(G_LVL_INFO,'create_supplier_site',
            'Site created vendor_site_id='||x_vendor_site_id||
            ' party_site_id='||x_party_site_id||
            ' location_id='||l_loc_id,
            'SUPPLIER', r.EMPLOYEE_NUMBER);

        x_msg := 'OK vendor_site_id='||x_vendor_site_id;
    EXCEPTION
        WHEN EX_API_FAILED THEN RAISE;
        WHEN OTHERS THEN
            x_msg := SUBSTR('Unhandled in create_supplier_site: '||SQLERRM,1,4000);
            log_message(G_LVL_ERROR,'create_supplier_site', x_msg,
                'SUPPLIER', NVL(r.EMPLOYEE_NUMBER,TO_CHAR(p_stg_id)), SQLERRM);
            RAISE EX_API_FAILED;
    END create_supplier_site;

    -- =========================================================================
    -- ensure_external_payee
    --   In R12 the IBY_EXTERNAL_PAYEES_ALL row is auto-created by
    --   AP_VENDOR_PUB_PKG.Create_Vendor_Site. This procedure VERIFIES it
    --   exists and, if missing (rare patch-level issue), creates it via
    --   IBY_DISBURSEMENT_SETUP_PUB.Create_External_Payee. It also forces the
    --   default payment method when one is supplied from Workday.
    -- =========================================================================
    PROCEDURE ensure_external_payee
    (
        p_party_id        IN  NUMBER,
        p_vendor_id       IN  NUMBER,
        p_vendor_site_id  IN  NUMBER,
        p_org_id          IN  NUMBER,
        p_payment_method  IN  VARCHAR2,
        x_payee_id        OUT NOCOPY NUMBER,
        x_msg             OUT NOCOPY VARCHAR2
    )
    IS
        l_existing      NUMBER;
        l_payee_rec     IBY_DISBURSEMENT_SETUP_PUB.external_payee_rec_type;
        l_payee_in_tab  IBY_DISBURSEMENT_SETUP_PUB.external_payee_tab_type;
        l_payee_out_tab IBY_DISBURSEMENT_SETUP_PUB.ext_payee_create_tab_type;
        l_return_status VARCHAR2(1);
        l_msg_count     NUMBER;
        l_msg_data      VARCHAR2(4000);
        l_msgs          VARCHAR2(4000);
    BEGIN
        SELECT MAX(ext_payee_id) INTO l_existing
          FROM iby_external_payees_all
         WHERE payee_party_id  = p_party_id
           AND supplier_site_id = p_vendor_site_id
           AND org_id           = p_org_id
           AND org_type         = 'OPERATING_UNIT';

        IF l_existing IS NOT NULL THEN
            x_payee_id := l_existing;

            -- Refresh the default payment method if the source pinned one.
            IF p_payment_method IS NOT NULL THEN
                UPDATE iby_external_payees_all
                   SET default_pmt_method_code = p_payment_method,
                       last_update_date        = SYSDATE,
                       last_updated_by         = g_user_id,
                       last_update_login       = g_login_id
                 WHERE ext_payee_id = l_existing;
            END IF;

            x_msg := 'Existing payee verified ext_payee_id='||l_existing;
            log_message(G_LVL_DEBUG,'ensure_external_payee', x_msg,
                'PAYEE', TO_CHAR(p_vendor_id));
            RETURN;
        END IF;

        log_message(G_LVL_WARN,'ensure_external_payee',
            'No IBY external payee row found - creating explicitly',
            'PAYEE', TO_CHAR(p_vendor_id));

        l_payee_rec.payee_party_id    := p_party_id;
        l_payee_rec.payment_function  := 'EMPLOYEE_EXP';
        l_payee_rec.party_site_id     := NULL;
        l_payee_rec.supplier_site_id  := p_vendor_site_id;
        l_payee_rec.exclusive_pay_flag := 'N';
        l_payee_rec.default_pmt_method := NVL(p_payment_method,'CHECK');
        l_payee_rec.org_id            := p_org_id;
        l_payee_rec.org_type          := 'OPERATING_UNIT';
        l_payee_in_tab(1) := l_payee_rec;

        IBY_DISBURSEMENT_SETUP_PUB.Create_External_Payee
        (
            p_api_version    => 1.0,
            p_init_msg_list  => FND_API.G_TRUE,
            p_ext_payee_tab  => l_payee_in_tab,
            x_ext_payee_id_tab => l_payee_out_tab,
            x_return_status  => l_return_status,
            x_msg_count      => l_msg_count,
            x_msg_data       => l_msg_data
        );

        IF l_return_status <> FND_API.G_RET_STS_SUCCESS THEN
            FOR i IN 1 .. NVL(l_msg_count,0) LOOP
                l_msgs := l_msgs || FND_MSG_PUB.get(p_msg_index => i,
                                                    p_encoded   => FND_API.G_FALSE) || ' | ';
            END LOOP;
            x_msg := SUBSTR('Create_External_Payee failed: '||l_msg_data||' :: '||l_msgs,1,4000);
            log_message(G_LVL_ERROR,'ensure_external_payee', x_msg,
                'PAYEE', TO_CHAR(p_vendor_id));
            RAISE EX_API_FAILED;
        END IF;

        x_payee_id := l_payee_out_tab(1).ext_payee_id;
        x_msg := 'OK ext_payee_id='||x_payee_id;
        log_message(G_LVL_INFO,'ensure_external_payee', x_msg,
            'PAYEE', TO_CHAR(p_vendor_id));
    EXCEPTION
        WHEN EX_API_FAILED THEN RAISE;
        WHEN OTHERS THEN
            x_msg := SUBSTR('Unhandled in ensure_external_payee: '||SQLERRM,1,4000);
            log_message(G_LVL_ERROR,'ensure_external_payee', x_msg,
                'PAYEE', TO_CHAR(p_vendor_id), SQLERRM);
            RAISE EX_API_FAILED;
    END ensure_external_payee;

-- ============================================================================
-- PART 4 OF 5 - END
-- (still inside PACKAGE BODY - part 5 contains expense report import + MAIN)
-- ============================================================================
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
