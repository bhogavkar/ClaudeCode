--==============================================================================
-- File         : 02_xx_ap_expense_import_pkg_spec.sql
-- Object Type  : PL/SQL Package Specification
-- Package      : XX_AP_EXPENSE_IMPORT_PKG
-- Module       : Oracle Payables (AP) - R12
-- Purpose      : Workday -> Oracle EBS Expense Report inbound integration.
--                Reads pre-loaded staging data, validates it, creates supplier
--                & supplier-site (when required) and pushes the data into
--                AP_INVOICES_INTERFACE / AP_INVOICE_LINES_INTERFACE so that
--                the standard "Payables Open Interface Import" can pick the
--                records up.
--
-- Author       : Oracle EBS Technical Consultant
-- Created      : 2026-05-04
--==============================================================================
CREATE OR REPLACE PACKAGE xx_ap_expense_import_pkg AUTHID CURRENT_USER
AS

   ---------------------------------------------------------------------------
   -- Public constants - statuses driven by the staging tables
   ---------------------------------------------------------------------------
   g_status_new        CONSTANT VARCHAR2(20) := 'NEW';
   g_status_valid      CONSTANT VARCHAR2(20) := 'VALID';
   g_status_error      CONSTANT VARCHAR2(20) := 'ERROR';
   g_status_processed  CONSTANT VARCHAR2(20) := 'PROCESSED';

   g_stage_validation  CONSTANT VARCHAR2(30) := 'VALIDATION';
   g_stage_supplier    CONSTANT VARCHAR2(30) := 'SUPPLIER';
   g_stage_interface   CONSTANT VARCHAR2(30) := 'INTERFACE';
   g_stage_fatal       CONSTANT VARCHAR2(30) := 'FATAL';

   g_source            CONSTANT VARCHAR2(80) := 'WORKDAY_EXPENSE';
   g_invoice_type      CONSTANT VARCHAR2(25) := 'EXPENSE REPORT';

   ---------------------------------------------------------------------------
   -- INIT_CONTEXT
   --   Initializes FND_GLOBAL session and the MOAC policy context for the
   --   ORG_ID supplied.  Must be called once per ORG_ID being processed.
   ---------------------------------------------------------------------------
   PROCEDURE init_context
   ( p_user_name       IN VARCHAR2 DEFAULT NULL
   , p_responsibility  IN VARCHAR2 DEFAULT NULL
   , p_org_id          IN NUMBER
   );

   ---------------------------------------------------------------------------
   -- LOG_ERROR
   --   Inserts an entry in XX_AP_EXP_ERROR_LOG.  Uses an autonomous transaction
   --   so error rows survive a ROLLBACK on the main flow.
   ---------------------------------------------------------------------------
   PROCEDURE log_error
   ( p_record_id     IN NUMBER
   , p_line_number   IN NUMBER     DEFAULT NULL
   , p_stage         IN VARCHAR2
   , p_error_code    IN VARCHAR2   DEFAULT NULL
   , p_error_message IN VARCHAR2
   );

   ---------------------------------------------------------------------------
   -- VALIDATE_DATA
   --   Walks every NEW header in the staging table for the given ORG_ID and
   --   runs the full set of business validations.  Sets each header status
   --   to VALID or ERROR and updates the line statuses accordingly.
   ---------------------------------------------------------------------------
   PROCEDURE validate_data
   ( p_org_id      IN  NUMBER
   , x_valid_cnt   OUT NUMBER
   , x_error_cnt   OUT NUMBER
   );

   ---------------------------------------------------------------------------
   -- CREATE_SUPPLIER_IF_NEEDED
   --   For an employee that is not yet mapped to an AP supplier, creates the
   --   supplier and its site by calling the standard public APIs:
   --      AP_VENDOR_PUB_PKG.create_vendor
   --      AP_VENDOR_PUB_PKG.create_vendor_site
   --   Returns the VENDOR_ID and VENDOR_SITE_ID via OUT parameters.
   ---------------------------------------------------------------------------
   PROCEDURE create_supplier_if_needed
   ( p_record_id        IN  NUMBER
   , p_employee_id      IN  NUMBER
   , p_org_id           IN  NUMBER
   , x_vendor_id        OUT NUMBER
   , x_vendor_site_id   OUT NUMBER
   , x_return_status    OUT VARCHAR2
   , x_error_message    OUT VARCHAR2
   );

   ---------------------------------------------------------------------------
   -- LOAD_INTERFACE
   --   Inserts validated headers/lines into the AP open interface tables:
   --      AP_INVOICES_INTERFACE
   --      AP_INVOICE_LINES_INTERFACE
   --   Updates staging status to PROCESSED on success.
   ---------------------------------------------------------------------------
   PROCEDURE load_interface
   ( p_org_id         IN  NUMBER
   , x_loaded_cnt     OUT NUMBER
   , x_failed_cnt     OUT NUMBER
   );

   ---------------------------------------------------------------------------
   -- REPORT_STATUS
   --   Prints a formatted report (FND_FILE.OUTPUT) summarising the run.
   ---------------------------------------------------------------------------
   PROCEDURE report_status
   ( p_org_id IN NUMBER
   );

   ---------------------------------------------------------------------------
   -- MAIN_PROCESS
   --   Orchestrates the entire flow:
   --      INIT_CONTEXT -> VALIDATE_DATA -> LOAD_INTERFACE -> REPORT_STATUS
   --   This is the entry point invoked by the concurrent program executable.
   ---------------------------------------------------------------------------
   PROCEDURE main_process
   ( errbuf            OUT VARCHAR2
   , retcode           OUT NUMBER
   , p_org_id          IN  NUMBER
   , p_debug_flag      IN  VARCHAR2 DEFAULT 'N'
   );

END xx_ap_expense_import_pkg;
/
SHOW ERRORS PACKAGE xx_ap_expense_import_pkg
