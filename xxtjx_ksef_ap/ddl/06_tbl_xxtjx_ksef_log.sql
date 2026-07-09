-- =====================================================================
--  XXTJX_KSEF_LOG  |  Enterprise logging / instrumentation
--  Written autonomously so log survives a rollback of the business txn.
-- =====================================================================
SET DEFINE OFF;

CREATE TABLE xxtjx.xxtjx_ksef_log
( log_id            NUMBER(15)     NOT NULL
, request_id        NUMBER(15)
, log_level         VARCHAR2(10)   NOT NULL       -- DEBUG/INFO/WARN/ERROR/METRIC
, log_phase         VARCHAR2(40)                  -- LOADER/PARSER/VALIDATE/IMPORT/ATTACH/POST
, package_name      VARCHAR2(60)
, procedure_name    VARCHAR2(60)
, file_id           NUMBER(15)
, file_name         VARCHAR2(255)
, invoice_number    VARCHAR2(50)
, ksef_number       VARCHAR2(50)
, message           VARCHAR2(4000)
, sql_code          NUMBER
, sql_errm          VARCHAR2(4000)
, error_backtrace   VARCHAR2(4000)
, elapsed_ms        NUMBER
, log_date          TIMESTAMP(6)   DEFAULT SYSTIMESTAMP NOT NULL
, created_by        NUMBER(15)     DEFAULT fnd_global.user_id
)
TABLESPACE apps_ts_tx_data;

COMMENT ON TABLE xxtjx.xxtjx_ksef_log IS 'KSeF integration enterprise log - autonomous-transaction backed';

GRANT SELECT, INSERT, UPDATE, DELETE ON xxtjx.xxtjx_ksef_log TO apps;
CREATE OR REPLACE SYNONYM apps.xxtjx_ksef_log FOR xxtjx.xxtjx_ksef_log;
