CREATE OR REPLACE PACKAGE XX_WD_EMP_SUPPLIER_PKG AUTHID CURRENT_USER AS
/*------------------------------------------------------------------------------
| Package    : XX_WD_EMP_SUPPLIER_PKG
| Purpose    : Workday -> Oracle EBS R12.2.12 inbound integration.
|              1) Validates employee + expense report rows landed in staging
|                 by the upstream Data Loader (CSV -> SQL*Loader).
|              2) Creates the employee in HRMS if missing
|                 (HR_EMPLOYEE_API.create_employee).
|              3) Creates the matching EMPLOYEE-typed supplier
|                 (AP_VENDOR_PUB_PKG.Create_Vendor with employee_id linked)
|                 + supplier site, and verifies/creates the
|                 IBY_EXTERNAL_PAYEES_ALL row.
|              4) Imports approved expense reports into AP via
|                 AP_INVOICES_INTERFACE / AP_INVOICE_LINES_INTERFACE
|                 (invoice_type_lookup_code = 'EXPENSE REPORT')
|                 and submits Payables Open Interface Import.
|
| Entry pt   : MAIN (concurrent program)
| Author     : Workday-EBS Integrations team
| Notes      : Numeric/varchar2 sizes mirror the 12.2 base tables. All public
|              procs are autonomous-safe for logging only (logging proc itself
|              is autonomous). Business logic does NOT use autonomous txns -
|              we want savepoint-per-record control instead.
+-----------------------------------------------------------------------------*/

    -- ---------------------------------------------------------------- types --
    SUBTYPE st_status   IS VARCHAR2(30);
    SUBTYPE st_msg      IS VARCHAR2(4000);
    SUBTYPE st_emp_num  IS VARCHAR2(30);

    -- Run-mode constants
    G_MODE_INSERT   CONSTANT VARCHAR2(10) := 'INS';
    G_MODE_UPDATE   CONSTANT VARCHAR2(10) := 'UPD';
    G_MODE_BOTH     CONSTANT VARCHAR2(10) := 'BOTH';

    -- Status constants (kept in sync with check constraints on staging tables)
    G_ST_NEW          CONSTANT st_status := 'NEW';
    G_ST_VALIDATED    CONSTANT st_status := 'VALIDATED';
    G_ST_PROCESSING   CONSTANT st_status := 'PROCESSING';
    G_ST_SUCCESS      CONSTANT st_status := 'SUCCESS';
    G_ST_VAL_ERR      CONSTANT st_status := 'VALIDATION_ERROR';
    G_ST_API_ERR      CONSTANT st_status := 'API_ERROR';
    G_ST_SKIPPED      CONSTANT st_status := 'SKIPPED';
    G_ST_REJECTED     CONSTANT st_status := 'REJECTED';

    -- Log-level constants
    G_LVL_DEBUG  CONSTANT VARCHAR2(10) := 'DEBUG';
    G_LVL_INFO   CONSTANT VARCHAR2(10) := 'INFO';
    G_LVL_WARN   CONSTANT VARCHAR2(10) := 'WARN';
    G_LVL_ERROR  CONSTANT VARCHAR2(10) := 'ERROR';

    -- Application errors raised by this package
    EX_VALIDATION_FAILED EXCEPTION;
    PRAGMA EXCEPTION_INIT(EX_VALIDATION_FAILED, -20001);
    EX_API_FAILED        EXCEPTION;
    PRAGMA EXCEPTION_INIT(EX_API_FAILED,        -20002);
    EX_SETUP_MISSING     EXCEPTION;
    PRAGMA EXCEPTION_INIT(EX_SETUP_MISSING,     -20003);

    -- ----------------------------------------------------------- procedures --

    /* ----------------------------------------------------------------------
       MAIN - concurrent program entry point.
         p_business_group_id : Optional. If NULL, derived per row from
                               BUSINESS_GROUP_NAME (US/CA) in staging.
         p_run_mode          : INS = create employees only (no expense import)
                               UPD = expense import only (employees expected)
                               BOTH= full pipeline (default)
         p_batch_id          : Optional. If NULL, picks up all NEW rows.
         p_debug             : Y/N - emit DEBUG-level log rows.
       ---------------------------------------------------------------------- */
    PROCEDURE main
    (
        errbuf              OUT NOCOPY VARCHAR2,
        retcode             OUT NOCOPY NUMBER,
        p_business_group_id IN  NUMBER   DEFAULT NULL,
        p_run_mode          IN  VARCHAR2 DEFAULT 'BOTH',
        p_batch_id          IN  VARCHAR2 DEFAULT NULL,
        p_debug             IN  VARCHAR2 DEFAULT 'N'
    );

    -- The procedures below are exposed mainly for unit testing / re-runs.

    PROCEDURE log_message
    (
        p_level       IN VARCHAR2,
        p_source      IN VARCHAR2,
        p_message     IN VARCHAR2,
        p_entity_type IN VARCHAR2 DEFAULT NULL,
        p_entity_key  IN VARCHAR2 DEFAULT NULL,
        p_oracle_err  IN VARCHAR2 DEFAULT NULL
    );

    PROCEDURE init_run
    (
        p_request_id IN NUMBER,
        p_batch_id   IN VARCHAR2,
        p_run_mode   IN VARCHAR2,
        p_bg_id      IN NUMBER,
        p_debug      IN VARCHAR2
    );

    PROCEDURE finalize_run(p_request_id IN NUMBER);

    PROCEDURE validate_employee_row(p_stg_id IN NUMBER);

    PROCEDURE validate_expense_header(p_stg_hdr_id IN NUMBER);

    FUNCTION  get_existing_person_id(p_employee_number IN VARCHAR2,
                                     p_business_group_id IN NUMBER)
        RETURN NUMBER;

    FUNCTION  get_existing_vendor_id(p_person_id IN NUMBER) RETURN NUMBER;

    PROCEDURE create_employee_in_hrms
    (
        p_stg_id       IN  NUMBER,
        p_bg_id        IN  NUMBER,
        x_person_id    OUT NOCOPY NUMBER,
        x_assignment_id OUT NOCOPY NUMBER,
        x_msg          OUT NOCOPY VARCHAR2
    );

    PROCEDURE create_employee_supplier
    (
        p_stg_id       IN  NUMBER,
        p_person_id    IN  NUMBER,
        x_vendor_id    OUT NOCOPY NUMBER,
        x_party_id     OUT NOCOPY NUMBER,
        x_msg          OUT NOCOPY VARCHAR2
    );

    PROCEDURE create_supplier_site
    (
        p_stg_id          IN  NUMBER,
        p_vendor_id       IN  NUMBER,
        p_org_id          IN  NUMBER,
        p_business_group  IN  VARCHAR2,
        x_vendor_site_id  OUT NOCOPY NUMBER,
        x_party_site_id   OUT NOCOPY NUMBER,
        x_msg             OUT NOCOPY VARCHAR2
    );

    PROCEDURE ensure_external_payee
    (
        p_party_id       IN  NUMBER,
        p_vendor_id      IN  NUMBER,
        p_vendor_site_id IN  NUMBER,
        p_org_id         IN  NUMBER,
        p_payment_method IN  VARCHAR2,
        x_payee_id       OUT NOCOPY NUMBER,
        x_msg            OUT NOCOPY VARCHAR2
    );

    PROCEDURE process_one_expense_report
    (
        p_stg_hdr_id IN NUMBER
    );

    PROCEDURE submit_ap_open_interface_import
    (
        p_org_id     IN  NUMBER,
        p_source     IN  VARCHAR2,
        p_group_id   IN  VARCHAR2,
        x_request_id OUT NOCOPY NUMBER
    );

    PROCEDURE write_summary_report;

END XX_WD_EMP_SUPPLIER_PKG;
/
SHOW ERRORS PACKAGE XX_WD_EMP_SUPPLIER_PKG
