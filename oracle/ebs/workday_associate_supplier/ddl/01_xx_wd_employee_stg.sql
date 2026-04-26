--------------------------------------------------------------------------------
-- File         : 01_xx_wd_employee_stg.sql
-- Object       : XX_WD_EMPLOYEE_STG
-- Purpose      : Staging table for Workday employee/associate master.
--                Populated by the upstream Data Loader (SQL*Loader) from the
--                CSV that MoveIT Central drops at /tmp on the EBS node.
--                Read-only from this integration's point of view (we only
--                update PROCESS_STATUS / ERROR_MESSAGE / EBS_PERSON_ID /
--                EBS_VENDOR_ID columns).
-- EBS Release  : 12.2.12
--------------------------------------------------------------------------------
WHENEVER SQLERROR EXIT FAILURE ROLLBACK;
SET DEFINE OFF;

CREATE TABLE XX_WD_EMPLOYEE_STG
(
    STG_ID                NUMBER             NOT NULL,
    BATCH_ID              VARCHAR2(60)       NOT NULL,
    FILE_NAME             VARCHAR2(240),
    FILE_LINE_NUM         NUMBER,
    -- Workday source identifiers
    WD_WORKER_ID          VARCHAR2(60),
    WD_EVENT_TYPE         VARCHAR2(30),       -- HIRE / REHIRE / TERMINATE / UPDATE
    -- EBS-aligned employee attributes
    EMPLOYEE_NUMBER       VARCHAR2(30)       NOT NULL,
    TITLE                 VARCHAR2(30),
    FIRST_NAME            VARCHAR2(150),
    MIDDLE_NAME           VARCHAR2(60),
    LAST_NAME             VARCHAR2(150)      NOT NULL,
    KNOWN_AS              VARCHAR2(80),
    GENDER                VARCHAR2(30),       -- M / F
    DATE_OF_BIRTH         DATE,
    NATIONAL_IDENTIFIER   VARCHAR2(30),
    EMAIL_ADDRESS         VARCHAR2(240),
    HIRE_DATE             DATE               NOT NULL,
    TERMINATION_DATE      DATE,
    BUSINESS_GROUP_NAME   VARCHAR2(60)       NOT NULL,   -- 'US' or 'CA'
    LEGAL_ENTITY          VARCHAR2(60),
    DEPARTMENT            VARCHAR2(60),
    JOB_NAME              VARCHAR2(240),
    POSITION_NAME         VARCHAR2(240),
    LOCATION_CODE         VARCHAR2(60),
    SUPERVISOR_EMP_NUM    VARCHAR2(30),
    -- Address
    ADDRESS_TYPE          VARCHAR2(30) DEFAULT 'HOME',
    ADDRESS_LINE1         VARCHAR2(240),
    ADDRESS_LINE2         VARCHAR2(240),
    ADDRESS_LINE3         VARCHAR2(240),
    CITY                  VARCHAR2(60),
    STATE_PROVINCE        VARCHAR2(60),
    POSTAL_CODE           VARCHAR2(30),
    COUNTRY               VARCHAR2(60),
    -- Pay / payment
    DEFAULT_CURRENCY      VARCHAR2(15),
    PAYMENT_METHOD        VARCHAR2(30),       -- CHECK / EFT / WIRE
    -- Bank (only used if PAYMENT_METHOD = 'EFT')
    BANK_NAME             VARCHAR2(150),
    BANK_BRANCH           VARCHAR2(150),
    BANK_ACCOUNT_NUMBER   VARCHAR2(50),
    BANK_ROUTING_NUMBER   VARCHAR2(30),
    BANK_ACCOUNT_TYPE     VARCHAR2(30),       -- CHECKING / SAVINGS
    -- Audit / control
    PROCESS_STATUS        VARCHAR2(30) DEFAULT 'NEW' NOT NULL,
                          -- NEW / VALIDATED / PROCESSING / SUCCESS / VALIDATION_ERROR / API_ERROR / SKIPPED
    ERROR_MESSAGE         VARCHAR2(4000),
    REQUEST_ID            NUMBER,
    EBS_PERSON_ID         NUMBER,
    EBS_VENDOR_ID         NUMBER,
    EBS_VENDOR_SITE_ID    NUMBER,
    EBS_PARTY_ID          NUMBER,
    PROCESSED_DATE        DATE,
    -- Std WHO columns
    CREATED_BY            NUMBER       DEFAULT FND_GLOBAL.USER_ID,
    CREATION_DATE         DATE         DEFAULT SYSDATE,
    LAST_UPDATED_BY       NUMBER       DEFAULT FND_GLOBAL.USER_ID,
    LAST_UPDATE_DATE      DATE         DEFAULT SYSDATE,
    LAST_UPDATE_LOGIN     NUMBER       DEFAULT FND_GLOBAL.LOGIN_ID,
    CONSTRAINT XX_WD_EMPLOYEE_STG_PK PRIMARY KEY (STG_ID),
    CONSTRAINT XX_WD_EMP_STG_STATUS_CK
        CHECK (PROCESS_STATUS IN
            ('NEW','VALIDATED','PROCESSING','SUCCESS',
             'VALIDATION_ERROR','API_ERROR','SKIPPED'))
)
TABLESPACE APPS_TS_TX_DATA;

CREATE INDEX XX_WD_EMP_STG_N1 ON XX_WD_EMPLOYEE_STG (BATCH_ID, PROCESS_STATUS)
    TABLESPACE APPS_TS_TX_IDX;
CREATE INDEX XX_WD_EMP_STG_N2 ON XX_WD_EMPLOYEE_STG (EMPLOYEE_NUMBER)
    TABLESPACE APPS_TS_TX_IDX;
CREATE INDEX XX_WD_EMP_STG_N3 ON XX_WD_EMPLOYEE_STG (PROCESS_STATUS)
    TABLESPACE APPS_TS_TX_IDX;

COMMENT ON TABLE  XX_WD_EMPLOYEE_STG                  IS 'Workday -> EBS associate master staging';
COMMENT ON COLUMN XX_WD_EMPLOYEE_STG.STG_ID           IS 'Surrogate key (XX_WD_EMPLOYEE_STG_S)';
COMMENT ON COLUMN XX_WD_EMPLOYEE_STG.BATCH_ID         IS 'Loader batch identifier; ties rows from one CSV';
COMMENT ON COLUMN XX_WD_EMPLOYEE_STG.WD_WORKER_ID     IS 'Workday Worker ID (informational)';
COMMENT ON COLUMN XX_WD_EMPLOYEE_STG.EMPLOYEE_NUMBER  IS 'Match key against PER_ALL_PEOPLE_F.EMPLOYEE_NUMBER';
COMMENT ON COLUMN XX_WD_EMPLOYEE_STG.PROCESS_STATUS   IS 'Lifecycle: NEW->VALIDATED->PROCESSING->SUCCESS|*_ERROR|SKIPPED';

-- Public synonym + grant (uncomment if loader runs from a different schema)
-- CREATE OR REPLACE PUBLIC SYNONYM XX_WD_EMPLOYEE_STG FOR APPS.XX_WD_EMPLOYEE_STG;
-- GRANT SELECT, INSERT, UPDATE ON XX_WD_EMPLOYEE_STG TO APPS_NE;

PROMPT Created XX_WD_EMPLOYEE_STG
EXIT;
