--------------------------------------------------------------------------------
-- FILE NAME
--   01_XXTJX_WD_EXP_AP_STG_TABLES.sql
--
-- DESCRIPTION
--   Database objects for the Workday Expense -> Oracle AP Invoice Open Interface.
--
--   Creates the two custom STAGING / REPLICA tables that mirror the structure of
--   the seeded Oracle interface tables and add a handful of Workday control and
--   error columns:
--
--      XXTJX_AP_INVOICES_INTERFACE   -> replica of AP_INVOICES_INTERFACE   (header)
--      XXTJX_AP_INV_LINES_INTERFACE  -> replica of AP_INVOICE_LINES_INTERFACE (line)
--
--   These names intentionally match the tables already consumed by
--   XXTJX_TMS_INVIMP_ASSETKEY_PKG so the asset-key derivation step continues
--   to work unchanged.
--
--   Also creates a lightweight run-log table and a sequence used for batch ids.
--
-- DEPLOYMENT NOTES
--   * Run as the custom schema owner (e.g. XXTJX), then grant + synonym to APPS.
--   * The "replica" column lists below cover the columns actually used by the
--     interface and by downstream programs.  When deploying against a specific
--     instance the safest approach is to generate the replica with:
--         CREATE TABLE XXTJX_AP_INVOICES_INTERFACE
--             AS SELECT * FROM AP.AP_INVOICES_INTERFACE WHERE 1 = 2;
--     and then ALTER TABLE ... ADD the custom control columns shown at the end.
--     The explicit DDL below is provided so the object is self-contained and
--     version-controlled.
--------------------------------------------------------------------------------

----------------------------------------------------------------------------
-- 1. HEADER STAGING TABLE  (replica of AP_INVOICES_INTERFACE)
----------------------------------------------------------------------------
CREATE TABLE XXTJX_AP_INVOICES_INTERFACE
(
   -- ---- Replica of AP_INVOICES_INTERFACE (subset actually populated) -------
    INVOICE_ID                      NUMBER(15)
   ,INVOICE_NUM                     VARCHAR2(50)
   ,INVOICE_TYPE_LOOKUP_CODE        VARCHAR2(25)
   ,INVOICE_DATE                    DATE
   ,VENDOR_ID                       NUMBER(15)
   ,VENDOR_NUM                      VARCHAR2(30)
   ,VENDOR_NAME                     VARCHAR2(240)
   ,VENDOR_SITE_ID                  NUMBER(15)
   ,VENDOR_SITE_CODE                VARCHAR2(15)
   ,INVOICE_AMOUNT                  NUMBER
   ,INVOICE_CURRENCY_CODE           VARCHAR2(15)
   ,EXCHANGE_RATE                   NUMBER
   ,EXCHANGE_RATE_TYPE              VARCHAR2(30)
   ,EXCHANGE_DATE                   DATE
   ,TERMS_ID                        NUMBER(15)
   ,TERMS_NAME                      VARCHAR2(50)
   ,DESCRIPTION                     VARCHAR2(240)
   ,GL_DATE                         DATE
   ,ACCTS_PAY_CODE_COMBINATION_ID   NUMBER(15)
   ,PAY_GROUP_LOOKUP_CODE           VARCHAR2(25)
   ,PAYMENT_METHOD_CODE             VARCHAR2(30)
   ,DOC_CATEGORY_CODE               VARCHAR2(30)
   ,PARTY_ID                        NUMBER
   ,PARTY_SITE_ID                   NUMBER
   ,ORG_ID                          NUMBER(15)
   ,SOURCE                          VARCHAR2(80)
   ,GROUP_ID                        VARCHAR2(80)
   ,REQUEST_ID                      NUMBER(15)
   ,STATUS                          VARCHAR2(25)
   ,PRODUCT_TABLE                   VARCHAR2(30)
   ,REFERENCE_KEY1                  VARCHAR2(150)
   ,ATTRIBUTE_CATEGORY              VARCHAR2(150)
   ,ATTRIBUTE1                      VARCHAR2(150)
   ,ATTRIBUTE2                      VARCHAR2(150)
   ,ATTRIBUTE3                      VARCHAR2(150)
   ,ATTRIBUTE4                      VARCHAR2(150)
   ,ATTRIBUTE5                      VARCHAR2(150)
   ,GLOBAL_ATTRIBUTE_CATEGORY       VARCHAR2(150)
   ,GLOBAL_ATTRIBUTE1               VARCHAR2(150)   -- carries the WD Batch Id
   ,GLOBAL_ATTRIBUTE2               VARCHAR2(150)
   ,CREATION_DATE                   DATE
   ,CREATED_BY                      NUMBER(15)
   ,LAST_UPDATE_DATE                DATE
   ,LAST_UPDATED_BY                 NUMBER(15)
   ,LAST_UPDATE_LOGIN               NUMBER(15)
   -- ---- Custom Workday control / staging columns ---------------------------
   ,BATCH_ID                        VARCHAR2(20)    -- WD file batch (MMDDYYHH24MISS)
   ,EMPLOYEE_NUMBER                 VARCHAR2(30)    -- from Workday file
   ,OPERATING_UNIT_NAME             VARCHAR2(240)   -- from Workday file
   ,PERSON_ID                       NUMBER(15)      -- derived
   ,FULL_NAME                       VARCHAR2(240)   -- derived
   ,PROCESS_STATUS                  VARCHAR2(1)  DEFAULT 'N'   -- N=New,V=Valid,E=Error,T=Transferred
   ,ERROR_MESSAGE                   VARCHAR2(4000)
   ,CONSTRAINT XXTJX_WD_AP_INV_IFACE_PK PRIMARY KEY (INVOICE_NUM, BATCH_ID)
)
/

COMMENT ON TABLE  XXTJX_AP_INVOICES_INTERFACE                IS 'Workday Expense header staging / replica of AP_INVOICES_INTERFACE';
COMMENT ON COLUMN XXTJX_AP_INVOICES_INTERFACE.PROCESS_STATUS IS 'N=New, V=Validated, E=Error, T=Transferred to AP interface';
COMMENT ON COLUMN XXTJX_AP_INVOICES_INTERFACE.GLOBAL_ATTRIBUTE1 IS 'Workday Batch Id (kept for asset-key package compatibility)';

----------------------------------------------------------------------------
-- 2. LINE STAGING TABLE  (replica of AP_INVOICE_LINES_INTERFACE)
----------------------------------------------------------------------------
CREATE TABLE XXTJX_AP_INV_LINES_INTERFACE
(
   -- ---- Replica of AP_INVOICE_LINES_INTERFACE (subset actually populated) --
    INVOICE_ID                      NUMBER(15)
   ,INVOICE_LINE_ID                 NUMBER(15)
   ,INVOICE_NUM                     VARCHAR2(50)
   ,LINE_NUMBER                     NUMBER(15)
   ,LINE_TYPE_LOOKUP_CODE           VARCHAR2(25)
   ,AMOUNT                          NUMBER
   ,ACCOUNTING_DATE                 DATE
   ,DESCRIPTION                     VARCHAR2(240)
   ,DIST_CODE_CONCATENATED          VARCHAR2(250)   -- TJX COA string from WD
   ,DIST_CODE_COMBINATION_ID        NUMBER(15)      -- derived ccid
   ,VENDOR_SITE_ID                  NUMBER(15)      -- carried from header
   ,TAX_CLASSIFICATION_CODE         VARCHAR2(30)
   ,SET_OF_BOOKS_ID                 NUMBER(15)
   ,ASSET_CATEGORY_ID               NUMBER(15)      -- populated by asset-key pkg
   ,PO_NUMBER                       VARCHAR2(20)
   ,ORG_ID                          NUMBER(15)
   ,ATTRIBUTE_CATEGORY              VARCHAR2(150)
   ,ATTRIBUTE1                      VARCHAR2(150)
   ,ATTRIBUTE2                      VARCHAR2(150)   -- asset key (asset-key pkg)
   ,ATTRIBUTE3                      VARCHAR2(150)
   ,GLOBAL_ATTRIBUTE1               VARCHAR2(150)   -- carries the WD Batch Id
   ,CREATION_DATE                   DATE
   ,CREATED_BY                      NUMBER(15)
   ,LAST_UPDATE_DATE                DATE
   ,LAST_UPDATED_BY                 NUMBER(15)
   ,LAST_UPDATE_LOGIN               NUMBER(15)
   -- ---- Custom Workday control / staging columns ---------------------------
   ,BATCH_ID                        VARCHAR2(20)
   ,EMPLOYEE_NUMBER                 VARCHAR2(30)
   ,PROCESS_STATUS                  VARCHAR2(1)  DEFAULT 'N'
   ,ERROR_MESSAGE                   VARCHAR2(4000)
   ,CONSTRAINT XXTJX_WD_AP_LINE_IFACE_PK PRIMARY KEY (INVOICE_NUM, LINE_NUMBER, BATCH_ID)
)
/

COMMENT ON TABLE XXTJX_AP_INV_LINES_INTERFACE IS 'Workday Expense line staging / replica of AP_INVOICE_LINES_INTERFACE';

CREATE INDEX XXTJX_AP_INV_LINES_IFACE_N1
   ON XXTJX_AP_INV_LINES_INTERFACE (BATCH_ID, INVOICE_NUM, PROCESS_STATUS)
/

----------------------------------------------------------------------------
-- 3. RUN LOG TABLE  (lightweight processing statistics)
----------------------------------------------------------------------------
CREATE TABLE XXTJX_WD_EXP_AP_LOG
(
    LOG_ID            NUMBER             -- from sequence
   ,REQUEST_ID        NUMBER
   ,MODULE_NAME       VARCHAR2(100)
   ,PROCEDURE_NAME    VARCHAR2(100)
   ,SOURCE            VARCHAR2(80)
   ,BATCH_ID          VARCHAR2(20)
   ,RECORD_COUNT      NUMBER
   ,SUCCESS_COUNT     NUMBER
   ,FAILURE_COUNT     NUMBER
   ,START_TIME        TIMESTAMP
   ,END_TIME          TIMESTAMP
   ,ELAPSED_SECONDS   NUMBER
   ,STATUS            VARCHAR2(20)
   ,MESSAGE           VARCHAR2(4000)
   ,CREATION_DATE     DATE DEFAULT SYSDATE
   ,CONSTRAINT XXTJX_WD_EXP_AP_LOG_PK PRIMARY KEY (LOG_ID)
)
/

----------------------------------------------------------------------------
-- 4. SOURCE-DATA ERROR TABLE
--    Mirrors the XXTJXAP_STND_INV_IMP_PKG "source_data_errors" concept:
--    one row per failed validation, bulk-inserted at the end of the run.
----------------------------------------------------------------------------
CREATE TABLE XXTJX_WD_EXP_AP_ERRORS
(
    REQUEST_ID        NUMBER
   ,BATCH_ID          VARCHAR2(20)
   ,SOURCE            VARCHAR2(80)
   ,INVOICE_ID        NUMBER
   ,INVOICE_NUM       VARCHAR2(50)
   ,VENDOR_NUM        VARCHAR2(30)
   ,EMPLOYEE_NUMBER   VARCHAR2(30)
   ,INVOICE_LINE_NUM  NUMBER
   ,ERROR_CODE        VARCHAR2(100)
   ,ERROR_MSG         VARCHAR2(1000)
   ,CREATION_DATE     DATE DEFAULT SYSDATE
)
/

COMMENT ON TABLE XXTJX_WD_EXP_AP_ERRORS IS 'One row per Workday expense validation failure (source data errors)';

----------------------------------------------------------------------------
-- 5. SEQUENCE  (log id + surrogate keys)
----------------------------------------------------------------------------
CREATE SEQUENCE XXTJX_WD_EXP_AP_LOG_S START WITH 1 INCREMENT BY 1 NOCACHE
/

----------------------------------------------------------------------------
-- 5. GRANTS / SYNONYMS  (run from the custom schema; adjust APPS as required)
----------------------------------------------------------------------------
-- GRANT ALL ON XXTJX_AP_INVOICES_INTERFACE  TO APPS;
-- GRANT ALL ON XXTJX_AP_INV_LINES_INTERFACE TO APPS;
-- GRANT ALL ON XXTJX_WD_EXP_AP_LOG          TO APPS;
-- GRANT ALL ON XXTJX_WD_EXP_AP_ERRORS       TO APPS;
-- GRANT ALL ON XXTJX_WD_EXP_AP_LOG_S        TO APPS;
-- (Create matching public/APPS synonyms per your standards.)
