-- =====================================================================
--  XXTJX_KSEF_AP_LINE_STG  |  Line staging
--  Similar to AP_INVOICE_LINES_INTERFACE + integration columns.
-- =====================================================================
SET DEFINE OFF;

CREATE TABLE xxtjx.xxtjx_ksef_ap_line_stg
( -- ---- Integration / control columns ----
  line_stg_id              NUMBER(15)     NOT NULL
, hdr_stg_id               NUMBER(15)     NOT NULL         -- FK to header staging
, file_id                  NUMBER(15)     NOT NULL
, request_id               NUMBER(15)
, json_line_number         NUMBER(9)                       -- lineNumber as received
, process_status           VARCHAR2(30)   DEFAULT 'PARSED'  NOT NULL
, validation_status        VARCHAR2(30)   DEFAULT 'PENDING' NOT NULL
, error_code               VARCHAR2(30)
, error_message            VARCHAR2(4000)
  -- ---- AP_INVOICE_LINES_INTERFACE mirror (working subset) ----
, invoice_id               NUMBER(15)                      -- match header AII.INVOICE_ID
, invoice_line_id          NUMBER(15)                      -- AILI.INVOICE_LINE_ID
, line_number              NUMBER(9)
, line_type_lookup_code    VARCHAR2(25)
, amount                   NUMBER
, description              VARCHAR2(240)
, accounting_date          DATE
, set_of_books_id          NUMBER
, dist_code_concatenated   VARCHAR2(250)                   -- normalised COA string
, dist_code_combination_id NUMBER                          -- resolved CCID
, line_group_number        NUMBER(9)
, prorate_across_flag      VARCHAR2(1)
, tax_classification_code  VARCHAR2(30)
, tax_code                 VARCHAR2(30)
, tax_regime_code          VARCHAR2(30)
, tax                      VARCHAR2(30)
, tax_status_code          VARCHAR2(30)
, po_number                VARCHAR2(20)
, po_line_number           NUMBER
, po_shipment_num          NUMBER
, po_distribution_num      NUMBER
, vendor_site_id           NUMBER
, org_id                   NUMBER
, accounting_date_str      VARCHAR2(20)                    -- raw MMDDYYYY (diagnostics)
  -- ---- WHO columns ----
, created_by               NUMBER(15)  DEFAULT fnd_global.user_id  NOT NULL
, creation_date            DATE        DEFAULT SYSDATE             NOT NULL
, last_updated_by          NUMBER(15)  DEFAULT fnd_global.user_id  NOT NULL
, last_update_date         DATE        DEFAULT SYSDATE             NOT NULL
, last_update_login        NUMBER(15)  DEFAULT fnd_global.login_id
)
TABLESPACE apps_ts_tx_data;

COMMENT ON TABLE xxtjx.xxtjx_ksef_ap_line_stg IS 'KSeF AP invoice line staging - AP_INVOICE_LINES_INTERFACE replica + integration columns';

GRANT SELECT, INSERT, UPDATE, DELETE ON xxtjx.xxtjx_ksef_ap_line_stg TO apps;
CREATE OR REPLACE SYNONYM apps.xxtjx_ksef_ap_line_stg FOR xxtjx.xxtjx_ksef_ap_line_stg;
