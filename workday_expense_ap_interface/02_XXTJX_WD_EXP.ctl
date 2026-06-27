--------------------------------------------------------------------------------
-- FILE     : 02_XXTJX_WD_EXP.ctl
-- PURPOSE  : SQL*Loader control file for the Workday Expense interface file.
--            Loads the pipe-delimited file (H / DH / DL / T records) directly
--            into the single staging table XXTJX_WD_EXP_STG.
--
--            Only DH (invoice header) and DL (invoice line) records are loaded;
--            the H (file header) and T (trailer) records are skipped here. The
--            trailer count is reconciled inside the package (RECONCILE_BATCH).
--
-- USAGE    : Registered as a SQL*Loader concurrent program. The data file name
--            is passed by the request; CONTROL is this file.
--              sqlldr USERID=apps/<pwd> CONTROL=XXTJX_WD_EXP.ctl \
--                     DATA=<file> LOG=<log> BAD=<bad> DISCARD=<dsc> ERRORS=0
--
-- LAYOUT   : Fields are pipe ('|') delimited, position-based per Invoice File
--            Format (WD). Non-required fields still occupy a position.
-- HISTORY  : 1.0  27-Jun-2026  Architect  Initial version
--------------------------------------------------------------------------------
OPTIONS (ERRORS=0, ROWS=1000, BINDSIZE=10485760, READSIZE=10485760)
LOAD DATA
CHARACTERSET UTF8
APPEND
INTO TABLE xxtjx.xxtjx_wd_exp_stg
   WHEN (01) = 'DH'
   FIELDS TERMINATED BY '|' OPTIONALLY ENCLOSED BY '"'
   TRAILING NULLCOLUMNS
( record_type           POSITION(1),                       -- 'DH'
  batch_id              CHAR "TRIM(:batch_id)",
  invoice_num           CHAR "TRIM(:invoice_num)",
  invoice_type          CHAR "TRIM(:invoice_type)",        -- STANDARD
  fil_vendor_num        FILLER,                            -- not required
  fil_vendor_name       FILLER,                            -- not required
  fil_vendor_id         FILLER,                            -- not required
  fil_vendor_site_code  FILLER,                            -- not required
  employee_number       CHAR "TRIM(:employee_number)",
  fil_gl_date           FILLER,                            -- derived in EBS
  operating_unit_name   CHAR "TRIM(:operating_unit_name)",
  fil_legal_entity      FILLER,                            -- not required
  source                CHAR "TRIM(:source)",              -- TJXWD_EXP US
  invoice_date          CHAR "TRIM(:invoice_date)",        -- MMDDYYYY
  invoice_amount        CHAR "TRIM(:invoice_amount)",
  fil_total_tax_amount  FILLER,                            -- not required
  currency_code         CHAR "TRIM(:currency_code)",
  fil_exch_rate         FILLER,                            -- not required
  fil_exch_rate_date    FILLER,                            -- not required
  fil_exch_rate_type    FILLER,                            -- not required
  invoice_description   CHAR "TRIM(:invoice_description)",
  -- remaining header positions (terms .. remit-to*) are not required
  process_status        CONSTANT 'N',
  error_flag            CONSTANT 'N',
  record_type_dummy     FILLER,
  request_id            "FND_GLOBAL.CONC_REQUEST_ID",
  stg_id                "XXTJX.XXTJX_WD_EXP_STG_S.NEXTVAL",
  created_by            "FND_GLOBAL.USER_ID",
  creation_date         SYSDATE,
  last_updated_by       "FND_GLOBAL.USER_ID",
  last_update_date      SYSDATE
)
INTO TABLE xxtjx.xxtjx_wd_exp_stg
   WHEN (01:02) = 'DL'
   FIELDS TERMINATED BY '|' OPTIONALLY ENCLOSED BY '"'
   TRAILING NULLCOLUMNS
( record_type           POSITION(1),                       -- 'DL'
  batch_id              CHAR "TRIM(:batch_id)",
  invoice_num           CHAR "TRIM(:invoice_num)",
  line_number           CHAR "TRIM(:line_number)",
  line_description      CHAR "TRIM(:line_description)",
  fil_l_vendor_num      FILLER,                            -- not required
  fil_l_vendor_name     FILLER,                            -- not required
  fil_l_vendor_id       FILLER,                            -- not required
  fil_l_vendor_site     FILLER,                            -- not required
  employee_number       CHAR "TRIM(:employee_number)",
  line_type             CHAR "TRIM(:line_type)",           -- ITEM
  line_amount           CHAR "TRIM(:line_amount)",
  fil_accounting_date   FILLER,                            -- not required
  fil_set_of_book_id    FILLER,                            -- not required
  dist_account          CHAR "TRIM(:dist_account)",        -- 6-seg COA
  fil_line_group_num    FILLER,                            -- not required
  fil_tax_code          FILLER,                            -- not required
  fil_tax_regime        FILLER,                            -- not required
  fil_tax               FILLER,                            -- not required
  fil_tax_status_code   FILLER,                            -- not required
  tax_classification_code CHAR "TRIM(:tax_classification_code)",
  fil_prorate_flag      FILLER,                            -- not required
  fil_po_number         FILLER,                            -- not required
  fil_po_line_number    FILLER,                            -- not required
  fil_po_shipment_num   FILLER,                            -- not required
  fil_po_dist_num       FILLER,                            -- not required
  trip_distance         CHAR "TRIM(:trip_distance)",       -- CA only
  process_status        CONSTANT 'N',
  error_flag            CONSTANT 'N',
  request_id            "FND_GLOBAL.CONC_REQUEST_ID",
  stg_id                "XXTJX.XXTJX_WD_EXP_STG_S.NEXTVAL",
  created_by            "FND_GLOBAL.USER_ID",
  creation_date         SYSDATE,
  last_updated_by       "FND_GLOBAL.USER_ID",
  last_update_date      SYSDATE
)
