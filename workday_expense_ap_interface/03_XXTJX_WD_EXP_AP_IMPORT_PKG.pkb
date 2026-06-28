CREATE OR REPLACE PACKAGE BODY XXTJX_WD_EXP_AP_IMPORT_PKG
AS
   /**************************************************************************
   *
   * FILE NAME
   *   XXTJX_WD_EXP_AP_IMPORT_PKG.pkb
   *
   * DESCRIPTION
   *   Body for the Workday Expense -> Oracle AP Open Interface import.
   *   See package specification header for scope.
   *
   * HISTORY
   * =======
   * VERSION DATE        AUTHOR(S)            DESCRIPTION
   * ------- ----------- -------------------- ---------------------------------
   * 1.0     2026-06-28  EBS Tech Architect   Initial version.
   *************************************************************************/

   --------------------------------------------------------------------------
   -- GLOBAL CONSTANTS  (no hardcoding inside the logic)
   --------------------------------------------------------------------------
   g_module             CONSTANT VARCHAR2(40)  := 'XXTJX_WD_EXP_AP_IMPORT_PKG';
   g_inv_type_standard  CONSTANT VARCHAR2(25)  := 'STANDARD';
   g_line_type_item     CONSTANT VARCHAR2(25)  := 'ITEM';
   g_status_new         CONSTANT VARCHAR2(1)   := 'N';
   g_status_valid       CONSTANT VARCHAR2(1)   := 'V';
   g_status_error       CONSTANT VARCHAR2(1)   := 'E';
   g_status_transferred CONSTANT VARCHAR2(1)   := 'T';
   g_vendor_type_emp    CONSTANT VARCHAR2(30)  := 'EMPLOYEE';
   g_bulk_limit         CONSTANT PLS_INTEGER   := 500;   -- BULK COLLECT batch size
   g_ret_success        CONSTANT NUMBER        := 0;
   g_ret_warning        CONSTANT NUMBER        := 1;
   g_ret_error          CONSTANT NUMBER        := 2;

   --------------------------------------------------------------------------
   -- GLOBAL RUN-TIME CONTEXT
   --------------------------------------------------------------------------
   g_debug          BOOLEAN       := FALSE;
   g_request_id     NUMBER        := NVL (fnd_global.conc_request_id, -1);
   g_user_id        NUMBER        := NVL (fnd_global.user_id, -1);
   g_login_id       NUMBER        := NVL (fnd_global.login_id, -1);

   --------------------------------------------------------------------------
   -- PRIVATE TYPES used for set-based line insert
   --------------------------------------------------------------------------
   TYPE line_stg_tab IS TABLE OF XXTJX_AP_INV_LINES_INTERFACE%ROWTYPE
      INDEX BY PLS_INTEGER;

   ------------------------------------------------------------------------
   -- PRIVATE: debug() - verbose log only when debug flag is on
   ------------------------------------------------------------------------
   PROCEDURE debug (p_text IN VARCHAR2)
   IS
   BEGIN
      IF g_debug THEN
         fnd_file.put_line (fnd_file.LOG, p_text);
      END IF;
   END debug;

   ------------------------------------------------------------------------
   -- PRIVATE: log_line() - always written to concurrent LOG
   ------------------------------------------------------------------------
   PROCEDURE log_line (p_text IN VARCHAR2)
   IS
   BEGIN
      fnd_file.put_line (fnd_file.LOG, p_text);
   END log_line;

   ------------------------------------------------------------------------
   -- PRIVATE: out_line() - written to concurrent OUTPUT (audit report)
   ------------------------------------------------------------------------
   PROCEDURE out_line (p_text IN VARCHAR2)
   IS
   BEGIN
      fnd_file.put_line (fnd_file.OUTPUT, p_text);
   END out_line;

   ------------------------------------------------------------------------
   -- PRIVATE: write_run_log() - lightweight statistics row
   ------------------------------------------------------------------------
   PROCEDURE write_run_log
   (
       p_proc        IN VARCHAR2
      ,p_source      IN VARCHAR2
      ,p_batch_id    IN VARCHAR2
      ,p_total       IN NUMBER
      ,p_success     IN NUMBER
      ,p_failure     IN NUMBER
      ,p_start       IN TIMESTAMP
      ,p_status      IN VARCHAR2
      ,p_message     IN VARCHAR2 DEFAULT NULL
   )
   IS
      PRAGMA AUTONOMOUS_TRANSACTION;
      l_end   TIMESTAMP := SYSTIMESTAMP;
   BEGIN
      INSERT INTO XXTJX_WD_EXP_AP_LOG
         (log_id, request_id, module_name, procedure_name, source, batch_id,
          record_count, success_count, failure_count, start_time, end_time,
          elapsed_seconds, status, message)
      VALUES
         (XXTJX_WD_EXP_AP_LOG_S.NEXTVAL, g_request_id, g_module, p_proc,
          p_source, p_batch_id, p_total, p_success, p_failure, p_start, l_end,
          ROUND (EXTRACT (SECOND FROM (l_end - p_start))
                 + EXTRACT (MINUTE FROM (l_end - p_start)) * 60, 2),
          p_status, p_message);
      COMMIT;
   EXCEPTION
      WHEN OTHERS THEN
         ROLLBACK;   -- logging must never break the run
   END write_run_log;

   ------------------------------------------------------------------------
   -- PRIVATE: mark_record() - stamp staging header + its lines with status
   ------------------------------------------------------------------------
   PROCEDURE mark_record
   (
       p_invoice_num IN VARCHAR2
      ,p_batch_id    IN VARCHAR2
      ,p_status      IN VARCHAR2
      ,p_message     IN VARCHAR2 DEFAULT NULL
   )
   IS
   BEGIN
      UPDATE XXTJX_AP_INVOICES_INTERFACE
         SET process_status   = p_status
            ,error_message    = p_message
            ,last_update_date = SYSDATE
            ,last_updated_by  = g_user_id
       WHERE invoice_num = p_invoice_num
         AND batch_id    = p_batch_id;

      UPDATE XXTJX_AP_INV_LINES_INTERFACE
         SET process_status   = p_status
            ,error_message    = p_message
            ,last_update_date = SYSDATE
            ,last_updated_by  = g_user_id
       WHERE invoice_num = p_invoice_num
         AND batch_id    = p_batch_id;
   END mark_record;

   ------------------------------------------------------------------------
   -- FUNCTION: validate_employee_number
   ------------------------------------------------------------------------
   FUNCTION validate_employee_number
   (
       p_employee_number IN  VARCHAR2
      ,x_error_message   OUT NOCOPY VARCHAR2
   ) RETURN BOOLEAN
   IS
      l_cnt   PLS_INTEGER;
   BEGIN
      IF p_employee_number IS NULL THEN
         x_error_message := 'Missing mandatory field: Employee Number';
         RETURN FALSE;
      END IF;

      SELECT COUNT (1)
        INTO l_cnt
        FROM per_all_people_f papf
       WHERE papf.employee_number = p_employee_number
         AND TRUNC (SYSDATE) BETWEEN papf.effective_start_date
                                 AND papf.effective_end_date;

      IF l_cnt = 0 THEN
         x_error_message := 'Employee not found in HR for Employee Number ' || p_employee_number;
         RETURN FALSE;
      END IF;

      RETURN TRUE;
   EXCEPTION
      WHEN OTHERS THEN
         x_error_message := 'Error validating Employee Number ' || p_employee_number
                            || ' : ' || SQLERRM;
         RETURN FALSE;
   END validate_employee_number;

   ------------------------------------------------------------------------
   -- FUNCTION: derive_person_details
   --   Resolves to exactly ONE active, primary employee assignment.
   --   Handles multiple person ids / multiple active assignments cleanly.
   ------------------------------------------------------------------------
   FUNCTION derive_person_details
   (
       p_employee_number IN  VARCHAR2
      ,p_org_id          IN  NUMBER
      ,x_employee_rec    OUT NOCOPY employee_rec_type
      ,x_error_message   OUT NOCOPY VARCHAR2
   ) RETURN BOOLEAN
   IS
      l_active_cnt   PLS_INTEGER;
   BEGIN
      -------------------------------------------------------------------
      -- Count distinct persons that have an ACTIVE, PRIMARY employee
      -- assignment effective today.  This single query covers:
      --   * Active Assignment        (per_system_status = ACTIVE_ASSIGN)
      --   * Effective Dates          (SYSDATE between effective dates)
      --   * Assignment Status        (via assignment_status_type)
      --   * Primary Assignment       (primary_flag = 'Y')
      -------------------------------------------------------------------
      SELECT COUNT (DISTINCT papf.person_id)
        INTO l_active_cnt
        FROM per_all_people_f          papf
            ,per_all_assignments_f     paaf
            ,per_assignment_status_types past
       WHERE papf.employee_number = p_employee_number
         AND paaf.person_id       = papf.person_id
         AND paaf.assignment_type = 'E'
         AND paaf.primary_flag    = 'Y'
         AND past.assignment_status_type_id = paaf.assignment_status_type_id
         AND past.per_system_status         = 'ACTIVE_ASSIGN'
         AND TRUNC (SYSDATE) BETWEEN papf.effective_start_date
                                 AND papf.effective_end_date
         AND TRUNC (SYSDATE) BETWEEN paaf.effective_start_date
                                 AND paaf.effective_end_date;

      IF l_active_cnt = 0 THEN
         x_error_message := 'No active primary assignment found for Employee Number '
                            || p_employee_number;
         RETURN FALSE;
      ELSIF l_active_cnt > 1 THEN
         x_error_message := 'Multiple active employees found for Employee Number '
                            || p_employee_number || ' - cannot uniquely identify person';
         RETURN FALSE;
      END IF;

      -------------------------------------------------------------------
      -- Exactly one - fetch the person + party details.
      -------------------------------------------------------------------
      SELECT DISTINCT papf.person_id
                     ,papf.full_name
                     ,papf.party_id
        INTO x_employee_rec.person_id
            ,x_employee_rec.full_name
            ,x_employee_rec.party_id
        FROM per_all_people_f          papf
            ,per_all_assignments_f     paaf
            ,per_assignment_status_types past
       WHERE papf.employee_number = p_employee_number
         AND paaf.person_id       = papf.person_id
         AND paaf.assignment_type = 'E'
         AND paaf.primary_flag    = 'Y'
         AND past.assignment_status_type_id = paaf.assignment_status_type_id
         AND past.per_system_status         = 'ACTIVE_ASSIGN'
         AND TRUNC (SYSDATE) BETWEEN papf.effective_start_date
                                 AND papf.effective_end_date
         AND TRUNC (SYSDATE) BETWEEN paaf.effective_start_date
                                 AND paaf.effective_end_date;

      x_employee_rec.org_id := p_org_id;
      RETURN TRUE;
   EXCEPTION
      WHEN OTHERS THEN
         x_error_message := 'Error deriving person details for Employee Number '
                            || p_employee_number || ' : ' || SQLERRM;
         RETURN FALSE;
   END derive_person_details;

   ------------------------------------------------------------------------
   -- FUNCTION: validate_operating_unit
   --   Resolve the file OU Name (or the parameter org_id) to a valid org_id.
   ------------------------------------------------------------------------
   FUNCTION validate_operating_unit
   (
       p_operating_unit_name IN  VARCHAR2
      ,p_org_id_param        IN  NUMBER
      ,x_org_id              OUT NOCOPY NUMBER
      ,x_error_message       OUT NOCOPY VARCHAR2
   ) RETURN BOOLEAN
   IS
      l_org_id   hr_operating_units.organization_id%TYPE;
   BEGIN
      -- When the concurrent parameter Operating Unit is supplied it wins;
      -- otherwise derive from the Operating Unit Name in the file (seeded
      -- behaviour, where the OU parameter is optional).
      IF p_org_id_param IS NOT NULL THEN
         BEGIN
            SELECT organization_id
              INTO l_org_id
              FROM hr_operating_units
             WHERE organization_id = p_org_id_param;
         EXCEPTION
            WHEN NO_DATA_FOUND THEN
               x_error_message := 'Invalid Operating Unit parameter (org_id=' || p_org_id_param || ')';
               RETURN FALSE;
         END;
      ELSE
         IF p_operating_unit_name IS NULL THEN
            x_error_message := 'Missing mandatory field: Operating Unit Name';
            RETURN FALSE;
         END IF;

         BEGIN
            SELECT organization_id
              INTO l_org_id
              FROM hr_operating_units
             WHERE name = p_operating_unit_name;
         EXCEPTION
            WHEN NO_DATA_FOUND THEN
               x_error_message := 'Invalid Operating Unit: ' || p_operating_unit_name;
               RETURN FALSE;
            WHEN TOO_MANY_ROWS THEN
               x_error_message := 'Ambiguous Operating Unit Name: ' || p_operating_unit_name;
               RETURN FALSE;
         END;
      END IF;

      x_org_id := l_org_id;
      RETURN TRUE;
   EXCEPTION
      WHEN OTHERS THEN
         x_error_message := 'Error validating Operating Unit : ' || SQLERRM;
         RETURN FALSE;
   END validate_operating_unit;

   ------------------------------------------------------------------------
   -- FUNCTION: get_employee_supplier
   --   Existing employee supplier + pay site for the OU (seeded approach:
   --   supplier is matched on PARTY_ID; site is the employee pay site).
   ------------------------------------------------------------------------
   FUNCTION get_employee_supplier
   (
       p_party_id      IN  NUMBER
      ,p_org_id        IN  NUMBER
      ,x_vendor_rec    OUT NOCOPY vendor_rec_type
      ,x_error_message OUT NOCOPY VARCHAR2
   ) RETURN BOOLEAN
   IS
   BEGIN
      -- Supplier keyed on the employee party.
      BEGIN
         SELECT aps.vendor_id
               ,aps.vendor_name
               ,aps.segment1
               ,aps.party_id
               ,aps.terms_id
               ,aps.pay_group_lookup_code
               ,aps.accts_pay_code_combination_id
           INTO x_vendor_rec.vendor_id
               ,x_vendor_rec.vendor_name
               ,x_vendor_rec.vendor_num
               ,x_vendor_rec.party_id
               ,x_vendor_rec.terms_id
               ,x_vendor_rec.pay_group
               ,x_vendor_rec.liab_acc
           FROM ap_suppliers aps
          WHERE aps.party_id            = p_party_id
            AND NVL (aps.enabled_flag, 'Y') = 'Y'
            AND NVL (aps.vendor_type_lookup_code, g_vendor_type_emp) = g_vendor_type_emp;
      EXCEPTION
         WHEN NO_DATA_FOUND THEN
            x_error_message := 'No existing employee supplier';   -- caller will create
            RETURN FALSE;
         WHEN TOO_MANY_ROWS THEN
            x_error_message := 'Multiple employee suppliers found for party_id ' || p_party_id;
            RETURN FALSE;
      END;

      -- Active pay site for this supplier in the requested OU.
      BEGIN
         SELECT assa.vendor_site_id
               ,assa.vendor_site_code
               ,assa.party_site_id
           INTO x_vendor_rec.vendor_site_id
               ,x_vendor_rec.vendor_site_code
               ,x_vendor_rec.party_site_id
           FROM ap_supplier_sites_all assa
          WHERE assa.vendor_id    = x_vendor_rec.vendor_id
            AND assa.org_id       = p_org_id
            AND assa.pay_site_flag = 'Y'
            AND SYSDATE < NVL (assa.inactive_date, SYSDATE + 1)
            AND ROWNUM = 1;
      EXCEPTION
         WHEN NO_DATA_FOUND THEN
            x_error_message := 'No employee supplier site';   -- caller will create
            RETURN FALSE;
      END;

      RETURN TRUE;
   EXCEPTION
      WHEN OTHERS THEN
         x_error_message := 'Error reading employee supplier : ' || SQLERRM;
         RETURN FALSE;
   END get_employee_supplier;

   ------------------------------------------------------------------------
   -- PRIVATE: create_payee  (IBY external payee, seeded CreatePayee)
   ------------------------------------------------------------------------
   FUNCTION create_payee
   (
       p_party_id      IN  NUMBER
      ,p_org_id        IN  NUMBER
      ,x_error_message OUT NOCOPY VARCHAR2
   ) RETURN BOOLEAN
   IS
      l_exists       VARCHAR2(1);
      l_return       VARCHAR2(1);
      l_msg_count    NUMBER;
      l_msg_data     VARCHAR2(2000);
      l_payee_tab    iby_disbursement_setup_pub.external_payee_tab_type;
      l_id_tab       iby_disbursement_setup_pub.ext_payee_id_tab_type;
      l_create_tab   iby_disbursement_setup_pub.ext_payee_create_tab_type;
   BEGIN
      BEGIN
         SELECT 'Y'
           INTO l_exists
           FROM iby_external_payees_all
          WHERE payee_party_id = p_party_id
            AND org_id         = p_org_id
            AND ROWNUM         = 1;
         RETURN TRUE;   -- already a payee
      EXCEPTION
         WHEN NO_DATA_FOUND THEN
            NULL;        -- fall through and create
      END;

      l_payee_tab (0).payee_party_id    := p_party_id;
      l_payee_tab (0).payer_org_id      := p_org_id;
      l_payee_tab (0).payment_function  := 'PAYABLES_DISB';
      l_payee_tab (0).exclusive_pay_flag := 'N';

      iby_disbursement_setup_pub.create_external_payee
         (p_api_version          => 1.0
         ,p_init_msg_list        => fnd_api.g_true
         ,p_ext_payee_tab        => l_payee_tab
         ,x_return_status        => l_return
         ,x_msg_count            => l_msg_count
         ,x_msg_data             => l_msg_data
         ,x_ext_payee_id_tab     => l_id_tab
         ,x_ext_payee_status_tab => l_create_tab);

      IF l_return <> fnd_api.g_ret_sts_success THEN
         x_error_message := 'Payee creation failed : '
                            || SUBSTRB (l_create_tab (0).payee_creation_msg, 1, 200);
         RETURN FALSE;
      END IF;

      RETURN TRUE;
   EXCEPTION
      WHEN OTHERS THEN
         x_error_message := 'Error creating payee : ' || SQLERRM;
         RETURN FALSE;
   END create_payee;

   ------------------------------------------------------------------------
   -- FUNCTION: create_employee_supplier
   --   Create supplier (if needed) + pay site + payee, mirroring the seeded
   --   AP_VENDOR_PUB_PKG flow but only with what Workday needs.
   ------------------------------------------------------------------------
   FUNCTION create_employee_supplier
   (
       p_employee_rec  IN  employee_rec_type
      ,p_full_name     IN  VARCHAR2
      ,p_org_id        IN  NUMBER
      ,x_vendor_rec    IN OUT NOCOPY vendor_rec_type
      ,x_error_message OUT NOCOPY VARCHAR2
   ) RETURN BOOLEAN
   IS
      l_return        VARCHAR2(1);
      l_msg_count     NUMBER;
      l_msg_data      VARCHAR2(2000);
      l_vendor_rec    ap_vendor_pub_pkg.r_vendor_rec_type;
      l_site_rec      ap_vendor_pub_pkg.r_vendor_site_rec_type;
      l_vendor_id     NUMBER;
      l_party_id      NUMBER;
      l_site_id       NUMBER;
      l_party_site_id NUMBER;
      l_location_id   NUMBER;
      l_create_flag   ap_system_parameters_all.create_employee_vendor_flag%TYPE;
      l_base_curr     ap_system_parameters_all.base_currency_code%TYPE;
      l_pay_priority  ap_system_parameters_all.employee_payment_priority%TYPE;
   BEGIN
      -- Payables Option must allow automatic employee->supplier creation.
      BEGIN
         SELECT create_employee_vendor_flag, base_currency_code, employee_payment_priority
           INTO l_create_flag, l_base_curr, l_pay_priority
           FROM ap_system_parameters_all
          WHERE org_id = p_org_id;
      EXCEPTION
         WHEN NO_DATA_FOUND THEN
            x_error_message := 'No Payables system parameters for org_id ' || p_org_id;
            RETURN FALSE;
      END;

      IF NVL (l_create_flag, 'N') <> 'Y' THEN
         x_error_message := 'Vendor not found and "Create Employee as Supplier" is disabled';
         RETURN FALSE;
      END IF;

      -------------------------------------------------------------------
      -- Create the supplier when it does not yet exist for the employee.
      -------------------------------------------------------------------
      IF NVL (x_vendor_rec.vendor_id, -1) = -1 THEN
         l_vendor_rec.vendor_name              := p_full_name;
         l_vendor_rec.employee_id              := p_employee_rec.person_id;
         l_vendor_rec.vendor_type_lookup_code  := g_vendor_type_emp;
         l_vendor_rec.invoice_currency_code    := l_base_curr;
         l_vendor_rec.payment_currency_code    := l_base_curr;
         l_vendor_rec.payment_priority         := l_pay_priority;

         ap_vendor_pub_pkg.create_vendor
            (p_api_version      => 1.0
            ,p_init_msg_list    => fnd_api.g_false
            ,p_commit           => fnd_api.g_false
            ,p_validation_level => fnd_api.g_valid_level_full
            ,x_return_status    => l_return
            ,x_msg_count        => l_msg_count
            ,x_msg_data         => l_msg_data
            ,p_vendor_rec       => l_vendor_rec
            ,x_vendor_id        => l_vendor_id
            ,x_party_id         => l_party_id);

         IF l_return <> fnd_api.g_ret_sts_success THEN
            x_error_message := 'Vendor creation failed : ' || SUBSTRB (l_msg_data, 1, 200);
            RETURN FALSE;
         END IF;

         x_vendor_rec.vendor_id := l_vendor_id;
         x_vendor_rec.party_id  := NVL (l_party_id, l_vendor_rec.party_id);
      END IF;

      -------------------------------------------------------------------
      -- Create the pay site (OFFICE) for the OU.
      -------------------------------------------------------------------
      l_site_rec.vendor_id              := x_vendor_rec.vendor_id;
      l_site_rec.org_id                 := p_org_id;
      l_site_rec.vendor_site_code       := 'OFFICE';
      l_site_rec.pay_site_flag          := 'Y';
      l_site_rec.invoice_currency_code  := l_base_curr;
      l_site_rec.payment_currency_code  := l_base_curr;
      l_site_rec.payment_priority       := l_pay_priority;

      ap_vendor_pub_pkg.create_vendor_site
         (p_api_version      => 1.0
         ,p_init_msg_list    => fnd_api.g_false
         ,p_commit           => fnd_api.g_false
         ,p_validation_level => fnd_api.g_valid_level_full
         ,x_return_status    => l_return
         ,x_msg_count        => l_msg_count
         ,x_msg_data         => l_msg_data
         ,p_vendor_site_rec  => l_site_rec
         ,x_vendor_site_id   => l_site_id
         ,x_party_site_id    => l_party_site_id
         ,x_location_id      => l_location_id);

      IF l_return <> fnd_api.g_ret_sts_success THEN
         x_error_message := 'Vendor site creation failed : ' || SUBSTRB (l_msg_data, 1, 200);
         RETURN FALSE;
      END IF;

      x_vendor_rec.vendor_site_id   := l_site_id;
      x_vendor_rec.vendor_site_code := l_site_rec.vendor_site_code;
      x_vendor_rec.party_site_id    := l_party_site_id;

      -- Refresh terms / pay group / liability from the new supplier.
      BEGIN
         SELECT vendor_name, segment1, terms_id,
                pay_group_lookup_code, accts_pay_code_combination_id
           INTO x_vendor_rec.vendor_name, x_vendor_rec.vendor_num, x_vendor_rec.terms_id,
                x_vendor_rec.pay_group, x_vendor_rec.liab_acc
           FROM ap_suppliers
          WHERE vendor_id = x_vendor_rec.vendor_id;
      EXCEPTION
         WHEN OTHERS THEN NULL;
      END;

      -- Ensure an IBY payee exists for the OU.
      IF NOT create_payee (x_vendor_rec.party_id, p_org_id, x_error_message) THEN
         RETURN FALSE;
      END IF;

      RETURN TRUE;
   EXCEPTION
      WHEN OTHERS THEN
         x_error_message := 'Error creating employee supplier : ' || SQLERRM;
         RETURN FALSE;
   END create_employee_supplier;

   ------------------------------------------------------------------------
   -- PRIVATE: insert_invoice_header
   --   One row into AP_INVOICES_INTERFACE.  Returns the generated invoice_id.
   ------------------------------------------------------------------------
   FUNCTION insert_invoice_header
   (
       p_hdr        IN XXTJX_AP_INVOICES_INTERFACE%ROWTYPE
      ,p_vendor_rec IN vendor_rec_type
      ,p_org_id     IN NUMBER
      ,p_source     IN VARCHAR2
      ,p_group_id   IN VARCHAR2
   ) RETURN NUMBER
   IS
      l_invoice_id   NUMBER;
   BEGIN
      SELECT ap_invoices_interface_s.NEXTVAL INTO l_invoice_id FROM DUAL;

      INSERT INTO ap_invoices_interface
         (invoice_id, invoice_num, invoice_type_lookup_code, invoice_date,
          vendor_id, vendor_site_id, party_id, party_site_id,
          invoice_amount, invoice_currency_code, description,
          terms_id, pay_group_lookup_code, accts_pay_code_combination_id,
          gl_date, source, group_id, org_id, status, request_id,
          product_table, reference_key1,
          creation_date, created_by, last_update_date, last_updated_by, last_update_login)
      VALUES
         (l_invoice_id, p_hdr.invoice_num, NVL (p_hdr.invoice_type_lookup_code, g_inv_type_standard),
          p_hdr.invoice_date,
          p_vendor_rec.vendor_id, p_vendor_rec.vendor_site_id, p_vendor_rec.party_id, p_vendor_rec.party_site_id,
          p_hdr.invoice_amount, p_hdr.invoice_currency_code, p_hdr.description,
          p_vendor_rec.terms_id, p_vendor_rec.pay_group, p_vendor_rec.liab_acc,
          p_hdr.gl_date, p_source, p_group_id, p_org_id, NULL, g_request_id,
          'XXTJX_AP_INVOICES_INTERFACE', p_hdr.batch_id,
          SYSDATE, g_user_id, SYSDATE, g_user_id, g_login_id);

      RETURN l_invoice_id;
   END insert_invoice_header;

   ------------------------------------------------------------------------
   -- PRIVATE: insert_invoice_lines
   --   Bulk insert all lines for one invoice via FORALL.
   ------------------------------------------------------------------------
   PROCEDURE insert_invoice_lines
   (
       p_lines      IN line_stg_tab
      ,p_invoice_id IN NUMBER
      ,p_org_id     IN NUMBER
   )
   IS
   BEGIN
      FORALL i IN 1 .. p_lines.COUNT
         INSERT INTO ap_invoice_lines_interface
            (invoice_id, invoice_line_id, line_number, line_type_lookup_code,
             amount, accounting_date, description,
             dist_code_concatenated, dist_code_combination_id,
             tax_classification_code, asset_category_id,
             org_id, attribute_category, attribute2,
             creation_date, created_by, last_update_date, last_updated_by, last_update_login)
         VALUES
            (p_invoice_id, ap_invoice_lines_interface_s.NEXTVAL, p_lines (i).line_number,
             NVL (p_lines (i).line_type_lookup_code, g_line_type_item),
             p_lines (i).amount, p_lines (i).accounting_date, p_lines (i).description,
             p_lines (i).dist_code_concatenated, p_lines (i).dist_code_combination_id,
             p_lines (i).tax_classification_code, p_lines (i).asset_category_id,
             p_org_id, p_lines (i).attribute_category, p_lines (i).attribute2,
             SYSDATE, g_user_id, SYSDATE, g_user_id, g_login_id);
   END insert_invoice_lines;

   ------------------------------------------------------------------------
   -- MAIN: import_expenses
   ------------------------------------------------------------------------
   PROCEDURE import_expenses
   (
       errbuf        OUT NOCOPY VARCHAR2
      ,retcode       OUT NOCOPY NUMBER
      ,p_source      IN          VARCHAR2
      ,p_org_id      IN          NUMBER   DEFAULT NULL
      ,p_batch_name  IN          VARCHAR2 DEFAULT NULL
      ,p_group_id    IN          VARCHAR2 DEFAULT NULL
      ,p_debug_flag  IN          VARCHAR2 DEFAULT 'N'
   )
   IS
      -- Header driving cursor: only NEW staging rows for the source/batch.
      CURSOR c_headers IS
         SELECT *
           FROM XXTJX_AP_INVOICES_INTERFACE h
          WHERE h.source = p_source
            AND h.process_status = g_status_new
            AND (p_batch_name IS NULL OR h.batch_id = p_batch_name)
          ORDER BY h.batch_id, h.invoice_num;

      TYPE hdr_tab IS TABLE OF XXTJX_AP_INVOICES_INTERFACE%ROWTYPE INDEX BY PLS_INTEGER;
      l_hdrs          hdr_tab;

      l_lines         line_stg_tab;
      l_emp_rec       employee_rec_type;
      l_vendor_rec    vendor_rec_type;
      l_org_id        NUMBER;
      l_invoice_id    NUMBER;
      l_err           VARCHAR2(4000);

      l_total         PLS_INTEGER := 0;
      l_success       PLS_INTEGER := 0;
      l_failure       PLS_INTEGER := 0;
      l_start         TIMESTAMP   := SYSTIMESTAMP;
   BEGIN
      g_debug := (NVL (UPPER (p_debug_flag), 'N') = 'Y');

      ----------------------------------------------------------------------
      -- Mandatory parameter check.
      ----------------------------------------------------------------------
      IF p_source IS NULL THEN
         errbuf  := 'Parameter Source is mandatory.';
         retcode := g_ret_error;
         RETURN;
      END IF;

      log_line ('============================================================');
      log_line ('Workday Expense -> AP Open Interface Import');
      log_line ('Module        : ' || g_module);
      log_line ('Request Id    : ' || g_request_id);
      log_line ('Source        : ' || p_source);
      log_line ('Operating Unit: ' || NVL (TO_CHAR (p_org_id), 'ALL (derived from file)'));
      log_line ('Batch         : ' || NVL (p_batch_name, 'ALL NEW'));
      log_line ('Group Id      : ' || NVL (p_group_id, '(none)'));
      log_line ('Started       : ' || TO_CHAR (l_start, 'DD-MON-YYYY HH24:MI:SS'));
      log_line ('============================================================');

      out_line (RPAD ('Invoice Num', 22) || RPAD ('Employee', 12)
                || RPAD ('Status', 10) || 'Message');
      out_line (RPAD ('-', 110, '-'));

      ----------------------------------------------------------------------
      -- Process headers in bulk batches.
      ----------------------------------------------------------------------
      OPEN c_headers;
      LOOP
         FETCH c_headers BULK COLLECT INTO l_hdrs LIMIT g_bulk_limit;
         EXIT WHEN l_hdrs.COUNT = 0;

         FOR i IN 1 .. l_hdrs.COUNT
         LOOP
            l_total := l_total + 1;
            l_err   := NULL;

            <<process_one_invoice>>
            BEGIN
               -- 1. Employee number present and known.
               IF NOT validate_employee_number (l_hdrs (i).employee_number, l_err) THEN
                  RAISE_APPLICATION_ERROR (-20001, l_err);
               END IF;

               -- 2. Operating unit valid (param wins, else file OU name).
               IF NOT validate_operating_unit
                        (l_hdrs (i).operating_unit_name, p_org_id, l_org_id, l_err) THEN
                  RAISE_APPLICATION_ERROR (-20002, l_err);
               END IF;

               -- 3. Person / party derivation (single active assignment).
               IF NOT derive_person_details
                        (l_hdrs (i).employee_number, l_org_id, l_emp_rec, l_err) THEN
                  RAISE_APPLICATION_ERROR (-20003, l_err);
               END IF;

               -- 4. Existing employee supplier + site, else create.
               l_vendor_rec := NULL;
               IF NOT get_employee_supplier
                        (l_emp_rec.party_id, l_org_id, l_vendor_rec, l_err) THEN
                  -- Not found -> attempt creation (seeded behaviour).
                  l_vendor_rec.party_id := l_emp_rec.party_id;
                  IF NOT create_employee_supplier
                           (l_emp_rec, l_emp_rec.full_name, l_org_id, l_vendor_rec, l_err) THEN
                     RAISE_APPLICATION_ERROR (-20004, l_err);
                  END IF;
               END IF;

               -- 5. Collect this invoice's NEW lines.
               SELECT * BULK COLLECT INTO l_lines
                 FROM XXTJX_AP_INV_LINES_INTERFACE l
                WHERE l.invoice_num    = l_hdrs (i).invoice_num
                  AND l.batch_id       = l_hdrs (i).batch_id
                  AND l.process_status = g_status_new
                ORDER BY l.line_number;

               IF l_lines.COUNT = 0 THEN
                  RAISE_APPLICATION_ERROR (-20005, 'No lines found for invoice ' || l_hdrs (i).invoice_num);
               END IF;

               -- 6. Insert into the Oracle AP Open Interface tables.
               l_invoice_id := insert_invoice_header
                                  (l_hdrs (i), l_vendor_rec, l_org_id, p_source, p_group_id);
               insert_invoice_lines (l_lines, l_invoice_id, l_org_id);

               -- 7. Mark staging Transferred.
               mark_record (l_hdrs (i).invoice_num, l_hdrs (i).batch_id, g_status_transferred, NULL);
               l_success := l_success + 1;

               out_line (RPAD (l_hdrs (i).invoice_num, 22)
                         || RPAD (l_hdrs (i).employee_number, 12)
                         || RPAD ('TRANSFER', 10)
                         || 'Inserted ' || l_lines.COUNT || ' line(s)');

            EXCEPTION
               WHEN OTHERS THEN
                  l_failure := l_failure + 1;
                  l_err := NVL (l_err, SQLERRM);
                  mark_record (l_hdrs (i).invoice_num, l_hdrs (i).batch_id, g_status_error, l_err);
                  out_line (RPAD (l_hdrs (i).invoice_num, 22)
                            || RPAD (l_hdrs (i).employee_number, 12)
                            || RPAD ('ERROR', 10) || l_err);
            END process_one_invoice;
         END LOOP;

         -- Commit after each bulk batch (limited commits, not row-by-row).
         COMMIT;
      END LOOP;
      CLOSE c_headers;

      ----------------------------------------------------------------------
      -- Summary + run log + return code.
      ----------------------------------------------------------------------
      log_line ('------------------------------------------------------------');
      log_line ('Total processed : ' || l_total);
      log_line ('Transferred     : ' || l_success);
      log_line ('Errors          : ' || l_failure);
      log_line ('------------------------------------------------------------');

      write_run_log
         (p_proc => 'import_expenses', p_source => p_source, p_batch_id => p_batch_name,
          p_total => l_total, p_success => l_success, p_failure => l_failure,
          p_start => l_start,
          p_status => CASE WHEN l_failure = 0 THEN 'SUCCESS' ELSE 'WARNING' END);

      IF l_failure = 0 THEN
         retcode := g_ret_success;
         errbuf  := 'Imported ' || l_success || ' expense report(s) successfully.';
      ELSE
         retcode := g_ret_warning;
         errbuf  := 'Completed with errors. Transferred=' || l_success
                    || ', Errors=' || l_failure || '. See output for details.';
      END IF;
   EXCEPTION
      WHEN OTHERS THEN
         IF c_headers%ISOPEN THEN
            CLOSE c_headers;
         END IF;
         ROLLBACK;
         retcode := g_ret_error;
         errbuf  := 'Fatal error in import_expenses : ' || SQLERRM;
         log_line (errbuf);
         log_line (DBMS_UTILITY.format_error_backtrace);
         write_run_log
            (p_proc => 'import_expenses', p_source => p_source, p_batch_id => p_batch_name,
             p_total => l_total, p_success => l_success, p_failure => l_failure,
             p_start => l_start, p_status => 'FATAL', p_message => errbuf);
   END import_expenses;

END XXTJX_WD_EXP_AP_IMPORT_PKG;
/
SHOW ERRORS;
