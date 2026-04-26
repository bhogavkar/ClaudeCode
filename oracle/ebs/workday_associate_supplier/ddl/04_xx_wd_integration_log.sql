--------------------------------------------------------------------------------
-- File         : 04_xx_wd_integration_log.sql
-- Objects      : XX_WD_INTEGRATION_LOG  - structured run log (one row per event)
--                XX_WD_RUN_SUMMARY      - one row per concurrent program run
-- Purpose      : Detailed observability for the Workday integration. Used by
--                support to triage failures and by the program to write the
--                end-of-run summary report.
-- EBS Release  : 12.2.12
--------------------------------------------------------------------------------
WHENEVER SQLERROR EXIT FAILURE ROLLBACK;
SET DEFINE OFF;

-- 1) Detailed log -------------------------------------------------------------
CREATE TABLE XX_WD_INTEGRATION_LOG
(
    LOG_ID           NUMBER             NOT NULL,
    REQUEST_ID       NUMBER,
    BATCH_ID         VARCHAR2(60),
    LOG_LEVEL        VARCHAR2(10)       NOT NULL,    -- DEBUG/INFO/WARN/ERROR
    LOG_SOURCE       VARCHAR2(60),                   -- procedure name
    ENTITY_TYPE      VARCHAR2(30),                   -- EMPLOYEE / SUPPLIER / EXPENSE
    ENTITY_KEY       VARCHAR2(120),                  -- emp_num or wd_exp_id
    MESSAGE          VARCHAR2(4000),
    ORACLE_ERROR     VARCHAR2(4000),
    LOGGED_DATE      TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CREATED_BY       NUMBER DEFAULT FND_GLOBAL.USER_ID,
    CONSTRAINT XX_WD_INT_LOG_PK PRIMARY KEY (LOG_ID),
    CONSTRAINT XX_WD_INT_LOG_LEVEL_CK
        CHECK (LOG_LEVEL IN ('DEBUG','INFO','WARN','ERROR'))
)
TABLESPACE APPS_TS_TX_DATA;

CREATE INDEX XX_WD_INT_LOG_N1 ON XX_WD_INTEGRATION_LOG (REQUEST_ID)            TABLESPACE APPS_TS_TX_IDX;
CREATE INDEX XX_WD_INT_LOG_N2 ON XX_WD_INTEGRATION_LOG (BATCH_ID, LOG_LEVEL)   TABLESPACE APPS_TS_TX_IDX;
CREATE INDEX XX_WD_INT_LOG_N3 ON XX_WD_INTEGRATION_LOG (ENTITY_TYPE, ENTITY_KEY) TABLESPACE APPS_TS_TX_IDX;

COMMENT ON TABLE  XX_WD_INTEGRATION_LOG IS 'Per-event log for Workday integration. Retained 90 days.';

-- 2) Run summary --------------------------------------------------------------
CREATE TABLE XX_WD_RUN_SUMMARY
(
    SUMMARY_ID            NUMBER             NOT NULL,
    REQUEST_ID            NUMBER             NOT NULL,
    BATCH_ID              VARCHAR2(60),
    RUN_MODE              VARCHAR2(10),                 -- INS/UPD/BOTH
    BUSINESS_GROUP_ID     NUMBER,
    BUSINESS_GROUP_NAME   VARCHAR2(60),
    START_TIME            TIMESTAMP,
    END_TIME              TIMESTAMP,
    EMP_TOTAL             NUMBER DEFAULT 0,
    EMP_CREATED           NUMBER DEFAULT 0,
    EMP_EXISTING          NUMBER DEFAULT 0,
    EMP_FAILED            NUMBER DEFAULT 0,
    SUP_CREATED           NUMBER DEFAULT 0,
    SUP_FAILED            NUMBER DEFAULT 0,
    EXP_TOTAL             NUMBER DEFAULT 0,
    EXP_LOADED            NUMBER DEFAULT 0,
    EXP_FAILED            NUMBER DEFAULT 0,
    EXP_VALIDATION_ERR    NUMBER DEFAULT 0,
    AP_IMPORT_REQUEST_ID  NUMBER,
    OVERALL_STATUS        VARCHAR2(20),                 -- SUCCESS/PARTIAL/FAILED
    CREATED_BY            NUMBER DEFAULT FND_GLOBAL.USER_ID,
    CREATION_DATE         DATE   DEFAULT SYSDATE,
    CONSTRAINT XX_WD_RUN_SUM_PK PRIMARY KEY (SUMMARY_ID),
    CONSTRAINT XX_WD_RUN_SUM_UK1 UNIQUE (REQUEST_ID)
)
TABLESPACE APPS_TS_TX_DATA;

CREATE INDEX XX_WD_RUN_SUM_N1 ON XX_WD_RUN_SUMMARY (BATCH_ID) TABLESPACE APPS_TS_TX_IDX;

COMMENT ON TABLE XX_WD_RUN_SUMMARY IS 'One row per concurrent program execution; drives the end-of-run report';

PROMPT Created XX_WD_INTEGRATION_LOG and XX_WD_RUN_SUMMARY
EXIT;
