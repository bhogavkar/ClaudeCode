--------------------------------------------------------------------------------
-- File         : 03_xx_wd_exp_line_stg.sql
-- Object       : XX_WD_EXP_LINE_STG
-- Purpose      : Staging table for Workday expense report LINES.
--                Each row becomes one AP_INVOICE_LINES_INTERFACE row.
-- EBS Release  : 12.2.12
--------------------------------------------------------------------------------
WHENEVER SQLERROR EXIT FAILURE ROLLBACK;
SET DEFINE OFF;

CREATE TABLE XX_WD_EXP_LINE_STG
(
    STG_LINE_ID           NUMBER             NOT NULL,
    STG_HDR_ID            NUMBER             NOT NULL,
    BATCH_ID              VARCHAR2(60)       NOT NULL,
    -- Workday source identifiers
    WD_EXPENSE_REPORT_ID  VARCHAR2(60)       NOT NULL,
    WD_LINE_ID            VARCHAR2(60),
    LINE_NUMBER           NUMBER             NOT NULL,
    -- Line attributes
    EXPENSE_TYPE          VARCHAR2(60),       -- AIRFARE/HOTEL/MEAL/...
    EXPENSE_DATE          DATE,
    MERCHANT_NAME         VARCHAR2(240),
    LINE_DESCRIPTION      VARCHAR2(240),
    LINE_AMOUNT           NUMBER             NOT NULL,
    CURRENCY_CODE         VARCHAR2(15),
    QUANTITY              NUMBER,
    UNIT_PRICE            NUMBER,
    -- Tax
    TAX_CODE              VARCHAR2(30),
    TAX_AMOUNT            NUMBER,
    -- GL coding
    DIST_CODE_COMBINATION VARCHAR2(240),     -- Concat segments (e.g. 01-000-7600-0000-000)
    DIST_CCID             NUMBER,             -- pre-resolved CCID; if NULL, package resolves
    PROJECT_NUMBER        VARCHAR2(30),
    TASK_NUMBER           VARCHAR2(30),
    EXPENDITURE_TYPE      VARCHAR2(30),
    EXPENDITURE_ORG       VARCHAR2(60),
    -- Receipt / mileage flags
    RECEIPT_REQUIRED_FLAG VARCHAR2(1)        DEFAULT 'N',
    RECEIPT_MISSING_FLAG  VARCHAR2(1)        DEFAULT 'N',
    -- Audit / control
    PROCESS_STATUS        VARCHAR2(30) DEFAULT 'NEW' NOT NULL,
    ERROR_MESSAGE         VARCHAR2(4000),
    INVOICE_LINE_INTERFACE_ID NUMBER,
    -- Std WHO columns
    CREATED_BY            NUMBER       DEFAULT FND_GLOBAL.USER_ID,
    CREATION_DATE         DATE         DEFAULT SYSDATE,
    LAST_UPDATED_BY       NUMBER       DEFAULT FND_GLOBAL.USER_ID,
    LAST_UPDATE_DATE      DATE         DEFAULT SYSDATE,
    LAST_UPDATE_LOGIN     NUMBER       DEFAULT FND_GLOBAL.LOGIN_ID,
    CONSTRAINT XX_WD_EXP_LINE_STG_PK PRIMARY KEY (STG_LINE_ID),
    CONSTRAINT XX_WD_EXP_LINE_STATUS_CK
        CHECK (PROCESS_STATUS IN
            ('NEW','VALIDATED','PROCESSING','SUCCESS',
             'VALIDATION_ERROR','API_ERROR','SKIPPED'))
)
TABLESPACE APPS_TS_TX_DATA;

CREATE INDEX XX_WD_EXP_LINE_STG_N1 ON XX_WD_EXP_LINE_STG (STG_HDR_ID)              TABLESPACE APPS_TS_TX_IDX;
CREATE INDEX XX_WD_EXP_LINE_STG_N2 ON XX_WD_EXP_LINE_STG (BATCH_ID, PROCESS_STATUS) TABLESPACE APPS_TS_TX_IDX;
CREATE INDEX XX_WD_EXP_LINE_STG_N3 ON XX_WD_EXP_LINE_STG (WD_EXPENSE_REPORT_ID)     TABLESPACE APPS_TS_TX_IDX;

COMMENT ON TABLE  XX_WD_EXP_LINE_STG                IS 'Workday -> EBS expense report lines staging';
COMMENT ON COLUMN XX_WD_EXP_LINE_STG.DIST_CCID      IS 'If pre-resolved by Workday, used directly; else resolved via flex API';

PROMPT Created XX_WD_EXP_LINE_STG
EXIT;
