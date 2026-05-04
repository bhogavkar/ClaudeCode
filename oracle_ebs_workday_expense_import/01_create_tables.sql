--==============================================================================
-- File         : 01_create_tables.sql
-- Object Type  : DDL - Custom Staging & Error Log Tables
-- Module       : Oracle Payables (AP) - R12
-- Purpose      : Supporting tables for the Workday -> Oracle EBS Expense
--                Report inbound integration (XX_AP_EXPENSE_IMPORT_PKG).
--
--                Tables created:
--                  1. XX_AP_EXP_STG_HDR    - Header staging
--                  2. XX_AP_EXP_STG_LINE   - Line  staging
--                  3. XX_AP_EXP_ERROR_LOG  - Error log
--
--                Sequences created:
--                  1. XX_AP_EXP_STG_HDR_S     - Surrogate key for header
--                  2. XX_AP_EXP_ERROR_LOG_S   - Surrogate key for error log
--                  3. XX_AP_EXP_GROUP_ID_S    - GROUP_ID for AP interface
--
-- NOTE         : Run this script as the custom schema owner (e.g. XXCUST)
--                and grant the required privileges to APPS, then create the
--                synonyms in APPS.  A grants/synonyms section is provided at
--                the bottom of this file.
--==============================================================================

PROMPT Creating staging header table XX_AP_EXP_STG_HDR ...

CREATE TABLE xx_ap_exp_stg_hdr
( record_id        NUMBER          NOT NULL
, employee_id      NUMBER
, employee_name    VARCHAR2(240)
, email_id         VARCHAR2(240)
, invoice_num      VARCHAR2(50)    NOT NULL
, invoice_date     DATE
, invoice_amount   NUMBER
, currency_code    VARCHAR2(15)
, org_id           NUMBER
, status           VARCHAR2(20)    DEFAULT 'NEW'
, error_message    VARCHAR2(4000)
, vendor_id        NUMBER       -- populated after supplier mapping
, vendor_site_id   NUMBER       -- populated after supplier mapping
, group_id         VARCHAR2(80) -- populated after interface load
, request_id       NUMBER       -- concurrent request that processed it
, created_by       NUMBER       DEFAULT fnd_global.user_id
, created_date     DATE         DEFAULT SYSDATE
, last_updated_by  NUMBER       DEFAULT fnd_global.user_id
, last_update_date DATE         DEFAULT SYSDATE
, CONSTRAINT xx_ap_exp_stg_hdr_pk  PRIMARY KEY (record_id)
)
/

CREATE INDEX xx_ap_exp_stg_hdr_n1 ON xx_ap_exp_stg_hdr (status)
/
CREATE INDEX xx_ap_exp_stg_hdr_n2 ON xx_ap_exp_stg_hdr (employee_id)
/
CREATE UNIQUE INDEX xx_ap_exp_stg_hdr_u1
   ON xx_ap_exp_stg_hdr (invoice_num, employee_id, org_id)
/

PROMPT Creating staging line table XX_AP_EXP_STG_LINE ...

CREATE TABLE xx_ap_exp_stg_line
( record_id        NUMBER          NOT NULL
, line_number      NUMBER          NOT NULL
, expense_type     VARCHAR2(80)
, description      VARCHAR2(240)
, amount           NUMBER
, ccid             NUMBER       -- GL Code Combination Id
, status           VARCHAR2(20)    DEFAULT 'NEW'
, error_message    VARCHAR2(4000)
, created_by       NUMBER       DEFAULT fnd_global.user_id
, created_date     DATE         DEFAULT SYSDATE
, last_updated_by  NUMBER       DEFAULT fnd_global.user_id
, last_update_date DATE         DEFAULT SYSDATE
, CONSTRAINT xx_ap_exp_stg_line_pk PRIMARY KEY (record_id, line_number)
, CONSTRAINT xx_ap_exp_stg_line_fk FOREIGN KEY (record_id)
                                    REFERENCES xx_ap_exp_stg_hdr (record_id)
)
/

CREATE INDEX xx_ap_exp_stg_line_n1 ON xx_ap_exp_stg_line (status)
/

PROMPT Creating error log table XX_AP_EXP_ERROR_LOG ...

CREATE TABLE xx_ap_exp_error_log
( log_id           NUMBER          NOT NULL
, record_id        NUMBER
, line_number      NUMBER
, stage            VARCHAR2(30)    -- VALIDATION / INTERFACE / SUPPLIER / FATAL
, error_code       VARCHAR2(80)
, error_message    VARCHAR2(4000)
, request_id       NUMBER
, created_by       NUMBER       DEFAULT fnd_global.user_id
, created_date     DATE         DEFAULT SYSDATE
, CONSTRAINT xx_ap_exp_error_log_pk PRIMARY KEY (log_id)
)
/

CREATE INDEX xx_ap_exp_error_log_n1 ON xx_ap_exp_error_log (record_id)
/
CREATE INDEX xx_ap_exp_error_log_n2 ON xx_ap_exp_error_log (request_id)
/

PROMPT Creating supporting sequences ...

CREATE SEQUENCE xx_ap_exp_stg_hdr_s   START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE
/
CREATE SEQUENCE xx_ap_exp_error_log_s START WITH 1 INCREMENT BY 1 CACHE 100
/
CREATE SEQUENCE xx_ap_exp_group_id_s  START WITH 1 INCREMENT BY 1 CACHE 20
/

--==============================================================================
-- Grants & Synonyms (run as the custom schema owner, then connect as APPS)
--==============================================================================
-- GRANT ALL ON xx_ap_exp_stg_hdr     TO apps;
-- GRANT ALL ON xx_ap_exp_stg_line    TO apps;
-- GRANT ALL ON xx_ap_exp_error_log   TO apps;
-- GRANT SELECT ON xx_ap_exp_stg_hdr_s    TO apps;
-- GRANT SELECT ON xx_ap_exp_error_log_s  TO apps;
-- GRANT SELECT ON xx_ap_exp_group_id_s   TO apps;
--
-- -- As APPS:
-- CREATE OR REPLACE SYNONYM apps.xx_ap_exp_stg_hdr     FOR xxcust.xx_ap_exp_stg_hdr;
-- CREATE OR REPLACE SYNONYM apps.xx_ap_exp_stg_line    FOR xxcust.xx_ap_exp_stg_line;
-- CREATE OR REPLACE SYNONYM apps.xx_ap_exp_error_log   FOR xxcust.xx_ap_exp_error_log;
-- CREATE OR REPLACE SYNONYM apps.xx_ap_exp_stg_hdr_s   FOR xxcust.xx_ap_exp_stg_hdr_s;
-- CREATE OR REPLACE SYNONYM apps.xx_ap_exp_error_log_s FOR xxcust.xx_ap_exp_error_log_s;
-- CREATE OR REPLACE SYNONYM apps.xx_ap_exp_group_id_s  FOR xxcust.xx_ap_exp_group_id_s;
--==============================================================================
