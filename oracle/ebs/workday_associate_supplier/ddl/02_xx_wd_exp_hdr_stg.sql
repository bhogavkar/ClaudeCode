--------------------------------------------------------------------------------
-- File         : 02_xx_wd_exp_hdr_stg.sql
-- Object       : XX_WD_EXP_HDR_STG
-- Purpose      : Staging table for Workday expense report HEADERS.
--                Populated by upstream Data Loader. Each row becomes one
--                AP_INVOICES_INTERFACE row (invoice_type_lookup_code = 'EXPENSE
--                REPORT') for the corresponding employee-supplier.
-- EBS Release  : 12.2.12
--------------------------------------------------------------------------------
WHENEVER SQLERROR EXIT FAILURE ROLLBACK;
SET DEFINE OFF;

CREATE TABLE XX_WD_EXP_HDR_STG
(
    STG_HDR_ID            NUMBER             NOT NULL,
    BATCH_ID              VARCHAR2(60)       NOT NULL,
    FILE_NAME             VARCHAR2(240),
    FILE_LINE_NUM         NUMBER,
    -- Workday source identifiers (idempotency keys)
    WD_EXPENSE_REPORT_ID  VARCHAR2(60)       NOT NULL,
    WD_REPORT_NUMBER      VARCHAR2(60),
    -- Match keys
    EMPLOYEE_NUMBER       VARCHAR2(30)       NOT NULL,
    -- Header attributes
    REPORT_DATE           DATE               NOT NULL,
    GL_DATE               DATE,
    REPORT_DESCRIPTION    VARCHAR2(240),
    PURPOSE               VARCHAR2(240),
    REPORT_TOTAL_AMOUNT   NUMBER             NOT NULL,
    CURRENCY_CODE         VARCHAR2(15)       NOT NULL,
    EXCHANGE_RATE_TYPE    VARCHAR2(30),
    EXCHANGE_RATE         NUMBER,
    EXCHANGE_DATE         DATE,
    -- Org context
    BUSINESS_GROUP_NAME   VARCHAR2(60)       NOT NULL,    -- US / CA
    OPERATING_UNIT_NAME   VARCHAR2(60)       NOT NULL,
    LEGAL_ENTITY          VARCHAR2(60),
    -- Payment
    PAYMENT_METHOD_CODE   VARCHAR2(30),       -- CHECK / EFT / WIRE
    PAYMENT_TERMS         VARCHAR2(50)        DEFAULT 'IMMEDIATE',
    PAY_GROUP_LOOKUP_CODE VARCHAR2(50)        DEFAULT 'EMPLOYEE',
    -- Source / control
    SOURCE                VARCHAR2(30)        DEFAULT 'WORKDAY_EXPENSES',
    INVOICE_NUM           VARCHAR2(60),       -- derived during processing if null
    -- Audit / control
    PROCESS_STATUS        VARCHAR2(30) DEFAULT 'NEW' NOT NULL,
    ERROR_MESSAGE         VARCHAR2(4000),
    REQUEST_ID            NUMBER,
    INVOICE_INTERFACE_ID  NUMBER,
    EBS_INVOICE_ID        NUMBER,
    PROCESSED_DATE        DATE,
    -- Std WHO columns
    CREATED_BY            NUMBER       DEFAULT FND_GLOBAL.USER_ID,
    CREATION_DATE         DATE         DEFAULT SYSDATE,
    LAST_UPDATED_BY       NUMBER       DEFAULT FND_GLOBAL.USER_ID,
    LAST_UPDATE_DATE      DATE         DEFAULT SYSDATE,
    LAST_UPDATE_LOGIN     NUMBER       DEFAULT FND_GLOBAL.LOGIN_ID,
    CONSTRAINT XX_WD_EXP_HDR_STG_PK PRIMARY KEY (STG_HDR_ID),
    CONSTRAINT XX_WD_EXP_HDR_STG_UK1 UNIQUE (WD_EXPENSE_REPORT_ID),
    CONSTRAINT XX_WD_EXP_HDR_STATUS_CK
        CHECK (PROCESS_STATUS IN
            ('NEW','VALIDATED','PROCESSING','SUCCESS',
             'VALIDATION_ERROR','API_ERROR','SKIPPED','REJECTED'))
)
TABLESPACE APPS_TS_TX_DATA;

CREATE INDEX XX_WD_EXP_HDR_STG_N1 ON XX_WD_EXP_HDR_STG (BATCH_ID, PROCESS_STATUS) TABLESPACE APPS_TS_TX_IDX;
CREATE INDEX XX_WD_EXP_HDR_STG_N2 ON XX_WD_EXP_HDR_STG (EMPLOYEE_NUMBER)          TABLESPACE APPS_TS_TX_IDX;
CREATE INDEX XX_WD_EXP_HDR_STG_N3 ON XX_WD_EXP_HDR_STG (PROCESS_STATUS)            TABLESPACE APPS_TS_TX_IDX;

COMMENT ON TABLE  XX_WD_EXP_HDR_STG                       IS 'Workday -> EBS expense report headers staging';
COMMENT ON COLUMN XX_WD_EXP_HDR_STG.WD_EXPENSE_REPORT_ID  IS 'Workday expense report ID; UNIQUE to prevent re-import';
COMMENT ON COLUMN XX_WD_EXP_HDR_STG.INVOICE_NUM           IS 'Becomes AP_INVOICES_INTERFACE.INVOICE_NUM (defaulted to WD_EXPENSE_REPORT_ID if null)';

PROMPT Created XX_WD_EXP_HDR_STG
EXIT;
