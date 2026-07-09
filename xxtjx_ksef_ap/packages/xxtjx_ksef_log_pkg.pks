CREATE OR REPLACE PACKAGE apps.xxtjx_ksef_log_pkg
AS
  -- ===================================================================
  --  XXTJX_KSEF_LOG_PKG : Enterprise logging / instrumentation
  --  - Writes to XXTJX_KSEF_LOG via AUTONOMOUS transaction (log survives
  --    a rollback of the business transaction).
  --  - Mirrors to FND_FILE (concurrent LOG) and FND_LOG (AOL) at level.
  -- ===================================================================

  -- Context set once at program start; reused on every log call.
  PROCEDURE init_context ( p_request_id   IN NUMBER
                         , p_package_name IN VARCHAR2 );

  PROCEDURE set_file_context ( p_file_id        IN NUMBER   DEFAULT NULL
                             , p_file_name      IN VARCHAR2 DEFAULT NULL
                             , p_invoice_number IN VARCHAR2 DEFAULT NULL
                             , p_ksef_number    IN VARCHAR2 DEFAULT NULL );

  PROCEDURE log_debug ( p_procedure IN VARCHAR2, p_message IN VARCHAR2 );

  PROCEDURE log_info  ( p_procedure IN VARCHAR2, p_message IN VARCHAR2 );

  PROCEDURE log_warn  ( p_procedure IN VARCHAR2, p_message IN VARCHAR2 );

  -- Captures SQLCODE / SQLERRM / FORMAT_ERROR_BACKTRACE automatically.
  PROCEDURE log_error ( p_procedure IN VARCHAR2
                      , p_message   IN VARCHAR2
                      , p_sqlcode   IN NUMBER   DEFAULT SQLCODE
                      , p_sqlerrm   IN VARCHAR2 DEFAULT SQLERRM );

  -- Performance metric (elapsed ms for a phase / step).
  PROCEDURE log_metric ( p_procedure IN VARCHAR2
                       , p_message   IN VARCHAR2
                       , p_elapsed_ms IN NUMBER );

END xxtjx_ksef_log_pkg;
/
