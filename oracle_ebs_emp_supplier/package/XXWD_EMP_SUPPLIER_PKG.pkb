CREATE OR REPLACE PACKAGE BODY XXWD_EMP_SUPPLIER_PKG
AS
-- +=====================================================================+
-- |  Package Body : XXWD_EMP_SUPPLIER_PKG                                |
-- |  Description  : Workday -> Oracle EBS R12.2.12 inbound integration   |
-- |                 for Employee Suppliers, Sites, Payees, Banks,        |
-- |                 Branches, Bank Accounts and Payee Instrument         |
-- |                 Assignments.                                         |
-- |                                                                      |
-- |  NOTES                                                               |
-- |  -----                                                               |
-- |  *  Multi-OU is supported via p_org_id - context is set with         |
-- |     MO_GLOBAL.* and FND_GLOBAL.APPS_INITIALIZE.                      |
-- |  *  Each employee record is wrapped in a SAVEPOINT so failures do    |
-- |     not affect other rows.  Processing continues on errors.          |
-- |  *  Validation logic is split into discrete reusable procedures.     |
-- |  *  All API outputs (x_return_status, x_msg_count, x_msg_data) are   |
-- |     captured and routed to XXWD_EMP_SUP_LOG via log_message.         |
-- |  *  Bank account numbers are masked before being logged.             |
-- |  *  Non-ANSI joins are used throughout per coding standards.         |
-- +=====================================================================+

   --========================================================
   -- Private constants
   --========================================================
   gc_pkg_name          CONSTANT VARCHAR2(60) := 'XXWD_EMP_SUPPLIER_PKG';
   gc_supplier_type     CONSTANT VARCHAR2(30) := 'EMPLOYEE';
   gc_api_version       CONSTANT NUMBER       := 1.0;
   gc_yes               CONSTANT VARCHAR2(1)  := 'Y';
   gc_no                CONSTANT VARCHAR2(1)  := 'N';
   gc_fnd_true          CONSTANT VARCHAR2(1)  := FND_API.G_TRUE;
   gc_fnd_false         CONSTANT VARCHAR2(1)  := FND_API.G_FALSE;
   gc_ret_success       CONSTANT VARCHAR2(1)  := FND_API.G_RET_STS_SUCCESS;

   --========================================================
   -- Private types
   --========================================================
   TYPE varchar_tbl_t IS TABLE OF VARCHAR2(4000) INDEX BY PLS_INTEGER;

   --========================================================
   -- Forward declarations
   --========================================================
   PROCEDURE init_context
   ( p_org_id     IN NUMBER
   , p_debug_flag IN VARCHAR2
   );

   PROCEDURE update_header_status
   ( p_row_id        IN NUMBER
   , p_status        IN VARCHAR2
   , p_error_message IN VARCHAR2 DEFAULT NULL
   , p_vendor_id     IN NUMBER   DEFAULT NULL
   , p_vendor_site_id IN NUMBER  DEFAULT NULL
   , p_party_id      IN NUMBER   DEFAULT NULL
   );

   PROCEDURE update_bank_status
   ( p_row_id        IN NUMBER
   , p_status        IN VARCHAR2
   , p_error_message IN VARCHAR2 DEFAULT NULL
   , p_ext_bank_id   IN NUMBER   DEFAULT NULL
   , p_ext_branch_id IN NUMBER   DEFAULT NULL
   , p_ext_acct_id   IN NUMBER   DEFAULT NULL
   , p_payee_id      IN NUMBER   DEFAULT NULL
   , p_instr_id      IN NUMBER   DEFAULT NULL
   );

   FUNCTION get_fnd_messages RETURN VARCHAR2;

   FUNCTION mask_account_number
   ( p_account_number IN VARCHAR2
   ) RETURN VARCHAR2;

   --========================================================
   -- log_message
   --   Centralised logger.  Every module/validation/API call
   --   writes through this routine.  Autonomous transaction
   --   so log rows survive record-level rollbacks.
   --========================================================
   PROCEDURE log_message
   ( p_module          IN VARCHAR2
   , p_step            IN VARCHAR2
   , p_message_type    IN VARCHAR2
   , p_message_text    IN VARCHAR2
   , p_row_id          IN NUMBER   DEFAULT NULL
   , p_bank_row_id     IN NUMBER   DEFAULT NULL
   , p_employee_number IN VARCHAR2 DEFAULT NULL
   , p_sql_code        IN NUMBER   DEFAULT NULL
   , p_sql_errm        IN VARCHAR2 DEFAULT NULL
   , p_backtrace       IN VARCHAR2 DEFAULT NULL
   )
   IS
      PRAGMA AUTONOMOUS_TRANSACTION;
   BEGIN
      -- Skip DEBUG records when debug flag is disabled.
      IF p_message_type = 'DEBUG' AND NVL(g_debug_flag, gc_no) <> gc_yes THEN
         RETURN;
      END IF;

      INSERT INTO XXWD_EMP_SUP_LOG
         ( log_id
         , request_id
         , row_id
         , bank_row_id
         , employee_number
         , org_id
         , module_name
         , step_name
         , message_type
         , message_text
         , sql_code
         , sql_errm
         , error_backtrace
         , creation_date
         , created_by
         )
      VALUES
         ( xxwd_emp_sup_log_s.NEXTVAL
         , g_request_id
         , p_row_id
         , p_bank_row_id
         , p_employee_number
         , g_org_id
         , p_module
         , p_step
         , p_message_type
         , SUBSTR(p_message_text, 1, 4000)
         , p_sql_code
         , SUBSTR(p_sql_errm, 1, 4000)
         , SUBSTR(p_backtrace, 1, 4000)
         , SYSDATE
         , NVL(g_user_id, FND_GLOBAL.user_id)
         );

      COMMIT;

      -- Always echo to concurrent program log
      FND_FILE.put_line(FND_FILE.log
                      , RPAD(NVL(p_module,'-'),18) || ' | ' ||
                        RPAD(NVL(p_step,'-'),30)  || ' | ' ||
                        RPAD(NVL(p_message_type,'-'),6) || ' | ' ||
                        NVL(p_employee_number,'-') || ' | ' ||
                        SUBSTR(p_message_text, 1, 3500));
   EXCEPTION
      WHEN OTHERS THEN
         -- Last-ditch fallback so logger failures do not blow up the run.
         ROLLBACK;
         FND_FILE.put_line(FND_FILE.log,
            'log_message failed: '||SQLERRM||' - original msg: '||p_message_text);
   END log_message;

   --========================================================
   -- mask_account_number
   --   Masks all but the last 4 digits of an account number
   --   before it is written to logs.
   --========================================================
   FUNCTION mask_account_number
   ( p_account_number IN VARCHAR2
   ) RETURN VARCHAR2
   IS
      l_len NUMBER;
   BEGIN
      l_len := NVL(LENGTH(p_account_number), 0);
      IF l_len <= 4 THEN
         RETURN RPAD('*', l_len, '*');
      ELSE
         RETURN LPAD('*', l_len - 4, '*') ||
                SUBSTR(p_account_number, l_len - 3, 4);
      END IF;
   END mask_account_number;

   --========================================================
   -- get_fnd_messages
   --   Drains FND_MSG_PUB into a single concatenated string.
   --========================================================
   FUNCTION get_fnd_messages RETURN VARCHAR2
   IS
      l_count   NUMBER;
      l_msg     VARCHAR2(4000);
      l_buffer  VARCHAR2(4000);
   BEGIN
      l_count := FND_MSG_PUB.count_msg;

      IF l_count = 0 THEN
         RETURN NULL;
      END IF;

      FOR i IN 1 .. l_count LOOP
         l_msg := FND_MSG_PUB.get(p_msg_index => i, p_encoded => FND_API.G_FALSE);
         l_buffer := SUBSTR(l_buffer || ' [' || i || '] ' || l_msg, 1, 4000);
      END LOOP;

      -- Clear the stack so successive API calls don't pick up
      -- stale messages.
      FND_MSG_PUB.delete_msg;

      RETURN l_buffer;
   END get_fnd_messages;

   --========================================================
   -- init_context
   --   Initialises EBS context for the running session.
   --========================================================
   PROCEDURE init_context
   ( p_org_id     IN NUMBER
   , p_debug_flag IN VARCHAR2
   )
   IS
   BEGIN
      g_request_id   := FND_GLOBAL.conc_request_id;
      g_user_id      := FND_GLOBAL.user_id;
      g_resp_id      := FND_GLOBAL.resp_id;
      g_resp_appl_id := FND_GLOBAL.resp_appl_id;
      g_org_id       := p_org_id;
      g_debug_flag   := NVL(p_debug_flag, gc_no);

      -- Apps initialisation (idempotent - safe inside concurrent program)
      FND_GLOBAL.apps_initialize
         ( user_id      => g_user_id
         , resp_id      => g_resp_id
         , resp_appl_id => g_resp_appl_id
         );

      -- Multi-Org context
      MO_GLOBAL.init(p_appl_short_name => 'SQLAP');
      MO_GLOBAL.set_policy_context(p_access_mode => 'S', p_org_id => p_org_id);

      log_message
         ( p_module       => gc_mod_init
         , p_step         => 'init_context'
         , p_message_type => 'INFO'
         , p_message_text => 'Context initialised. request_id='||g_request_id||
                             ', user_id='||g_user_id||
                             ', resp_id='||g_resp_id||
                             ', resp_appl_id='||g_resp_appl_id||
                             ', org_id='||g_org_id||
                             ', debug='||g_debug_flag
         );
   END init_context;

   --========================================================
   -- update_header_status
   --========================================================
   PROCEDURE update_header_status
   ( p_row_id        IN NUMBER
   , p_status        IN VARCHAR2
   , p_error_message IN VARCHAR2 DEFAULT NULL
   , p_vendor_id     IN NUMBER   DEFAULT NULL
   , p_vendor_site_id IN NUMBER  DEFAULT NULL
   , p_party_id      IN NUMBER   DEFAULT NULL
   )
   IS
   BEGIN
      UPDATE XXWD_EMP_SUP_STG
         SET status            = p_status
           , error_message     = SUBSTR(NVL(p_error_message, error_message), 1, 4000)
           , vendor_id         = NVL(p_vendor_id, vendor_id)
           , vendor_site_id    = NVL(p_vendor_site_id, vendor_site_id)
           , party_id          = NVL(p_party_id, party_id)
           , request_id        = NVL(request_id, g_request_id)
           , last_update_date  = SYSDATE
           , last_updated_by   = NVL(g_user_id, FND_GLOBAL.user_id)
           , last_update_login = FND_GLOBAL.login_id
       WHERE row_id = p_row_id;
   END update_header_status;

   --========================================================
   -- update_bank_status
   --========================================================
   PROCEDURE update_bank_status
   ( p_row_id        IN NUMBER
   , p_status        IN VARCHAR2
   , p_error_message IN VARCHAR2 DEFAULT NULL
   , p_ext_bank_id   IN NUMBER   DEFAULT NULL
   , p_ext_branch_id IN NUMBER   DEFAULT NULL
   , p_ext_acct_id   IN NUMBER   DEFAULT NULL
   , p_payee_id      IN NUMBER   DEFAULT NULL
   , p_instr_id      IN NUMBER   DEFAULT NULL
   )
   IS
   BEGIN
      UPDATE XXWD_EMP_BANK_STG
         SET status              = p_status
           , error_message       = SUBSTR(NVL(p_error_message, error_message), 1, 4000)
           , ext_bank_id         = NVL(p_ext_bank_id,   ext_bank_id)
           , ext_branch_id       = NVL(p_ext_branch_id, ext_branch_id)
           , ext_bank_account_id = NVL(p_ext_acct_id,   ext_bank_account_id)
           , payee_id            = NVL(p_payee_id,      payee_id)
           , instr_assignment_id = NVL(p_instr_id,      instr_assignment_id)
           , last_update_date    = SYSDATE
           , last_updated_by     = NVL(g_user_id, FND_GLOBAL.user_id)
           , last_update_login   = FND_GLOBAL.login_id
       WHERE row_id = p_row_id;
   END update_bank_status;

   --========================================================
   -- Validation Procedures
   --
   -- Each validation has a uniform signature so they can be
   -- composed by the orchestrator without special-casing.
   -- All validations populate x_status and x_message.
   --========================================================

   ------------------------------------------------------------
   -- validate_header
   --   Validates header-level attributes:
   --     - employee_number is not null
   --     - mandatory attributes
   --     - duplicate supplier check (by employee_number)
   --     - PARTY_ID existence (HR -> per_all_people_f)
   --     - "Automatic Create Employee as Supplier" profile
   --     - AP_PRODUCT_SETUP.supplier_num_method
   --     - ORG_ID validity
   --     - country/currency
   ------------------------------------------------------------
   PROCEDURE validate_header
   ( p_header   IN  XXWD_EMP_SUP_STG%ROWTYPE
   , x_party_id OUT NUMBER
   , x_status   OUT VARCHAR2
   , x_message  OUT VARCHAR2
   )
   IS
      l_count                NUMBER;
      l_party_id             NUMBER;
      l_auto_emp_supp        VARCHAR2(1);
      l_supplier_num_method  VARCHAR2(30);
      l_ou_count             NUMBER;
      l_curr_count           NUMBER;
      l_country_count        NUMBER;
   BEGIN
      x_status  := gc_ret_success;
      x_message := NULL;
      x_party_id := NULL;

      log_message(gc_mod_validation, 'validate_header', 'DEBUG',
                  'Begin header validation',
                  p_header.row_id, NULL, p_header.employee_number);

      -- 1. employee_number not null
      IF p_header.employee_number IS NULL THEN
         x_status  := 'E';
         x_message := 'Employee Number is mandatory.';
         RETURN;
      END IF;

      -- 2. Mandatory attributes
      IF p_header.last_name IS NULL OR p_header.org_id IS NULL THEN
         x_status  := 'E';
         x_message := 'Mandatory attributes missing (last_name / org_id).';
         RETURN;
      END IF;

      -- 3. Validate ORG_ID
      SELECT COUNT(1)
        INTO l_ou_count
        FROM hr_operating_units hou        -- non-ANSI joins enforced
       WHERE hou.organization_id = p_header.org_id;

      IF l_ou_count = 0 THEN
         x_status  := 'E';
         x_message := 'Invalid ORG_ID: '||p_header.org_id;
         RETURN;
      END IF;

      -- 4. Country validation
      IF p_header.country_code IS NOT NULL THEN
         SELECT COUNT(1)
           INTO l_country_count
           FROM fnd_territories ft
          WHERE ft.territory_code = p_header.country_code;

         IF l_country_count = 0 THEN
            x_status  := 'E';
            x_message := 'Invalid country code: '||p_header.country_code;
            RETURN;
         END IF;
      END IF;

      -- 5. Currency validation
      IF p_header.currency_code IS NOT NULL THEN
         SELECT COUNT(1)
           INTO l_curr_count
           FROM fnd_currencies fc
          WHERE fc.currency_code  = p_header.currency_code
            AND fc.enabled_flag   = 'Y'
            AND NVL(fc.start_date_active, SYSDATE-1) <= SYSDATE
            AND NVL(fc.end_date_active,   SYSDATE+1) >= SYSDATE;

         IF l_curr_count = 0 THEN
            x_status  := 'E';
            x_message := 'Invalid or disabled currency code: '||p_header.currency_code;
            RETURN;
         END IF;
      END IF;

      -- 6. PARTY_ID for the employee from HR
      BEGIN
         SELECT papf.party_id
           INTO l_party_id
           FROM per_all_people_f papf
          WHERE papf.employee_number = p_header.employee_number
            AND TRUNC(SYSDATE) BETWEEN papf.effective_start_date
                                   AND papf.effective_end_date
            AND ROWNUM = 1;
      EXCEPTION
         WHEN NO_DATA_FOUND THEN
            l_party_id := NULL;
      END;

      IF l_party_id IS NULL THEN
         x_status  := 'E';
         x_message := 'PARTY_ID not found in HR for employee_number='||
                      p_header.employee_number;
         RETURN;
      END IF;

      x_party_id := l_party_id;

      -- 7. Profile - "Automatic Create Employee as Supplier"
      l_auto_emp_supp := FND_PROFILE.value('HR_EMPLOYEE_TO_VENDOR');
      log_message(gc_mod_validation, 'validate_header', 'DEBUG',
                  'HR_EMPLOYEE_TO_VENDOR profile='||l_auto_emp_supp,
                  p_header.row_id, NULL, p_header.employee_number);

      -- If profile is enabled the supplier may already exist - we
      -- still proceed but log the condition.

      -- 8. Supplier numbering method
      BEGIN
         SELECT aps.supplier_num_option
           INTO l_supplier_num_method
           FROM ap_product_setup aps
          WHERE ROWNUM = 1;
      EXCEPTION
         WHEN NO_DATA_FOUND THEN
            l_supplier_num_method := NULL;
      END;

      IF l_supplier_num_method IS NULL THEN
         x_status  := 'E';
         x_message := 'Supplier Numbering Method not configured in AP_PRODUCT_SETUP.';
         RETURN;
      END IF;

      log_message(gc_mod_validation, 'validate_header', 'DEBUG',
                  'Supplier numbering method='||l_supplier_num_method,
                  p_header.row_id, NULL, p_header.employee_number);

      -- 9. Duplicate supplier check (by employee_number)
      SELECT COUNT(1)
        INTO l_count
        FROM ap_suppliers aps
       WHERE aps.employee_id IS NOT NULL
         AND aps.segment1 = p_header.employee_number;

      IF l_count > 0 THEN
         x_status  := 'E';
         x_message := 'Supplier already exists for employee_number='||
                      p_header.employee_number;
         RETURN;
      END IF;

      -- 10. Check existing active suppliers via party_id (defensive)
      SELECT COUNT(1)
        INTO l_count
        FROM ap_suppliers aps
       WHERE aps.party_id    = l_party_id
         AND NVL(aps.end_date_active, SYSDATE+1) > SYSDATE;

      IF l_count > 0 THEN
         x_status  := 'E';
         x_message := 'Active supplier already linked to PARTY_ID='||l_party_id;
         RETURN;
      END IF;

      log_message(gc_mod_validation, 'validate_header', 'INFO',
                  'Header validation passed. party_id='||l_party_id,
                  p_header.row_id, NULL, p_header.employee_number);
   EXCEPTION
      WHEN OTHERS THEN
         x_status  := 'E';
         x_message := 'Unhandled exception in validate_header: '||SQLERRM;
         log_message(gc_mod_validation, 'validate_header', 'ERROR',
                     x_message, p_header.row_id, NULL, p_header.employee_number,
                     SQLCODE, SQLERRM, DBMS_UTILITY.format_error_backtrace);
   END validate_header;

   ------------------------------------------------------------
   -- validate_bank_data
   --   Validates bank/branch/account rows for a single
   --   employee.  Sets each bank row's status to VALIDATED
   --   or ERROR.  Header validation must have already passed.
   ------------------------------------------------------------
   PROCEDURE validate_bank_data
   ( p_employee_number IN  VARCHAR2
   , p_parent_row_id   IN  NUMBER
   , x_valid_count     OUT NUMBER
   , x_error_count     OUT NUMBER
   )
   IS
      l_error_msg    VARCHAR2(4000);
      l_dup_count    NUMBER;
      l_country_cnt  NUMBER;
      l_currency_cnt NUMBER;
   BEGIN
      x_valid_count := 0;
      x_error_count := 0;

      FOR r_bank IN
      (
         SELECT *
           FROM xxwd_emp_bank_stg xebs
          WHERE xebs.parent_row_id   = p_parent_row_id
            AND xebs.employee_number = p_employee_number
            AND xebs.status IN (gc_status_new, gc_status_retry)
      )
      LOOP
         l_error_msg := NULL;

         -- Mandatory bank attributes
         IF r_bank.bank_name IS NULL OR r_bank.bank_country_code IS NULL THEN
            l_error_msg := 'Bank name and bank country code are mandatory.';
         END IF;

         -- Mandatory branch attributes
         IF l_error_msg IS NULL THEN
            IF r_bank.branch_name IS NULL AND r_bank.branch_number IS NULL THEN
               l_error_msg := 'Either branch name or branch number is mandatory.';
            END IF;
         END IF;

         -- Mandatory account attributes
         IF l_error_msg IS NULL THEN
            IF r_bank.bank_account_number IS NULL OR r_bank.currency_code IS NULL THEN
               l_error_msg := 'Bank account number and currency are mandatory.';
            END IF;
         END IF;

         -- Country code validity
         IF l_error_msg IS NULL THEN
            SELECT COUNT(1)
              INTO l_country_cnt
              FROM fnd_territories ft
             WHERE ft.territory_code = r_bank.bank_country_code;

            IF l_country_cnt = 0 THEN
               l_error_msg := 'Invalid bank country code: '||r_bank.bank_country_code;
            END IF;
         END IF;

         -- Currency validity
         IF l_error_msg IS NULL THEN
            SELECT COUNT(1)
              INTO l_currency_cnt
              FROM fnd_currencies fc
             WHERE fc.currency_code = r_bank.currency_code
               AND fc.enabled_flag  = 'Y';

            IF l_currency_cnt = 0 THEN
               l_error_msg := 'Invalid bank account currency: '||r_bank.currency_code;
            END IF;
         END IF;

         -- Duplicate account number for the same employee
         IF l_error_msg IS NULL THEN
            SELECT COUNT(1)
              INTO l_dup_count
              FROM iby_ext_bank_accounts ieba
                 , iby_ext_party_pmt_mthds  -- placeholder reference
             WHERE ieba.bank_account_num = r_bank.bank_account_number
               AND ieba.country_code     = r_bank.country_code
               AND ROWNUM <= 1;

            IF l_dup_count > 0 THEN
               l_error_msg := 'Duplicate bank account already exists in IBY: '||
                              mask_account_number(r_bank.bank_account_number);
            END IF;
         END IF;

         -- Result handling
         IF l_error_msg IS NULL THEN
            update_bank_status(r_bank.row_id, gc_status_validated, NULL);
            x_valid_count := x_valid_count + 1;
            log_message(gc_mod_validation, 'validate_bank_data', 'INFO',
                        'Bank row validated. acct='||
                        mask_account_number(r_bank.bank_account_number),
                        p_parent_row_id, r_bank.row_id, p_employee_number);
         ELSE
            update_bank_status(r_bank.row_id, gc_status_error, l_error_msg);
            x_error_count := x_error_count + 1;
            log_message(gc_mod_validation, 'validate_bank_data', 'ERROR',
                        l_error_msg,
                        p_parent_row_id, r_bank.row_id, p_employee_number);
         END IF;
      END LOOP;
   EXCEPTION
      WHEN OTHERS THEN
         log_message(gc_mod_validation, 'validate_bank_data', 'ERROR',
                     'Unhandled exception: '||SQLERRM,
                     p_parent_row_id, NULL, p_employee_number,
                     SQLCODE, SQLERRM, DBMS_UTILITY.format_error_backtrace);
   END validate_bank_data;

   --========================================================
   -- derive_site_attributes
   --   Modular procedure that derives the supplier-site
   --   attributes from the staged header.  Keeping this
   --   isolated allows future enhancements (e.g. lookup-based
   --   mapping) without touching create_supplier_site.
   --========================================================
   PROCEDURE derive_site_attributes
   ( p_header     IN  XXWD_EMP_SUP_STG%ROWTYPE
   , x_site_code  OUT VARCHAR2
   , x_purpose    OUT VARCHAR2
   , x_pay_method OUT VARCHAR2
   )
   IS
   BEGIN
      x_site_code  := NVL(p_header.site_code, 'OFFICE');
      x_purpose    := 'PAY';                          -- Employees: PAY usage
      x_pay_method := NVL(p_header.payment_method_code, 'EFT');

      log_message(gc_mod_site, 'derive_site_attributes', 'DEBUG',
                  'Derived site_code='||x_site_code||
                  ', purpose='||x_purpose||
                  ', pay_method='||x_pay_method,
                  p_header.row_id, NULL, p_header.employee_number);
   END derive_site_attributes;

   --========================================================
   -- create_supplier
   --   Calls AP_VENDOR_PUB_PKG.create_vendor with EMPLOYEE type.
   --========================================================
   PROCEDURE create_supplier
   ( p_header    IN  XXWD_EMP_SUP_STG%ROWTYPE
   , p_party_id  IN  NUMBER
   , x_vendor_id OUT NUMBER
   , x_party_id  OUT NUMBER
   , x_status    OUT VARCHAR2
   , x_message   OUT VARCHAR2
   )
   IS
      l_vendor_rec       AP_VENDOR_PUB_PKG.r_vendor_rec_type;
      l_return_status    VARCHAR2(1);
      l_msg_count        NUMBER;
      l_msg_data         VARCHAR2(4000);
      l_vendor_id        NUMBER;
      l_party_id         NUMBER;
      l_employee_id      NUMBER;
   BEGIN
      x_status  := gc_ret_success;
      x_message := NULL;

      -- Get employee_id (HR person id) - required for EMPLOYEE supplier type
      BEGIN
         SELECT papf.person_id
           INTO l_employee_id
           FROM per_all_people_f papf
          WHERE papf.employee_number = p_header.employee_number
            AND TRUNC(SYSDATE) BETWEEN papf.effective_start_date
                                   AND papf.effective_end_date
            AND ROWNUM = 1;
      EXCEPTION
         WHEN NO_DATA_FOUND THEN
            x_status  := 'E';
            x_message := 'HR person_id not found for employee_number='||
                         p_header.employee_number;
            RETURN;
      END;

      -- Populate vendor record
      l_vendor_rec.vendor_name        := NVL(p_header.employee_name,
                                          TRIM(p_header.first_name||' '||p_header.last_name));
      l_vendor_rec.segment1           := p_header.employee_number;
      l_vendor_rec.vendor_type_lookup_code := gc_supplier_type;
      l_vendor_rec.employee_id        := l_employee_id;
      l_vendor_rec.enabled_flag       := 'Y';
      l_vendor_rec.start_date_active  := TRUNC(SYSDATE);
      l_vendor_rec.email_address      := p_header.email_address;

      -- Reset message stack
      FND_MSG_PUB.initialize;

      log_message(gc_mod_supplier, 'AP_VENDOR_PUB_PKG.create_vendor', 'API',
                  'Calling create_vendor with vendor_name='||l_vendor_rec.vendor_name||
                  ', segment1='||l_vendor_rec.segment1||
                  ', employee_id='||l_employee_id,
                  p_header.row_id, NULL, p_header.employee_number);

      AP_VENDOR_PUB_PKG.create_vendor
         ( p_api_version      => gc_api_version
         , p_init_msg_list    => gc_fnd_true
         , p_commit           => gc_fnd_false
         , p_validation_level => FND_API.G_VALID_LEVEL_FULL
         , x_return_status    => l_return_status
         , x_msg_count        => l_msg_count
         , x_msg_data         => l_msg_data
         , p_vendor_rec       => l_vendor_rec
         , x_vendor_id        => l_vendor_id
         , x_party_id         => l_party_id
         );

      log_message(gc_mod_supplier, 'AP_VENDOR_PUB_PKG.create_vendor', 'API',
                  'return_status='||l_return_status||
                  ', msg_count='||l_msg_count||
                  ', msg_data='||l_msg_data||
                  ', vendor_id='||l_vendor_id||
                  ', party_id='||l_party_id||
                  ', fnd_msgs='||get_fnd_messages,
                  p_header.row_id, NULL, p_header.employee_number);

      IF l_return_status = gc_ret_success AND l_vendor_id IS NOT NULL THEN
         x_vendor_id := l_vendor_id;
         x_party_id  := NVL(l_party_id, p_party_id);
         x_status    := gc_ret_success;
      ELSE
         x_status  := 'E';
         x_message := 'create_vendor failed: '||NVL(l_msg_data, 'unknown');
      END IF;
   EXCEPTION
      WHEN OTHERS THEN
         x_status  := 'E';
         x_message := 'Exception in create_supplier: '||SQLERRM;
         log_message(gc_mod_supplier, 'create_supplier', 'ERROR',
                     x_message, p_header.row_id, NULL, p_header.employee_number,
                     SQLCODE, SQLERRM, DBMS_UTILITY.format_error_backtrace);
   END create_supplier;

   --========================================================
   -- create_supplier_site
   --   Calls AP_VENDOR_PUB_PKG.create_vendor_site.
   --========================================================
   PROCEDURE create_supplier_site
   ( p_header         IN  XXWD_EMP_SUP_STG%ROWTYPE
   , p_vendor_id      IN  NUMBER
   , p_party_id       IN  NUMBER
   , x_vendor_site_id OUT NUMBER
   , x_party_site_id  OUT NUMBER
   , x_status         OUT VARCHAR2
   , x_message        OUT VARCHAR2
   )
   IS
      l_site_rec        AP_VENDOR_PUB_PKG.r_vendor_site_rec_type;
      l_return_status   VARCHAR2(1);
      l_msg_count       NUMBER;
      l_msg_data        VARCHAR2(4000);
      l_vendor_site_id  NUMBER;
      l_party_site_id   NUMBER;
      l_loc_id          NUMBER;
      l_site_code       VARCHAR2(15);
      l_purpose         VARCHAR2(30);
      l_pay_method      VARCHAR2(30);
      l_dup_count       NUMBER;
   BEGIN
      x_status  := gc_ret_success;
      x_message := NULL;

      derive_site_attributes(p_header, l_site_code, l_purpose, l_pay_method);

      -- Duplicate site check
      SELECT COUNT(1)
        INTO l_dup_count
        FROM ap_supplier_sites_all assa
       WHERE assa.vendor_id      = p_vendor_id
         AND assa.org_id         = p_header.org_id
         AND assa.vendor_site_code = l_site_code;

      IF l_dup_count > 0 THEN
         x_status  := 'E';
         x_message := 'Duplicate supplier site already exists: '||l_site_code;
         RETURN;
      END IF;

      l_site_rec.vendor_id        := p_vendor_id;
      l_site_rec.org_id           := p_header.org_id;
      l_site_rec.vendor_site_code := l_site_code;
      l_site_rec.address_line1    := p_header.address_line1;
      l_site_rec.address_line2    := p_header.address_line2;
      l_site_rec.address_line3    := p_header.address_line3;
      l_site_rec.city             := p_header.city;
      l_site_rec.state            := p_header.state;
      l_site_rec.zip              := p_header.postal_code;
      l_site_rec.country          := p_header.country_code;
      l_site_rec.email_address    := p_header.email_address;
      l_site_rec.pay_site_flag    := 'Y';
      l_site_rec.payment_method_lookup_code := l_pay_method;

      FND_MSG_PUB.initialize;

      log_message(gc_mod_site, 'AP_VENDOR_PUB_PKG.create_vendor_site', 'API',
                  'Calling create_vendor_site vendor_id='||p_vendor_id||
                  ', site_code='||l_site_code||
                  ', org_id='||p_header.org_id,
                  p_header.row_id, NULL, p_header.employee_number);

      AP_VENDOR_PUB_PKG.create_vendor_site
         ( p_api_version      => gc_api_version
         , p_init_msg_list    => gc_fnd_true
         , p_commit           => gc_fnd_false
         , p_validation_level => FND_API.G_VALID_LEVEL_FULL
         , x_return_status    => l_return_status
         , x_msg_count        => l_msg_count
         , x_msg_data         => l_msg_data
         , p_vendor_site_rec  => l_site_rec
         , x_vendor_site_id   => l_vendor_site_id
         , x_party_site_id    => l_party_site_id
         , x_location_id      => l_loc_id
         );

      log_message(gc_mod_site, 'AP_VENDOR_PUB_PKG.create_vendor_site', 'API',
                  'return_status='||l_return_status||
                  ', msg_count='||l_msg_count||
                  ', msg_data='||l_msg_data||
                  ', vendor_site_id='||l_vendor_site_id||
                  ', party_site_id='||l_party_site_id||
                  ', fnd_msgs='||get_fnd_messages,
                  p_header.row_id, NULL, p_header.employee_number);

      IF l_return_status = gc_ret_success AND l_vendor_site_id IS NOT NULL THEN
         x_vendor_site_id := l_vendor_site_id;
         x_party_site_id  := l_party_site_id;
      ELSE
         x_status  := 'E';
         x_message := 'create_vendor_site failed: '||NVL(l_msg_data, 'unknown');
      END IF;
   EXCEPTION
      WHEN OTHERS THEN
         x_status  := 'E';
         x_message := 'Exception in create_supplier_site: '||SQLERRM;
         log_message(gc_mod_site, 'create_supplier_site', 'ERROR',
                     x_message, p_header.row_id, NULL, p_header.employee_number,
                     SQLCODE, SQLERRM, DBMS_UTILITY.format_error_backtrace);
   END create_supplier_site;

   --========================================================
   -- create_or_get_payee
   --   Resolves (or registers) the payee within IBY for the
   --   given supplier/site.  Payees in IBY are represented in
   --   IBY_EXTERNAL_PAYEES_ALL.
   --========================================================
   PROCEDURE create_or_get_payee
   ( p_header        IN  XXWD_EMP_SUP_STG%ROWTYPE
   , p_vendor_id     IN  NUMBER
   , p_vendor_site_id IN NUMBER
   , p_party_id      IN  NUMBER
   , x_payee_id      OUT NUMBER
   , x_status        OUT VARCHAR2
   , x_message       OUT VARCHAR2
   )
   IS
      l_payee_id  NUMBER;
   BEGIN
      x_status  := gc_ret_success;
      x_message := NULL;

      -- Validate payee existence based on supplier/site/party
      BEGIN
         SELECT iepa.ext_payee_id
           INTO l_payee_id
           FROM iby_external_payees_all iepa
          WHERE iepa.payee_party_id     = p_party_id
            AND iepa.supplier_site_id   = p_vendor_site_id
            AND iepa.org_id             = p_header.org_id
            AND ROWNUM = 1;
      EXCEPTION
         WHEN NO_DATA_FOUND THEN
            l_payee_id := NULL;
      END;

      IF l_payee_id IS NOT NULL THEN
         x_payee_id := l_payee_id;
         log_message(gc_mod_payee, 'create_or_get_payee', 'INFO',
                     'Existing payee located. payee_id='||l_payee_id,
                     p_header.row_id, NULL, p_header.employee_number);
         RETURN;
      END IF;

      -- If no payee row exists, the supplier/site creation should have
      -- generated one. Refresh from base table after a short pause.
      BEGIN
         SELECT iepa.ext_payee_id
           INTO l_payee_id
           FROM iby_external_payees_all iepa
          WHERE iepa.payee_party_id     = p_party_id
            AND iepa.supplier_site_id   = p_vendor_site_id
            AND ROWNUM = 1;

         x_payee_id := l_payee_id;
         log_message(gc_mod_payee, 'create_or_get_payee', 'INFO',
                     'Payee resolved post site-create. payee_id='||l_payee_id,
                     p_header.row_id, NULL, p_header.employee_number);
      EXCEPTION
         WHEN NO_DATA_FOUND THEN
            x_status  := 'E';
            x_message := 'Payee not found in IBY_EXTERNAL_PAYEES_ALL for '||
                         'party_id='||p_party_id||', site_id='||p_vendor_site_id;
            log_message(gc_mod_payee, 'create_or_get_payee', 'ERROR',
                        x_message, p_header.row_id, NULL, p_header.employee_number);
      END;
   EXCEPTION
      WHEN OTHERS THEN
         x_status  := 'E';
         x_message := 'Exception in create_or_get_payee: '||SQLERRM;
         log_message(gc_mod_payee, 'create_or_get_payee', 'ERROR',
                     x_message, p_header.row_id, NULL, p_header.employee_number,
                     SQLCODE, SQLERRM, DBMS_UTILITY.format_error_backtrace);
   END create_or_get_payee;

   --========================================================
   -- create_bank
   --   Returns the existing or newly created ext_bank_id for
   --   the staged bank_name/country combination.
   --========================================================
   PROCEDURE create_bank
   ( p_bank           IN  XXWD_EMP_BANK_STG%ROWTYPE
   , x_ext_bank_id    OUT NUMBER
   , x_status         OUT VARCHAR2
   , x_message        OUT VARCHAR2
   )
   IS
      l_bank_rec       IBY_EXT_BANKACCT_PUB.ExtBank_rec_type;
      l_return_status  VARCHAR2(1);
      l_msg_count      NUMBER;
      l_msg_data       VARCHAR2(4000);
      l_resp_rec       IBY_FNDCPT_COMMON_PUB.Result_rec_type;
      l_bank_id        NUMBER;
   BEGIN
      x_status  := gc_ret_success;
      x_message := NULL;

      -- Existing-bank lookup
      BEGIN
         SELECT hp.party_id
           INTO l_bank_id
           FROM hz_parties hp
              , hz_organization_profiles hop
          WHERE hp.party_id          = hop.party_id
            AND hp.party_type        = 'ORGANIZATION'
            AND hop.bank_or_branch_number IS NOT NULL
            AND UPPER(hp.party_name) = UPPER(p_bank.bank_name)
            AND TRUNC(SYSDATE) BETWEEN hop.effective_start_date
                                   AND NVL(hop.effective_end_date, SYSDATE+1)
            AND ROWNUM = 1;
      EXCEPTION
         WHEN NO_DATA_FOUND THEN
            l_bank_id := NULL;
      END;

      IF l_bank_id IS NOT NULL THEN
         x_ext_bank_id := l_bank_id;
         log_message(gc_mod_bank, 'create_bank', 'INFO',
                     'Bank already exists. bank_party_id='||l_bank_id,
                     NULL, p_bank.row_id, p_bank.employee_number);
         RETURN;
      END IF;

      l_bank_rec.bank_name          := p_bank.bank_name;
      l_bank_rec.bank_number        := p_bank.bank_number;
      l_bank_rec.country_code       := p_bank.bank_country_code;
      l_bank_rec.institution_type   := 'BANK';

      FND_MSG_PUB.initialize;

      log_message(gc_mod_bank, 'IBY_EXT_BANKACCT_PUB.create_ext_bank', 'API',
                  'Calling create_ext_bank for bank_name='||p_bank.bank_name||
                  ', country='||p_bank.bank_country_code,
                  NULL, p_bank.row_id, p_bank.employee_number);

      IBY_EXT_BANKACCT_PUB.create_ext_bank
         ( p_api_version    => gc_api_version
         , p_init_msg_list  => gc_fnd_true
         , p_ext_bank_rec   => l_bank_rec
         , x_bank_id        => l_bank_id
         , x_return_status  => l_return_status
         , x_msg_count      => l_msg_count
         , x_msg_data       => l_msg_data
         , x_response       => l_resp_rec
         );

      log_message(gc_mod_bank, 'IBY_EXT_BANKACCT_PUB.create_ext_bank', 'API',
                  'return_status='||l_return_status||
                  ', msg_count='||l_msg_count||
                  ', msg_data='||l_msg_data||
                  ', bank_id='||l_bank_id||
                  ', fnd_msgs='||get_fnd_messages,
                  NULL, p_bank.row_id, p_bank.employee_number);

      IF l_return_status = gc_ret_success AND l_bank_id IS NOT NULL THEN
         x_ext_bank_id := l_bank_id;
      ELSE
         x_status  := 'E';
         x_message := 'create_ext_bank failed: '||NVL(l_msg_data, 'unknown');
      END IF;
   EXCEPTION
      WHEN OTHERS THEN
         x_status  := 'E';
         x_message := 'Exception in create_bank: '||SQLERRM;
         log_message(gc_mod_bank, 'create_bank', 'ERROR',
                     x_message, NULL, p_bank.row_id, p_bank.employee_number,
                     SQLCODE, SQLERRM, DBMS_UTILITY.format_error_backtrace);
   END create_bank;

   --========================================================
   -- create_bank_branch
   --========================================================
   PROCEDURE create_bank_branch
   ( p_bank           IN  XXWD_EMP_BANK_STG%ROWTYPE
   , p_ext_bank_id    IN  NUMBER
   , x_ext_branch_id  OUT NUMBER
   , x_status         OUT VARCHAR2
   , x_message        OUT VARCHAR2
   )
   IS
      l_branch_rec     IBY_EXT_BANKACCT_PUB.ExtBankBranch_rec_type;
      l_return_status  VARCHAR2(1);
      l_msg_count      NUMBER;
      l_msg_data       VARCHAR2(4000);
      l_resp_rec       IBY_FNDCPT_COMMON_PUB.Result_rec_type;
      l_branch_id      NUMBER;
   BEGIN
      x_status  := gc_ret_success;
      x_message := NULL;

      -- Existing-branch lookup (under the parent bank)
      BEGIN
         SELECT hp.party_id
           INTO l_branch_id
           FROM hz_parties hp
              , hz_relationships hr
          WHERE hp.party_id       = hr.subject_id
            AND hr.object_id      = p_ext_bank_id
            AND hr.relationship_type = 'BRANCH_OF'
            AND UPPER(hp.party_name) = UPPER(p_bank.branch_name)
            AND ROWNUM = 1;
      EXCEPTION
         WHEN NO_DATA_FOUND THEN
            l_branch_id := NULL;
      END;

      IF l_branch_id IS NOT NULL THEN
         x_ext_branch_id := l_branch_id;
         log_message(gc_mod_branch, 'create_bank_branch', 'INFO',
                     'Branch already exists. branch_id='||l_branch_id,
                     NULL, p_bank.row_id, p_bank.employee_number);
         RETURN;
      END IF;

      l_branch_rec.bank_party_id   := p_ext_bank_id;
      l_branch_rec.branch_name     := p_bank.branch_name;
      l_branch_rec.branch_number   := p_bank.branch_number;
      l_branch_rec.bic             := p_bank.bic_code;
      l_branch_rec.branch_type     := NVL(p_bank.branch_type, 'OTHER');
      l_branch_rec.country_code    := p_bank.bank_country_code;

      FND_MSG_PUB.initialize;

      log_message(gc_mod_branch, 'IBY_EXT_BANKACCT_PUB.create_ext_bank_branch', 'API',
                  'Calling create_ext_bank_branch bank_party_id='||p_ext_bank_id||
                  ', branch_name='||p_bank.branch_name,
                  NULL, p_bank.row_id, p_bank.employee_number);

      IBY_EXT_BANKACCT_PUB.create_ext_bank_branch
         ( p_api_version       => gc_api_version
         , p_init_msg_list     => gc_fnd_true
         , p_ext_bank_branch_rec => l_branch_rec
         , x_branch_id         => l_branch_id
         , x_return_status     => l_return_status
         , x_msg_count         => l_msg_count
         , x_msg_data          => l_msg_data
         , x_response          => l_resp_rec
         );

      log_message(gc_mod_branch, 'IBY_EXT_BANKACCT_PUB.create_ext_bank_branch', 'API',
                  'return_status='||l_return_status||
                  ', msg_count='||l_msg_count||
                  ', msg_data='||l_msg_data||
                  ', branch_id='||l_branch_id||
                  ', fnd_msgs='||get_fnd_messages,
                  NULL, p_bank.row_id, p_bank.employee_number);

      IF l_return_status = gc_ret_success AND l_branch_id IS NOT NULL THEN
         x_ext_branch_id := l_branch_id;
      ELSE
         x_status  := 'E';
         x_message := 'create_ext_bank_branch failed: '||NVL(l_msg_data, 'unknown');
      END IF;
   EXCEPTION
      WHEN OTHERS THEN
         x_status  := 'E';
         x_message := 'Exception in create_bank_branch: '||SQLERRM;
         log_message(gc_mod_branch, 'create_bank_branch', 'ERROR',
                     x_message, NULL, p_bank.row_id, p_bank.employee_number,
                     SQLCODE, SQLERRM, DBMS_UTILITY.format_error_backtrace);
   END create_bank_branch;

   --========================================================
   -- create_bank_account
   --========================================================
   PROCEDURE create_bank_account
   ( p_bank           IN  XXWD_EMP_BANK_STG%ROWTYPE
   , p_ext_bank_id    IN  NUMBER
   , p_ext_branch_id  IN  NUMBER
   , p_party_id       IN  NUMBER
   , x_ext_acct_id    OUT NUMBER
   , x_status         OUT VARCHAR2
   , x_message        OUT VARCHAR2
   )
   IS
      l_acct_rec       IBY_EXT_BANKACCT_PUB.ExtBankAcct_rec_type;
      l_acct_owner_tbl IBY_EXT_BANKACCT_PUB.acctowner_tbl_type;
      l_return_status  VARCHAR2(1);
      l_msg_count      NUMBER;
      l_msg_data       VARCHAR2(4000);
      l_resp_rec       IBY_FNDCPT_COMMON_PUB.Result_rec_type;
      l_acct_id        NUMBER;
      l_dup_count      NUMBER;
   BEGIN
      x_status  := gc_ret_success;
      x_message := NULL;

      -- Duplicate account validation
      SELECT COUNT(1)
        INTO l_dup_count
        FROM iby_ext_bank_accounts ieba
       WHERE ieba.bank_id          = p_ext_bank_id
         AND ieba.branch_id        = p_ext_branch_id
         AND ieba.bank_account_num = p_bank.bank_account_number;

      IF l_dup_count > 0 THEN
         BEGIN
            SELECT ieba.ext_bank_account_id
              INTO l_acct_id
              FROM iby_ext_bank_accounts ieba
             WHERE ieba.bank_id          = p_ext_bank_id
               AND ieba.branch_id        = p_ext_branch_id
               AND ieba.bank_account_num = p_bank.bank_account_number
               AND ROWNUM = 1;

            x_ext_acct_id := l_acct_id;
            log_message(gc_mod_account, 'create_bank_account', 'INFO',
                        'Bank account already exists. acct_id='||l_acct_id||
                        ', acct='||mask_account_number(p_bank.bank_account_number),
                        NULL, p_bank.row_id, p_bank.employee_number);
         EXCEPTION
            WHEN OTHERS THEN
               x_status  := 'E';
               x_message := 'Duplicate account but could not retrieve id: '||SQLERRM;
         END;
         RETURN;
      END IF;

      l_acct_rec.country_code       := p_bank.country_code;
      l_acct_rec.bank_id            := p_ext_bank_id;
      l_acct_rec.branch_id          := p_ext_branch_id;
      l_acct_rec.acct_owner_party_id := p_party_id;
      l_acct_rec.bank_account_name  := p_bank.bank_account_name;
      l_acct_rec.bank_account_num   := p_bank.bank_account_number;
      l_acct_rec.currency           := p_bank.currency_code;
      l_acct_rec.iban               := p_bank.iban_number;
      l_acct_rec.acct_type          := p_bank.bank_account_type;
      l_acct_rec.start_date         := NVL(p_bank.start_date, TRUNC(SYSDATE));
      l_acct_rec.end_date           := p_bank.end_date;
      l_acct_rec.foreign_payment_use_flag := 'N';

      l_acct_owner_tbl(1).acct_owner_party_id := p_party_id;
      l_acct_owner_tbl(1).primary_flag        := 'Y';

      FND_MSG_PUB.initialize;

      log_message(gc_mod_account, 'IBY_EXT_BANKACCT_PUB.create_ext_bank_acct', 'API',
                  'Calling create_ext_bank_acct party_id='||p_party_id||
                  ', bank_id='||p_ext_bank_id||
                  ', branch_id='||p_ext_branch_id||
                  ', acct='||mask_account_number(p_bank.bank_account_number),
                  NULL, p_bank.row_id, p_bank.employee_number);

      IBY_EXT_BANKACCT_PUB.create_ext_bank_acct
         ( p_api_version       => gc_api_version
         , p_init_msg_list     => gc_fnd_true
         , p_ext_bank_acct_rec => l_acct_rec
         , p_acct_owner_list   => l_acct_owner_tbl
         , x_acct_id           => l_acct_id
         , x_return_status     => l_return_status
         , x_msg_count         => l_msg_count
         , x_msg_data          => l_msg_data
         , x_response          => l_resp_rec
         );

      log_message(gc_mod_account, 'IBY_EXT_BANKACCT_PUB.create_ext_bank_acct', 'API',
                  'return_status='||l_return_status||
                  ', msg_count='||l_msg_count||
                  ', msg_data='||l_msg_data||
                  ', acct_id='||l_acct_id||
                  ', fnd_msgs='||get_fnd_messages,
                  NULL, p_bank.row_id, p_bank.employee_number);

      IF l_return_status = gc_ret_success AND l_acct_id IS NOT NULL THEN
         x_ext_acct_id := l_acct_id;
      ELSE
         x_status  := 'E';
         x_message := 'create_ext_bank_acct failed: '||NVL(l_msg_data, 'unknown');
      END IF;
   EXCEPTION
      WHEN OTHERS THEN
         x_status  := 'E';
         x_message := 'Exception in create_bank_account: '||SQLERRM;
         log_message(gc_mod_account, 'create_bank_account', 'ERROR',
                     x_message, NULL, p_bank.row_id, p_bank.employee_number,
                     SQLCODE, SQLERRM, DBMS_UTILITY.format_error_backtrace);
   END create_bank_account;

   --========================================================
   -- assign_payee_instrument
   --   Wires the bank account to the payee using
   --   IBY_DISBURSEMENT_SETUP_PUB.set_payee_instr_assignment.
   --========================================================
   PROCEDURE assign_payee_instrument
   ( p_header         IN  XXWD_EMP_SUP_STG%ROWTYPE
   , p_bank           IN  XXWD_EMP_BANK_STG%ROWTYPE
   , p_payee_id       IN  NUMBER
   , p_ext_acct_id    IN  NUMBER
   , p_vendor_id      IN  NUMBER
   , p_vendor_site_id IN  NUMBER
   , p_party_id       IN  NUMBER
   , x_assignment_id  OUT NUMBER
   , x_status         OUT VARCHAR2
   , x_message        OUT VARCHAR2
   )
   IS
      l_assignment_rec  IBY_FNDCPT_SETUP_PUB.PmtInstrAssignment_rec_type;
      l_payee_rec       IBY_DISBURSEMENT_SETUP_PUB.External_Payee_Tab_Type;
      l_payee_id_rec    IBY_DISBURSEMENT_SETUP_PUB.External_Payee_ID_Tab_Type;
      l_return_status   VARCHAR2(1);
      l_msg_count       NUMBER;
      l_msg_data        VARCHAR2(4000);
      l_resp_rec        IBY_FNDCPT_COMMON_PUB.Result_rec_type;
      l_assignment_id   NUMBER;
      l_dup_count       NUMBER;
   BEGIN
      x_status  := gc_ret_success;
      x_message := NULL;

      -- Validate payee existence
      IF p_payee_id IS NULL THEN
         x_status  := 'E';
         x_message := 'Payee id missing - cannot assign instrument.';
         RETURN;
      END IF;

      -- Validate instrument existence
      IF p_ext_acct_id IS NULL THEN
         x_status  := 'E';
         x_message := 'External bank account id missing - cannot assign instrument.';
         RETURN;
      END IF;

      -- Duplicate assignment check
      SELECT COUNT(1)
        INTO l_dup_count
        FROM iby_pmt_instr_uses_all ipiu
       WHERE ipiu.ext_pmt_party_id   = p_payee_id
         AND ipiu.instrument_id      = p_ext_acct_id
         AND ipiu.instrument_type    = 'BANKACCOUNT'
         AND NVL(ipiu.end_date, SYSDATE+1) > SYSDATE;

      IF l_dup_count > 0 THEN
         log_message(gc_mod_instrument, 'assign_payee_instrument', 'INFO',
                     'Payee instrument assignment already active. Skipping.',
                     p_header.row_id, p_bank.row_id, p_header.employee_number);
         RETURN;
      END IF;

      l_assignment_rec.payment_flow         := 'DISBURSEMENTS';
      l_assignment_rec.payer_party_id       := NULL;
      l_assignment_rec.payee_party_id       := p_party_id;
      l_assignment_rec.supplier_site_id     := p_vendor_site_id;
      l_assignment_rec.org_id               := p_header.org_id;
      l_assignment_rec.org_type             := 'OPERATING_UNIT';
      l_assignment_rec.instrument.instrument_type := 'BANKACCOUNT';
      l_assignment_rec.instrument.instrument_id   := p_ext_acct_id;
      l_assignment_rec.start_date           := TRUNC(SYSDATE);
      l_assignment_rec.priority             := 1;

      FND_MSG_PUB.initialize;

      log_message(gc_mod_instrument,
                  'IBY_DISBURSEMENT_SETUP_PUB.set_payee_instr_assignment',
                  'API',
                  'Calling set_payee_instr_assignment payee_party_id='||p_party_id||
                  ', site_id='||p_vendor_site_id||
                  ', acct_id='||p_ext_acct_id,
                  p_header.row_id, p_bank.row_id, p_header.employee_number);

      IBY_DISBURSEMENT_SETUP_PUB.set_payee_instr_assignment
         ( p_api_version      => gc_api_version
         , p_init_msg_list    => gc_fnd_true
         , p_commit           => gc_fnd_false
         , p_assignment_attribs => l_assignment_rec
         , x_assign_id        => l_assignment_id
         , x_return_status    => l_return_status
         , x_msg_count        => l_msg_count
         , x_msg_data         => l_msg_data
         , x_response         => l_resp_rec
         );

      log_message(gc_mod_instrument,
                  'IBY_DISBURSEMENT_SETUP_PUB.set_payee_instr_assignment',
                  'API',
                  'return_status='||l_return_status||
                  ', msg_count='||l_msg_count||
                  ', msg_data='||l_msg_data||
                  ', assignment_id='||l_assignment_id||
                  ', fnd_msgs='||get_fnd_messages,
                  p_header.row_id, p_bank.row_id, p_header.employee_number);

      IF l_return_status = gc_ret_success AND l_assignment_id IS NOT NULL THEN
         x_assignment_id := l_assignment_id;
      ELSE
         x_status  := 'E';
         x_message := 'set_payee_instr_assignment failed: '||NVL(l_msg_data, 'unknown');
      END IF;
   EXCEPTION
      WHEN OTHERS THEN
         x_status  := 'E';
         x_message := 'Exception in assign_payee_instrument: '||SQLERRM;
         log_message(gc_mod_instrument, 'assign_payee_instrument', 'ERROR',
                     x_message, p_header.row_id, p_bank.row_id,
                     p_header.employee_number,
                     SQLCODE, SQLERRM, DBMS_UTILITY.format_error_backtrace);
   END assign_payee_instrument;

   --========================================================
   -- process_bank_block
   --   Iterates the bank rows for a single employee and runs
   --   Bank -> Branch -> Account -> Instrument-assignment.
   --   Each bank row is wrapped in a sub-savepoint so a bad
   --   account does not affect sibling rows.
   --========================================================
   PROCEDURE process_bank_block
   ( p_header         IN XXWD_EMP_SUP_STG%ROWTYPE
   , p_vendor_id      IN NUMBER
   , p_vendor_site_id IN NUMBER
   , p_party_id       IN NUMBER
   , p_payee_id       IN NUMBER
   )
   IS
      l_status         VARCHAR2(1);
      l_message        VARCHAR2(4000);
      l_ext_bank_id    NUMBER;
      l_ext_branch_id  NUMBER;
      l_ext_acct_id    NUMBER;
      l_assignment_id  NUMBER;
   BEGIN
      FOR r_bank IN
      (
         SELECT *
           FROM xxwd_emp_bank_stg xebs
          WHERE xebs.parent_row_id = p_header.row_id
            AND xebs.status        = gc_status_validated
      )
      LOOP
         SAVEPOINT sp_bank_row;

         BEGIN
            -- Bank
            create_bank(r_bank, l_ext_bank_id, l_status, l_message);
            IF l_status <> gc_ret_success THEN
               RAISE_APPLICATION_ERROR(-20001, 'Bank: '||l_message);
            END IF;

            -- Branch
            create_bank_branch(r_bank, l_ext_bank_id,
                               l_ext_branch_id, l_status, l_message);
            IF l_status <> gc_ret_success THEN
               RAISE_APPLICATION_ERROR(-20002, 'Branch: '||l_message);
            END IF;

            -- Account
            create_bank_account(r_bank, l_ext_bank_id, l_ext_branch_id,
                                p_party_id, l_ext_acct_id, l_status, l_message);
            IF l_status <> gc_ret_success THEN
               RAISE_APPLICATION_ERROR(-20003, 'Account: '||l_message);
            END IF;

            -- Payee instrument assignment
            assign_payee_instrument(p_header, r_bank, p_payee_id, l_ext_acct_id,
                                    p_vendor_id, p_vendor_site_id, p_party_id,
                                    l_assignment_id, l_status, l_message);
            IF l_status <> gc_ret_success THEN
               RAISE_APPLICATION_ERROR(-20004, 'Instrument: '||l_message);
            END IF;

            update_bank_status
               ( p_row_id        => r_bank.row_id
               , p_status        => gc_status_success
               , p_error_message => NULL
               , p_ext_bank_id   => l_ext_bank_id
               , p_ext_branch_id => l_ext_branch_id
               , p_ext_acct_id   => l_ext_acct_id
               , p_payee_id      => p_payee_id
               , p_instr_id      => l_assignment_id
               );
         EXCEPTION
            WHEN OTHERS THEN
               ROLLBACK TO sp_bank_row;
               update_bank_status
                  ( p_row_id        => r_bank.row_id
                  , p_status        => gc_status_error
                  , p_error_message => 'Bank block failed: '||SQLERRM
                  );
               log_message(gc_mod_account, 'process_bank_block', 'ERROR',
                           'Bank block failed for acct='||
                           mask_account_number(r_bank.bank_account_number)||
                           ' - '||SQLERRM,
                           p_header.row_id, r_bank.row_id,
                           p_header.employee_number,
                           SQLCODE, SQLERRM,
                           DBMS_UTILITY.format_error_backtrace);
         END;
      END LOOP;
   END process_bank_block;

   --========================================================
   -- process_employee
   --   Orchestrates the full lifecycle for ONE employee row.
   --   Wrapped in a SAVEPOINT.  Returns nothing - any failure
   --   simply marks the row as ERROR and continues.
   --========================================================
   PROCEDURE process_employee
   ( p_row_id IN NUMBER
   )
   IS
      l_header         XXWD_EMP_SUP_STG%ROWTYPE;
      l_status         VARCHAR2(1);
      l_message        VARCHAR2(4000);
      l_party_id       NUMBER;
      l_vendor_id      NUMBER;
      l_vendor_site_id NUMBER;
      l_party_site_id  NUMBER;
      l_payee_id       NUMBER;
      l_valid_banks    NUMBER;
      l_error_banks    NUMBER;
   BEGIN
      SAVEPOINT sp_emp_row;

      -- Lock the row to prevent concurrent processing
      SELECT *
        INTO l_header
        FROM xxwd_emp_sup_stg xess
       WHERE xess.row_id = p_row_id
         FOR UPDATE NOWAIT;

      update_header_status(p_row_id, gc_status_processing);

      -- 1. Validate header
      validate_header(l_header, l_party_id, l_status, l_message);
      IF l_status <> gc_ret_success THEN
         update_header_status(p_row_id, gc_status_error, l_message);
         RETURN;
      END IF;

      -- 2. Validate bank data
      validate_bank_data(l_header.employee_number, l_header.row_id,
                         l_valid_banks, l_error_banks);
      log_message(gc_mod_validation, 'process_employee', 'INFO',
                  'Bank rows validated. valid='||l_valid_banks||
                  ', error='||l_error_banks,
                  l_header.row_id, NULL, l_header.employee_number);

      -- Mark header as VALIDATED so support can spot where we are
      update_header_status(p_row_id, gc_status_validated);

      -- 3. Create supplier
      create_supplier(l_header, l_party_id, l_vendor_id, l_party_id,
                      l_status, l_message);
      IF l_status <> gc_ret_success THEN
         ROLLBACK TO sp_emp_row;
         update_header_status(p_row_id, gc_status_error, l_message);
         RETURN;
      END IF;

      -- 4. Create supplier site
      create_supplier_site(l_header, l_vendor_id, l_party_id,
                           l_vendor_site_id, l_party_site_id,
                           l_status, l_message);
      IF l_status <> gc_ret_success THEN
         ROLLBACK TO sp_emp_row;
         update_header_status(p_row_id, gc_status_error, l_message);
         RETURN;
      END IF;

      -- 5. Resolve / create payee
      create_or_get_payee(l_header, l_vendor_id, l_vendor_site_id, l_party_id,
                          l_payee_id, l_status, l_message);
      IF l_status <> gc_ret_success THEN
         ROLLBACK TO sp_emp_row;
         update_header_status(p_row_id, gc_status_error, l_message);
         RETURN;
      END IF;

      -- 6. Process all bank blocks
      IF l_valid_banks > 0 THEN
         process_bank_block(l_header, l_vendor_id, l_vendor_site_id,
                            l_party_id, l_payee_id);
      ELSE
         log_message(gc_mod_validation, 'process_employee', 'WARN',
                     'No valid bank rows to process - supplier/site only.',
                     l_header.row_id, NULL, l_header.employee_number);
      END IF;

      -- 7. Finalise header status
      update_header_status
         ( p_row_id        => p_row_id
         , p_status        => gc_status_success
         , p_error_message => NULL
         , p_vendor_id     => l_vendor_id
         , p_vendor_site_id => l_vendor_site_id
         , p_party_id      => l_party_id
         );

      log_message(gc_mod_supplier, 'process_employee', 'INFO',
                  'Employee processed successfully. vendor_id='||l_vendor_id||
                  ', site_id='||l_vendor_site_id,
                  l_header.row_id, NULL, l_header.employee_number);

      COMMIT;
   EXCEPTION
      WHEN OTHERS THEN
         ROLLBACK TO sp_emp_row;
         update_header_status
            ( p_row_id        => p_row_id
            , p_status        => gc_status_error
            , p_error_message => 'process_employee exception: '||SQLERRM
            );
         log_message(gc_mod_supplier, 'process_employee', 'ERROR',
                     'Unhandled exception in process_employee.',
                     p_row_id, NULL, l_header.employee_number,
                     SQLCODE, SQLERRM, DBMS_UTILITY.format_error_backtrace);
         COMMIT;
   END process_employee;

   --========================================================
   -- print_summary_report
   --   Successful records first, then ERROR records.
   --   Output is sent to the concurrent program OUTPUT file.
   --========================================================
   PROCEDURE print_summary_report
   ( p_request_id IN NUMBER
   )
   IS
      l_success_cnt NUMBER := 0;
      l_error_cnt   NUMBER := 0;
      l_total_cnt   NUMBER := 0;
   BEGIN
      FND_FILE.put_line(FND_FILE.output, RPAD('=', 130, '='));
      FND_FILE.put_line(FND_FILE.output,
         '           WORKDAY -> ORACLE EBS  EMPLOYEE SUPPLIER INTEGRATION SUMMARY');
      FND_FILE.put_line(FND_FILE.output,
         '           Request Id : '||p_request_id||'      Run Date : '||
         TO_CHAR(SYSDATE,'DD-MON-YYYY HH24:MI:SS'));
      FND_FILE.put_line(FND_FILE.output, RPAD('=', 130, '='));
      FND_FILE.put_line(FND_FILE.output, ' ');

      --------------------------------------------------------
      -- SECTION 1 : SUCCESSFUL RECORDS
      --------------------------------------------------------
      FND_FILE.put_line(FND_FILE.output, RPAD('-', 130, '-'));
      FND_FILE.put_line(FND_FILE.output, ' SUCCESSFUL RECORDS');
      FND_FILE.put_line(FND_FILE.output, RPAD('-', 130, '-'));
      FND_FILE.put_line(FND_FILE.output,
         RPAD('Emp Number',15)||' | '||
         RPAD('Employee Name',40)||' | '||
         RPAD('Vendor Id',12)||' | '||
         RPAD('Site Id',12)||' | '||
         RPAD('Party Id',12));
      FND_FILE.put_line(FND_FILE.output, RPAD('-', 130, '-'));

      FOR r IN
      (
         SELECT xess.employee_number, xess.employee_name
              , xess.vendor_id, xess.vendor_site_id, xess.party_id
           FROM xxwd_emp_sup_stg xess
          WHERE xess.request_id = p_request_id
            AND xess.status     = gc_status_success
          ORDER BY xess.employee_number
      )
      LOOP
         FND_FILE.put_line(FND_FILE.output,
            RPAD(NVL(r.employee_number,' '),15)||' | '||
            RPAD(SUBSTR(NVL(r.employee_name,' '),1,40),40)||' | '||
            RPAD(NVL(TO_CHAR(r.vendor_id),' '),12)||' | '||
            RPAD(NVL(TO_CHAR(r.vendor_site_id),' '),12)||' | '||
            RPAD(NVL(TO_CHAR(r.party_id),' '),12));
         l_success_cnt := l_success_cnt + 1;
      END LOOP;

      IF l_success_cnt = 0 THEN
         FND_FILE.put_line(FND_FILE.output, ' (no successful records)');
      END IF;
      FND_FILE.put_line(FND_FILE.output, ' ');

      --------------------------------------------------------
      -- SECTION 2 : ERROR RECORDS
      --------------------------------------------------------
      FND_FILE.put_line(FND_FILE.output, RPAD('-', 130, '-'));
      FND_FILE.put_line(FND_FILE.output, ' ERROR RECORDS');
      FND_FILE.put_line(FND_FILE.output, RPAD('-', 130, '-'));
      FND_FILE.put_line(FND_FILE.output,
         RPAD('Emp Number',15)||' | '||
         RPAD('Employee Name',40)||' | '||
         RPAD('Status',12)||' | '||
         'Error Message');
      FND_FILE.put_line(FND_FILE.output, RPAD('-', 130, '-'));

      FOR r IN
      (
         SELECT xess.employee_number, xess.employee_name
              , xess.status, xess.error_message
           FROM xxwd_emp_sup_stg xess
          WHERE xess.request_id = p_request_id
            AND xess.status     = gc_status_error
          ORDER BY xess.employee_number
      )
      LOOP
         FND_FILE.put_line(FND_FILE.output,
            RPAD(NVL(r.employee_number,' '),15)||' | '||
            RPAD(SUBSTR(NVL(r.employee_name,' '),1,40),40)||' | '||
            RPAD(NVL(r.status,' '),12)||' | '||
            SUBSTR(NVL(r.error_message,' '), 1, 800));
         l_error_cnt := l_error_cnt + 1;
      END LOOP;

      IF l_error_cnt = 0 THEN
         FND_FILE.put_line(FND_FILE.output, ' (no error records)');
      END IF;

      l_total_cnt := l_success_cnt + l_error_cnt;

      FND_FILE.put_line(FND_FILE.output, ' ');
      FND_FILE.put_line(FND_FILE.output, RPAD('=', 130, '='));
      FND_FILE.put_line(FND_FILE.output,
         ' TOTAL PROCESSED : '||l_total_cnt||
         '     SUCCESS : '||l_success_cnt||
         '     ERROR   : '||l_error_cnt);
      FND_FILE.put_line(FND_FILE.output, RPAD('=', 130, '='));
   EXCEPTION
      WHEN OTHERS THEN
         FND_FILE.put_line(FND_FILE.output,
            'print_summary_report exception: '||SQLERRM);
   END print_summary_report;

   --========================================================
   -- main
   --   Concurrent program entry point.
   --========================================================
   PROCEDURE main
   ( p_errbuf            OUT VARCHAR2
   , p_retcode           OUT VARCHAR2
   , p_org_id            IN  NUMBER
   , p_batch_id          IN  NUMBER   DEFAULT NULL
   , p_employee_number   IN  VARCHAR2 DEFAULT NULL
   , p_debug_flag        IN  VARCHAR2 DEFAULT 'N'
   , p_reprocess_errors  IN  VARCHAR2 DEFAULT 'N'
   )
   IS
      l_processed_count NUMBER := 0;
      l_success_count   NUMBER := 0;
      l_error_count     NUMBER := 0;
   BEGIN
      p_errbuf  := NULL;
      p_retcode := '0';

      -- 1. Initialise context
      init_context(p_org_id, p_debug_flag);

      log_message(gc_mod_init, 'main', 'INFO',
                  'Run parameters - org_id='||p_org_id||
                  ', batch_id='||p_batch_id||
                  ', employee_number='||p_employee_number||
                  ', debug='||p_debug_flag||
                  ', reprocess_errors='||p_reprocess_errors);

      -- 2. Loop over eligible staging rows
      FOR r_stg IN
      (
         SELECT xess.row_id, xess.employee_number
           FROM xxwd_emp_sup_stg xess
          WHERE xess.org_id = p_org_id
            AND (   xess.status = gc_status_new
                 OR (xess.status = gc_status_retry)
                 OR (p_reprocess_errors = gc_yes AND xess.status = gc_status_error)
                )
            AND (p_batch_id        IS NULL OR xess.batch_id        = p_batch_id)
            AND (p_employee_number IS NULL OR xess.employee_number = p_employee_number)
          ORDER BY xess.batch_id, xess.row_id
      )
      LOOP
         BEGIN
            process_employee(r_stg.row_id);
            l_processed_count := l_processed_count + 1;
         EXCEPTION
            WHEN OTHERS THEN
               -- process_employee already handles its own exceptions;
               -- this is a final safety net so the loop keeps running.
               log_message(gc_mod_supplier, 'main', 'ERROR',
                           'Top-level exception while processing row_id='||
                           r_stg.row_id||' - '||SQLERRM,
                           r_stg.row_id, NULL, r_stg.employee_number,
                           SQLCODE, SQLERRM,
                           DBMS_UTILITY.format_error_backtrace);
         END;
      END LOOP;

      -- 3. Tallies for retcode determination
      SELECT COUNT(CASE WHEN xess.status = gc_status_success THEN 1 END)
           , COUNT(CASE WHEN xess.status = gc_status_error   THEN 1 END)
        INTO l_success_count, l_error_count
        FROM xxwd_emp_sup_stg xess
       WHERE xess.request_id = g_request_id;

      -- 4. Reporting
      print_summary_report(g_request_id);

      -- 5. Determine concurrent return code
      IF l_error_count = 0 AND l_processed_count > 0 THEN
         p_retcode := '0';                                -- Success
      ELSIF l_error_count > 0 AND l_success_count > 0 THEN
         p_retcode := '1';                                -- Warning
         p_errbuf  := 'Completed with errors: '||l_error_count||' failures.';
      ELSIF l_error_count > 0 AND l_success_count = 0 THEN
         p_retcode := '2';                                -- Error
         p_errbuf  := 'All records failed: '||l_error_count||' failures.';
      ELSE
         p_retcode := '0';
         p_errbuf  := 'No records to process.';
      END IF;

      log_message(gc_mod_report, 'main', 'INFO',
                  'Run complete. processed='||l_processed_count||
                  ', success='||l_success_count||
                  ', error='||l_error_count||
                  ', retcode='||p_retcode);
   EXCEPTION
      WHEN OTHERS THEN
         p_retcode := '2';
         p_errbuf  := 'Fatal exception in main: '||SQLERRM;
         log_message(gc_mod_init, 'main', 'ERROR',
                     p_errbuf, NULL, NULL, NULL,
                     SQLCODE, SQLERRM, DBMS_UTILITY.format_error_backtrace);
         BEGIN
            print_summary_report(g_request_id);
         EXCEPTION
            WHEN OTHERS THEN NULL;
         END;
   END main;

END XXWD_EMP_SUPPLIER_PKG;
/
SHOW ERRORS PACKAGE BODY XXWD_EMP_SUPPLIER_PKG;
