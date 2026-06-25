CREATE OR REPLACE PACKAGE xxtjx_wd_exp_invimp_pkg
AS

    /**************************************************************************
   *
   * FILE NAME
   *   XXTJX_WD_EXP_INVIMP_PKG.pks
   *
   * PROGRAM NAME
   *  APPS.XXTJX_WD_EXP_INVIMP_PKG
   *
   * DESCRIPTION
   * Package to import Workday Expense Reports from a pipe delimited file into
   * the Oracle Payables Open Interface. The program validates the staged
   * records, derives the employee, gets or creates the employee supplier and
   * supplier site, populates the AP invoice header and line interface tables
   * and logs the results. The Payables Open Interface Import program is run
   * separately as a scheduled request.
   *
   * HISTORY
   * =======
   *
   * VERSION DATE        AUTHOR(S)       DESCRIPTION
   * ------- ----------- --------------- ------------------------------------
   * 1.0     25-JUN-2026 <Author>          Initial version.
   *************************************************************************/

  /**************************************************************************
    *
    * PROCEDURE
    *  export_expense_report_to_ap
    *
    * DESCRIPTION
    *  Main concurrent program controller. Orchestrates validation, employee
    *  derivation, employee supplier / site creation, AP interface population,
    *  status update and logging for the WD expense report invoice import.
    *
    * PARAMETERS
    * ==========
    * NAME              TYPE     DESCRIPTION
    * ----------------- -------- ------------------------------------------
    * errbuf            OUT      Concurrent program error buffer
    * retcode           OUT      Concurrent program return code (0/1/2)
    * p_org_id          IN       Operating unit id
    * p_source          IN       Invoice source (e.g. TJXWD_EXP US)
    * p_batch_id        IN       File batch id (links staged records)
    * p_file_name       IN       Source file name (for logging)
    * p_import_flag     IN       Y submits AP Open Interface Import; default N
    *
    * RETURN VALUE
    *  NA
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
   );

END xxtjx_wd_exp_invimp_pkg;
/
SHOW ERRORS;

EXIT;
