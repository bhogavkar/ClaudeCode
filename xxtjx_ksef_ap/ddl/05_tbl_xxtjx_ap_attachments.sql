-- =====================================================================
--  XXTJX_AP_ATTACHMENTS  |  PDF attachment repository (SecureFile BLOB)
--  Decoded PDF ONLY. Base64 is never persisted.
-- =====================================================================
SET DEFINE OFF;

CREATE TABLE xxtjx.xxtjx_ap_attachments
( attachment_id        NUMBER(15)      NOT NULL
, file_id              NUMBER(15)      NOT NULL          -- FK -> XXTJX_KSEF_FILES
, hdr_stg_id           NUMBER(15)
, invoice_id           NUMBER(15)                        -- AP_INVOICES_ALL.INVOICE_ID
, invoice_number       VARCHAR2(50)
  -- ---- FND Attachment linkage (populated after fnd upload) ----
, document_id          NUMBER(15)                        -- FND_DOCUMENTS.DOCUMENT_ID
, attached_document_id NUMBER(15)                        -- FND_ATTACHED_DOCUMENTS
, media_id             NUMBER(15)                        -- FND_LOBS.MEDIA_ID
, category_id          NUMBER(15)
, datatype_id          NUMBER(15)      DEFAULT 6         -- 6 = File
  -- ---- File attributes (computed post-decode) ----
, file_name            VARCHAR2(255)   NOT NULL
, mime_type            VARCHAR2(240)   NOT NULL
, file_extension       VARCHAR2(10)
, file_size            NUMBER(15)                        -- decoded byte length
, checksum             VARCHAR2(64)                      -- SHA-256 of decoded BLOB
, pdf_content          BLOB            NOT NULL          -- decoded PDF, SecureFile
  -- ---- Status ----
, upload_status        VARCHAR2(30)    DEFAULT 'PENDING' NOT NULL
--   PENDING / DECODED / VALIDATED / ATTACHED / ATTACH_ERROR / DECODE_ERROR
, error_code           VARCHAR2(30)
, error_message        VARCHAR2(4000)
, request_id           NUMBER(15)
  -- ---- WHO columns ----
, created_by           NUMBER(15)  DEFAULT fnd_global.user_id  NOT NULL
, creation_date        DATE        DEFAULT SYSDATE             NOT NULL
, last_updated_by      NUMBER(15)  DEFAULT fnd_global.user_id  NOT NULL
, last_update_date     DATE        DEFAULT SYSDATE             NOT NULL
, last_update_login    NUMBER(15)  DEFAULT fnd_global.login_id
)
LOB (pdf_content) STORE AS SECUREFILE
  ( ENABLE STORAGE IN ROW CHUNK 8192 NOCACHE
    COMPRESS MEDIUM )               -- PDFs are already compressed; no dedup
TABLESPACE apps_ts_media;

COMMENT ON TABLE  xxtjx.xxtjx_ap_attachments            IS 'KSeF invoice PDF repository - decoded SecureFile BLOB, linked to FND attachments';
COMMENT ON COLUMN xxtjx.xxtjx_ap_attachments.pdf_content IS 'Decoded PDF bytes. Base64 is never stored.';

GRANT SELECT, INSERT, UPDATE, DELETE ON xxtjx.xxtjx_ap_attachments TO apps;
CREATE OR REPLACE SYNONYM apps.xxtjx_ap_attachments FOR xxtjx.xxtjx_ap_attachments;
