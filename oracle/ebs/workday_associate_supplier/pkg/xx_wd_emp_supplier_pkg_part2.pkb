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
