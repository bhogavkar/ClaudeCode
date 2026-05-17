-- +=====================================================================+
-- |  File Name   : XXWD_EMP_SUP_LOG.sql                                 |
-- |  Description : Logging table DDL for Workday-EBS Employee Supplier  |
-- |                integration. Captures every step / API message      |
-- |                / validation outcome for support and debugging.     |
-- |  Module      : Oracle EBS R12.2.12 - Accounts Payable               |
-- |  Author      : XX Development Team                                  |
-- +=====================================================================+

CREATE TABLE XXWD_EMP_SUP_LOG
(
   log_id                NUMBER          NOT NULL,    -- Surrogate key
   request_id            NUMBER,                      -- Concurrent request id
   row_id                NUMBER,                      -- Header staging row id
   bank_row_id           NUMBER,                      -- Bank staging row id (optional)
   employee_number       VARCHAR2(30),
   org_id                NUMBER,
   module_name           VARCHAR2(60),                -- e.g. VALIDATION, SUPPLIER,
                                                       -- SITE, PAYEE, BANK, BRANCH,
                                                       -- ACCOUNT, INSTRUMENT
   step_name             VARCHAR2(120),               -- Specific step / API name
   message_type          VARCHAR2(20),                -- INFO, DEBUG, WARN, ERROR, API
   message_text          VARCHAR2(4000),
   sql_code              NUMBER,
   sql_errm              VARCHAR2(4000),
   error_backtrace       VARCHAR2(4000),
   --
   -- WHO columns
   --
   creation_date         DATE            DEFAULT SYSDATE NOT NULL,
   created_by            NUMBER          DEFAULT FND_GLOBAL.USER_ID NOT NULL,
   --
   CONSTRAINT xxwd_emp_sup_log_pk PRIMARY KEY (log_id)
)
/

CREATE INDEX xxwd_emp_sup_log_n1 ON XXWD_EMP_SUP_LOG (request_id)
/
CREATE INDEX xxwd_emp_sup_log_n2 ON XXWD_EMP_SUP_LOG (employee_number)
/
CREATE INDEX xxwd_emp_sup_log_n3 ON XXWD_EMP_SUP_LOG (message_type, creation_date)
/

CREATE SEQUENCE XXWD_EMP_SUP_LOG_S START WITH 1 INCREMENT BY 1 CACHE 100 NOCYCLE
/

COMMENT ON TABLE XXWD_EMP_SUP_LOG IS
   'Centralised log table for Workday-EBS employee supplier integration runs.';
