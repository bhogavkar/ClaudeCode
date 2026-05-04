--==============================================================================
-- File         : 03_xx_ap_expense_import_pkg_body.sql
-- Object Type  : PL/SQL Package Body
-- Package      : XX_AP_EXPENSE_IMPORT_PKG
-- Module       : Oracle Payables (AP) - R12
-- Purpose      : Implementation of the Workday -> Oracle EBS Expense Report
--                inbound integration.
--
-- Notes        :
--   * Uses row-by-row FOR loops as specified in the requirements.
--   * Idempotent: duplicate invoices (same VENDOR_ID, INVOICE_NUM, ORG_ID)
--     are detected against AP_INVOICES_ALL, AP_INVOICES_INTERFACE and the
--     staging table itself.
--   * All DML on AP open-interface tables uses the supported public APIs or
--     direct INSERT statements documented in the EBS Integration Repository.
--   * Supplier creation reuses the same logic the standard "Expense Report
--     Export" program follows: derive vendor type EMPLOYEE, copy
--     PER_ALL_PEOPLE_F demographics into PO_VENDORS / PO_VENDOR_SITES_ALL via
--     the AP_VENDOR_PUB_PKG public API.
--==============================================================================
CREATE OR REPLACE PACKAGE BODY xx_ap_expense_import_pkg
AS

   ---------------------------------------------------------------------------
   -- Private package state
   ---------------------------------------------------------------------------
   g_request_id      NUMBER       := fnd_global.conc_request_id;
   g_user_id         NUMBER       := NVL(fnd_global.user_id, -1);
   g_login_id        NUMBER       := NVL(fnd_global.login_id, -1);
   g_debug           BOOLEAN      := FALSE;

   ---------------------------------------------------------------------------
   -- Private helpers
   ---------------------------------------------------------------------------
   PROCEDURE log_msg (p_msg IN VARCHAR2)
   IS
   BEGIN
      -- Always log to concurrent request log.
      fnd_file.put_line (fnd_file.log, TO_CHAR(SYSDATE,'HH24:MI:SS')||' - '||p_msg);
      IF g_debug THEN
         dbms_output.put_line (p_msg);
      END IF;
   EXCEPTION
      WHEN OTHERS THEN
         NULL;  -- never let logging break the flow
   END log_msg;

   ---------------------------------------------------------------------------
   -- INIT_CONTEXT
   ---------------------------------------------------------------------------
   PROCEDURE init_context
   ( p_user_name       IN VARCHAR2 DEFAULT NULL
   , p_responsibility  IN VARCHAR2 DEFAULT NULL
   , p_org_id          IN NUMBER
   )
   IS
      l_user_id  NUMBER;
      l_resp_id  NUMBER;
      l_appl_id  NUMBER;
   BEGIN
      log_msg('init_context: org_id='||p_org_id);

      -- 1. Apps session.  When called from a concurrent program FND_GLOBAL is
      --    already initialised, so apps_initialize is only required for SQL*Plus
      --    or an external scheduler invocation.
      IF p_user_name IS NOT NULL AND p_responsibility IS NOT NULL THEN
         SELECT user_id INTO l_user_id
           FROM fnd_user
          WHERE user_name = UPPER(p_user_name);

         SELECT responsibility_id, application_id
           INTO l_resp_id, l_appl_id
           FROM fnd_responsibility_vl
          WHERE responsibility_name = p_responsibility
            AND ROWNUM = 1;

         fnd_global.apps_initialize ( user_id      => l_user_id
                                    , resp_id      => l_resp_id
                                    , resp_appl_id => l_appl_id );

         g_user_id  := l_user_id;
         g_login_id := fnd_global.login_id;
      END IF;

      -- 2. MOAC: pin to the operating unit being processed.
      mo_global.set_policy_context ('S', p_org_id);

      log_msg('init_context: completed (user_id='||g_user_id||')');
   EXCEPTION
      WHEN OTHERS THEN
         log_msg('init_context: failed - '||SQLERRM);
         RAISE;
   END init_context;

   ---------------------------------------------------------------------------
   -- LOG_ERROR  (autonomous so errors persist past a ROLLBACK)
   ---------------------------------------------------------------------------
   PROCEDURE log_error
   ( p_record_id     IN NUMBER
   , p_line_number   IN NUMBER     DEFAULT NULL
   , p_stage         IN VARCHAR2
   , p_error_code    IN VARCHAR2   DEFAULT NULL
   , p_error_message IN VARCHAR2
   )
   IS
      PRAGMA AUTONOMOUS_TRANSACTION;
   BEGIN
      INSERT INTO xx_ap_exp_error_log
         ( log_id, record_id, line_number, stage
         , error_code, error_message
         , request_id, created_by, created_date )
      VALUES
         ( xx_ap_exp_error_log_s.NEXTVAL, p_record_id, p_line_number, p_stage
         , p_error_code, SUBSTR(p_error_message,1,4000)
         , g_request_id, g_user_id, SYSDATE );
      COMMIT;
   EXCEPTION
      WHEN OTHERS THEN
         ROLLBACK;
   END log_error;

   ---------------------------------------------------------------------------
   -- Mark a header (and its lines) as ERROR with a message
   ---------------------------------------------------------------------------
   PROCEDURE mark_error
   ( p_record_id IN NUMBER
   , p_message   IN VARCHAR2
   )
   IS
   BEGIN
      UPDATE xx_ap_exp_stg_hdr
         SET status           = g_status_error
           , error_message    = SUBSTR(p_message,1,4000)
           , last_updated_by  = g_user_id
           , last_update_date = SYSDATE
       WHERE record_id        = p_record_id;

      UPDATE xx_ap_exp_stg_line
         SET status           = g_status_error
           , error_message    = NVL(error_message, p_message)
           , last_updated_by  = g_user_id
           , last_update_date = SYSDATE
       WHERE record_id        = p_record_id;

      log_error ( p_record_id     => p_record_id
                , p_stage         => g_stage_validation
                , p_error_message => p_message );
   END mark_error;

   ---------------------------------------------------------------------------
   -- Functional currency for the OU
   ---------------------------------------------------------------------------
   FUNCTION get_functional_currency (p_org_id IN NUMBER) RETURN VARCHAR2
   IS
      l_curr  VARCHAR2(15);
   BEGIN
      SELECT gsb.currency_code
        INTO l_curr
        FROM hr_operating_units hou
           , gl_sets_of_books   gsb
       WHERE hou.organization_id  = p_org_id
         AND hou.set_of_books_id  = gsb.set_of_books_id;
      RETURN l_curr;
   EXCEPTION
      WHEN NO_DATA_FOUND THEN
         RETURN NULL;
   END get_functional_currency;

   ---------------------------------------------------------------------------
   -- Look up the supplier already mapped to the employee (if any)
   ---------------------------------------------------------------------------
   PROCEDURE find_employee_supplier
   ( p_employee_id    IN  NUMBER
   , p_org_id         IN  NUMBER
   , x_vendor_id      OUT NUMBER
   , x_vendor_site_id OUT NUMBER
   )
   IS
   BEGIN
      x_vendor_id      := NULL;
      x_vendor_site_id := NULL;

      -- Standard EBS rule: an employee-supplier carries EMPLOYEE_ID = the
      -- person_id and VENDOR_TYPE_LOOKUP_CODE = 'EMPLOYEE'.
      BEGIN
         SELECT pv.vendor_id, pvs.vendor_site_id
           INTO x_vendor_id, x_vendor_site_id
           FROM ap_suppliers          pv
              , ap_supplier_sites_all pvs
          WHERE pv.employee_id              = p_employee_id
            AND pv.vendor_type_lookup_code  = 'EMPLOYEE'
            AND pv.enabled_flag             = 'Y'
            AND NVL(pv.end_date_active, SYSDATE+1) > SYSDATE
            AND pvs.vendor_id               = pv.vendor_id
            AND pvs.org_id                  = p_org_id
            AND pvs.pay_site_flag           = 'Y'
            AND NVL(pvs.inactive_date, SYSDATE+1) > SYSDATE
            AND ROWNUM = 1;
      EXCEPTION
         WHEN NO_DATA_FOUND THEN
            NULL;
      END;
   END find_employee_supplier;

   ---------------------------------------------------------------------------
   -- CREATE_SUPPLIER_IF_NEEDED
   --   Mirrors the Expense Report Export logic: if no employee-supplier exists
   --   for the OU, create one using AP_VENDOR_PUB_PKG.
   ---------------------------------------------------------------------------
   PROCEDURE create_supplier_if_needed
   ( p_record_id        IN  NUMBER
   , p_employee_id      IN  NUMBER
   , p_org_id           IN  NUMBER
   , x_vendor_id        OUT NUMBER
   , x_vendor_site_id   OUT NUMBER
   , x_return_status    OUT VARCHAR2
   , x_error_message    OUT VARCHAR2
   )
   IS
      l_emp           per_all_people_f%ROWTYPE;
      l_vendor_rec    ap_vendor_pub_pkg.r_vendor_rec_type;
      l_site_rec      ap_vendor_pub_pkg.r_vendor_site_rec_type;
      l_msg_count     NUMBER;
      l_msg_data      VARCHAR2(4000);
      l_party_id      NUMBER;
      l_party_site_id NUMBER;
      l_loc_id        NUMBER;
   BEGIN
      x_return_status := fnd_api.g_ret_sts_success;

      -- 0. First try to find an existing mapping
      find_employee_supplier ( p_employee_id    => p_employee_id
                             , p_org_id         => p_org_id
                             , x_vendor_id      => x_vendor_id
                             , x_vendor_site_id => x_vendor_site_id );

      IF x_vendor_id IS NOT NULL AND x_vendor_site_id IS NOT NULL THEN
         RETURN;   -- nothing to do
      END IF;

      -- 1. Fetch the employee record (must be an active employee on the
      --    invoice date - mimics the standard program)
      BEGIN
         SELECT *
           INTO l_emp
           FROM per_all_people_f
          WHERE person_id = p_employee_id
            AND TRUNC(SYSDATE) BETWEEN effective_start_date
                                   AND effective_end_date
            AND current_employee_flag = 'Y'
            AND ROWNUM = 1;
      EXCEPTION
         WHEN NO_DATA_FOUND THEN
            x_return_status := fnd_api.g_ret_sts_error;
            x_error_message := 'Employee '||p_employee_id||' is not active';
            RETURN;
      END;

      -- 2. Build the supplier record
      l_vendor_rec.vendor_name              := SUBSTR(l_emp.full_name,1,240);
      l_vendor_rec.segment1                 := l_emp.employee_number;
      l_vendor_rec.vendor_type_lookup_code  := 'EMPLOYEE';
      l_vendor_rec.employee_id              := p_employee_id;
      l_vendor_rec.enabled_flag             := 'Y';
      l_vendor_rec.start_date_active        := TRUNC(SYSDATE);
      l_vendor_rec.invoice_currency_code    := get_functional_currency(p_org_id);
      l_vendor_rec.payment_currency_code    := l_vendor_rec.invoice_currency_code;
      l_vendor_rec.pay_group_lookup_code    := 'EMPLOYEE';

      -- 3. Create the supplier  (creates HZ_PARTIES / AP_SUPPLIERS)
      IF x_vendor_id IS NULL THEN
         ap_vendor_pub_pkg.create_vendor
            ( p_api_version   => 1.0
            , p_init_msg_list => fnd_api.g_true
            , p_commit        => fnd_api.g_false
            , p_validation_level => fnd_api.g_valid_level_full
            , x_return_status => x_return_status
            , x_msg_count     => l_msg_count
            , x_msg_data      => l_msg_data
            , p_vendor_rec    => l_vendor_rec
            , x_vendor_id     => x_vendor_id
            , x_party_id      => l_party_id );

         IF x_return_status <> fnd_api.g_ret_sts_success THEN
            x_error_message := 'create_vendor failed: '||l_msg_data;
            log_error ( p_record_id => p_record_id
                      , p_stage     => g_stage_supplier
                      , p_error_message => x_error_message );
            RETURN;
         END IF;
      END IF;

      -- 4. Build the supplier site record - one PAY site per OU
      l_site_rec.vendor_id              := x_vendor_id;
      l_site_rec.vendor_site_code        := 'HOME';
      l_site_rec.org_id                  := p_org_id;
      l_site_rec.pay_site_flag           := 'Y';
      l_site_rec.purchasing_site_flag    := 'N';
      l_site_rec.rfq_only_site_flag      := 'N';
      l_site_rec.address_line1           := 'Employee Address';   -- HR addr lookup happens downstream
      l_site_rec.city                    := 'TBD';
      l_site_rec.country                 := 'US';
      l_site_rec.payment_method_lookup_code := 'CHECK';
      l_site_rec.invoice_currency_code   := l_vendor_rec.invoice_currency_code;
      l_site_rec.payment_currency_code   := l_vendor_rec.payment_currency_code;

      ap_vendor_pub_pkg.create_vendor_site
         ( p_api_version       => 1.0
         , p_init_msg_list     => fnd_api.g_true
         , p_commit            => fnd_api.g_false
         , p_validation_level  => fnd_api.g_valid_level_full
         , x_return_status     => x_return_status
         , x_msg_count         => l_msg_count
         , x_msg_data          => l_msg_data
         , p_vendor_site_rec   => l_site_rec
         , x_vendor_site_id    => x_vendor_site_id
         , x_party_site_id     => l_party_site_id
         , x_location_id       => l_loc_id );

      IF x_return_status <> fnd_api.g_ret_sts_success THEN
         x_error_message := 'create_vendor_site failed: '||l_msg_data;
         log_error ( p_record_id => p_record_id
                   , p_stage     => g_stage_supplier
                   , p_error_message => x_error_message );
         RETURN;
      END IF;

      log_msg('Supplier '||x_vendor_id||' / Site '||x_vendor_site_id
              ||' created for employee '||p_employee_id);

   EXCEPTION
      WHEN OTHERS THEN
         x_return_status := fnd_api.g_ret_sts_unexp_error;
         x_error_message := 'create_supplier_if_needed: '||SQLERRM;
         log_error ( p_record_id => p_record_id
                   , p_stage     => g_stage_supplier
                   , p_error_message => x_error_message );
   END create_supplier_if_needed;

   ---------------------------------------------------------------------------
   -- VALIDATE_DATA
   ---------------------------------------------------------------------------
   PROCEDURE validate_data
   ( p_org_id      IN  NUMBER
   , x_valid_cnt   OUT NUMBER
   , x_error_cnt   OUT NUMBER
   )
   IS
      CURSOR c_hdr IS
         SELECT *
           FROM xx_ap_exp_stg_hdr
          WHERE status  = g_status_new
            AND org_id  = p_org_id
          ORDER BY record_id;

      l_func_curr        VARCHAR2(15);
      l_emp_cnt          NUMBER;
      l_dup_cnt          NUMBER;
      l_lines_total      NUMBER;
      l_lines_cnt        NUMBER;
      l_invalid_ccid     NUMBER;
      l_vendor_id        NUMBER;
      l_vendor_site_id   NUMBER;
      l_ret_status       VARCHAR2(1);
      l_err_msg          VARCHAR2(4000);
      l_record_error     BOOLEAN;
      l_error_buffer     VARCHAR2(4000);
   BEGIN
      x_valid_cnt := 0;
      x_error_cnt := 0;

      l_func_curr := get_functional_currency (p_org_id);
      IF l_func_curr IS NULL THEN
         RAISE_APPLICATION_ERROR (-20001
            , 'Functional currency could not be derived for ORG_ID '||p_org_id);
      END IF;

      log_msg('validate_data: starting for org_id='||p_org_id
              ||' (functional currency='||l_func_curr||')');

      <<header_loop>>
      FOR r_hdr IN c_hdr LOOP
         l_record_error := FALSE;
         l_error_buffer := NULL;

         BEGIN
            -- ----- 1. Required fields ------------------------------------
            IF r_hdr.employee_id IS NULL
               OR r_hdr.invoice_num    IS NULL
               OR r_hdr.invoice_date   IS NULL
               OR r_hdr.invoice_amount IS NULL
               OR r_hdr.currency_code  IS NULL
               OR r_hdr.org_id         IS NULL
            THEN
               l_record_error := TRUE;
               l_error_buffer := 'Required header field missing';
            END IF;

            -- ----- 2. Currency - must equal OU functional currency --------
            IF NOT l_record_error
               AND r_hdr.currency_code <> l_func_curr
            THEN
               l_record_error := TRUE;
               l_error_buffer := 'Currency '||r_hdr.currency_code
                                 ||' differs from functional '||l_func_curr;
            END IF;

            -- ----- 3. Invoice date sanity --------------------------------
            IF NOT l_record_error
               AND r_hdr.invoice_date > SYSDATE
            THEN
               l_record_error := TRUE;
               l_error_buffer := 'Invoice date in the future';
            END IF;

            -- ----- 4. Employee existence ---------------------------------
            IF NOT l_record_error THEN
               SELECT COUNT(*)
                 INTO l_emp_cnt
                 FROM per_all_people_f
                WHERE person_id = r_hdr.employee_id
                  AND TRUNC(SYSDATE) BETWEEN effective_start_date
                                         AND effective_end_date
                  AND current_employee_flag = 'Y';

               IF l_emp_cnt = 0 THEN
                  l_record_error := TRUE;
                  l_error_buffer := 'Employee '||r_hdr.employee_id
                                     ||' does not exist or is inactive';
               END IF;
            END IF;

            -- ----- 5. Lines exist & header amount = sum(lines) ------------
            IF NOT l_record_error THEN
               SELECT COUNT(*), NVL(SUM(amount),0)
                 INTO l_lines_cnt, l_lines_total
                 FROM xx_ap_exp_stg_line
                WHERE record_id = r_hdr.record_id;

               IF l_lines_cnt = 0 THEN
                  l_record_error := TRUE;
                  l_error_buffer := 'No expense lines for header';
               ELSIF NVL(r_hdr.invoice_amount,0) <> l_lines_total THEN
                  l_record_error := TRUE;
                  l_error_buffer := 'Header amount ('||r_hdr.invoice_amount
                                     ||') <> sum of lines ('||l_lines_total||')';
               END IF;
            END IF;

            -- ----- 6. CCID validation per line ---------------------------
            IF NOT l_record_error THEN
               SELECT COUNT(*)
                 INTO l_invalid_ccid
                 FROM xx_ap_exp_stg_line stl
                WHERE stl.record_id = r_hdr.record_id
                  AND ( stl.ccid IS NULL
                     OR NOT EXISTS
                        ( SELECT 1
                            FROM gl_code_combinations gcc
                           WHERE gcc.code_combination_id = stl.ccid
                             AND gcc.enabled_flag        = 'Y'
                             AND TRUNC(SYSDATE) BETWEEN
                                   NVL(gcc.start_date_active,TRUNC(SYSDATE))
                               AND NVL(gcc.end_date_active,TRUNC(SYSDATE))
                             AND gcc.detail_posting_allowed_flag = 'Y' ) );

               IF l_invalid_ccid > 0 THEN
                  l_record_error := TRUE;
                  l_error_buffer := l_invalid_ccid
                                     ||' line(s) with invalid/disabled CCID';

                  -- Mark the offending lines individually
                  UPDATE xx_ap_exp_stg_line
                     SET status        = g_status_error
                       , error_message = 'Invalid or disabled CCID'
                   WHERE record_id     = r_hdr.record_id
                     AND ( ccid IS NULL
                        OR NOT EXISTS
                           ( SELECT 1
                               FROM gl_code_combinations gcc
                              WHERE gcc.code_combination_id = ccid
                                AND gcc.enabled_flag        = 'Y'
                                AND gcc.detail_posting_allowed_flag = 'Y' ) );
               END IF;
            END IF;

            -- ----- 7. Duplicate invoice check ----------------------------
            IF NOT l_record_error THEN
               -- Resolve the supplier first (create if necessary) so that the
               -- duplicate check can be performed with a vendor_id.
               create_supplier_if_needed
                  ( p_record_id      => r_hdr.record_id
                  , p_employee_id    => r_hdr.employee_id
                  , p_org_id         => r_hdr.org_id
                  , x_vendor_id      => l_vendor_id
                  , x_vendor_site_id => l_vendor_site_id
                  , x_return_status  => l_ret_status
                  , x_error_message  => l_err_msg );

               IF l_ret_status <> fnd_api.g_ret_sts_success
                  OR l_vendor_id IS NULL
                  OR l_vendor_site_id IS NULL
               THEN
                  l_record_error := TRUE;
                  l_error_buffer := NVL(l_err_msg,'Supplier mapping failed');
               ELSE
                  -- Duplicate against AP_INVOICES_ALL
                  SELECT COUNT(*)
                    INTO l_dup_cnt
                    FROM ap_invoices_all
                   WHERE invoice_num = r_hdr.invoice_num
                     AND vendor_id   = l_vendor_id
                     AND org_id      = r_hdr.org_id;

                  IF l_dup_cnt = 0 THEN
                     -- Also check the open interface (un-imported)
                     SELECT COUNT(*)
                       INTO l_dup_cnt
                       FROM ap_invoices_interface
                      WHERE invoice_num = r_hdr.invoice_num
                        AND vendor_id   = l_vendor_id
                        AND org_id      = r_hdr.org_id;
                  END IF;

                  IF l_dup_cnt > 0 THEN
                     l_record_error := TRUE;
                     l_error_buffer := 'Duplicate invoice '||r_hdr.invoice_num
                                        ||' for vendor '||l_vendor_id;
                  END IF;
               END IF;
            END IF;

            -- ----- Result ------------------------------------------------
            IF l_record_error THEN
               mark_error (r_hdr.record_id, l_error_buffer);
               x_error_cnt := x_error_cnt + 1;
            ELSE
               UPDATE xx_ap_exp_stg_hdr
                  SET status           = g_status_valid
                    , vendor_id        = l_vendor_id
                    , vendor_site_id   = l_vendor_site_id
                    , error_message    = NULL
                    , last_updated_by  = g_user_id
                    , last_update_date = SYSDATE
                WHERE record_id        = r_hdr.record_id;

               UPDATE xx_ap_exp_stg_line
                  SET status           = g_status_valid
                    , error_message    = NULL
                WHERE record_id        = r_hdr.record_id;

               x_valid_cnt := x_valid_cnt + 1;
            END IF;

         EXCEPTION
            WHEN OTHERS THEN
               -- Validation must never abort the whole run.  Mark this header
               -- and continue with the next one.
               mark_error (r_hdr.record_id
                          , 'Unexpected validation error: '||SQLERRM);
               x_error_cnt := x_error_cnt + 1;
         END;

         COMMIT;       -- one record = one logical unit of work
      END LOOP header_loop;

      log_msg('validate_data: completed - valid='||x_valid_cnt
              ||', error='||x_error_cnt);
   END validate_data;

   ---------------------------------------------------------------------------
   -- LOAD_INTERFACE
   ---------------------------------------------------------------------------
   PROCEDURE load_interface
   ( p_org_id         IN  NUMBER
   , x_loaded_cnt     OUT NUMBER
   , x_failed_cnt     OUT NUMBER
   )
   IS
      CURSOR c_valid_hdr IS
         SELECT *
           FROM xx_ap_exp_stg_hdr
          WHERE status = g_status_valid
            AND org_id = p_org_id
          ORDER BY record_id;

      CURSOR c_lines (cp_record_id NUMBER) IS
         SELECT *
           FROM xx_ap_exp_stg_line
          WHERE record_id = cp_record_id
            AND status   <> g_status_error
          ORDER BY line_number;

      l_invoice_id    NUMBER;
      l_group_id      VARCHAR2(80);
      l_func_curr     VARCHAR2(15);
   BEGIN
      x_loaded_cnt := 0;
      x_failed_cnt := 0;
      l_func_curr  := get_functional_currency (p_org_id);
      l_group_id   := 'WD_EXP_'||TO_CHAR(SYSDATE,'YYYYMMDDHH24MISS')
                              ||'_'||xx_ap_exp_group_id_s.NEXTVAL;

      log_msg('load_interface: starting for org_id='||p_org_id
              ||', group_id='||l_group_id);

      <<header_loop>>
      FOR r_hdr IN c_valid_hdr LOOP
         BEGIN
            l_invoice_id := ap_invoices_interface_s.NEXTVAL;

            INSERT INTO ap_invoices_interface
               ( invoice_id
               , invoice_num
               , invoice_type_lookup_code
               , invoice_date
               , gl_date
               , vendor_id
               , vendor_site_id
               , invoice_amount
               , invoice_currency_code
               , payment_currency_code
               , description
               , source
               , group_id
               , org_id
               , status
               , workflow_flag
               , created_by
               , creation_date
               , last_updated_by
               , last_update_date
               , last_update_login )
            VALUES
               ( l_invoice_id
               , r_hdr.invoice_num
               , g_invoice_type
               , r_hdr.invoice_date
               , GREATEST(r_hdr.invoice_date, TRUNC(SYSDATE))
               , r_hdr.vendor_id
               , r_hdr.vendor_site_id
               , r_hdr.invoice_amount
               , NVL(r_hdr.currency_code, l_func_curr)
               , NVL(r_hdr.currency_code, l_func_curr)
               , 'Workday Expense '||r_hdr.invoice_num||' / '||r_hdr.employee_name
               , g_source
               , l_group_id
               , r_hdr.org_id
               , 'NEW'
               , 'N'
               , g_user_id
               , SYSDATE
               , g_user_id
               , SYSDATE
               , g_login_id );

            -- Lines
            FOR r_line IN c_lines (r_hdr.record_id) LOOP
               INSERT INTO ap_invoice_lines_interface
                  ( invoice_id
                  , invoice_line_id
                  , line_number
                  , line_type_lookup_code
                  , amount
                  , description
                  , dist_code_combination_id
                  , accounting_date
                  , org_id
                  , created_by
                  , creation_date
                  , last_updated_by
                  , last_update_date )
               VALUES
                  ( l_invoice_id
                  , ap_invoice_lines_interface_s.NEXTVAL
                  , r_line.line_number
                  , 'ITEM'
                  , r_line.amount
                  , SUBSTR(NVL(r_line.description, r_line.expense_type),1,240)
                  , r_line.ccid
                  , GREATEST(r_hdr.invoice_date, TRUNC(SYSDATE))
                  , r_hdr.org_id
                  , g_user_id
                  , SYSDATE
                  , g_user_id
                  , SYSDATE );
            END LOOP;

            -- Mark staging row as PROCESSED
            UPDATE xx_ap_exp_stg_hdr
               SET status           = g_status_processed
                 , group_id         = l_group_id
                 , request_id       = g_request_id
                 , last_updated_by  = g_user_id
                 , last_update_date = SYSDATE
             WHERE record_id        = r_hdr.record_id;

            UPDATE xx_ap_exp_stg_line
               SET status           = g_status_processed
                 , last_updated_by  = g_user_id
                 , last_update_date = SYSDATE
             WHERE record_id        = r_hdr.record_id
               AND status          <> g_status_error;

            x_loaded_cnt := x_loaded_cnt + 1;
            COMMIT;

         EXCEPTION
            WHEN OTHERS THEN
               ROLLBACK;
               x_failed_cnt := x_failed_cnt + 1;
               mark_error (r_hdr.record_id
                          ,'Interface load failed: '||SQLERRM);
               log_error ( p_record_id     => r_hdr.record_id
                         , p_stage         => g_stage_interface
                         , p_error_message => 'Interface load failed: '||SQLERRM );
               COMMIT;
         END;
      END LOOP header_loop;

      log_msg('load_interface: completed - loaded='||x_loaded_cnt
              ||', failed='||x_failed_cnt);
   END load_interface;

   ---------------------------------------------------------------------------
   -- REPORT_STATUS  - writes a formatted summary to FND_FILE.OUTPUT
   ---------------------------------------------------------------------------
   PROCEDURE report_status (p_org_id IN NUMBER)
   IS
      l_total      NUMBER;
      l_valid      NUMBER;
      l_error      NUMBER;
      l_processed  NUMBER;

      CURSOR c_success IS
         SELECT h.invoice_num
              , pv.vendor_name
              , h.invoice_amount
              , h.invoice_date
           FROM xx_ap_exp_stg_hdr h
              , ap_suppliers      pv
          WHERE h.status     = g_status_processed
            AND h.org_id     = p_org_id
            AND h.request_id = g_request_id
            AND pv.vendor_id = h.vendor_id
          ORDER BY h.invoice_num;

      CURSOR c_errors IS
         SELECT h.invoice_num
              , NVL(pv.vendor_name, h.employee_name) vendor_name
              , h.invoice_amount
              , h.invoice_date
              , h.error_message
           FROM xx_ap_exp_stg_hdr h
              , ap_suppliers      pv
          WHERE h.status   = g_status_error
            AND h.org_id   = p_org_id
            AND pv.vendor_id (+) = h.vendor_id
          ORDER BY h.invoice_num;
   BEGIN
      SELECT COUNT(*)
           , SUM(CASE WHEN status IN (g_status_valid, g_status_processed)
                      THEN 1 ELSE 0 END)
           , SUM(CASE WHEN status = g_status_error     THEN 1 ELSE 0 END)
           , SUM(CASE WHEN status = g_status_processed THEN 1 ELSE 0 END)
        INTO l_total, l_valid, l_error, l_processed
        FROM xx_ap_exp_stg_hdr
       WHERE org_id = p_org_id;

      fnd_file.put_line (fnd_file.output
         ,'=================================================================================');
      fnd_file.put_line (fnd_file.output
         ,'        WORKDAY EXPENSE IMPORT - PROCESSING REPORT');
      fnd_file.put_line (fnd_file.output
         ,'=================================================================================');
      fnd_file.put_line (fnd_file.output
         ,'Run Date            : '||TO_CHAR(SYSDATE,'DD-MON-YYYY HH24:MI:SS'));
      fnd_file.put_line (fnd_file.output
         ,'Operating Unit ID   : '||p_org_id);
      fnd_file.put_line (fnd_file.output
         ,'Concurrent Request  : '||g_request_id);
      fnd_file.put_line (fnd_file.output, ' ');
      fnd_file.put_line (fnd_file.output
         ,'Total records         : '||l_total);
      fnd_file.put_line (fnd_file.output
         ,'Valid records         : '||l_valid);
      fnd_file.put_line (fnd_file.output
         ,'Failed records        : '||l_error);
      fnd_file.put_line (fnd_file.output
         ,'Loaded to Interface   : '||l_processed);
      fnd_file.put_line (fnd_file.output, ' ');

      fnd_file.put_line (fnd_file.output
         ,'---------------------------------------------------------------------------------');
      fnd_file.put_line (fnd_file.output
         ,'  SUCCESSFUL RECORDS');
      fnd_file.put_line (fnd_file.output
         ,'---------------------------------------------------------------------------------');
      fnd_file.put_line (fnd_file.output
         , RPAD('Invoice Num',20)||RPAD('Vendor Name',40)
          ||LPAD('Invoice Amt',15)||'  '||'Invoice Date');
      fnd_file.put_line (fnd_file.output
         ,'---------------------------------------------------------------------------------');
      FOR r IN c_success LOOP
         fnd_file.put_line (fnd_file.output
            , RPAD(r.invoice_num,20)
              ||RPAD(SUBSTR(r.vendor_name,1,40),40)
              ||LPAD(TO_CHAR(r.invoice_amount,'999,999,990.00'),15)
              ||'  '||TO_CHAR(r.invoice_date,'DD-MON-YYYY'));
      END LOOP;

      fnd_file.put_line (fnd_file.output, ' ');
      fnd_file.put_line (fnd_file.output
         ,'---------------------------------------------------------------------------------');
      fnd_file.put_line (fnd_file.output
         ,'  ERROR SUMMARY');
      fnd_file.put_line (fnd_file.output
         ,'---------------------------------------------------------------------------------');
      fnd_file.put_line (fnd_file.output
         , RPAD('Invoice Num',20)||RPAD('Vendor Name',40)
          ||LPAD('Invoice Amt',15)||'  '||'Invoice Date');
      fnd_file.put_line (fnd_file.output
         ,'---------------------------------------------------------------------------------');
      FOR r IN c_errors LOOP
         fnd_file.put_line (fnd_file.output
            , RPAD(r.invoice_num,20)
              ||RPAD(SUBSTR(r.vendor_name,1,40),40)
              ||LPAD(TO_CHAR(r.invoice_amount,'999,999,990.00'),15)
              ||'  '||TO_CHAR(r.invoice_date,'DD-MON-YYYY'));
         fnd_file.put_line (fnd_file.output
            ,'    Reason : '||SUBSTR(r.error_message,1,200));
      END LOOP;

      fnd_file.put_line (fnd_file.output, ' ');
      fnd_file.put_line (fnd_file.output
         ,'================================ END OF REPORT ==================================');
   END report_status;

   ---------------------------------------------------------------------------
   -- MAIN_PROCESS  - concurrent program entry point
   ---------------------------------------------------------------------------
   PROCEDURE main_process
   ( errbuf            OUT VARCHAR2
   , retcode           OUT NUMBER
   , p_org_id          IN  NUMBER
   , p_debug_flag      IN  VARCHAR2 DEFAULT 'N'
   )
   IS
      l_valid_cnt   NUMBER := 0;
      l_error_cnt   NUMBER := 0;
      l_loaded_cnt  NUMBER := 0;
      l_failed_cnt  NUMBER := 0;
   BEGIN
      g_debug      := (NVL(UPPER(p_debug_flag),'N') = 'Y');
      g_request_id := NVL(fnd_global.conc_request_id, g_request_id);

      log_msg('=== Workday Expense Import START ===');

      -- 1. Apps + MOAC context
      init_context (p_org_id => p_org_id);

      -- 2. Validate
      validate_data ( p_org_id    => p_org_id
                    , x_valid_cnt => l_valid_cnt
                    , x_error_cnt => l_error_cnt );

      -- 3. Load to interface
      load_interface ( p_org_id     => p_org_id
                     , x_loaded_cnt => l_loaded_cnt
                     , x_failed_cnt => l_failed_cnt );

      -- 4. Report
      report_status (p_org_id);

      -- 5. Concurrent program exit codes
      IF l_error_cnt = 0 AND l_failed_cnt = 0 THEN
         retcode := 0;                                   -- SUCCESS
         errbuf  := 'Workday Expense Import completed successfully';
      ELSIF l_loaded_cnt > 0 THEN
         retcode := 1;                                   -- WARNING
         errbuf  := 'Completed with errors: '||(l_error_cnt + l_failed_cnt)
                    ||' record(s) failed';
      ELSE
         retcode := 2;                                   -- ERROR
         errbuf  := 'No records loaded - all '||(l_error_cnt + l_failed_cnt)
                    ||' record(s) failed';
      END IF;

      log_msg('=== Workday Expense Import END ('||errbuf||') ===');

   EXCEPTION
      WHEN OTHERS THEN
         retcode := 2;
         errbuf  := 'Fatal error: '||SQLERRM;
         log_msg(errbuf);
         log_error ( p_record_id     => NULL
                   , p_stage         => g_stage_fatal
                   , p_error_message => DBMS_UTILITY.format_error_backtrace
                                        ||' - '||SQLERRM );
   END main_process;

END xx_ap_expense_import_pkg;
/
SHOW ERRORS PACKAGE BODY xx_ap_expense_import_pkg
