--------------------------------------------------------------------------------
-- File   : xx_wd_employee.ctl
-- Purpose: REFERENCE-ONLY SQL*Loader control file showing the column layout
--          this integration expects. Customer's own Data Loader job already
--          has its production CTL; use this only to validate column ordering.
-- Usage  : sqlldr apps/<pwd> control=xx_wd_employee.ctl data=employees.csv
--          log=employees.log bad=employees.bad
--------------------------------------------------------------------------------
OPTIONS (DIRECT=FALSE, ROWS=500, ERRORS=0, BINDSIZE=10485760, READSIZE=10485760)
LOAD DATA
CHARACTERSET UTF8
INFILE   '/tmp/workday_employees.csv'
BADFILE  '/tmp/workday_employees.bad'
DISCARDFILE '/tmp/workday_employees.dsc'
APPEND
INTO TABLE XX_WD_EMPLOYEE_STG
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
TRAILING NULLCOLS
(
    STG_ID                "XX_WD_EMPLOYEE_STG_S.NEXTVAL",
    BATCH_ID              CONSTANT "&1",                    -- pass batch id as arg
    FILE_NAME             CONSTANT "workday_employees.csv",
    FILE_LINE_NUM         RECNUM,
    WD_WORKER_ID          CHAR(60),
    WD_EVENT_TYPE         CHAR(30),
    EMPLOYEE_NUMBER       CHAR(30),
    TITLE                 CHAR(30),
    FIRST_NAME            CHAR(150),
    MIDDLE_NAME           CHAR(60),
    LAST_NAME             CHAR(150),
    KNOWN_AS              CHAR(80),
    GENDER                CHAR(1),
    DATE_OF_BIRTH         DATE "YYYY-MM-DD" NULLIF DATE_OF_BIRTH=BLANKS,
    NATIONAL_IDENTIFIER   CHAR(30),
    EMAIL_ADDRESS         CHAR(240),
    HIRE_DATE             DATE "YYYY-MM-DD",
    TERMINATION_DATE      DATE "YYYY-MM-DD" NULLIF TERMINATION_DATE=BLANKS,
    BUSINESS_GROUP_NAME   CHAR(60),
    LEGAL_ENTITY          CHAR(60),
    DEPARTMENT            CHAR(60),
    JOB_NAME              CHAR(240),
    POSITION_NAME         CHAR(240),
    LOCATION_CODE         CHAR(60),
    SUPERVISOR_EMP_NUM    CHAR(30),
    ADDRESS_TYPE          CHAR(30),
    ADDRESS_LINE1         CHAR(240),
    ADDRESS_LINE2         CHAR(240),
    ADDRESS_LINE3         CHAR(240),
    CITY                  CHAR(60),
    STATE_PROVINCE        CHAR(60),
    POSTAL_CODE           CHAR(30),
    COUNTRY               CHAR(60),
    DEFAULT_CURRENCY      CHAR(15),
    PAYMENT_METHOD        CHAR(30),
    BANK_NAME             CHAR(150),
    BANK_BRANCH           CHAR(150),
    BANK_ACCOUNT_NUMBER   CHAR(50),
    BANK_ROUTING_NUMBER   CHAR(30),
    BANK_ACCOUNT_TYPE     CHAR(30),
    PROCESS_STATUS        CONSTANT 'NEW',
    CREATED_BY            "FND_GLOBAL.USER_ID",
    CREATION_DATE         SYSDATE,
    LAST_UPDATED_BY       "FND_GLOBAL.USER_ID",
    LAST_UPDATE_DATE      SYSDATE,
    LAST_UPDATE_LOGIN     "FND_GLOBAL.LOGIN_ID"
)
