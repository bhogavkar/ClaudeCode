-- =====================================================================
--  Index strategy
--  PK/UK indexes are created with the constraints (07_constraints.sql).
--  Below are the access-path indexes for the drivers used by each phase.
-- =====================================================================
SET DEFINE OFF;

-- XXTJX_KSEF_FILES ---------------------------------------------------
-- Loader/parser driver: "next files in a given status".
CREATE INDEX xxtjx.xxtjx_ksef_files_n1
  ON xxtjx.xxtjx_ksef_files (process_status, received_date)
  TABLESPACE apps_ts_tx_idx;
-- Fast KSeF replay lookup (idempotency probe).
CREATE INDEX xxtjx.xxtjx_ksef_files_n2
  ON xxtjx.xxtjx_ksef_files (ksef_number)
  TABLESPACE apps_ts_tx_idx;
CREATE INDEX xxtjx.xxtjx_ksef_files_n3
  ON xxtjx.xxtjx_ksef_files (request_id)
  TABLESPACE apps_ts_tx_idx;

-- XXTJX_KSEF_AP_HDR_STG ----------------------------------------------
CREATE INDEX xxtjx.xxtjx_ksef_hdr_stg_n1
  ON xxtjx.xxtjx_ksef_ap_hdr_stg (process_status, validation_status)
  TABLESPACE apps_ts_tx_idx;
CREATE INDEX xxtjx.xxtjx_ksef_hdr_stg_n2
  ON xxtjx.xxtjx_ksef_ap_hdr_stg (file_id)
  TABLESPACE apps_ts_tx_idx;
CREATE INDEX xxtjx.xxtjx_ksef_hdr_stg_n3
  ON xxtjx.xxtjx_ksef_ap_hdr_stg (group_id)
  TABLESPACE apps_ts_tx_idx;
CREATE INDEX xxtjx.xxtjx_ksef_hdr_stg_n4
  ON xxtjx.xxtjx_ksef_ap_hdr_stg (ksef_number)
  TABLESPACE apps_ts_tx_idx;

-- XXTJX_KSEF_AP_LINE_STG ---------------------------------------------
CREATE INDEX xxtjx.xxtjx_ksef_line_stg_n1
  ON xxtjx.xxtjx_ksef_ap_line_stg (hdr_stg_id)
  TABLESPACE apps_ts_tx_idx;
CREATE INDEX xxtjx.xxtjx_ksef_line_stg_n2
  ON xxtjx.xxtjx_ksef_ap_line_stg (file_id, process_status)
  TABLESPACE apps_ts_tx_idx;

-- XXTJX_AP_ATTACHMENTS -----------------------------------------------
CREATE INDEX xxtjx.xxtjx_ap_attach_n1
  ON xxtjx.xxtjx_ap_attachments (upload_status)
  TABLESPACE apps_ts_tx_idx;
CREATE INDEX xxtjx.xxtjx_ap_attach_n2
  ON xxtjx.xxtjx_ap_attachments (invoice_id)
  TABLESPACE apps_ts_tx_idx;
CREATE INDEX xxtjx.xxtjx_ap_attach_n3
  ON xxtjx.xxtjx_ap_attachments (hdr_stg_id)
  TABLESPACE apps_ts_tx_idx;

-- XXTJX_KSEF_LOG -----------------------------------------------------
CREATE INDEX xxtjx.xxtjx_ksef_log_n1
  ON xxtjx.xxtjx_ksef_log (request_id, log_date)
  TABLESPACE apps_ts_tx_idx;
CREATE INDEX xxtjx.xxtjx_ksef_log_n2
  ON xxtjx.xxtjx_ksef_log (file_id)
  TABLESPACE apps_ts_tx_idx;
CREATE INDEX xxtjx.xxtjx_ksef_log_n3
  ON xxtjx.xxtjx_ksef_log (log_level, log_date)
  TABLESPACE apps_ts_tx_idx;
