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
