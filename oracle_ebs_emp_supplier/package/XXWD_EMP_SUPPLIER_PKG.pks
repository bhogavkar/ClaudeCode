CREATE OR REPLACE PACKAGE XXWD_EMP_SUPPLIER_PKG
AS
-- +=====================================================================+
-- |  Package Name : XXWD_EMP_SUPPLIER_PKG                                |
-- |  Description  : Workday -> Oracle EBS R12.2.12 inbound integration   |
-- |                 to create Employee Suppliers, Sites, Payees, Banks,  |
-- |                 Branches, Bank Accounts and Payee Instrument         |
-- |                 Assignments from data staged in:                     |
-- |                    XXWD_EMP_SUP_STG  (header)                        |
-- |                    XXWD_EMP_BANK_STG (bank)                          |
-- |                 All run-time activity is logged in:                  |
-- |                    XXWD_EMP_SUP_LOG                                  |
-- |                                                                      |
-- |  Public APIs used:                                                   |
-- |     AP_VENDOR_PUB_PKG.create_vendor                                  |
-- |     AP_VENDOR_PUB_PKG.create_vendor_site                             |
-- |     IBY_EXT_BANKACCT_PUB.create_ext_bank                             |
-- |     IBY_EXT_BANKACCT_PUB.create_ext_bank_branch                      |
-- |     IBY_EXT_BANKACCT_PUB.create_ext_bank_acct                        |
-- |     IBY_DISBURSEMENT_SETUP_PUB.set_payee_instr_assignment            |
-- |                                                                      |
-- |  Author       : XX Development Team                                  |
-- |  Version      : 1.0                                                  |
-- |                                                                      |
-- |  History                                                             |
-- |  -------                                                             |
-- |  Ver  Date         Author              Description                   |
-- |  1.0  17-MAY-2026  XX Dev Team         Initial creation              |
-- +=====================================================================+

   --========================================================
   -- Public constants - status framework
   --========================================================
   gc_status_new        CONSTANT VARCHAR2(20) := 'NEW';
   gc_status_validated  CONSTANT VARCHAR2(20) := 'VALIDATED';
   gc_status_processing CONSTANT VARCHAR2(20) := 'PROCESSING';
   gc_status_success    CONSTANT VARCHAR2(20) := 'SUCCESS';
   gc_status_error      CONSTANT VARCHAR2(20) := 'ERROR';
   gc_status_retry      CONSTANT VARCHAR2(20) := 'RETRY';

   --========================================================
   -- Module name constants - used for logging classification
   --========================================================
   gc_mod_init          CONSTANT VARCHAR2(60) := 'INIT';
   gc_mod_validation    CONSTANT VARCHAR2(60) := 'VALIDATION';
   gc_mod_supplier      CONSTANT VARCHAR2(60) := 'SUPPLIER';
   gc_mod_site          CONSTANT VARCHAR2(60) := 'SITE';
   gc_mod_payee         CONSTANT VARCHAR2(60) := 'PAYEE';
   gc_mod_bank          CONSTANT VARCHAR2(60) := 'BANK';
   gc_mod_branch        CONSTANT VARCHAR2(60) := 'BRANCH';
   gc_mod_account       CONSTANT VARCHAR2(60) := 'BANK_ACCOUNT';
   gc_mod_instrument    CONSTANT VARCHAR2(60) := 'INSTRUMENT';
   gc_mod_report        CONSTANT VARCHAR2(60) := 'REPORT';

   --========================================================
   -- Globals populated at runtime - made available to all
   -- private procedures so callers can rely on context.
   --========================================================
   g_request_id         NUMBER;
   g_user_id            NUMBER;
   g_resp_id            NUMBER;
   g_resp_appl_id       NUMBER;
   g_org_id             NUMBER;
   g_debug_flag         VARCHAR2(1) := 'N';

   --========================================================
   -- Public types - reporting summary
   --========================================================
   TYPE summary_rec_t IS RECORD
   ( employee_number   VARCHAR2(30)
   , employee_name     VARCHAR2(240)
   , vendor_id         NUMBER
   , vendor_site_id    NUMBER
   , status            VARCHAR2(20)
   , error_message     VARCHAR2(4000)
   );

   TYPE summary_tbl_t IS TABLE OF summary_rec_t INDEX BY PLS_INTEGER;

   --========================================================
   -- MAIN entry point - invoked by the concurrent program
   --
   --   p_errbuf, p_retcode : standard concurrent program out
   --   p_org_id            : Operating Unit - Multi-OU support
   --   p_batch_id          : Optional batch filter
   --   p_employee_number   : Optional single-employee filter
   --   p_debug_flag        : Y/N - enables verbose logging
   --   p_reprocess_errors  : Y/N - re-processes ERROR rows
   --========================================================
   PROCEDURE main
   ( p_errbuf            OUT VARCHAR2
   , p_retcode           OUT VARCHAR2
   , p_org_id            IN  NUMBER
   , p_batch_id          IN  NUMBER   DEFAULT NULL
   , p_employee_number   IN  VARCHAR2 DEFAULT NULL
   , p_debug_flag        IN  VARCHAR2 DEFAULT 'N'
   , p_reprocess_errors  IN  VARCHAR2 DEFAULT 'N'
   );

   --========================================================
   -- Reporting procedure - prints final summary to the
   -- concurrent program OUTPUT. Successful records appear
   -- first, followed by ERROR records.
   --========================================================
   PROCEDURE print_summary_report
   ( p_request_id IN NUMBER
   );

   --========================================================
   -- Centralised logger - exposed so any caller (e.g. a
   -- wrapper or unit test) can write to the integration log.
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
   );

END XXWD_EMP_SUPPLIER_PKG;
/
SHOW ERRORS PACKAGE XXWD_EMP_SUPPLIER_PKG;
