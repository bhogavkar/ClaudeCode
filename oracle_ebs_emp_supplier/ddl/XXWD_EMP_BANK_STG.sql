-- +=====================================================================+
-- |  File Name   : XXWD_EMP_BANK_STG.sql                                |
-- |  Description : Staging table DDL for Workday Employee Bank details  |
-- |  Module      : Oracle EBS R12.2.12 - Accounts Payable               |
-- |  Author      : XX Development Team                                  |
-- +=====================================================================+

CREATE TABLE XXWD_EMP_BANK_STG
(
   row_id                NUMBER          NOT NULL,    -- Unique row identifier (PK)
   parent_row_id         NUMBER          NOT NULL,    -- FK to XXWD_EMP_SUP_STG.row_id
   employee_number       VARCHAR2(30)    NOT NULL,    -- Joining key
   --
   -- Bank attributes
   --
   bank_name             VARCHAR2(360),
   bank_number           VARCHAR2(30),
   bank_country_code     VARCHAR2(2),
   --
   -- Branch attributes
   --
   branch_name           VARCHAR2(360),
   branch_number         VARCHAR2(30),
   branch_type           VARCHAR2(30),                -- ABA, SWIFT, CHIPS, OTHER
   bic_code              VARCHAR2(30),
   --
   -- Account attributes
   --
   bank_account_number   VARCHAR2(100),
   bank_account_name     VARCHAR2(360),
   bank_account_type     VARCHAR2(30),                -- CHECKING, SAVINGS
   iban_number           VARCHAR2(50),
   currency_code         VARCHAR2(15),
   country_code          VARCHAR2(2),
   primary_account_flag  VARCHAR2(1)     DEFAULT 'Y',
   start_date            DATE,
   end_date              DATE,
   --
   -- Status / processing columns
   --
   status                VARCHAR2(20)    DEFAULT 'NEW' NOT NULL,
   error_message         VARCHAR2(4000),
   --
   -- Derived / generated columns populated post-creation
   --
   ext_bank_id           NUMBER,
   ext_branch_id         NUMBER,
   ext_bank_account_id   NUMBER,
   payee_id              NUMBER,
   instr_assignment_id   NUMBER,
   --
   -- WHO columns
   --
   creation_date         DATE            DEFAULT SYSDATE NOT NULL,
   created_by            NUMBER          DEFAULT FND_GLOBAL.USER_ID NOT NULL,
   last_update_date      DATE            DEFAULT SYSDATE NOT NULL,
   last_updated_by       NUMBER          DEFAULT FND_GLOBAL.USER_ID NOT NULL,
   last_update_login     NUMBER          DEFAULT FND_GLOBAL.LOGIN_ID,
   --
   CONSTRAINT xxwd_emp_bank_stg_pk PRIMARY KEY (row_id),
   CONSTRAINT xxwd_emp_bank_stg_status_ck
      CHECK (status IN ('NEW','VALIDATED','PROCESSING','SUCCESS','ERROR','RETRY'))
)
/

CREATE INDEX xxwd_emp_bank_stg_n1 ON XXWD_EMP_BANK_STG (employee_number)
/
CREATE INDEX xxwd_emp_bank_stg_n2 ON XXWD_EMP_BANK_STG (parent_row_id)
/
CREATE INDEX xxwd_emp_bank_stg_n3 ON XXWD_EMP_BANK_STG (status)
/

CREATE SEQUENCE XXWD_EMP_BANK_STG_S START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE
/

COMMENT ON TABLE XXWD_EMP_BANK_STG IS
   'Inbound staging table for Workday-EBS employee bank/branch/account integration.';
