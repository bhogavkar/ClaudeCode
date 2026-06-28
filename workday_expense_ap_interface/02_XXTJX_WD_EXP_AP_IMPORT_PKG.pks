CREATE OR REPLACE PACKAGE XXTJX_WD_EXP_AP_IMPORT_PKG
AS
   /**************************************************************************
   *
   * FILE NAME
   *   XXTJX_WD_EXP_AP_IMPORT_PKG.pks
   *
   * PROGRAM NAME
   *   APPS.XXTJX_WD_EXP_AP_IMPORT_PKG
   *
   * DESCRIPTION
   *   Imports Workday Expense Reports (already loaded into the custom staging
   *   tables XXTJX_AP_INVOICES_INTERFACE / XXTJX_AP_INV_LINES_INTERFACE) into
   *   the Oracle Payables Open Interface tables AP_INVOICES_INTERFACE and
   *   AP_INVOICE_LINES_INTERFACE.
   *
   *   Scope ENDS once the rows are inserted into the AP interface tables.
   *   The package does NOT submit Payables Open Interface Import, create
   *   invoices, approve, or run workflow.
   *
   *   Validation / error-staging method follows XXTJXAP_STND_INV_IMP_PKG:
   *     - one modular BOOLEAN validation function per check, each guarded by a
   *       config toggle so checks can be turned on/off per source;
   *     - all validations are run for a record (errors are accumulated, not
   *       short-circuited) so every problem is reported in one pass;
   *     - failures are captured in an in-memory collection AND stamped on the
   *       staging row, then bulk-inserted into XXTJX_WD_EXP_AP_ERRORS.
   *   Employee -> person -> vendor -> site derivation follows the seeded
   *   AP_WEB_EXPORT_ER (GetVendorInfo / CreatePayee) approach, simplified for
   *   Workday (employee suppliers only).
   *
   * HISTORY
   * =======
   * VERSION DATE        AUTHOR(S)            DESCRIPTION
   * ------- ----------- -------------------- ---------------------------------
   * 1.0     2026-06-28  EBS Tech Architect   Initial version.
   * 2.0     2026-06-28  EBS Tech Architect   Reworked validation + error
   *                                          staging to follow the
   *                                          XXTJXAP_STND_INV_IMP_PKG method.
   *************************************************************************/

   --------------------------------------------------------------------------
   -- PUBLIC RECORD / COLLECTION TYPES
   --------------------------------------------------------------------------
   TYPE employee_rec_type IS RECORD
   (
       person_id     per_all_people_f.person_id%TYPE
      ,full_name     per_all_people_f.full_name%TYPE
      ,party_id      hz_parties.party_id%TYPE
      ,org_id        hr_operating_units.organization_id%TYPE
   );

   TYPE vendor_rec_type IS RECORD
   (
       vendor_id        ap_suppliers.vendor_id%TYPE
      ,vendor_name      ap_suppliers.vendor_name%TYPE
      ,vendor_num       ap_suppliers.segment1%TYPE
      ,party_id         ap_suppliers.party_id%TYPE
      ,vendor_site_id   ap_supplier_sites_all.vendor_site_id%TYPE
      ,vendor_site_code ap_supplier_sites_all.vendor_site_code%TYPE
      ,party_site_id    ap_supplier_sites_all.party_site_id%TYPE
      ,terms_id         ap_suppliers.terms_id%TYPE
      ,pay_group        ap_suppliers.pay_group_lookup_code%TYPE
      ,liab_acc         ap_suppliers.accts_pay_code_combination_id%TYPE
   );

   -- Source-data error tracking (same shape as XXTJXAP_STND_INV_IMP_PKG).
   TYPE source_data_error_rec IS RECORD
   (
       request_id        NUMBER
      ,batch_id          VARCHAR2(20)
      ,source            VARCHAR2(80)
      ,invoice_id        NUMBER
      ,invoice_num       VARCHAR2(50)
      ,vendor_num        VARCHAR2(30)
      ,employee_number   VARCHAR2(30)
      ,invoice_line_num  NUMBER
      ,error_code        VARCHAR2(100)
      ,error_msg         VARCHAR2(1000)
   );

   TYPE source_data_error_tab IS TABLE OF source_data_error_rec
      INDEX BY BINARY_INTEGER;

   --------------------------------------------------------------------------
   -- MAIN ENTRY POINT  (registered as a Concurrent Program executable)
   --------------------------------------------------------------------------
   -- p_source      (MANDATORY) AP interface SOURCE value, e.g. 'TJXWD_EXP US'
   -- p_org_id      (OPTIONAL)  Restrict processing to a single Operating Unit.
   -- p_batch_name  (OPTIONAL)  Workday Batch Id to process. NULL => all New.
   -- p_group_id    (OPTIONAL)  GROUP_ID stamped on AP interface rows.
   -- p_debug_flag  (OPTIONAL)  'Y' enables verbose fnd_file.log output.
   PROCEDURE import_expenses
   (
       errbuf        OUT NOCOPY VARCHAR2
      ,retcode       OUT NOCOPY NUMBER
      ,p_source      IN          VARCHAR2
      ,p_org_id      IN          NUMBER   DEFAULT NULL
      ,p_batch_name  IN          VARCHAR2 DEFAULT NULL
      ,p_group_id    IN          VARCHAR2 DEFAULT NULL
      ,p_debug_flag  IN          VARCHAR2 DEFAULT 'N'
   );

   --------------------------------------------------------------------------
   -- MODULAR VALIDATION FUNCTIONS  (BOOLEAN; each internally honours a toggle)
   --------------------------------------------------------------------------

   -- All mandatory header/line fields present (driven by the WD file layout).
   FUNCTION validate_mandatory_fields
   (
       p_invoice_num   IN  VARCHAR2
      ,p_invoice_date  IN  DATE
      ,p_invoice_amt   IN  NUMBER
      ,p_currency      IN  VARCHAR2
      ,p_description    IN VARCHAR2
      ,p_employee_num  IN  VARCHAR2
      ,p_ou_name       IN  VARCHAR2
      ,x_error_message OUT NOCOPY VARCHAR2
   ) RETURN BOOLEAN;

   -- Employee number present and known in HR.
   FUNCTION validate_employee_number
   (
       p_employee_number IN  VARCHAR2
      ,x_error_message   OUT NOCOPY VARCHAR2
   ) RETURN BOOLEAN;

   -- Operating Unit (param wins, else file OU name) resolves to a valid org_id.
   FUNCTION validate_operating_unit
   (
       p_operating_unit_name IN  VARCHAR2
      ,p_org_id_param        IN  NUMBER
      ,x_org_id              OUT NOCOPY NUMBER
      ,x_error_message       OUT NOCOPY VARCHAR2
   ) RETURN BOOLEAN;

   -- Currency code active and enabled.
   FUNCTION validate_invoice_currency
   (
       p_currency      IN  VARCHAR2
      ,x_error_message OUT NOCOPY VARCHAR2
   ) RETURN BOOLEAN;

   -- Invoice type lookup code valid (STANDARD).
   FUNCTION validate_invoice_type
   (
       p_invoice_type_code IN  VARCHAR2
      ,x_error_message     OUT NOCOPY VARCHAR2
   ) RETURN BOOLEAN;

   -- Line type lookup code valid (ITEM).
   FUNCTION validate_invoice_line_type
   (
       p_line_type_code IN  VARCHAR2
      ,x_error_message  OUT NOCOPY VARCHAR2
   ) RETURN BOOLEAN;

   -- Duplicate invoice number: same batch (staging) and/or already in AP.
   FUNCTION validate_invoice_num
   (
       p_invoice_num   IN  VARCHAR2
      ,p_batch_id      IN  VARCHAR2
      ,p_source        IN  VARCHAR2
      ,p_vendor_id     IN  NUMBER
      ,x_error_message OUT NOCOPY VARCHAR2
   ) RETURN BOOLEAN;

   -- Header invoice amount = SUM(line amounts).
   FUNCTION validate_invoice_amounts
   (
       p_invoice_num   IN  VARCHAR2
      ,p_batch_id      IN  VARCHAR2
      ,p_header_amount IN  NUMBER
      ,x_error_message OUT NOCOPY VARCHAR2
   ) RETURN BOOLEAN;

   --------------------------------------------------------------------------
   -- DERIVATION FUNCTIONS
   --------------------------------------------------------------------------
   FUNCTION derive_person_details
   (
       p_employee_number IN  VARCHAR2
      ,p_org_id          IN  NUMBER
      ,x_employee_rec    OUT NOCOPY employee_rec_type
      ,x_error_message   OUT NOCOPY VARCHAR2
   ) RETURN BOOLEAN;

   FUNCTION get_employee_supplier
   (
       p_party_id      IN  NUMBER
      ,p_org_id        IN  NUMBER
      ,x_vendor_rec    OUT NOCOPY vendor_rec_type
      ,x_error_message OUT NOCOPY VARCHAR2
   ) RETURN BOOLEAN;

   FUNCTION create_employee_supplier
   (
       p_employee_rec  IN  employee_rec_type
      ,p_full_name     IN  VARCHAR2
      ,p_org_id        IN  NUMBER
      ,x_vendor_rec    IN OUT NOCOPY vendor_rec_type
      ,x_error_message OUT NOCOPY VARCHAR2
   ) RETURN BOOLEAN;

END XXTJX_WD_EXP_AP_IMPORT_PKG;
/
SHOW ERRORS;
