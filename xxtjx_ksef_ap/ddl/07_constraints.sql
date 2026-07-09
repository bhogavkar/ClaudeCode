-- =====================================================================
--  Primary keys, unique keys, foreign keys, check constraints
--  Run AFTER table creation.
-- =====================================================================
SET DEFINE OFF;

-- ---------- XXTJX_KSEF_FILES ----------
ALTER TABLE xxtjx.xxtjx_ksef_files
  ADD CONSTRAINT xxtjx_ksef_files_pk PRIMARY KEY (file_id)
  USING INDEX TABLESPACE apps_ts_tx_idx;

-- Idempotency at the FILE layer: identical bytes = duplicate file.
ALTER TABLE xxtjx.xxtjx_ksef_files
  ADD CONSTRAINT xxtjx_ksef_files_uk1 UNIQUE (file_hash)
  USING INDEX TABLESPACE apps_ts_tx_idx;

ALTER TABLE xxtjx.xxtjx_ksef_files
  ADD CONSTRAINT xxtjx_ksef_files_ck1
      CHECK (process_status IN ('NEW','LOADED','PARSING','PARSED','VALIDATING',
             'VALIDATED','IMPORTING','IMPORTED','ATTACHING','COMPLETED',
             'ERROR','DUPLICATE','REJECTED'));

-- ---------- XXTJX_KSEF_AP_HDR_STG ----------
ALTER TABLE xxtjx.xxtjx_ksef_ap_hdr_stg
  ADD CONSTRAINT xxtjx_ksef_hdr_stg_pk PRIMARY KEY (hdr_stg_id)
  USING INDEX TABLESPACE apps_ts_tx_idx;

ALTER TABLE xxtjx.xxtjx_ksef_ap_hdr_stg
  ADD CONSTRAINT xxtjx_ksef_hdr_stg_fk1 FOREIGN KEY (file_id)
      REFERENCES xxtjx.xxtjx_ksef_files (file_id);

-- Business idempotency key (defence in depth alongside ksef_number).
-- One staged header per (vendor_site, invoice_num, ksef) — enables safe replay.
ALTER TABLE xxtjx.xxtjx_ksef_ap_hdr_stg
  ADD CONSTRAINT xxtjx_ksef_hdr_stg_uk1
      UNIQUE (vendor_site_id, invoice_num, ksef_number)
  USING INDEX TABLESPACE apps_ts_tx_idx;

ALTER TABLE xxtjx.xxtjx_ksef_ap_hdr_stg
  ADD CONSTRAINT xxtjx_ksef_hdr_stg_ck1
      CHECK (validation_status IN ('PENDING','PASS','FAIL','WARN'));

-- ---------- XXTJX_KSEF_AP_LINE_STG ----------
ALTER TABLE xxtjx.xxtjx_ksef_ap_line_stg
  ADD CONSTRAINT xxtjx_ksef_line_stg_pk PRIMARY KEY (line_stg_id)
  USING INDEX TABLESPACE apps_ts_tx_idx;

ALTER TABLE xxtjx.xxtjx_ksef_ap_line_stg
  ADD CONSTRAINT xxtjx_ksef_line_stg_fk1 FOREIGN KEY (hdr_stg_id)
      REFERENCES xxtjx.xxtjx_ksef_ap_hdr_stg (hdr_stg_id);

ALTER TABLE xxtjx.xxtjx_ksef_ap_line_stg
  ADD CONSTRAINT xxtjx_ksef_line_stg_uk1
      UNIQUE (hdr_stg_id, line_number)
  USING INDEX TABLESPACE apps_ts_tx_idx;

-- ---------- XXTJX_AP_ATTACHMENTS ----------
ALTER TABLE xxtjx.xxtjx_ap_attachments
  ADD CONSTRAINT xxtjx_ap_attach_pk PRIMARY KEY (attachment_id)
  USING INDEX TABLESPACE apps_ts_tx_idx;

ALTER TABLE xxtjx.xxtjx_ap_attachments
  ADD CONSTRAINT xxtjx_ap_attach_fk1 FOREIGN KEY (file_id)
      REFERENCES xxtjx.xxtjx_ksef_files (file_id);

-- One attachment row per (file, file_name) — replay-safe.
ALTER TABLE xxtjx.xxtjx_ap_attachments
  ADD CONSTRAINT xxtjx_ap_attach_uk1 UNIQUE (file_id, file_name)
  USING INDEX TABLESPACE apps_ts_tx_idx;

ALTER TABLE xxtjx.xxtjx_ap_attachments
  ADD CONSTRAINT xxtjx_ap_attach_ck1
      CHECK (upload_status IN ('PENDING','DECODED','VALIDATED','ATTACHED',
             'ATTACH_ERROR','DECODE_ERROR'));

-- ---------- XXTJX_KSEF_LOG ----------
ALTER TABLE xxtjx.xxtjx_ksef_log
  ADD CONSTRAINT xxtjx_ksef_log_pk PRIMARY KEY (log_id)
  USING INDEX TABLESPACE apps_ts_tx_idx;

ALTER TABLE xxtjx.xxtjx_ksef_log
  ADD CONSTRAINT xxtjx_ksef_log_ck1
      CHECK (log_level IN ('DEBUG','INFO','WARN','ERROR','METRIC'));
