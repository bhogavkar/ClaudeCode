--------------------------------------------------------------------------------
-- FILE        : 01_XXTJX_WD_EXP_STG.sql
-- OBJECT      : XXTJX_WD_EXP_STG  (single staging table) + sequence + indexes
-- PURPOSE     : Stage Workday Expense pipe-delimited file (H / DH / DL / T) for
--               loading into the Oracle AP Invoice Open Interface.
--               Header (DH) and Line (DL) records are flattened into ONE table,
--               discriminated by RECORD_TYPE and linked by BATCH_ID + INVOICE_NUM.
-- NOTE        : Exactly ONE staging table is used. No temp / mapping / control /
--               header / detail / audit tables are created (by design).
-- HISTORY     : 1.0  27-Jun-2026  Architect  Initial version
--------------------------------------------------------------------------------

CREATE TABLE xxtjx.xxtjx_wd_exp_stg
( stg_id                  NUMBER            NOT NULL,  -- PK (xxtjx_wd_exp_stg_s)
  request_id              NUMBER,                      -- conc request that loaded row
  batch_id                VARCHAR2(17),                -- from file (MMDDYYHHMISS)
  record_type             VARCHAR2(2),                 -- 'DH' header / 'DL' line
  ------------------------------------------------------------------ raw header cols
  invoice_num             VARCHAR2(50),
  invoice_type            VARCHAR2(25),                -- constant 'STANDARD'
  employee_number         VARCHAR2(30),
  operating_unit_name     VARCHAR2(240),
  source                  VARCHAR2(80),                -- constant 'TJXWD_EXP US'
  invoice_date            VARCHAR2(8),                 -- MMDDYYYY (raw text)
  invoice_amount          VARCHAR2(40),                -- raw text -> validated number
  currency_code           VARCHAR2(15),
  invoice_description      VARCHAR2(240),
  ------------------------------------------------------------------ raw line cols
  line_number             VARCHAR2(15),
  line_description        VARCHAR2(240),
  line_type               VARCHAR2(25),                -- constant 'ITEM'
  line_amount             VARCHAR2(40),                -- raw text -> validated number
  dist_account            VARCHAR2(250),               -- 6-seg COA concatenated
  tax_classification_code VARCHAR2(30),
  trip_distance           VARCHAR2(40),                -- CA only (conditional)
  ------------------------------------------------------------------ derived Oracle cols
  org_id                  NUMBER,
  person_id               NUMBER,
  vendor_id               NUMBER,
  vendor_site_id          NUMBER,
  invoice_id              NUMBER,                      -- ap_invoices_interface_s link
  ccid                    NUMBER,                      -- resolved code_combination_id
  ------------------------------------------------------------------ control cols
  process_status          VARCHAR2(1)  DEFAULT 'N',    -- N new / V valid / S success / E error
  error_flag              VARCHAR2(1)  DEFAULT 'N',    -- Y / N
  error_message           VARCHAR2(2000),
  creation_date           DATE         DEFAULT SYSDATE,
  created_by              NUMBER,
  last_update_date        DATE         DEFAULT SYSDATE,
  last_updated_by         NUMBER,
  CONSTRAINT xxtjx_wd_exp_stg_pk PRIMARY KEY (stg_id)
)
/

CREATE SEQUENCE xxtjx.xxtjx_wd_exp_stg_s START WITH 1 INCREMENT BY 1 CACHE 1000
/

-- Drives every set-based validator and the status update
CREATE INDEX xxtjx.xxtjx_wd_exp_stg_n1
   ON xxtjx.xxtjx_wd_exp_stg (batch_id, record_type, process_status)
/

-- Drives the header <-> line join (BATCH_ID + INVOICE_NUM)
CREATE INDEX xxtjx.xxtjx_wd_exp_stg_n2
   ON xxtjx.xxtjx_wd_exp_stg (batch_id, invoice_num)
/

-- Synonym + grant for APPS (schema-reference removal friendly)
CREATE OR REPLACE SYNONYM apps.xxtjx_wd_exp_stg FOR xxtjx.xxtjx_wd_exp_stg
/
GRANT SELECT, INSERT, UPDATE, DELETE ON xxtjx.xxtjx_wd_exp_stg TO apps
/
GRANT SELECT ON xxtjx.xxtjx_wd_exp_stg_s TO apps
/
