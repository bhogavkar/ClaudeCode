--------------------------------------------------------------------------------
-- File   : xx_wd_expense_hdr.ctl  (REFERENCE ONLY)
-- Purpose: SQL*Loader CTL for Workday expense report HEADERS into
--          XX_WD_EXP_HDR_STG. Production CTL is owned by Data Loader team;
--          use this to validate column order/format.
--------------------------------------------------------------------------------
OPTIONS (DIRECT=FALSE, ROWS=500, ERRORS=0, BINDSIZE=10485760, READSIZE=10485760)
LOAD DATA
CHARACTERSET UTF8
INFILE   '/tmp/workday_expense_hdr.csv'
BADFILE  '/tmp/workday_expense_hdr.bad'
DISCARDFILE '/tmp/workday_expense_hdr.dsc'
APPEND
INTO TABLE XX_WD_EXP_HDR_STG
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
TRAILING NULLCOLS
(
    STG_HDR_ID            "XX_WD_EXP_HDR_STG_S.NEXTVAL",
    BATCH_ID              CONSTANT "&1",
    FILE_NAME             CONSTANT "workday_expense_hdr.csv",
    FILE_LINE_NUM         RECNUM,
    WD_EXPENSE_REPORT_ID  CHAR(60),
    WD_REPORT_NUMBER      CHAR(60),
    EMPLOYEE_NUMBER       CHAR(30),
    REPORT_DATE           DATE "YYYY-MM-DD",
    GL_DATE               DATE "YYYY-MM-DD" NULLIF GL_DATE=BLANKS,
    REPORT_DESCRIPTION    CHAR(240),
    PURPOSE               CHAR(240),
    REPORT_TOTAL_AMOUNT   DECIMAL EXTERNAL,
    CURRENCY_CODE         CHAR(15),
    EXCHANGE_RATE_TYPE    CHAR(30),
    EXCHANGE_RATE         DECIMAL EXTERNAL NULLIF EXCHANGE_RATE=BLANKS,
    EXCHANGE_DATE         DATE "YYYY-MM-DD" NULLIF EXCHANGE_DATE=BLANKS,
    BUSINESS_GROUP_NAME   CHAR(60),
    OPERATING_UNIT_NAME   CHAR(60),
    LEGAL_ENTITY          CHAR(60),
    PAYMENT_METHOD_CODE   CHAR(30),
    PAYMENT_TERMS         CHAR(50),
    PAY_GROUP_LOOKUP_CODE CHAR(50),
    SOURCE                CONSTANT 'WORKDAY_EXPENSES',
    INVOICE_NUM           CHAR(60),
    PROCESS_STATUS        CONSTANT 'NEW',
    CREATED_BY            "FND_GLOBAL.USER_ID",
    CREATION_DATE         SYSDATE,
    LAST_UPDATED_BY       "FND_GLOBAL.USER_ID",
    LAST_UPDATE_DATE      SYSDATE,
    LAST_UPDATE_LOGIN     "FND_GLOBAL.LOGIN_ID"
)
