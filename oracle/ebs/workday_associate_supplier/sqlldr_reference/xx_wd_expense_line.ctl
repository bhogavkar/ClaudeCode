--------------------------------------------------------------------------------
-- File   : xx_wd_expense_line.ctl  (REFERENCE ONLY)
-- Purpose: SQL*Loader CTL for Workday expense report LINES into
--          XX_WD_EXP_LINE_STG. Header must be loaded first; STG_HDR_ID is
--          resolved by joining on WD_EXPENSE_REPORT_ID.
--------------------------------------------------------------------------------
OPTIONS (DIRECT=FALSE, ROWS=1000, ERRORS=0, BINDSIZE=10485760, READSIZE=10485760)
LOAD DATA
CHARACTERSET UTF8
INFILE   '/tmp/workday_expense_lines.csv'
BADFILE  '/tmp/workday_expense_lines.bad'
DISCARDFILE '/tmp/workday_expense_lines.dsc'
APPEND
INTO TABLE XX_WD_EXP_LINE_STG
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
TRAILING NULLCOLS
(
    STG_LINE_ID           "XX_WD_EXP_LINE_STG_S.NEXTVAL",
    STG_HDR_ID            "(SELECT MAX(STG_HDR_ID) FROM XX_WD_EXP_HDR_STG WHERE WD_EXPENSE_REPORT_ID = :WD_EXPENSE_REPORT_ID)",
    BATCH_ID              CONSTANT "&1",
    WD_EXPENSE_REPORT_ID  CHAR(60),
    WD_LINE_ID            CHAR(60),
    LINE_NUMBER           INTEGER EXTERNAL,
    EXPENSE_TYPE          CHAR(60),
    EXPENSE_DATE          DATE "YYYY-MM-DD" NULLIF EXPENSE_DATE=BLANKS,
    MERCHANT_NAME         CHAR(240),
    LINE_DESCRIPTION      CHAR(240),
    LINE_AMOUNT           DECIMAL EXTERNAL,
    CURRENCY_CODE         CHAR(15),
    QUANTITY              DECIMAL EXTERNAL NULLIF QUANTITY=BLANKS,
    UNIT_PRICE            DECIMAL EXTERNAL NULLIF UNIT_PRICE=BLANKS,
    TAX_CODE              CHAR(30),
    TAX_AMOUNT            DECIMAL EXTERNAL NULLIF TAX_AMOUNT=BLANKS,
    DIST_CODE_COMBINATION CHAR(240),
    DIST_CCID             INTEGER EXTERNAL NULLIF DIST_CCID=BLANKS,
    PROJECT_NUMBER        CHAR(30),
    TASK_NUMBER           CHAR(30),
    EXPENDITURE_TYPE      CHAR(30),
    EXPENDITURE_ORG       CHAR(60),
    RECEIPT_REQUIRED_FLAG CHAR(1),
    RECEIPT_MISSING_FLAG  CHAR(1),
    PROCESS_STATUS        CONSTANT 'NEW',
    CREATED_BY            "FND_GLOBAL.USER_ID",
    CREATION_DATE         SYSDATE,
    LAST_UPDATED_BY       "FND_GLOBAL.USER_ID",
    LAST_UPDATE_DATE      SYSDATE,
    LAST_UPDATE_LOGIN     "FND_GLOBAL.LOGIN_ID"
)
