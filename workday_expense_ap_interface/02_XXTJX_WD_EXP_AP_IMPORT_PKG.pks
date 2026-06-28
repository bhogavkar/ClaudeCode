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
   *   Design follows the seeded AP_WEB_EXPORT_ER philosophy (employee ->
   *   person -> vendor -> vendor site derivation, create-supplier-if-missing)
   *   but in a much simpler, modular, set-based form tailored to Workday.
   *
   * HISTORY
   * =======
   * VERSION DATE        AUTHOR(S)            DESCRIPTION
   * ------- ----------- -------------------- ---------------------------------
   * 1.0     2026-06-28  EBS Tech Architect   Initial version.
   *************************************************************************/

   --------------------------------------------------------------------------
   -- PUBLIC RECORD TYPES
   --------------------------------------------------------------------------
   -- Employee / person derivation result.
   TYPE employee_rec_type IS RECORD
   (
       person_id     per_all_people_f.person_id%TYPE
      ,full_name     per_all_people_f.full_name%TYPE
      ,party_id      hz_parties.party_id%TYPE
      ,org_id        hr_operating_units.organization_id%TYPE
   );

   -- Supplier / supplier-site derivation result.
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

   --------------------------------------------------------------------------
   -- MAIN ENTRY POINT  (registered as a Concurrent Program executable)
   --------------------------------------------------------------------------
   -- p_source      (MANDATORY) AP interface SOURCE value, e.g. 'TJXWD_EXP US'
   -- p_org_id      (OPTIONAL)  Restrict processing to a single Operating Unit.
   --                           When NULL the OU is derived per record from the
   --                           file's Operating Unit Name (seeded behaviour).
   -- p_batch_name  (OPTIONAL)  Workday Batch Id to process. NULL => all New.
   -- p_group_id    (OPTIONAL)  GROUP_ID stamped on AP interface rows so the
   --                           subsequent Payables Import can be grouped.
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
   -- MODULAR VALIDATION / DERIVATION ROUTINES
   -- Public so they can be unit-tested and reused independently.
   --------------------------------------------------------------------------

   -- Validate that the employee number is present and known in HR.
   FUNCTION validate_employee_number
   (
       p_employee_number IN  VARCHAR2
      ,x_error_message   OUT NOCOPY VARCHAR2
   ) RETURN BOOLEAN;

   -- Derive person_id, full_name, party_id for an employee, resolving to a
   -- single active, primary, in-OU assignment.  Returns FALSE (with a
   -- meaningful message) when zero or many valid assignments remain.
   FUNCTION derive_person_details
   (
       p_employee_number IN  VARCHAR2
      ,p_org_id          IN  NUMBER
      ,x_employee_rec    OUT NOCOPY employee_rec_type
      ,x_error_message   OUT NOCOPY VARCHAR2
   ) RETURN BOOLEAN;

   -- Resolve an Operating Unit Name (from the file) to an org_id and confirm
   -- the OU exists and is active.
   FUNCTION validate_operating_unit
   (
       p_operating_unit_name IN  VARCHAR2
      ,p_org_id_param        IN  NUMBER
      ,x_org_id              OUT NOCOPY NUMBER
      ,x_error_message       OUT NOCOPY VARCHAR2
   ) RETURN BOOLEAN;

   -- Fetch the existing employee supplier + pay site for the OU.
   -- Returns TRUE when a usable supplier+site was found.
   FUNCTION get_employee_supplier
   (
       p_party_id      IN  NUMBER
      ,p_org_id        IN  NUMBER
      ,x_vendor_rec    OUT NOCOPY vendor_rec_type
      ,x_error_message OUT NOCOPY VARCHAR2
   ) RETURN BOOLEAN;

   -- Create employee supplier + pay site (+ IBY payee) when none exists,
   -- following the seeded AP_VENDOR_PUB_PKG approach.
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
