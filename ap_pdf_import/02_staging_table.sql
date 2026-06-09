-- =============================================================================
-- File        : 02_staging_table.sql
-- Description : Custom staging table and supporting objects for AP PDF import.
--               Run as APPS (or the schema that owns custom objects).
-- Module      : Oracle Payables (AP) - R12
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Sequence
-- ---------------------------------------------------------------------------
CREATE SEQUENCE XXCUST_AP_PDF_STG_S
    START WITH 1
    INCREMENT BY 1
    NOCACHE
    NOCYCLE;

-- ---------------------------------------------------------------------------
-- Staging Table
-- ---------------------------------------------------------------------------
CREATE TABLE XXCUST_AP_PDF_STAGING (
    -- Primary key
    staging_id            NUMBER            NOT NULL,

    -- Source file identification
    ksef_number           VARCHAR2(50)      NOT NULL,   -- 35-digit K-Sef number (file name without extension)
    pdf_file_name         VARCHAR2(255)     NOT NULL,   -- Full file name as read from OS directory

    -- PDF binary content  (supports up to 50 MB; Oracle BLOB max = 128 TB)
    pdf_content           BLOB,
    file_size_bytes       NUMBER,                       -- Actual file size in bytes

    -- Processing lifecycle
    status                VARCHAR2(30)      DEFAULT 'NEW' NOT NULL,
    --   NEW         = record inserted, load not yet attempted
    --   LOADING     = BLOB write in progress
    --   PROCESSED   = BLOB loaded successfully, ready for attachment
    --   ATTACHED    = successfully attached to AP invoice
    --   ERROR       = fatal error during load
    --   ATTACH_ERROR = BLOB loaded but FND attachment step failed

    error_message         VARCHAR2(4000),               -- Last error detail

    -- AP Invoice linkage (populated during or after attachment)
    invoice_id            NUMBER,                       -- AP_INVOICES_ALL.INVOICE_ID
    invoice_num           VARCHAR2(50),                 -- AP_INVOICES_ALL.INVOICE_NUM
    vendor_id             NUMBER,                       -- AP_INVOICES_ALL.VENDOR_ID

    -- FND attachment identifiers (populated after successful attachment)
    fnd_document_id       NUMBER,                       -- FND_DOCUMENTS.DOCUMENT_ID
    fnd_attached_doc_id   NUMBER,                       -- FND_ATTACHED_DOCUMENTS.ATTACHED_DOCUMENT_ID
    fnd_media_id          NUMBER,                       -- FND_LOBS.FILE_ID

    process_date          DATE,                         -- Timestamp of last status change

    -- Standard WHO columns
    created_by            NUMBER            DEFAULT -1  NOT NULL,
    creation_date         DATE              DEFAULT SYSDATE NOT NULL,
    last_updated_by       NUMBER            DEFAULT -1  NOT NULL,
    last_update_date      DATE              DEFAULT SYSDATE NOT NULL,
    last_update_login     NUMBER,

    -- Constraints
    CONSTRAINT XXCUST_AP_PDF_STG_PK
        PRIMARY KEY (staging_id),
    CONSTRAINT XXCUST_AP_PDF_STG_STATUS_CK
        CHECK (status IN ('NEW','LOADING','PROCESSED','ATTACHED','ERROR','ATTACH_ERROR')),
    CONSTRAINT XXCUST_AP_PDF_STG_KSEF_UQ
        UNIQUE (ksef_number, status)   -- prevents duplicate loads for same K-Sef when active
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- Support lookups by invoice
CREATE INDEX XXCUST_AP_PDF_STG_INV_IX
    ON XXCUST_AP_PDF_STAGING (invoice_num, status);

-- Support lookups by status for batch processing
CREATE INDEX XXCUST_AP_PDF_STG_STS_IX
    ON XXCUST_AP_PDF_STAGING (status, creation_date);

-- ---------------------------------------------------------------------------
-- Table and column comments
-- ---------------------------------------------------------------------------
COMMENT ON TABLE XXCUST_AP_PDF_STAGING
    IS 'Custom staging table for AP Invoice PDF imports via KSeF/OpenText integration. Stores raw PDF BLOBs before FND attachment.';

COMMENT ON COLUMN XXCUST_AP_PDF_STAGING.staging_id
    IS 'Surrogate PK from XXCUST_AP_PDF_STG_S sequence.';
COMMENT ON COLUMN XXCUST_AP_PDF_STAGING.ksef_number
    IS 'KSeF 35-digit invoice reference number, derived from PDF file name (extension stripped).';
COMMENT ON COLUMN XXCUST_AP_PDF_STAGING.pdf_file_name
    IS 'Full file name as found on the OS directory (e.g. 12345678901234567890123456789012345.pdf).';
COMMENT ON COLUMN XXCUST_AP_PDF_STAGING.pdf_content
    IS 'Binary content of the PDF file. Supports up to 50 MB per package guard; Oracle allows up to 128 TB.';
COMMENT ON COLUMN XXCUST_AP_PDF_STAGING.status
    IS 'Processing status: NEW|LOADING|PROCESSED|ATTACHED|ERROR|ATTACH_ERROR.';
COMMENT ON COLUMN XXCUST_AP_PDF_STAGING.fnd_document_id
    IS 'FND_DOCUMENTS.DOCUMENT_ID created during FND attachment step.';
COMMENT ON COLUMN XXCUST_AP_PDF_STAGING.fnd_attached_doc_id
    IS 'FND_ATTACHED_DOCUMENTS.ATTACHED_DOCUMENT_ID linking the document to the AP invoice.';
COMMENT ON COLUMN XXCUST_AP_PDF_STAGING.fnd_media_id
    IS 'FND_LOBS.FILE_ID where the BLOB is stored for FND attachment purposes.';

PROMPT Staging table XXCUST_AP_PDF_STAGING created. Run 03_pkg_spec.sql next.
