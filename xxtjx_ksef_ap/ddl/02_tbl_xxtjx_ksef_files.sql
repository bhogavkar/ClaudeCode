-- =====================================================================
--  XXTJX_KSEF_FILES  |  Raw JSON audit repository (immutable)
--  Stores the complete payload EXACTLY as received. Never updated except
--  status columns. Acts as the legal audit record + parser source.
-- =====================================================================
SET DEFINE OFF;

CREATE TABLE xxtjx.xxtjx_ksef_files
( file_id            NUMBER(15)      NOT NULL
, file_name          VARCHAR2(255)   NOT NULL
, file_content       CLOB            NOT NULL           -- raw JSON, immutable
, file_size          NUMBER(15)
, file_hash          VARCHAR2(64)    NOT NULL           -- SHA-256 of raw bytes
, source_system      VARCHAR2(30)    DEFAULT 'OPENTEXT' NOT NULL
, document_type      VARCHAR2(30)                       -- documentType
, batch_id           VARCHAR2(17)                       -- payload batchId
, ksef_number        VARCHAR2(50)                       -- lifted for fast dedup
, invoice_number     VARCHAR2(50)
, process_status     VARCHAR2(30)    DEFAULT 'NEW'  NOT NULL
--   NEW / LOADED / PARSING / PARSED / VALIDATING / VALIDATED /
--   IMPORTING / IMPORTED / ATTACHING / COMPLETED / ERROR / DUPLICATE / REJECTED
, error_code         VARCHAR2(30)
, error_message      VARCHAR2(4000)
, request_id         NUMBER(15)
, archive_file_name  VARCHAR2(500)
, received_date      DATE            DEFAULT SYSDATE NOT NULL
, process_date       DATE
-- ---- WHO columns (Oracle EBS standard) ----
, created_by         NUMBER(15)      DEFAULT fnd_global.user_id     NOT NULL
, creation_date      DATE            DEFAULT SYSDATE                NOT NULL
, last_updated_by    NUMBER(15)      DEFAULT fnd_global.user_id     NOT NULL
, last_update_date   DATE            DEFAULT SYSDATE                NOT NULL
, last_update_login  NUMBER(15)      DEFAULT fnd_global.login_id
)
LOB (file_content) STORE AS SECUREFILE
  ( ENABLE STORAGE IN ROW CHUNK 8192 NOCACHE
    COMPRESS MEDIUM DEDUPLICATE )
TABLESPACE apps_ts_tx_data;

COMMENT ON TABLE  xxtjx.xxtjx_ksef_files                 IS 'KSeF/OpenText raw JSON audit repository - immutable payload store';
COMMENT ON COLUMN xxtjx.xxtjx_ksef_files.file_hash       IS 'SHA-256 of raw file - duplicate-file detection';
COMMENT ON COLUMN xxtjx.xxtjx_ksef_files.process_status  IS 'NEW/LOADED/PARSED/VALIDATED/IMPORTED/COMPLETED/ERROR/DUPLICATE/REJECTED';

GRANT SELECT, INSERT, UPDATE, DELETE ON xxtjx.xxtjx_ksef_files TO apps;
CREATE OR REPLACE SYNONYM apps.xxtjx_ksef_files FOR xxtjx.xxtjx_ksef_files;
