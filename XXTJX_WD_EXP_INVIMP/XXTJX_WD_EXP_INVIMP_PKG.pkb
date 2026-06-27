SET DEFINE OFF;
create or replace PACKAGE BODY xxtjx_wd_exp_invimp_pkg
AS

    /**************************************************************************
   *
   * FILE NAME
   *   XXTJX_WD_EXP_INVIMP_PKG.pkb
   *
   * PROGRAM NAME
   *  APPS.XXTJX_WD_EXP_INVIMP_PKG
   *
   * DESCRIPTION
   * Package to import Workday Expense Reports from a pipe delimited file into
   * the Oracle Payables Open Interface. Validates staged records, derives the
   * employee, gets or creates the employee supplier and supplier site,
   * populates the AP invoice header and line interface tables, updates the
   * staging status and logs the results.
   *
   * BUSINESS LOGIC SOURCE
   *   AP_WEB_EXPORT_ER (Oracle seeded) - GetVendorInfo / InsertInvoiceInterface
   *   / InsertInvoiceLinesInterface.
   *
   * ASSUMPTIONS
   *   - Staging tables XXTJX_AP_INVOICES_INTERFACE (header) and
   *     XXTJX_AP_INV_LINES_INTERFACE (line) are replicas of AP_INVOICES_ALL /
   *     AP_INVOICE_LINES_ALL plus DIST_CODE_CONCATENATED and the two control
   *     columns (PROCESS_STATUS_FLAG, ERROR_MESSAGE) added by the DDL script.
   *   - Employee Number is staged in ATTRIBUTE1, Operating Unit Name in
   *     ATTRIBUTE2 (header). Batch Id is staged in GLOBAL_ATTRIBUTE1.
   *   - The Payables Open Interface Import (APXIIMPT) is run as a separate
   *     scheduled request (p_import_flag defaults to N).
   *
   * HISTORY
   * =======
   *
   * VERSION DATE        AUTHOR(S)       DESCRIPTION
   * ------- ----------- --------------- ------------------------------------
   * 1.0     25-JUN-2026 <Author>          Initial version.
   * 1.1     27-JUN-2026 <Author>          Derive a single active person id
   *                                       using the operating unit business
   *                                       group, with expatriate employee
   *                                       handling (reject when more than one
   *                                       active person id resolves).
   * 1.2     27-JUN-2026 <Author>          Distinguish expatriate person ids
   *                                       that share an employee number by the
   *                                       active (ACTIVE_ASSIGN) primary
   *                                       assignment; reject if more than one
   *                                       active person id remains.
   * 1.3     27-JUN-2026 <Author>          When more than one active person id
   *                                       resolves, select the person with the
   *                                       latest period of service start date
   *                                       instead of rejecting.
   *************************************************************************/

   ----------------------------------------------------------------------------
   -- Global constants
   ----------------------------------------------------------------------------
   gc_source              CONSTANT VARCHAR2 (80)  := 'TJXWD_EXP US';
   gc_ou_name             CONSTANT VARCHAR2 (240) := 'The TJX Companies – US';
   gc_application_id      CONSTANT NUMBER         := 200;
   gc_invoice_type        CONSTANT VARCHAR2 (25)  := 'STANDARD';
   gc_line_type           CONSTANT VARCHAR2 (25)  := 'ITEM';
   gc_site_office         CONSTANT VARCHAR2 (15)  := 'OFFICE';
   gc_vendor_type         CONSTANT VARCHAR2 (25)  := 'EMPLOYEE';
   gc_st_new              CONSTANT VARCHAR2 (20)  := 'NEW';
   gc_st_validated        CONSTANT VARCHAR2 (20)  := 'VALIDATED';
   gc_st_error            CONSTANT VARCHAR2 (20)  := 'ERROR';
   gc_st_processed        CONSTANT VARCHAR2 (20)  := 'PROCESSED';
   gc_bulk_limit          CONSTANT PLS_INTEGER    := 500;

   ----------------------------------------------------------------------------
   -- Global variables
   ----------------------------------------------------------------------------
   g_user_id              NUMBER (38) := fnd_profile.VALUE ('USER_ID');
   g_login_id             NUMBER (38) := fnd_global.login_id;
   g_org_id               NUMBER (38) := fnd_profile.VALUE ('ORG_ID');
   g_request_id           NUMBER (38) := fnd_profile.VALUE ('CONC_REQUEST_ID');
   g_audit_id             NUMBER (38) := NULL;
   g_file_name            VARCHAR2 (240) := NULL;
   l_temp_msg             VARCHAR2 (4000) := NULL;

   ----------------------------------------------------------------------------
   -- Local record holding the derived vendor / site information
   ----------------------------------------------------------------------------
   TYPE vendor_info_rec IS RECORD (
      vendor_id          ap_suppliers.vendor_id%TYPE,
      vendor_site_id     ap_supplier_sites_all.vendor_site_id%TYPE,
      party_id           ap_suppliers.party_id%TYPE,
      party_site_id      ap_supplier_sites_all.party_site_id%TYPE,
      terms_id           ap_suppliers.terms_id%TYPE,
      pay_group          ap_suppliers.pay_group_lookup_code%TYPE,
      terms_date_basis   ap_suppliers.terms_date_basis%TYPE,
      liab_acc           ap_supplier_sites_all.accts_pay_code_combination_id%TYPE,
      payment_priority   ap_supplier_sites_all.payment_priority%TYPE
   );

  /**************************************************************************
    *
    * PROCEDURE
    *  write_log
    *
    * DESCRIPTION
    *  Centralised logging. Mirrors the message to the standard audit
    *  framework (xxtjx_audit_pkg) and persists a row to the custom log table.
    *
    * PARAMETERS
    * ==========
    * NAME               TYPE   DESCRIPTION
    * ------------------ ------ -------------------------------------------
    * p_msg_type         IN     Message type (LOG / OUTPUT / se~ / be~)
    * p_msg_txt          IN     Message text
    * p_employee_number  IN     Employee number (optional)
    * p_invoice_number   IN     Invoice number (optional)
    * p_line_number      IN     Line number (optional)
    * p_vendor_id        IN     Vendor id (optional)
    * p_vendor_site_id   IN     Vendor site id (optional)
    *
    * CALLED BY
    *  All procedures / functions in this package
    *************************************************************************/
   PROCEDURE write_log (
      p_msg_type          IN   VARCHAR2,
      p_msg_txt           IN   VARCHAR2,
      p_employee_number   IN   VARCHAR2 DEFAULT NULL,
      p_invoice_number    IN   VARCHAR2 DEFAULT NULL,
      p_line_number       IN   NUMBER   DEFAULT NULL,
      p_vendor_id         IN   NUMBER   DEFAULT NULL,
      p_vendor_site_id    IN   NUMBER   DEFAULT NULL
   )
   IS
   BEGIN
      xxtjx_audit_pkg.build_message (p_msg_type => p_msg_type, p_msg_txt => p_msg_txt);

      INSERT INTO xxtjx_wd_exp_inv_log
                  (log_id, request_id, file_name, batch_id, employee_number,
                   invoice_number, line_number, vendor_id, vendor_site_id,
                   message_type, error_message, processing_date,
                   created_by, creation_date)
           VALUES (xxtjx_wd_exp_inv_log_s.NEXTVAL, g_request_id, g_file_name, NULL,
                   p_employee_number, p_invoice_number, p_line_number, p_vendor_id,
                   p_vendor_site_id, p_msg_type, SUBSTR (p_msg_txt, 1, 4000),
                   SYSTIMESTAMP, g_user_id, SYSDATE);
   EXCEPTION
      WHEN OTHERS THEN
         fnd_file.put_line (fnd_file.LOG, 'write_log error: ' || SQLERRM);
   END write_log;

  /**************************************************************************
    *
    * PROCEDURE
    *  log_error
    *
    * DESCRIPTION
    *  Persists a record / field level validation failure to the error table.
    *
    * CALLED BY
    *  validate_staging_records, export_expense_report_to_ap
    *************************************************************************/
   PROCEDURE log_error (
      p_record_type       IN   VARCHAR2,
      p_invoice_number    IN   VARCHAR2,
      p_line_number       IN   NUMBER,
      p_employee_number   IN   VARCHAR2,
      p_error_code        IN   VARCHAR2,
      p_error_message     IN   VARCHAR2
   )
   IS
   BEGIN
      INSERT INTO xxtjx_wd_exp_inv_err
                  (error_id, request_id, batch_id, record_type, invoice_number,
                   line_number, employee_number, error_code, error_message,
                   creation_date, created_by)
           VALUES (xxtjx_wd_exp_inv_err_s.NEXTVAL, g_request_id, NULL, p_record_type,
                   p_invoice_number, p_line_number, p_employee_number, p_error_code,
                   SUBSTR (p_error_message, 1, 2000), SYSDATE, g_user_id);
   EXCEPTION
      WHEN OTHERS THEN
         fnd_file.put_line (fnd_file.LOG, 'log_error error: ' || SQLERRM);
   END log_error;

  /**************************************************************************
    *
    * PROCEDURE
    *  initialize_audit
    *
    * DESCRIPTION
    *  Initialises the audit id and writes the run header banner to the
    *  concurrent log and output.
    *
    * CALLED BY
    *  main procedure export_expense_report_to_ap
    *************************************************************************/
   PROCEDURE initialize_audit (
      p_source   IN   VARCHAR2
   )
   IS
   BEGIN
      xxtjx_audit_pkg.upsert_audit_table (x_audit_id => g_audit_id, p_request_id => g_request_id);
      l_temp_msg                 :=
            '-----------------------------------------------------------------------------'
         || CHR (10)
         || 'WD Expense Report to AP Invoice Import'
         || CHR (10)
         || 'Package: XXTJX_WD_EXP_INVIMP_PKG '
         || CHR (10)
         || 'Called By: '
         || g_user_id
         || CHR (10)
         || 'Start Date Time: '
         || TO_CHAR (SYSTIMESTAMP, 'DD-MON-YYYY HH24:MI:SS:FF')
         || CHR (10)
         || 'Audit ID: '
         || g_audit_id
         || CHR (10)
         || 'Org ID: '
         || g_org_id
         || CHR (10)
         || 'Source: '
         || p_source;
      xxtjx_audit_pkg.build_message (p_msg_type => 'LOG', p_msg_txt => l_temp_msg);
   EXCEPTION
      WHEN OTHERS THEN
         xxtjx_audit_pkg.build_message (p_msg_type                    => 'se~05~ServiceException'
                                      , p_msg_txt                     =>    'Error While initialize '
                                                                         || 'Error Msg: '
                                                                         || SQLERRM
                                                                         || ' '
                                                                         || 'Occured at '
                                                                         || TO_CHAR (SYSTIMESTAMP, 'YYYY/MM/DD HH24:MI:SS:FF')
                                       );
   END initialize_audit;

  /**************************************************************************
    *
    * PROCEDURE
    *  update_status
    *
    * DESCRIPTION
    *  Updates the process status flag and error message on the header or
    *  line staging table.
    *
    * PARAMETERS
    * ==========
    * NAME             TYPE   DESCRIPTION
    * ---------------- ------ ----------------------------------------------
    * p_level          IN     HEADER or LINE
    * p_source         IN     Invoice source
    * p_batch_id       IN     File batch id
    * p_invoice_num    IN     Invoice number
    * p_status         IN     New status (VALIDATED / ERROR / PROCESSED)
    * p_message        IN     Error / status message
    *
    * CALLED BY
    *  validate_staging_records, export_expense_report_to_ap
    *************************************************************************/
   PROCEDURE update_status (
      p_level         IN   VARCHAR2,
      p_source        IN   VARCHAR2,
      p_batch_id      IN   VARCHAR2,
      p_invoice_num   IN   VARCHAR2,
      p_status        IN   VARCHAR2,
      p_message       IN   VARCHAR2 DEFAULT NULL
   )
   IS
   BEGIN
      IF p_level = 'HEADER'
      THEN
         UPDATE xxtjx_ap_invoices_interface
            SET process_status_flag    = p_status,
                error_message          = SUBSTR (p_message, 1, 2000),
                request_id             = g_request_id,
                last_update_date       = SYSDATE,
                last_updated_by        = g_user_id
          WHERE SOURCE = p_source
            AND NVL (global_attribute1, '~') = NVL (p_batch_id, '~')
            AND invoice_num = p_invoice_num;
      ELSE
         UPDATE xxtjx_ap_inv_lines_interface
            SET process_status_flag    = p_status,
                error_message          = SUBSTR (p_message, 1, 2000)
          WHERE NVL (global_attribute1, '~') = NVL (p_batch_id, '~')
            AND invoice_num = p_invoice_num;
      END IF;
   EXCEPTION
      WHEN OTHERS THEN
         write_log (p_msg_type      => 'se~01~ServiceException',
                    p_msg_txt       =>    'Error updating status for invoice '
                                       || p_invoice_num
                                       || ' Error Msg: '
                                       || SQLERRM);
   END update_status;

  /**************************************************************************
    *
    * FUNCTION
    *  get_employee_details
    *
    * DESCRIPTION
    *  Derives the person id and full name for the incoming employee number
    *  and verifies that the employee is active. Only active employees are
    *  processed.
    *
    * PARAMETERS
    * ==========
    * NAME                TYPE    DESCRIPTION
    * ------------------- ------- -------------------------------------------
    * p_employee_number   IN      WD employee number
    * p_org_id            IN      Operating unit id (resolves business group)
    * x_person_id         OUT     Derived person id (= employee id)
    * x_full_name         OUT     Employee full name
    * x_reject            OUT     Reject reason when FALSE
    *
    * RETURN VALUE
    *  BOOLEAN - TRUE when a single valid active employee is found
    *
    * NOTE
    *  The employee number alone is not unique for expatriate employees, who
    *  may hold separate person records (person ids) for the same number. The
    *  operating unit business group (derived from p_org_id) scopes the lookup
    *  and only the active primary assignment (per_system_status =
    *  'ACTIVE_ASSIGN') is considered, so a suspended home assignment is
    *  ignored even though its primary_flag is still 'Y'. When more than one
    *  active person id still resolves the person with the latest period of
    *  service start date (per_periods_of_service.date_start) is selected.
    *
    * CALLED BY
    *  validate_staging_records, export_expense_report_to_ap
    *************************************************************************/
   FUNCTION get_employee_details (
      p_employee_number   IN       VARCHAR2,
      p_org_id            IN       NUMBER,
      x_person_id         OUT      NUMBER,
      x_full_name         OUT      VARCHAR2,
      x_reject            OUT      VARCHAR2
   )
      RETURN BOOLEAN
   IS
      l_match_count   NUMBER := 0;
   BEGIN
      ----------------------------------------------------------------
      -- Count the distinct active persons for this employee number
      -- within the operating unit business group (active primary
      -- assignment only). Expatriates may resolve to more than one.
      ----------------------------------------------------------------
      BEGIN
         SELECT COUNT (DISTINCT papf.person_id)
           INTO l_match_count
           FROM per_all_people_f             papf,
                per_all_assignments_f        paaf,
                per_assignment_status_types  past,
                hr_operating_units           hou
          WHERE papf.employee_number = p_employee_number
            AND hou.organization_id = p_org_id
            AND papf.business_group_id = hou.business_group_id
            AND papf.current_employee_flag = 'Y'
            AND TRUNC (SYSDATE) BETWEEN papf.effective_start_date AND papf.effective_end_date
            AND paaf.person_id = papf.person_id
            AND paaf.business_group_id = papf.business_group_id
            AND paaf.primary_flag = 'Y'
            AND paaf.assignment_type = 'E'
            AND TRUNC (SYSDATE) BETWEEN paaf.effective_start_date AND paaf.effective_end_date
            AND past.assignment_status_type_id = paaf.assignment_status_type_id
            AND past.per_system_status = 'ACTIVE_ASSIGN';
      EXCEPTION
         WHEN OTHERS THEN
            l_match_count := 1;
      END;

      IF NVL (l_match_count, 0) = 0
      THEN
         x_reject := 'No active employee found for employee number ' || p_employee_number;
         RETURN (FALSE);
      END IF;

      IF l_match_count > 1
      THEN
         write_log (p_msg_type         => 'LOG',
                    p_msg_txt          =>    'Employee number '
                                          || p_employee_number
                                          || ' resolved to '
                                          || l_match_count
                                          || ' active persons; selecting the latest period of service.',
                    p_employee_number  => p_employee_number);
      END IF;

      ----------------------------------------------------------------
      -- Pick the active person with the latest period of service start
      -- date (the most recent deployment for an expatriate). The order
      -- by is fully deterministic so exactly one person id is returned.
      ----------------------------------------------------------------
      BEGIN
         SELECT person_id, full_name
           INTO x_person_id, x_full_name
           FROM (SELECT papf.person_id,
                        papf.full_name,
                        ROW_NUMBER () OVER (ORDER BY ppos.date_start DESC,
                                                     papf.effective_start_date DESC,
                                                     papf.person_id DESC) rn
                   FROM per_all_people_f             papf,
                        per_all_assignments_f        paaf,
                        per_assignment_status_types  past,
                        per_periods_of_service       ppos,
                        hr_operating_units           hou
                  WHERE papf.employee_number = p_employee_number
                    AND hou.organization_id = p_org_id
                    AND papf.business_group_id = hou.business_group_id
                    AND papf.current_employee_flag = 'Y'
                    AND TRUNC (SYSDATE) BETWEEN papf.effective_start_date AND papf.effective_end_date
                    AND paaf.person_id = papf.person_id
                    AND paaf.business_group_id = papf.business_group_id
                    AND paaf.primary_flag = 'Y'
                    AND paaf.assignment_type = 'E'
                    AND TRUNC (SYSDATE) BETWEEN paaf.effective_start_date AND paaf.effective_end_date
                    AND past.assignment_status_type_id = paaf.assignment_status_type_id
                    AND past.per_system_status = 'ACTIVE_ASSIGN'
                    AND ppos.person_id = papf.person_id
                    AND ppos.business_group_id = papf.business_group_id
                    AND ppos.date_start = (SELECT MAX (ppos2.date_start)
                                             FROM per_periods_of_service ppos2
                                            WHERE ppos2.person_id = papf.person_id
                                              AND ppos2.business_group_id = papf.business_group_id))
          WHERE rn = 1;
      EXCEPTION
         WHEN NO_DATA_FOUND THEN
            x_reject := 'No active employee found for employee number ' || p_employee_number;
            RETURN (FALSE);
      END;

      RETURN (TRUE);
   EXCEPTION
      WHEN OTHERS THEN
         x_reject := 'Error deriving employee ' || p_employee_number || ' : ' || SQLERRM;
         RETURN (FALSE);
   END get_employee_details;

  /**************************************************************************
    *
    * FUNCTION
    *  get_or_create_employee_supplier
    *
    * DESCRIPTION
    *  Searches for an existing employee supplier and supplier site. When the
    *  supplier / site does not exist they are created using the standard
    *  Oracle APIs AP_VENDOR_PUB_PKG.create_vendor / create_vendor_site
    *  (logic derived from AP_WEB_EXPORT_ER.GetVendorInfo). Returns the vendor
    *  id and vendor site id.
    *
    * PARAMETERS
    * ==========
    * NAME                TYPE      DESCRIPTION
    * ------------------- --------- -----------------------------------------
    * p_person_id         IN        Employee person id
    * p_org_id            IN        Operating unit id
    * p_employee_number   IN        Employee number (for logging)
    * p_full_name         IN        Employee full name (vendor name)
    * x_vendor_rec        IN OUT    Vendor info record (vendor_id / site_id)
    * x_reject            OUT       Reject reason when FALSE
    *
    * RETURN VALUE
    *  BOOLEAN - TRUE when the supplier and site are available
    *
    * CALLED BY
    *  export_expense_report_to_ap
    *************************************************************************/
   FUNCTION get_or_create_employee_supplier (
      p_person_id         IN       NUMBER,
      p_org_id            IN       NUMBER,
      p_employee_number   IN       VARCHAR2,
      p_full_name         IN       VARCHAR2,
      x_vendor_rec        IN OUT   vendor_info_rec,
      x_reject            OUT      VARCHAR2
   )
      RETURN BOOLEAN
   IS
      l_create_vendor_flag    ap_system_parameters_all.create_employee_vendor_flag%TYPE := NULL;
      l_base_currency_code    ap_system_parameters_all.base_currency_code%TYPE := NULL;
      l_payment_priority      ap_suppliers.payment_priority%TYPE := NULL;
      l_numbering_method      ap_product_setup.supplier_numbering_method%TYPE := NULL;
      l_party_id              ap_suppliers.party_id%TYPE := NULL;
      l_party_site_id         ap_supplier_sites_all.party_site_id%TYPE := NULL;
      l_location_id           NUMBER := NULL;
      l_return_status         VARCHAR2 (1) := NULL;
      l_msg_count             NUMBER := 0;
      l_msg_data              VARCHAR2 (2000) := NULL;
      l_vendor_rec            ap_vendor_pub_pkg.r_vendor_rec_type;
      l_vendor_site_rec       ap_vendor_pub_pkg.r_vendor_site_rec_type;
   BEGIN
      ----------------------------------------------------------------
      -- Search for an existing employee supplier.
      ----------------------------------------------------------------
      BEGIN
         SELECT vendor_id, party_id
           INTO x_vendor_rec.vendor_id, x_vendor_rec.party_id
           FROM ap_suppliers
          WHERE employee_id = p_person_id;
      EXCEPTION
         WHEN NO_DATA_FOUND THEN
            x_vendor_rec.vendor_id := NULL;
         WHEN TOO_MANY_ROWS THEN
            x_reject := 'Duplicate employee supplier';
            RETURN (FALSE);
      END;

      ----------------------------------------------------------------
      -- Read the payables options that gate automatic supplier creation.
      ----------------------------------------------------------------
      BEGIN
         SELECT create_employee_vendor_flag, base_currency_code, employee_payment_priority
           INTO l_create_vendor_flag, l_base_currency_code, l_payment_priority
           FROM ap_system_parameters_all
          WHERE org_id = p_org_id;
      EXCEPTION
         WHEN OTHERS THEN
            l_create_vendor_flag := 'N';
      END;

      ----------------------------------------------------------------
      -- Create the employee supplier when it does not exist.
      ----------------------------------------------------------------
      IF NVL (x_vendor_rec.vendor_id, -1) = -1
      THEN
         BEGIN
            SELECT party_id
              INTO l_party_id
              FROM per_all_people_f
             WHERE person_id = p_person_id
               AND ROWNUM = 1;
         EXCEPTION
            WHEN OTHERS THEN
               l_party_id := NULL;
         END;

         IF NVL (l_party_id, -1) = -1
         THEN
            x_reject := 'Invalid party for employee ' || p_employee_number;
            RETURN (FALSE);
         END IF;

         IF NVL (l_create_vendor_flag, 'N') <> 'Y'
         THEN
            x_reject := 'Automatic employee supplier creation not enabled';
            RETURN (FALSE);
         END IF;

         BEGIN
            SELECT supplier_numbering_method
              INTO l_numbering_method
              FROM ap_product_setup
             WHERE ROWNUM = 1;
         EXCEPTION
            WHEN OTHERS THEN
               l_numbering_method := NULL;
         END;

         IF NVL (l_numbering_method, 'X') <> 'AUTOMATIC'
         THEN
            x_reject := 'Supplier numbering method is not AUTOMATIC';
            RETURN (FALSE);
         END IF;

         l_vendor_rec.vendor_name              := p_full_name;
         l_vendor_rec.employee_id              := p_person_id;
         l_vendor_rec.vendor_type_lookup_code  := gc_vendor_type;
         l_vendor_rec.invoice_currency_code    := l_base_currency_code;
         l_vendor_rec.payment_currency_code    := l_base_currency_code;
         l_vendor_rec.payment_priority         := l_payment_priority;

         ap_vendor_pub_pkg.create_vendor (p_api_version        => 1.0,
                                          p_init_msg_list      => fnd_api.g_false,
                                          p_commit             => fnd_api.g_false,
                                          p_validation_level   => fnd_api.g_valid_level_full,
                                          x_return_status      => l_return_status,
                                          x_msg_count          => l_msg_count,
                                          x_msg_data           => l_msg_data,
                                          p_vendor_rec         => l_vendor_rec,
                                          x_vendor_id          => x_vendor_rec.vendor_id,
                                          x_party_id           => x_vendor_rec.party_id);

         IF l_return_status <> fnd_api.g_ret_sts_success
         THEN
            x_reject := SUBSTR ('Create supplier failed: ' || NVL (l_msg_data, fnd_msg_pub.get (p_encoded => fnd_api.g_false)), 1, 240);
            RETURN (FALSE);
         END IF;

         write_log (p_msg_type         => 'LOG',
                    p_msg_txt          => 'Created employee supplier for ' || p_employee_number || ', vendor id ' || x_vendor_rec.vendor_id,
                    p_employee_number  => p_employee_number,
                    p_vendor_id        => x_vendor_rec.vendor_id);
      END IF;

      ----------------------------------------------------------------
      -- Search for an existing pay site for this org (OFFICE).
      ----------------------------------------------------------------
      BEGIN
         SELECT vendor_site_id, party_site_id
           INTO x_vendor_rec.vendor_site_id, x_vendor_rec.party_site_id
           FROM ap_supplier_sites_all
          WHERE vendor_id = x_vendor_rec.vendor_id
            AND org_id = p_org_id
            AND vendor_site_code = gc_site_office
            AND SYSDATE < NVL (inactive_date, SYSDATE + 1)
            AND ROWNUM = 1;
      EXCEPTION
         WHEN NO_DATA_FOUND THEN
            x_vendor_rec.vendor_site_id := NULL;
      END;

      ----------------------------------------------------------------
      -- Create the supplier site when it does not exist.
      ----------------------------------------------------------------
      IF NVL (x_vendor_rec.vendor_site_id, -1) = -1
      THEN
         IF NVL (l_create_vendor_flag, 'N') <> 'Y'
         THEN
            x_reject := 'Invalid vendor site (auto-create not enabled)';
            RETURN (FALSE);
         END IF;

         l_vendor_site_rec.vendor_id               := x_vendor_rec.vendor_id;
         l_vendor_site_rec.org_id                  := p_org_id;
         l_vendor_site_rec.vendor_site_code        := gc_site_office;
         l_vendor_site_rec.pay_site_flag           := 'Y';
         l_vendor_site_rec.invoice_currency_code   := l_base_currency_code;
         l_vendor_site_rec.payment_currency_code   := l_base_currency_code;
         l_vendor_site_rec.payment_priority        := l_payment_priority;

         ap_vendor_pub_pkg.create_vendor_site (p_api_version        => 1.0,
                                               p_init_msg_list      => fnd_api.g_false,
                                               p_commit             => fnd_api.g_false,
                                               p_validation_level   => fnd_api.g_valid_level_full,
                                               x_return_status      => l_return_status,
                                               x_msg_count          => l_msg_count,
                                               x_msg_data           => l_msg_data,
                                               p_vendor_site_rec    => l_vendor_site_rec,
                                               x_vendor_site_id     => x_vendor_rec.vendor_site_id,
                                               x_party_site_id      => l_party_site_id,
                                               x_location_id        => l_location_id);

         IF l_return_status <> fnd_api.g_ret_sts_success
         THEN
            x_reject := SUBSTR ('Create supplier site failed: ' || NVL (l_msg_data, fnd_msg_pub.get (p_encoded => fnd_api.g_false)), 1, 240);
            RETURN (FALSE);
         END IF;

         x_vendor_rec.party_site_id := l_party_site_id;

         write_log (p_msg_type         => 'LOG',
                    p_msg_txt          => 'Created supplier site for vendor ' || x_vendor_rec.vendor_id || ', site id ' || x_vendor_rec.vendor_site_id,
                    p_employee_number  => p_employee_number,
                    p_vendor_id        => x_vendor_rec.vendor_id,
                    p_vendor_site_id   => x_vendor_rec.vendor_site_id);
      END IF;

      RETURN (TRUE);
   EXCEPTION
      WHEN OTHERS THEN
         x_reject := SUBSTR ('Error in get_or_create_employee_supplier: ' || SQLERRM, 1, 240);
         RETURN (FALSE);
   END get_or_create_employee_supplier;

  /**************************************************************************
    *
    * FUNCTION
    *  get_vendor_information
    *
    * DESCRIPTION
    *  Reads the supplier / site defaults (terms, pay group, liability
    *  account, party site, payment priority) required to populate the
    *  invoice header interface.
    *
    * PARAMETERS
    * ==========
    * NAME           TYPE      DESCRIPTION
    * -------------- --------- ----------------------------------------------
    * x_vendor_rec   IN OUT    Vendor info record (vendor_id / site_id in)
    * x_reject       OUT       Reject reason when FALSE
    *
    * RETURN VALUE
    *  BOOLEAN - TRUE when the vendor information is derived
    *
    * CALLED BY
    *  export_expense_report_to_ap
    *************************************************************************/
   FUNCTION get_vendor_information (
      x_vendor_rec   IN OUT   vendor_info_rec,
      x_reject       OUT      VARCHAR2
   )
      RETURN BOOLEAN
   IS
      l_v_terms_id          ap_suppliers.terms_id%TYPE := NULL;
      l_v_pay_group         ap_suppliers.pay_group_lookup_code%TYPE := NULL;
      l_v_terms_date_basis  ap_suppliers.terms_date_basis%TYPE := NULL;
      l_s_terms_id          ap_supplier_sites_all.terms_id%TYPE := NULL;
      l_s_pay_group         ap_supplier_sites_all.pay_group_lookup_code%TYPE := NULL;
      l_s_liab_acc          ap_supplier_sites_all.accts_pay_code_combination_id%TYPE := NULL;
      l_s_payment_priority  ap_supplier_sites_all.payment_priority%TYPE := NULL;
   BEGIN
      BEGIN
         SELECT terms_id, pay_group_lookup_code, terms_date_basis, party_id
           INTO l_v_terms_id, l_v_pay_group, l_v_terms_date_basis, x_vendor_rec.party_id
           FROM ap_suppliers
          WHERE vendor_id = x_vendor_rec.vendor_id;
      EXCEPTION
         WHEN OTHERS THEN
            x_reject := 'Unable to read supplier ' || x_vendor_rec.vendor_id;
            RETURN (FALSE);
      END;

      BEGIN
         SELECT terms_id, pay_group_lookup_code, accts_pay_code_combination_id,
                payment_priority, party_site_id
           INTO l_s_terms_id, l_s_pay_group, l_s_liab_acc,
                l_s_payment_priority, x_vendor_rec.party_site_id
           FROM ap_supplier_sites_all
          WHERE vendor_site_id = x_vendor_rec.vendor_site_id;
      EXCEPTION
         WHEN OTHERS THEN
            x_reject := 'Unable to read supplier site ' || x_vendor_rec.vendor_site_id;
            RETURN (FALSE);
      END;

      x_vendor_rec.terms_id           := NVL (l_s_terms_id, l_v_terms_id);
      x_vendor_rec.pay_group          := NVL (l_s_pay_group, l_v_pay_group);
      x_vendor_rec.terms_date_basis   := l_v_terms_date_basis;
      x_vendor_rec.liab_acc           := l_s_liab_acc;
      x_vendor_rec.payment_priority   := l_s_payment_priority;

      RETURN (TRUE);
   EXCEPTION
      WHEN OTHERS THEN
         x_reject := SUBSTR ('Error in get_vendor_information: ' || SQLERRM, 1, 240);
         RETURN (FALSE);
   END get_vendor_information;

  /**************************************************************************
    *
    * PROCEDURE
    *  validate_staging_records
    *
    * DESCRIPTION
    *  Validates all NEW header records for the batch (mandatory fields,
    *  employee, amount, operating unit, currency, duplicate, date) and marks
    *  each header VALIDATED or ERROR. Failed records are not processed.
    *  Uses BULK COLLECT / FORALL for set based status updates.
    *
    * PARAMETERS
    * ==========
    * NAME         TYPE   DESCRIPTION
    * ------------ ------ --------------------------------------------------
    * p_source     IN     Invoice source
    * p_batch_id   IN     File batch id
    * p_org_id     IN     Operating unit id
    *
    * CALLED BY
    *  export_expense_report_to_ap
    *************************************************************************/
   PROCEDURE validate_staging_records (
      p_source     IN   VARCHAR2,
      p_batch_id   IN   VARCHAR2,
      p_org_id     IN   NUMBER
   )
   IS
      CURSOR c_hdr
      IS
         SELECT ROWID row_id, invoice_num, global_attribute1 batch_id, attribute1 employee_number,
                attribute2 ou_name, invoice_amount, invoice_currency_code, invoice_date
           FROM xxtjx_ap_invoices_interface
          WHERE SOURCE = p_source
            AND NVL (global_attribute1, '~') = NVL (p_batch_id, '~')
            AND process_status_flag = gc_st_new
          ORDER BY invoice_num;

      TYPE hdr_tt IS TABLE OF c_hdr%ROWTYPE INDEX BY PLS_INTEGER;
      TYPE rid_tt IS TABLE OF ROWID INDEX BY PLS_INTEGER;
      TYPE st_tt  IS TABLE OF VARCHAR2 (20) INDEX BY PLS_INTEGER;
      TYPE msg_tt IS TABLE OF VARCHAR2 (2000) INDEX BY PLS_INTEGER;

      l_hdr_tab    hdr_tt;
      l_rid_tab    rid_tt;
      l_st_tab     st_tt;
      l_msg_tab    msg_tt;

      l_person_id    NUMBER;
      l_full_name    VARCHAR2 (240);
      l_reject       VARCHAR2 (2000);
      l_count        NUMBER;
      l_line_total   NUMBER;
      l_line_count   NUMBER;
   BEGIN
      OPEN c_hdr;

      LOOP
         FETCH c_hdr
         BULK COLLECT INTO l_hdr_tab LIMIT gc_bulk_limit;

         EXIT WHEN l_hdr_tab.COUNT = 0;

         l_rid_tab.DELETE;
         l_st_tab.DELETE;
         l_msg_tab.DELETE;

         FOR i IN 1 .. l_hdr_tab.COUNT
         LOOP
            l_rid_tab (i)   := l_hdr_tab (i).row_id;
            l_st_tab (i)    := gc_st_validated;
            l_msg_tab (i)   := NULL;
            l_reject        := NULL;

            ------------------------------------------------------------
            -- 1. Mandatory fields.
            ------------------------------------------------------------
            IF     l_hdr_tab (i).invoice_num IS NULL
                OR l_hdr_tab (i).employee_number IS NULL
                OR l_hdr_tab (i).ou_name IS NULL
                OR l_hdr_tab (i).invoice_date IS NULL
                OR l_hdr_tab (i).invoice_amount IS NULL
                OR l_hdr_tab (i).invoice_currency_code IS NULL
            THEN
               l_reject := 'Missing mandatory header field';
            END IF;

            ------------------------------------------------------------
            -- 2. Operating unit (resolved first; drives employee lookup).
            ------------------------------------------------------------
            IF l_reject IS NULL
            THEN
               BEGIN
                  SELECT COUNT (1)
                    INTO l_count
                    FROM hr_operating_units
                   WHERE organization_id = p_org_id
                     AND UPPER (name) = UPPER (l_hdr_tab (i).ou_name);

                  IF l_count = 0
                  THEN
                     l_reject := 'Invalid Operating Unit ' || l_hdr_tab (i).ou_name;
                  END IF;
               EXCEPTION
                  WHEN OTHERS THEN
                     l_reject := 'Error validating Operating Unit';
               END;
            END IF;

            ------------------------------------------------------------
            -- 3. Employee valid, active and single (expatriate aware).
            ------------------------------------------------------------
            IF l_reject IS NULL
            THEN
               IF NOT get_employee_details (l_hdr_tab (i).employee_number, p_org_id, l_person_id, l_full_name, l_reject)
               THEN
                  NULL;   -- l_reject already populated
               END IF;
            END IF;

            ------------------------------------------------------------
            -- 4. Currency.
            ------------------------------------------------------------
            IF l_reject IS NULL
            THEN
               BEGIN
                  SELECT COUNT (1)
                    INTO l_count
                    FROM fnd_currencies
                   WHERE currency_code = l_hdr_tab (i).invoice_currency_code
                     AND enabled_flag = 'Y'
                     AND SYSDATE < NVL (end_date_active, SYSDATE + 1);

                  IF l_count = 0
                  THEN
                     l_reject := 'Invalid currency ' || l_hdr_tab (i).invoice_currency_code;
                  END IF;
               EXCEPTION
                  WHEN OTHERS THEN
                     l_reject := 'Error validating currency';
               END;
            END IF;

            ------------------------------------------------------------
            -- 5. Amount and header / line reconciliation.
            ------------------------------------------------------------
            IF l_reject IS NULL
            THEN
               IF NVL (l_hdr_tab (i).invoice_amount, 0) <= 0
               THEN
                  l_reject := 'Invalid invoice amount';
               ELSE
                  BEGIN
                     SELECT COUNT (1), NVL (SUM (amount), 0)
                       INTO l_line_count, l_line_total
                       FROM xxtjx_ap_inv_lines_interface
                      WHERE invoice_num = l_hdr_tab (i).invoice_num
                        AND NVL (global_attribute1, '~') = NVL (l_hdr_tab (i).batch_id, '~');

                     IF l_line_count = 0
                     THEN
                        l_reject := 'No invoice lines found';
                     ELSIF l_line_total <> l_hdr_tab (i).invoice_amount
                     THEN
                        l_reject := 'Header amount does not match sum of lines';
                     END IF;
                  EXCEPTION
                     WHEN OTHERS THEN
                        l_reject := 'Error validating line amounts';
                  END;
               END IF;
            END IF;

            ------------------------------------------------------------
            -- 6. Duplicate invoice.
            ------------------------------------------------------------
            IF l_reject IS NULL
            THEN
               BEGIN
                  SELECT COUNT (1)
                    INTO l_count
                    FROM ap_invoices_all
                   WHERE invoice_num = l_hdr_tab (i).invoice_num
                     AND org_id = p_org_id;

                  IF l_count = 0
                  THEN
                     SELECT COUNT (1)
                       INTO l_count
                       FROM ap_invoices_interface
                      WHERE invoice_num = l_hdr_tab (i).invoice_num
                        AND SOURCE = p_source;
                  END IF;

                  IF l_count > 0
                  THEN
                     l_reject := 'Duplicate invoice ' || l_hdr_tab (i).invoice_num;
                  END IF;
               EXCEPTION
                  WHEN OTHERS THEN
                     l_reject := 'Error validating duplicate';
               END;
            END IF;

            ------------------------------------------------------------
            -- Capture the outcome for this record.
            ------------------------------------------------------------
            IF l_reject IS NOT NULL
            THEN
               l_st_tab (i)    := gc_st_error;
               l_msg_tab (i)   := l_reject;
               log_error ('HEADER', l_hdr_tab (i).invoice_num, NULL, l_hdr_tab (i).employee_number, 'VALIDATION', l_reject);
               write_log (p_msg_type         => 'be~01~BusinessLogicException',
                          p_msg_txt          => 'Validation failed for invoice ' || l_hdr_tab (i).invoice_num || ' : ' || l_reject,
                          p_employee_number  => l_hdr_tab (i).employee_number,
                          p_invoice_number   => l_hdr_tab (i).invoice_num);
            END IF;
         END LOOP;

         ------------------------------------------------------------
         -- Bulk update the header status.
         ------------------------------------------------------------
         FORALL i IN 1 .. l_rid_tab.COUNT
            UPDATE xxtjx_ap_invoices_interface
               SET process_status_flag    = l_st_tab (i),
                   error_message          = l_msg_tab (i),
                   request_id             = g_request_id,
                   last_update_date       = SYSDATE,
                   last_updated_by        = g_user_id
             WHERE ROWID = l_rid_tab (i);
      END LOOP;

      CLOSE c_hdr;

      ------------------------------------------------------------
      -- Cascade the header status onto the line staging records.
      ------------------------------------------------------------
      UPDATE xxtjx_ap_inv_lines_interface l
         SET (process_status_flag, error_message) =
                (SELECT h.process_status_flag, h.error_message
                   FROM xxtjx_ap_invoices_interface h
                  WHERE h.invoice_num = l.invoice_num
                    AND NVL (h.global_attribute1, '~') = NVL (l.global_attribute1, '~')
                    AND h.SOURCE = p_source)
       WHERE NVL (l.global_attribute1, '~') = NVL (p_batch_id, '~')
         AND l.process_status_flag = gc_st_new
         AND EXISTS (SELECT 1
                       FROM xxtjx_ap_invoices_interface h
                      WHERE h.invoice_num = l.invoice_num
                        AND NVL (h.global_attribute1, '~') = NVL (l.global_attribute1, '~')
                        AND h.SOURCE = p_source);

      COMMIT;
   EXCEPTION
      WHEN OTHERS THEN
         ROLLBACK;
         write_log (p_msg_type => 'se~01~ServiceException', p_msg_txt => 'Error in validate_staging_records: ' || SQLERRM);
         RAISE;
   END validate_staging_records;

  /**************************************************************************
    *
    * PROCEDURE
    *  insert_invoice_interface
    *
    * DESCRIPTION
    *  Populates the standard AP_INVOICES_INTERFACE (header) from a staged
    *  header record and the derived vendor information.
    *
    * PARAMETERS
    * ==========
    * NAME           TYPE      DESCRIPTION
    * -------------- --------- ----------------------------------------------
    * p_hdr          IN        Staged header row
    * p_vendor_rec   IN        Derived vendor information
    * p_group_id     IN        Group id (batch) for the import
    * p_org_id       IN        Operating unit id
    * p_gl_date      IN        GL date
    *
    * CALLED BY
    *  export_expense_report_to_ap
    *************************************************************************/
   PROCEDURE insert_invoice_interface (
      p_hdr          IN   xxtjx_ap_invoices_interface%ROWTYPE,
      p_vendor_rec   IN   vendor_info_rec,
      p_group_id     IN   VARCHAR2,
      p_org_id       IN   NUMBER,
      p_gl_date      IN   DATE
   )
   IS
   BEGIN
      INSERT INTO ap_invoices_interface
                  (invoice_id, application_id, invoice_num, invoice_type_lookup_code,
                   invoice_date, vendor_id, vendor_site_id, invoice_amount,
                   invoice_currency_code, description, terms_id, pay_group_lookup_code,
                   accts_pay_code_combination_id, party_id, party_site_id,
                   payment_priority, gl_date, SOURCE, group_id, org_id, request_id,
                   workflow_flag, last_update_date, last_updated_by, last_update_login,
                   creation_date, created_by)
           VALUES (p_hdr.invoice_id, gc_application_id, p_hdr.invoice_num,
                   NVL (p_hdr.invoice_type_lookup_code, gc_invoice_type),
                   p_hdr.invoice_date, p_vendor_rec.vendor_id, p_vendor_rec.vendor_site_id,
                   p_hdr.invoice_amount, p_hdr.invoice_currency_code, p_hdr.description,
                   p_vendor_rec.terms_id, p_vendor_rec.pay_group, p_vendor_rec.liab_acc,
                   p_vendor_rec.party_id, p_vendor_rec.party_site_id,
                   p_vendor_rec.payment_priority, p_gl_date, p_hdr.SOURCE, p_group_id,
                   p_org_id, g_request_id, 'N', SYSDATE, g_user_id, g_login_id,
                   SYSDATE, g_user_id);
   END insert_invoice_interface;

  /**************************************************************************
    *
    * PROCEDURE
    *  insert_invoice_lines_interface
    *
    * DESCRIPTION
    *  Populates the standard AP_INVOICE_LINES_INTERFACE (lines) from the
    *  staged line records. The 6 segment distribution account is resolved to
    *  a code combination id which carries the accounting for the line.
    *
    * PARAMETERS
    * ==========
    * NAME            TYPE     DESCRIPTION
    * --------------- -------- ----------------------------------------------
    * p_invoice_id    IN       Header interface invoice id
    * p_invoice_num   IN       Invoice number
    * p_batch_id      IN       File batch id
    * p_org_id        IN       Operating unit id
    * p_gl_date       IN       GL / accounting date
    *
    * CALLED BY
    *  export_expense_report_to_ap
    *************************************************************************/
   PROCEDURE insert_invoice_lines_interface (
      p_invoice_id    IN   NUMBER,
      p_invoice_num   IN   VARCHAR2,
      p_batch_id      IN   VARCHAR2,
      p_org_id        IN   NUMBER,
      p_gl_date       IN   DATE
   )
   IS
   BEGIN
      INSERT INTO ap_invoice_lines_interface
                  (invoice_id, invoice_line_id, line_number, line_type_lookup_code,
                   amount, description, item_description, dist_code_combination_id,
                   dist_code_concatenated, accounting_date, org_id, application_id,
                   last_update_date, last_updated_by, last_update_login,
                   creation_date, created_by)
         SELECT   p_invoice_id, ap_invoice_lines_interface_s.NEXTVAL, sl.line_number,
                  NVL (sl.line_type_lookup_code, gc_line_type), sl.amount, sl.description,
                  sl.description, gcc.code_combination_id, sl.dist_code_concatenated,
                  p_gl_date, p_org_id, gc_application_id, SYSDATE, g_user_id, g_login_id,
                  SYSDATE, g_user_id
             FROM xxtjx_ap_inv_lines_interface sl, gl_code_combinations_kfv gcc
            WHERE sl.invoice_num = p_invoice_num
              AND NVL (sl.global_attribute1, '~') = NVL (p_batch_id, '~')
              AND gcc.concatenated_segments = sl.dist_code_concatenated
         ORDER BY sl.line_number;
   END insert_invoice_lines_interface;

  /**************************************************************************
    *
    * PROCEDURE
    *  import_ap_invoice
    *
    * DESCRIPTION
    *  Optionally submits the standard Payables Open Interface Import program
    *  (SQLAP / APXIIMPT) for the source and group and captures the request
    *  id. Disabled by default (p_import_flag = N); the import is normally run
    *  as a separately scheduled request.
    *
    * PARAMETERS
    * ==========
    * NAME           TYPE     DESCRIPTION
    * -------------- -------- -----------------------------------------------
    * p_source       IN       Invoice source
    * p_group_id     IN       Group id (batch)
    * p_org_id       IN       Operating unit id
    * x_request_id   OUT      Submitted request id (0 when not submitted)
    *
    * CALLED BY
    *  export_expense_report_to_ap
    *************************************************************************/
   PROCEDURE import_ap_invoice (
      p_source       IN       VARCHAR2,
      p_group_id     IN       VARCHAR2,
      p_org_id       IN       NUMBER,
      x_request_id   OUT      NUMBER
   )
   IS
   BEGIN
      mo_global.set_policy_context ('S', p_org_id);

      x_request_id :=
         fnd_request.submit_request (application   => 'SQLAP',
                                     program       => 'APXIIMPT',
                                     description   => NULL,
                                     start_time    => NULL,
                                     sub_request   => FALSE,
                                     argument1     => p_source,        -- Source
                                     argument2     => p_group_id,      -- Group
                                     argument3     => NULL,            -- Invoice Batch Name
                                     argument4     => NULL,            -- Hold Name
                                     argument5     => NULL,            -- Hold Reason
                                     argument6     => NULL,            -- GL Date
                                     argument7     => 'N',             -- Purge
                                     argument8     => 'N',             -- Trace Switch
                                     argument9     => 'N',             -- Debug Switch
                                     argument10    => 'N',             -- Summarize Report
                                     argument11    => '1000',          -- Commit Batch Size
                                     argument12    => TO_CHAR (g_user_id),
                                     argument13    => TO_CHAR (g_login_id),
                                     argument14    => TO_CHAR (p_org_id)
                                    );

      IF NVL (x_request_id, 0) > 0
      THEN
         write_log (p_msg_type => 'LOG', p_msg_txt => 'Submitted Payables Open Interface Import, request id ' || x_request_id);
      ELSE
         write_log (p_msg_type => 'se~01~ServiceException', p_msg_txt => 'Failed to submit Payables Open Interface Import: ' || fnd_message.get);
      END IF;
   EXCEPTION
      WHEN OTHERS THEN
         x_request_id := 0;
         write_log (p_msg_type => 'se~01~ServiceException', p_msg_txt => 'Error submitting import: ' || SQLERRM);
   END import_ap_invoice;

  /**************************************************************************
    *
    * PROCEDURE
    *  export_expense_report_to_ap
    *
    * DESCRIPTION
    *  Main concurrent program controller. Orchestrates validation, employee
    *  derivation, employee supplier / site creation, AP interface population,
    *  status update and logging.
    *
    * PARAMETERS  (see package specification)
    *
    * CALLED BY
    *  Concurrent Program - TJX WD Expense Report to AP Invoice Import
    *************************************************************************/
   PROCEDURE export_expense_report_to_ap (
      errbuf          OUT      VARCHAR2,
      retcode         OUT      NUMBER,
      p_org_id        IN       NUMBER,
      p_source        IN       VARCHAR2,
      p_batch_id      IN       VARCHAR2,
      p_file_name     IN       VARCHAR2 DEFAULT NULL,
      p_import_flag   IN       VARCHAR2 DEFAULT 'N'
   )
   IS
      CURSOR c_validated (cp_source VARCHAR2, cp_batch_id VARCHAR2)
      IS
         SELECT *
           FROM xxtjx_ap_invoices_interface
          WHERE SOURCE = cp_source
            AND NVL (global_attribute1, '~') = NVL (cp_batch_id, '~')
            AND process_status_flag = gc_st_validated
          ORDER BY invoice_num;

      e_validation_failed   EXCEPTION;

      l_source           VARCHAR2 (80)  := NVL (p_source, gc_source);
      l_org_id           NUMBER         := NVL (p_org_id, g_org_id);
      l_hdr              xxtjx_ap_invoices_interface%ROWTYPE;
      l_vendor_rec       vendor_info_rec;
      l_empty_vendor_rec vendor_info_rec;
      l_person_id        NUMBER;
      l_full_name        VARCHAR2 (240);
      l_reject           VARCHAR2 (2000);
      l_gl_date          DATE;
      l_emp_num          VARCHAR2 (30);
      l_import_req_id    NUMBER := 0;
      l_success_cnt      NUMBER := 0;
      l_error_cnt        NUMBER := 0;
   BEGIN
      retcode        := 0;
      g_request_id   := NVL (fnd_global.conc_request_id, g_request_id);
      g_file_name    := p_file_name;

      initialize_audit (l_source);

      ------------------------------------------------------------------
      -- Output report header.
      ------------------------------------------------------------------
      l_temp_msg                 :=
            '-------------------------------------------------------------------------------------------------------------'
         || CHR (10)
         || RPAD ('Invoice #', 30)
         || ' '
         || RPAD ('Employee #', 15)
         || ' '
         || RPAD ('Vendor Id', 12)
         || ' '
         || RPAD ('Site Id', 12)
         || ' '
         || RPAD ('Status', 12)
         || ' '
         || 'Message'
         || CHR (10)
         || '-------------------------------------------------------------------------------------------------------------';
      xxtjx_audit_pkg.build_message (p_msg_type => 'OUTPUT', p_msg_txt => l_temp_msg);
      fnd_file.new_line (fnd_file.OUTPUT, 1);

      ------------------------------------------------------------------
      -- Step 2 - Validate the staged records.
      ------------------------------------------------------------------
      validate_staging_records (l_source, p_batch_id, l_org_id);

      ------------------------------------------------------------------
      -- Steps 3 to 5 - Process each validated header.
      ------------------------------------------------------------------
      OPEN c_validated (l_source, p_batch_id);

      LOOP
         FETCH c_validated INTO l_hdr;
         EXIT WHEN c_validated%NOTFOUND;

         BEGIN
            SAVEPOINT sp_invoice;

            l_vendor_rec   := l_empty_vendor_rec;
            l_reject       := NULL;
            l_emp_num      := l_hdr.attribute1;

            ------------------------------------------------------------
            -- Step 3 - Employee derivation (active only).
            ------------------------------------------------------------
            IF NOT get_employee_details (l_emp_num, l_org_id, l_person_id, l_full_name, l_reject)
            THEN
               RAISE e_validation_failed;
            END IF;

            ------------------------------------------------------------
            -- Step 4 - Get or create the employee supplier and site.
            ------------------------------------------------------------
            IF NOT get_or_create_employee_supplier (l_person_id, l_org_id, l_emp_num, l_full_name, l_vendor_rec, l_reject)
            THEN
               RAISE e_validation_failed;
            END IF;

            IF NOT get_vendor_information (l_vendor_rec, l_reject)
            THEN
               RAISE e_validation_failed;
            END IF;

            ------------------------------------------------------------
            -- Step 5 - Populate the AP invoice header and line interface.
            ------------------------------------------------------------
            l_gl_date := l_hdr.invoice_date;

            insert_invoice_interface (p_hdr          => l_hdr,
                                      p_vendor_rec   => l_vendor_rec,
                                      p_group_id     => p_batch_id,
                                      p_org_id       => l_org_id,
                                      p_gl_date      => l_gl_date);

            insert_invoice_lines_interface (p_invoice_id    => l_hdr.invoice_id,
                                            p_invoice_num   => l_hdr.invoice_num,
                                            p_batch_id      => p_batch_id,
                                            p_org_id        => l_org_id,
                                            p_gl_date       => l_gl_date);

            ------------------------------------------------------------
            -- Step 8 - Update status to PROCESSED.
            ------------------------------------------------------------
            update_status ('HEADER', l_source, p_batch_id, l_hdr.invoice_num, gc_st_processed,
                           'Interfaced to AP. Run Payables Open Interface Import for source ' || l_source);
            update_status ('LINE', l_source, p_batch_id, l_hdr.invoice_num, gc_st_processed, NULL);

            l_success_cnt := l_success_cnt + 1;

            write_log (p_msg_type         => 'LOG',
                       p_msg_txt          => 'Interfaced invoice ' || l_hdr.invoice_num,
                       p_employee_number  => l_emp_num,
                       p_invoice_number   => l_hdr.invoice_num,
                       p_vendor_id        => l_vendor_rec.vendor_id,
                       p_vendor_site_id   => l_vendor_rec.vendor_site_id);

            l_temp_msg :=
                  RPAD (l_hdr.invoice_num, 30)
               || ' '
               || RPAD (l_emp_num, 15)
               || ' '
               || RPAD (l_vendor_rec.vendor_id, 12)
               || ' '
               || RPAD (l_vendor_rec.vendor_site_id, 12)
               || ' '
               || RPAD ('PROCESSED', 12)
               || ' '
               || 'Interfaced to AP';
            xxtjx_audit_pkg.build_message (p_msg_type => 'OUTPUT', p_msg_txt => l_temp_msg);
            fnd_file.new_line (fnd_file.OUTPUT, 1);

            COMMIT;
         EXCEPTION
            WHEN e_validation_failed THEN
               ROLLBACK TO sp_invoice;
               update_status ('HEADER', l_source, p_batch_id, l_hdr.invoice_num, gc_st_error, l_reject);
               update_status ('LINE', l_source, p_batch_id, l_hdr.invoice_num, gc_st_error, l_reject);
               log_error ('HEADER', l_hdr.invoice_num, NULL, l_emp_num, 'PROCESS', l_reject);
               l_error_cnt := l_error_cnt + 1;

               write_log (p_msg_type         => 'be~01~BusinessLogicException',
                          p_msg_txt          => 'Invoice ' || l_hdr.invoice_num || ' failed: ' || l_reject,
                          p_employee_number  => l_emp_num,
                          p_invoice_number   => l_hdr.invoice_num);

               l_temp_msg :=
                     RPAD (l_hdr.invoice_num, 30) || ' ' || RPAD (l_emp_num, 15) || ' '
                  || RPAD (' ', 12) || ' ' || RPAD (' ', 12) || ' ' || RPAD (gc_st_error, 12) || ' ' || l_reject;
               xxtjx_audit_pkg.build_message (p_msg_type => 'OUTPUT', p_msg_txt => l_temp_msg);
               fnd_file.new_line (fnd_file.OUTPUT, 1);

               COMMIT;
            WHEN OTHERS THEN
               ROLLBACK TO sp_invoice;
               l_reject := SUBSTR (SQLERRM, 1, 2000);
               update_status ('HEADER', l_source, p_batch_id, l_hdr.invoice_num, gc_st_error, l_reject);
               update_status ('LINE', l_source, p_batch_id, l_hdr.invoice_num, gc_st_error, l_reject);
               log_error ('HEADER', l_hdr.invoice_num, NULL, l_emp_num, 'EXCEPTION', l_reject);
               l_error_cnt := l_error_cnt + 1;

               write_log (p_msg_type         => 'se~01~ServiceException',
                          p_msg_txt          => 'Invoice ' || l_hdr.invoice_num || ' error: ' || l_reject,
                          p_employee_number  => l_emp_num,
                          p_invoice_number   => l_hdr.invoice_num);
               COMMIT;
         END;
      END LOOP;

      CLOSE c_validated;

      ------------------------------------------------------------------
      -- Step 6 - Optionally submit the Payables Open Interface Import.
      ------------------------------------------------------------------
      IF NVL (p_import_flag, 'N') = 'Y' AND l_success_cnt > 0
      THEN
         import_ap_invoice (l_source, p_batch_id, l_org_id, l_import_req_id);
      ELSE
         write_log (p_msg_type => 'LOG',
                    p_msg_txt  => 'p_import_flag = N : AP Open Interface Import not submitted. Records populated in interface for source ' || l_source);
      END IF;

      ------------------------------------------------------------------
      -- Step 9 - Finalise and log the run summary.
      ------------------------------------------------------------------
      l_temp_msg                 :=
            CHR (10)
         || 'Processed (PROCESSED) : ' || l_success_cnt
         || CHR (10)
         || 'Errored   (ERROR)     : ' || l_error_cnt;
      xxtjx_audit_pkg.build_message (p_msg_type => 'OUTPUT', p_msg_txt => l_temp_msg);
      write_log (p_msg_type => 'LOG', p_msg_txt => 'Run complete. Processed ' || l_success_cnt || ', Errored ' || l_error_cnt);

      xxtjx_audit_pkg.upsert_audit_table (x_audit_id => g_audit_id, p_request_id => g_request_id);
      COMMIT;

      IF l_error_cnt > 0
      THEN
         retcode := 1;
         errbuf  := l_error_cnt || ' record(s) errored. Review the log and XXTJX_WD_EXP_INV_ERR.';
      END IF;
   EXCEPTION
      WHEN OTHERS THEN
         ROLLBACK;
         retcode := 2;
         errbuf  := SUBSTR (SQLERRM, 1, 240);
         write_log (p_msg_type                    => 'se~05~ServiceException'
                  , p_msg_txt                     =>    'Fatal error in export_expense_report_to_ap '
                                                     || 'Error Msg: '
                                                     || SQLERRM
                                                     || ' Occured at '
                                                     || TO_CHAR (SYSTIMESTAMP, 'YYYY/MM/DD HH24:MI:SS:FF'));
         xxtjx_audit_pkg.upsert_audit_table (x_audit_id => g_audit_id, p_request_id => g_request_id);
         COMMIT;
   END export_expense_report_to_ap;

END xxtjx_wd_exp_invimp_pkg;
/
SHOW ERRORS;

EXIT;
