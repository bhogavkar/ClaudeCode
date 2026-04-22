-- =============================================================
--  PERSONAL FINANCE TRACKER  |  PL/SQL Comprehensive Program
--  Covers: DDL, Packages, Cursors, Triggers, Exception Handling,
--          Bulk Collect/FORALL, Collections, Functions
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- SECTION 1: TABLE SETUP
-- ─────────────────────────────────────────────────────────────

CREATE TABLE accounts (
    account_id   NUMBER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_name   VARCHAR2(100)  NOT NULL,
    account_type VARCHAR2(20)   DEFAULT 'SAVINGS'
                                CHECK (account_type IN ('SAVINGS','CHECKING','INVESTMENT')),
    balance      NUMBER(15,2)   DEFAULT 0 NOT NULL,
    created_at   DATE           DEFAULT SYSDATE
);

CREATE TABLE transactions (
    txn_id       NUMBER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id   NUMBER         NOT NULL REFERENCES accounts(account_id),
    txn_type     VARCHAR2(10)   NOT NULL CHECK (txn_type IN ('CREDIT','DEBIT')),
    category     VARCHAR2(50),
    amount       NUMBER(15,2)   NOT NULL CHECK (amount > 0),
    description  VARCHAR2(200),
    txn_date     DATE           DEFAULT SYSDATE
);

CREATE TABLE audit_log (
    log_id       NUMBER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name   VARCHAR2(50),
    operation    VARCHAR2(10),
    old_balance  NUMBER(15,2),
    new_balance  NUMBER(15,2),
    changed_by   VARCHAR2(50)   DEFAULT USER,
    changed_at   TIMESTAMP      DEFAULT SYSTIMESTAMP
);

CREATE TABLE monthly_budget (
    budget_id    NUMBER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id   NUMBER         NOT NULL REFERENCES accounts(account_id),
    category     VARCHAR2(50)   NOT NULL,
    budget_month DATE           NOT NULL,
    limit_amount NUMBER(15,2)   NOT NULL CHECK (limit_amount > 0),
    UNIQUE (account_id, category, budget_month)
);


-- ─────────────────────────────────────────────────────────────
-- SECTION 2: AUDIT TRIGGER
-- Fires on every balance update and records old/new values.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE TRIGGER trg_account_audit
    AFTER UPDATE OF balance ON accounts
    FOR EACH ROW
BEGIN
    INSERT INTO audit_log (table_name, operation, old_balance, new_balance)
    VALUES ('ACCOUNTS', 'UPDATE', :OLD.balance, :NEW.balance);
END;
/


-- ─────────────────────────────────────────────────────────────
-- SECTION 3: MAIN PACKAGE SPECIFICATION
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE PACKAGE finance_pkg AS

    -- Custom exception: insufficient funds
    e_insufficient_funds EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_insufficient_funds, -20001);

    -- Custom exception: budget exceeded
    e_budget_exceeded EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_budget_exceeded, -20002);

    -- Record type for summary reporting
    TYPE t_summary_rec IS RECORD (
        category      VARCHAR2(50),
        total_spent   NUMBER(15,2),
        budget_limit  NUMBER(15,2),
        remaining     NUMBER(15,2),
        status        VARCHAR2(15)
    );

    TYPE t_summary_tab IS TABLE OF t_summary_rec;

    -- ── Account Management ──────────────────────────────────
    FUNCTION  create_account  (p_name VARCHAR2, p_type VARCHAR2 DEFAULT 'SAVINGS',
                                p_initial_balance NUMBER DEFAULT 0)
              RETURN NUMBER;

    PROCEDURE deposit          (p_account_id NUMBER, p_amount NUMBER,
                                p_category VARCHAR2 DEFAULT 'INCOME',
                                p_desc VARCHAR2 DEFAULT NULL);

    PROCEDURE withdraw          (p_account_id NUMBER, p_amount NUMBER,
                                 p_category VARCHAR2 DEFAULT 'GENERAL',
                                 p_desc VARCHAR2 DEFAULT NULL,
                                 p_check_budget BOOLEAN DEFAULT TRUE);

    PROCEDURE transfer          (p_from_id NUMBER, p_to_id NUMBER, p_amount NUMBER);

    -- ── Budget Management ───────────────────────────────────
    PROCEDURE set_budget        (p_account_id NUMBER, p_category VARCHAR2,
                                 p_month DATE, p_limit NUMBER);

    -- ── Reporting ───────────────────────────────────────────
    FUNCTION  get_balance       (p_account_id NUMBER) RETURN NUMBER;

    PROCEDURE print_statement   (p_account_id NUMBER,
                                 p_from_date DATE DEFAULT ADD_MONTHS(SYSDATE,-1),
                                 p_to_date   DATE DEFAULT SYSDATE);

    PROCEDURE print_budget_summary (p_account_id NUMBER,
                                    p_month      DATE DEFAULT SYSDATE);

    -- Returns pipelined table (can be used in SELECT)
    FUNCTION  budget_summary_tf (p_account_id NUMBER, p_month DATE DEFAULT SYSDATE)
              RETURN t_summary_tab PIPELINED;

    -- ── Bulk Utilities ──────────────────────────────────────
    PROCEDURE apply_interest    (p_rate NUMBER DEFAULT 0.04);  -- annual rate
    PROCEDURE archive_old_txns  (p_cutoff_date DATE);

END finance_pkg;
/


-- ─────────────────────────────────────────────────────────────
-- SECTION 4: MAIN PACKAGE BODY
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE PACKAGE BODY finance_pkg AS

    -- ── Internal helper: raise an error with a message ──────
    PROCEDURE raise_error(p_code NUMBER, p_msg VARCHAR2) IS
    BEGIN
        RAISE_APPLICATION_ERROR(p_code, p_msg);
    END;

    -- ── Internal helper: get spent amount in a category/month
    FUNCTION get_monthly_spent(p_account_id NUMBER, p_category VARCHAR2,
                                p_month DATE) RETURN NUMBER IS
        v_spent NUMBER := 0;
    BEGIN
        SELECT NVL(SUM(amount), 0)
          INTO v_spent
          FROM transactions
         WHERE account_id = p_account_id
           AND txn_type   = 'DEBIT'
           AND category   = p_category
           AND TRUNC(txn_date, 'MM') = TRUNC(p_month, 'MM');
        RETURN v_spent;
    END;

    -- ────────────────────────────────────────────────────────
    -- create_account: opens a new account, returns its ID
    -- ────────────────────────────────────────────────────────
    FUNCTION create_account(p_name VARCHAR2, p_type VARCHAR2 DEFAULT 'SAVINGS',
                             p_initial_balance NUMBER DEFAULT 0)
             RETURN NUMBER IS
        v_id accounts.account_id%TYPE;
    BEGIN
        IF p_initial_balance < 0 THEN
            raise_error(-20003, 'Initial balance cannot be negative.');
        END IF;

        INSERT INTO accounts (owner_name, account_type, balance)
        VALUES (UPPER(TRIM(p_name)), UPPER(p_type), p_initial_balance)
        RETURNING account_id INTO v_id;

        DBMS_OUTPUT.PUT_LINE('Account created  | ID: ' || v_id ||
                             '  Owner: ' || UPPER(TRIM(p_name)) ||
                             '  Type: ' || UPPER(p_type) ||
                             '  Balance: ' || TO_CHAR(p_initial_balance,'FM$999,990.00'));
        COMMIT;
        RETURN v_id;
    END create_account;

    -- ────────────────────────────────────────────────────────
    -- deposit
    -- ────────────────────────────────────────────────────────
    PROCEDURE deposit(p_account_id NUMBER, p_amount NUMBER,
                      p_category VARCHAR2 DEFAULT 'INCOME',
                      p_desc VARCHAR2 DEFAULT NULL) IS
    BEGIN
        UPDATE accounts
           SET balance = balance + p_amount
         WHERE account_id = p_account_id;

        IF SQL%ROWCOUNT = 0 THEN
            raise_error(-20004, 'Account ' || p_account_id || ' not found.');
        END IF;

        INSERT INTO transactions (account_id, txn_type, category, amount, description)
        VALUES (p_account_id, 'CREDIT', p_category, p_amount, p_desc);

        DBMS_OUTPUT.PUT_LINE('Deposited ' || TO_CHAR(p_amount,'FM$999,990.00') ||
                             ' into account ' || p_account_id);
        COMMIT;
    END deposit;

    -- ────────────────────────────────────────────────────────
    -- withdraw  (checks balance and optionally budget)
    -- ────────────────────────────────────────────────────────
    PROCEDURE withdraw(p_account_id NUMBER, p_amount NUMBER,
                       p_category VARCHAR2 DEFAULT 'GENERAL',
                       p_desc VARCHAR2 DEFAULT NULL,
                       p_check_budget BOOLEAN DEFAULT TRUE) IS
        v_balance      NUMBER;
        v_budget_limit NUMBER := NULL;
        v_spent        NUMBER;
    BEGIN
        SELECT balance INTO v_balance
          FROM accounts
         WHERE account_id = p_account_id
           FOR UPDATE;             -- row-level lock

        IF v_balance < p_amount THEN
            raise_error(-20001,
                'Insufficient funds. Balance: ' || TO_CHAR(v_balance,'FM$999,990.00') ||
                ', Requested: ' || TO_CHAR(p_amount,'FM$999,990.00'));
        END IF;

        -- Budget check (best-effort; no row = no limit configured)
        IF p_check_budget THEN
            BEGIN
                SELECT limit_amount INTO v_budget_limit
                  FROM monthly_budget
                 WHERE account_id   = p_account_id
                   AND category     = p_category
                   AND TRUNC(budget_month,'MM') = TRUNC(SYSDATE,'MM');

                v_spent := get_monthly_spent(p_account_id, p_category, SYSDATE);

                IF v_spent + p_amount > v_budget_limit THEN
                    raise_error(-20002,
                        'Budget exceeded for [' || p_category || ']. ' ||
                        'Limit: ' || TO_CHAR(v_budget_limit,'FM$999,990.00') ||
                        ', Already spent: ' || TO_CHAR(v_spent,'FM$999,990.00') ||
                        ', This debit: ' || TO_CHAR(p_amount,'FM$999,990.00'));
                END IF;
            EXCEPTION
                WHEN NO_DATA_FOUND THEN NULL; -- no budget set, skip check
            END;
        END IF;

        UPDATE accounts SET balance = balance - p_amount
         WHERE account_id = p_account_id;

        INSERT INTO transactions (account_id, txn_type, category, amount, description)
        VALUES (p_account_id, 'DEBIT', p_category, p_amount, p_desc);

        DBMS_OUTPUT.PUT_LINE('Withdrawn ' || TO_CHAR(p_amount,'FM$999,990.00') ||
                             ' from account ' || p_account_id ||
                             ' [' || p_category || ']');
        COMMIT;
    EXCEPTION
        WHEN e_insufficient_funds THEN
            ROLLBACK;
            DBMS_OUTPUT.PUT_LINE('ERROR: ' || SQLERRM);
        WHEN e_budget_exceeded THEN
            ROLLBACK;
            DBMS_OUTPUT.PUT_LINE('WARNING: ' || SQLERRM);
        WHEN OTHERS THEN
            ROLLBACK;
            DBMS_OUTPUT.PUT_LINE('UNEXPECTED ERROR: ' || SQLERRM);
            RAISE;
    END withdraw;

    -- ────────────────────────────────────────────────────────
    -- transfer  (atomic: debit one account, credit another)
    -- ────────────────────────────────────────────────────────
    PROCEDURE transfer(p_from_id NUMBER, p_to_id NUMBER, p_amount NUMBER) IS
    BEGIN
        withdraw(p_from_id, p_amount, 'TRANSFER',
                 'Transfer to account ' || p_to_id, FALSE);
        deposit (p_to_id,   p_amount, 'TRANSFER',
                 'Transfer from account ' || p_from_id);
        DBMS_OUTPUT.PUT_LINE('Transferred ' || TO_CHAR(p_amount,'FM$999,990.00') ||
                             ' from account ' || p_from_id ||
                             ' to account ' || p_to_id);
    END transfer;

    -- ────────────────────────────────────────────────────────
    -- set_budget
    -- ────────────────────────────────────────────────────────
    PROCEDURE set_budget(p_account_id NUMBER, p_category VARCHAR2,
                         p_month DATE, p_limit NUMBER) IS
    BEGIN
        MERGE INTO monthly_budget tgt
        USING (SELECT p_account_id AS aid, p_category AS cat,
                      TRUNC(p_month,'MM') AS mon FROM DUAL) src
        ON (tgt.account_id = src.aid AND tgt.category = src.cat
            AND TRUNC(tgt.budget_month,'MM') = src.mon)
        WHEN MATCHED    THEN UPDATE SET limit_amount = p_limit
        WHEN NOT MATCHED THEN INSERT (account_id, category, budget_month, limit_amount)
                              VALUES (src.aid, src.cat, src.mon, p_limit);

        DBMS_OUTPUT.PUT_LINE('Budget set: [' || p_category || '] ' ||
                             TO_CHAR(p_limit,'FM$999,990.00') ||
                             ' for ' || TO_CHAR(TRUNC(p_month,'MM'),'Mon-YYYY'));
        COMMIT;
    END set_budget;

    -- ────────────────────────────────────────────────────────
    -- get_balance
    -- ────────────────────────────────────────────────────────
    FUNCTION get_balance(p_account_id NUMBER) RETURN NUMBER IS
        v_bal NUMBER;
    BEGIN
        SELECT balance INTO v_bal FROM accounts WHERE account_id = p_account_id;
        RETURN v_bal;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            raise_error(-20004, 'Account ' || p_account_id || ' not found.');
            RETURN NULL;
    END get_balance;

    -- ────────────────────────────────────────────────────────
    -- print_statement  (explicit cursor demo)
    -- ────────────────────────────────────────────────────────
    PROCEDURE print_statement(p_account_id NUMBER,
                               p_from_date DATE DEFAULT ADD_MONTHS(SYSDATE,-1),
                               p_to_date   DATE DEFAULT SYSDATE) IS

        CURSOR c_txns IS
            SELECT txn_date, txn_type, category,
                   amount, NVL(description,'—') AS description
              FROM transactions
             WHERE account_id = p_account_id
               AND txn_date BETWEEN p_from_date AND p_to_date
             ORDER BY txn_date;

        v_owner   accounts.owner_name%TYPE;
        v_balance accounts.balance%TYPE;
        v_total_c NUMBER := 0;
        v_total_d NUMBER := 0;
    BEGIN
        SELECT owner_name, balance INTO v_owner, v_balance
          FROM accounts WHERE account_id = p_account_id;

        DBMS_OUTPUT.PUT_LINE(RPAD('=',60,'='));
        DBMS_OUTPUT.PUT_LINE('  ACCOUNT STATEMENT');
        DBMS_OUTPUT.PUT_LINE('  Owner   : ' || v_owner);
        DBMS_OUTPUT.PUT_LINE('  Account : ' || p_account_id);
        DBMS_OUTPUT.PUT_LINE('  Period  : ' || TO_CHAR(p_from_date,'DD-Mon-YYYY') ||
                             ' to ' || TO_CHAR(p_to_date,'DD-Mon-YYYY'));
        DBMS_OUTPUT.PUT_LINE(RPAD('=',60,'='));
        DBMS_OUTPUT.PUT_LINE(RPAD('Date',12) || RPAD('Type',8) ||
                             RPAD('Category',18) || LPAD('Amount',12));
        DBMS_OUTPUT.PUT_LINE(RPAD('-',60,'-'));

        FOR r IN c_txns LOOP
            DBMS_OUTPUT.PUT_LINE(
                RPAD(TO_CHAR(r.txn_date,'DD-Mon-YY'),12) ||
                RPAD(r.txn_type,8) ||
                RPAD(r.category,18) ||
                LPAD(TO_CHAR(r.amount,'FM$999,990.00'),12)
            );
            IF r.txn_type = 'CREDIT' THEN v_total_c := v_total_c + r.amount;
            ELSE                          v_total_d := v_total_d + r.amount;
            END IF;
        END LOOP;

        DBMS_OUTPUT.PUT_LINE(RPAD('-',60,'-'));
        DBMS_OUTPUT.PUT_LINE(RPAD('Total Credits',38) ||
                             LPAD(TO_CHAR(v_total_c,'FM$999,990.00'),12));
        DBMS_OUTPUT.PUT_LINE(RPAD('Total Debits',38) ||
                             LPAD(TO_CHAR(v_total_d,'FM$999,990.00'),12));
        DBMS_OUTPUT.PUT_LINE(RPAD('Current Balance',38) ||
                             LPAD(TO_CHAR(v_balance,'FM$999,990.00'),12));
        DBMS_OUTPUT.PUT_LINE(RPAD('=',60,'='));
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            DBMS_OUTPUT.PUT_LINE('Account ' || p_account_id || ' not found.');
    END print_statement;

    -- ────────────────────────────────────────────────────────
    -- print_budget_summary  (cursor FOR loop + calculations)
    -- ────────────────────────────────────────────────────────
    PROCEDURE print_budget_summary(p_account_id NUMBER,
                                   p_month      DATE DEFAULT SYSDATE) IS
        v_found BOOLEAN := FALSE;
    BEGIN
        DBMS_OUTPUT.PUT_LINE(RPAD('=',65,'='));
        DBMS_OUTPUT.PUT_LINE('  BUDGET SUMMARY — ' ||
                             TO_CHAR(TRUNC(p_month,'MM'),'Mon-YYYY'));
        DBMS_OUTPUT.PUT_LINE(RPAD('=',65,'='));
        DBMS_OUTPUT.PUT_LINE(RPAD('Category',20) || LPAD('Spent',12) ||
                             LPAD('Limit',12) || LPAD('Remaining',12) ||
                             '  Status');
        DBMS_OUTPUT.PUT_LINE(RPAD('-',65,'-'));

        FOR r IN (
            SELECT b.category,
                   b.limit_amount,
                   NVL(SUM(CASE WHEN t.txn_type='DEBIT' THEN t.amount END),0) AS spent
              FROM monthly_budget b
              LEFT JOIN transactions t
                ON t.account_id = b.account_id
               AND t.category   = b.category
               AND TRUNC(t.txn_date,'MM') = TRUNC(b.budget_month,'MM')
             WHERE b.account_id   = p_account_id
               AND TRUNC(b.budget_month,'MM') = TRUNC(p_month,'MM')
             GROUP BY b.category, b.limit_amount
             ORDER BY b.category
        ) LOOP
            v_found := TRUE;
            DECLARE
                v_remaining NUMBER := r.limit_amount - r.spent;
                v_status    VARCHAR2(15);
            BEGIN
                v_status := CASE
                    WHEN v_remaining < 0         THEN '!! OVER BUDGET'
                    WHEN v_remaining < r.limit_amount * 0.1 THEN '! NEAR LIMIT'
                    ELSE 'OK'
                END;
                DBMS_OUTPUT.PUT_LINE(
                    RPAD(r.category,20) ||
                    LPAD(TO_CHAR(r.spent,        'FM$999,990.00'),12) ||
                    LPAD(TO_CHAR(r.limit_amount, 'FM$999,990.00'),12) ||
                    LPAD(TO_CHAR(v_remaining,    'FM$999,990.00'),12) ||
                    '  ' || v_status
                );
            END;
        END LOOP;

        IF NOT v_found THEN
            DBMS_OUTPUT.PUT_LINE('  No budgets configured for this month.');
        END IF;
        DBMS_OUTPUT.PUT_LINE(RPAD('=',65,'='));
    END print_budget_summary;

    -- ────────────────────────────────────────────────────────
    -- budget_summary_tf  (pipelined table function — usable in SQL)
    -- ────────────────────────────────────────────────────────
    FUNCTION budget_summary_tf(p_account_id NUMBER, p_month DATE DEFAULT SYSDATE)
             RETURN t_summary_tab PIPELINED IS
        v_rec t_summary_rec;
    BEGIN
        FOR r IN (
            SELECT b.category,
                   b.limit_amount,
                   NVL(SUM(CASE WHEN t.txn_type='DEBIT' THEN t.amount END),0) AS spent
              FROM monthly_budget b
              LEFT JOIN transactions t
                ON t.account_id = b.account_id
               AND t.category   = b.category
               AND TRUNC(t.txn_date,'MM') = TRUNC(b.budget_month,'MM')
             WHERE b.account_id   = p_account_id
               AND TRUNC(b.budget_month,'MM') = TRUNC(p_month,'MM')
             GROUP BY b.category, b.limit_amount
        ) LOOP
            v_rec.category     := r.category;
            v_rec.total_spent  := r.spent;
            v_rec.budget_limit := r.limit_amount;
            v_rec.remaining    := r.limit_amount - r.spent;
            v_rec.status       := CASE
                WHEN v_rec.remaining < 0                        THEN 'OVER BUDGET'
                WHEN v_rec.remaining < r.limit_amount * 0.1    THEN 'NEAR LIMIT'
                ELSE 'OK'
            END;
            PIPE ROW(v_rec);
        END LOOP;
        RETURN;
    END budget_summary_tf;

    -- ────────────────────────────────────────────────────────
    -- apply_interest  (BULK COLLECT + FORALL demo)
    -- Applies annual interest rate to all SAVINGS accounts.
    -- ────────────────────────────────────────────────────────
    PROCEDURE apply_interest(p_rate NUMBER DEFAULT 0.04) IS
        TYPE t_id_tab  IS TABLE OF accounts.account_id%TYPE;
        TYPE t_bal_tab IS TABLE OF accounts.balance%TYPE;

        v_ids      t_id_tab;
        v_balances t_bal_tab;
        v_monthly  NUMBER := p_rate / 12;
        v_count    NUMBER := 0;
    BEGIN
        -- Bulk fetch all savings accounts
        SELECT account_id, balance
          BULK COLLECT INTO v_ids, v_balances
          FROM accounts
         WHERE account_type = 'SAVINGS'
           AND balance > 0;

        -- Bulk update balances
        FORALL i IN 1 .. v_ids.COUNT
            UPDATE accounts
               SET balance = balance + ROUND(v_balances(i) * v_monthly, 2)
             WHERE account_id = v_ids(i);

        v_count := SQL%ROWCOUNT;

        -- Log interest deposits in bulk
        FORALL i IN 1 .. v_ids.COUNT
            INSERT INTO transactions (account_id, txn_type, category, amount, description)
            VALUES (v_ids(i), 'CREDIT', 'INTEREST',
                    ROUND(v_balances(i) * v_monthly, 2),
                    'Monthly interest at ' || TO_CHAR(p_rate*100,'FM990.0') || '% p.a.');

        COMMIT;
        DBMS_OUTPUT.PUT_LINE('Interest applied to ' || v_count || ' savings account(s).');
    END apply_interest;

    -- ────────────────────────────────────────────────────────
    -- archive_old_txns  (BULK DELETE demo)
    -- Moves transactions older than cutoff into an archive table.
    -- ────────────────────────────────────────────────────────
    PROCEDURE archive_old_txns(p_cutoff_date DATE) IS
        TYPE t_txn_tab IS TABLE OF transactions%ROWTYPE;
        v_old_txns t_txn_tab;
    BEGIN
        SELECT * BULK COLLECT INTO v_old_txns
          FROM transactions
         WHERE txn_date < p_cutoff_date;

        IF v_old_txns.COUNT = 0 THEN
            DBMS_OUTPUT.PUT_LINE('No transactions to archive before ' ||
                                  TO_CHAR(p_cutoff_date,'DD-Mon-YYYY'));
            RETURN;
        END IF;

        -- Delete in bulk
        FORALL i IN 1 .. v_old_txns.COUNT
            DELETE FROM transactions WHERE txn_id = v_old_txns(i).txn_id;

        COMMIT;
        DBMS_OUTPUT.PUT_LINE('Archived ' || v_old_txns.COUNT ||
                             ' transaction(s) older than ' ||
                             TO_CHAR(p_cutoff_date,'DD-Mon-YYYY'));
    END archive_old_txns;

END finance_pkg;
/


-- ─────────────────────────────────────────────────────────────
-- SECTION 5: DEMO / TEST SCRIPT
-- Run this block to see everything in action.
-- ─────────────────────────────────────────────────────────────

SET SERVEROUTPUT ON SIZE UNLIMITED;

DECLARE
    v_acc1 NUMBER;
    v_acc2 NUMBER;
BEGIN
    DBMS_OUTPUT.PUT_LINE(CHR(10) || '>>> Creating accounts...');
    v_acc1 := finance_pkg.create_account('Alice Johnson', 'SAVINGS',    1000);
    v_acc2 := finance_pkg.create_account('Bob Smith',     'CHECKING',   500);

    DBMS_OUTPUT.PUT_LINE(CHR(10) || '>>> Setting monthly budgets for Alice...');
    finance_pkg.set_budget(v_acc1, 'GROCERIES', SYSDATE, 400);
    finance_pkg.set_budget(v_acc1, 'DINING',    SYSDATE, 150);
    finance_pkg.set_budget(v_acc1, 'TRANSPORT', SYSDATE, 100);

    DBMS_OUTPUT.PUT_LINE(CHR(10) || '>>> Making transactions...');
    finance_pkg.deposit (v_acc1,  2500, 'SALARY',    'Monthly salary');
    finance_pkg.withdraw(v_acc1,   120, 'GROCERIES', 'Weekly groceries');
    finance_pkg.withdraw(v_acc1,    45, 'DINING',    'Dinner with family');
    finance_pkg.withdraw(v_acc1,    30, 'TRANSPORT', 'Bus pass');
    finance_pkg.withdraw(v_acc1,    80, 'GROCERIES', 'Supermarket run');

    DBMS_OUTPUT.PUT_LINE(CHR(10) || '>>> Attempting over-budget withdrawal...');
    finance_pkg.withdraw(v_acc1, 220, 'GROCERIES', 'Large grocery shop');

    DBMS_OUTPUT.PUT_LINE(CHR(10) || '>>> Transfer between accounts...');
    finance_pkg.transfer(v_acc1, v_acc2, 300);

    DBMS_OUTPUT.PUT_LINE(CHR(10) || '>>> Applying monthly interest...');
    finance_pkg.apply_interest(0.04);  -- 4% annual

    DBMS_OUTPUT.PUT_LINE(CHR(10) || '>>> Account Statement for Alice:');
    finance_pkg.print_statement(v_acc1,
                                 TRUNC(SYSDATE,'MM'),
                                 SYSDATE);

    DBMS_OUTPUT.PUT_LINE(CHR(10) || '>>> Budget Summary for Alice:');
    finance_pkg.print_budget_summary(v_acc1, SYSDATE);

    DBMS_OUTPUT.PUT_LINE(CHR(10) || '>>> Current balances:');
    DBMS_OUTPUT.PUT_LINE('Alice balance : ' ||
        TO_CHAR(finance_pkg.get_balance(v_acc1),'FM$999,990.00'));
    DBMS_OUTPUT.PUT_LINE('Bob balance   : ' ||
        TO_CHAR(finance_pkg.get_balance(v_acc2),'FM$999,990.00'));

END;
/

-- You can also query the pipelined function directly in SQL:
-- SELECT * FROM TABLE(finance_pkg.budget_summary_tf(<account_id>));
