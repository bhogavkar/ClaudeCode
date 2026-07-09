CREATE OR REPLACE PACKAGE BODY apps.xxtjx_ksef_log_pkg
AS
  -- Session-scoped context (package globals).
  g_request_id     NUMBER;
  g_package_name   VARCHAR2(60);
  g_file_id        NUMBER;
  g_file_name      VARCHAR2(255);
  g_invoice_number VARCHAR2(50);
  g_ksef_number    VARCHAR2(50);

  ------------------------------------------------------------------
  PROCEDURE init_context ( p_request_id IN NUMBER, p_package_name IN VARCHAR2 )
  IS
  BEGIN
    g_request_id   := NVL(p_request_id, fnd_global.conc_request_id);
    g_package_name := p_package_name;
  END init_context;

  ------------------------------------------------------------------
  PROCEDURE set_file_context ( p_file_id        IN NUMBER   DEFAULT NULL
                             , p_file_name      IN VARCHAR2 DEFAULT NULL
                             , p_invoice_number IN VARCHAR2 DEFAULT NULL
                             , p_ksef_number    IN VARCHAR2 DEFAULT NULL )
  IS
  BEGIN
    g_file_id        := NVL(p_file_id, g_file_id);
    g_file_name      := NVL(p_file_name, g_file_name);
    g_invoice_number := NVL(p_invoice_number, g_invoice_number);
    g_ksef_number    := NVL(p_ksef_number, g_ksef_number);
  END set_file_context;

  ------------------------------------------------------------------
  --  Core writer - autonomous so log persists across rollback.
  ------------------------------------------------------------------
  PROCEDURE write_log ( p_level     IN VARCHAR2
                      , p_procedure IN VARCHAR2
                      , p_message   IN VARCHAR2
                      , p_sqlcode   IN NUMBER   DEFAULT NULL
                      , p_sqlerrm   IN VARCHAR2 DEFAULT NULL
                      , p_backtrace IN VARCHAR2 DEFAULT NULL
                      , p_elapsed   IN NUMBER   DEFAULT NULL )
  IS
    PRAGMA AUTONOMOUS_TRANSACTION;
  BEGIN
    INSERT INTO xxtjx.xxtjx_ksef_log
      ( log_id, request_id, log_level, log_phase, package_name, procedure_name
      , file_id, file_name, invoice_number, ksef_number, message
      , sql_code, sql_errm, error_backtrace, elapsed_ms, log_date, created_by )
    VALUES
      ( xxtjx.xxtjx_ksef_log_s.NEXTVAL, g_request_id, p_level
      , SUBSTR(g_package_name,1,40), g_package_name, p_procedure
      , g_file_id, g_file_name, g_invoice_number, g_ksef_number
      , SUBSTR(p_message,1,4000), p_sqlcode, SUBSTR(p_sqlerrm,1,4000)
      , SUBSTR(p_backtrace,1,4000), p_elapsed, SYSTIMESTAMP
      , NVL(fnd_global.user_id,-1) );
    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;   -- logging must never break the caller
  END write_log;

  ------------------------------------------------------------------
  PROCEDURE to_conc ( p_level IN VARCHAR2, p_procedure IN VARCHAR2, p_message IN VARCHAR2 )
  IS
  BEGIN
    -- Mirror to concurrent request log file (best effort).
    fnd_file.put_line( fnd_file.log
                     , TO_CHAR(SYSTIMESTAMP,'HH24:MI:SS.FF3')||' ['||p_level||'] '
                       ||p_procedure||' - '||SUBSTR(p_message,1,3000) );
  EXCEPTION WHEN OTHERS THEN NULL;
  END to_conc;

  ------------------------------------------------------------------
  PROCEDURE log_debug ( p_procedure IN VARCHAR2, p_message IN VARCHAR2 ) IS
  BEGIN
    -- Only persist DEBUG when AOL logging is at STATEMENT level.
    IF fnd_log.test(fnd_log.level_statement, 'xxtjx.ksef') THEN
      write_log('DEBUG', p_procedure, p_message);
    END IF;
  END log_debug;

  PROCEDURE log_info ( p_procedure IN VARCHAR2, p_message IN VARCHAR2 ) IS
  BEGIN
    write_log('INFO', p_procedure, p_message);
    to_conc('INFO', p_procedure, p_message);
  END log_info;

  PROCEDURE log_warn ( p_procedure IN VARCHAR2, p_message IN VARCHAR2 ) IS
  BEGIN
    write_log('WARN', p_procedure, p_message);
    to_conc('WARN', p_procedure, p_message);
  END log_warn;

  PROCEDURE log_error ( p_procedure IN VARCHAR2
                      , p_message   IN VARCHAR2
                      , p_sqlcode   IN NUMBER   DEFAULT SQLCODE
                      , p_sqlerrm   IN VARCHAR2 DEFAULT SQLERRM )
  IS
  BEGIN
    write_log( 'ERROR', p_procedure, p_message
             , p_sqlcode, p_sqlerrm, DBMS_UTILITY.format_error_backtrace );
    to_conc('ERROR', p_procedure, p_message||' | '||p_sqlcode||' '||p_sqlerrm);
  END log_error;

  PROCEDURE log_metric ( p_procedure IN VARCHAR2, p_message IN VARCHAR2, p_elapsed_ms IN NUMBER ) IS
  BEGIN
    write_log('METRIC', p_procedure, p_message, p_elapsed => p_elapsed_ms);
    to_conc('METRIC', p_procedure, p_message||' ('||p_elapsed_ms||' ms)');
  END log_metric;

END xxtjx_ksef_log_pkg;
/
