-- +=====================================================================+
-- |  File Name   : XXWD_EMP_SUP_STG.sql                                 |
-- |  Description : Staging table DDL for Workday Employee Supplier      |
-- |                Header level data                                    |
-- |  Module      : Oracle EBS R12.2.12 - Accounts Payable               |
-- |  Author      : XX Development Team                                  |
-- +=====================================================================+

CREATE TABLE XXWD_EMP_SUP_STG
(
   row_id                NUMBER          NOT NULL,    -- Unique row identifier (PK)
   batch_id              NUMBER,                      -- Logical batch group from Workday
   employee_number       VARCHAR2(30)    NOT NULL,    -- Primary unique identifier
   employee_name         VARCHAR2(240),               -- Full employee name
   first_name            VARCHAR2(150),
   middle_name           VARCHAR2(60),
   last_name             VARCHAR2(150),
   email_address         VARCHAR2(240),
   org_id                NUMBER          NOT NULL,    -- Operating Unit ID (Multi-OU)
   address_line1         VARCHAR2(240),
   address_line2         VARCHAR2(240),
   address_line3         VARCHAR2(240),
   city                  VARCHAR2(60),
   state                 VARCHAR2(60),
   postal_code           VARCHAR2(60),
   country_code          VARCHAR2(2),
   currency_code         VARCHAR2(15),
   site_code             VARCHAR2(15),                -- Optional site code override
   payment_method_code   VARCHAR2(30),
   --
   -- Status / processing columns
   --
   status                VARCHAR2(20)    DEFAULT 'NEW' NOT NULL,
                                                       -- NEW, VALIDATED, PROCESSING,
                                                       -- SUCCESS, ERROR, RETRY
   error_message         VARCHAR2(4000),
   retry_count           NUMBER          DEFAULT 0,
   request_id            NUMBER,                      -- Concurrent request id
   --
   -- Derived / generated columns populated post-creation
   --
   vendor_id             NUMBER,
   vendor_site_id        NUMBER,
   party_id              NUMBER,
   party_site_id         NUMBER,
   --
   -- WHO columns
   --
   creation_date         DATE            DEFAULT SYSDATE NOT NULL,
   created_by            NUMBER          DEFAULT FND_GLOBAL.USER_ID NOT NULL,
   last_update_date      DATE            DEFAULT SYSDATE NOT NULL,
   last_updated_by       NUMBER          DEFAULT FND_GLOBAL.USER_ID NOT NULL,
   last_update_login     NUMBER          DEFAULT FND_GLOBAL.LOGIN_ID,
   --
   CONSTRAINT xxwd_emp_sup_stg_pk PRIMARY KEY (row_id),
   CONSTRAINT xxwd_emp_sup_stg_status_ck
      CHECK (status IN ('NEW','VALIDATED','PROCESSING','SUCCESS','ERROR','RETRY'))
)
/

CREATE INDEX xxwd_emp_sup_stg_n1 ON XXWD_EMP_SUP_STG (employee_number)
/
CREATE INDEX xxwd_emp_sup_stg_n2 ON XXWD_EMP_SUP_STG (status, org_id)
/
CREATE INDEX xxwd_emp_sup_stg_n3 ON XXWD_EMP_SUP_STG (batch_id)
/

CREATE SEQUENCE XXWD_EMP_SUP_STG_S START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE
/

COMMENT ON TABLE XXWD_EMP_SUP_STG IS
   'Inbound staging table for Workday-EBS employee supplier integration (Header).';
