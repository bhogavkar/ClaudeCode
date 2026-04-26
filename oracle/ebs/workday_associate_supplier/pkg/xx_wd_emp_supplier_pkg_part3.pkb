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
