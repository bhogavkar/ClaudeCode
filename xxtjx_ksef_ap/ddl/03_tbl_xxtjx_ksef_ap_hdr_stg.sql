-- =====================================================================
--  XXTJX_KSEF_AP_HDR_STG  |  Header staging
--  Replica of AP_INVOICES_INTERFACE (working subset) + integration cols.
--  Datatypes mirror the interface so population is a straight assignment.
-- =====================================================================
SET DEFINE OFF;

CREATE TABLE xxtjx.xxtjx_ksef_ap_hdr_stg
( -- ---- Integration / control columns ----
  hdr_stg_id                  NUMBER(15)     NOT NULL
, file_id                     NUMBER(15)     NOT NULL
, original_json_id            NUMBER(15)                    -- = file_id (audit lineage)
, request_id                  NUMBER(15)
, batch_id                    VARCHAR2(17)
, group_id                    VARCHAR2(80)                  -- AP import GROUP_ID
, ksef_number                 VARCHAR2(50)
, json_version                VARCHAR2(30)
, source_system               VARCHAR2(30)   DEFAULT 'OPENTEXT'
, invoice_source              VARCHAR2(80)                  -- header.source (AII.SOURCE)
, process_status              VARCHAR2(30)   DEFAULT 'PARSED'  NOT NULL
, validation_status           VARCHAR2(30)   DEFAULT 'PENDING' NOT NULL   -- PENDING/PASS/FAIL
, interface_status            VARCHAR2(30)   DEFAULT 'PENDING'            -- PENDING/LOADED/IMPORTED/REJECTED
, error_code                  VARCHAR2(30)
, error_message               VARCHAR2(4000)
, ap_invoice_id               NUMBER(15)                    -- populated after import
  -- ---- AP_INVOICES_INTERFACE mirror (working subset) ----
, invoice_id                  NUMBER(15)                    -- AII.INVOICE_ID (from AP seq at load)
, invoice_num                 VARCHAR2(50)
, invoice_type_lookup_code    VARCHAR2(25)
, invoice_date                DATE
, gl_date                     DATE
, vendor_id                   NUMBER
, vendor_num                  VARCHAR2(30)
, vendor_name                 VARCHAR2(240)
, vendor_site_id              NUMBER
, vendor_site_code            VARCHAR2(30)
, invoice_amount              NUMBER
, invoice_currency_code       VARCHAR2(15)
, exchange_rate               NUMBER
, exchange_rate_type          VARCHAR2(30)
, exchange_date               DATE
, terms_name                  VARCHAR2(50)
, terms_date                  DATE
, description                 VARCHAR2(240)
, source                      VARCHAR2(80)
, org_id                      NUMBER
, operating_unit_name         VARCHAR2(240)
, legal_entity_id             NUMBER
, legal_entity_name           VARCHAR2(240)
, payment_method_code         VARCHAR2(30)
, pay_group_lookup_code       VARCHAR2(25)
, accts_pay_code_comb_id      NUMBER                        -- liability account CCID
, calc_tax_during_import_flag VARCHAR2(1)
, po_number                   VARCHAR2(20)
, total_tax_amount            NUMBER
, remit_to_vendor_id          NUMBER
, remit_to_vendor_site_id     NUMBER
, gl_date_str                 VARCHAR2(20)                  -- raw MMDDYYYY (diagnostics)
, invoice_date_str            VARCHAR2(20)
  -- ---- KSeF / TJX attribute passthrough ----
, attribute_category          VARCHAR2(30)
, attribute1                  VARCHAR2(150)                 -- KSeF number
, attribute2                  VARCHAR2(150)                 -- legacy PO number
, attribute3                  VARCHAR2(150)
, attribute_date1             DATE                          -- internalRecordingDate
  -- ---- WHO columns ----
, created_by                  NUMBER(15)  DEFAULT fnd_global.user_id  NOT NULL
, creation_date               DATE        DEFAULT SYSDATE             NOT NULL
, last_updated_by             NUMBER(15)  DEFAULT fnd_global.user_id  NOT NULL
, last_update_date            DATE        DEFAULT SYSDATE             NOT NULL
, last_update_login           NUMBER(15)  DEFAULT fnd_global.login_id
)
TABLESPACE apps_ts_tx_data;

COMMENT ON TABLE xxtjx.xxtjx_ksef_ap_hdr_stg IS 'KSeF AP invoice header staging - AP_INVOICES_INTERFACE replica + integration columns';

GRANT SELECT, INSERT, UPDATE, DELETE ON xxtjx.xxtjx_ksef_ap_hdr_stg TO apps;
CREATE OR REPLACE SYNONYM apps.xxtjx_ksef_ap_hdr_stg FOR xxtjx.xxtjx_ksef_ap_hdr_stg;
