/* =============================================================================
 * File-type registry + sample content + persistence helpers.
 * Maps the supported Oracle/data extensions to a Monaco language + an icon,
 * and provides localStorage-backed session persistence.
 * Exposed as window.FileTypes / window.Samples / window.Persist
 * ============================================================================= */
(function (global) {
  'use strict';

  // ext -> { lang, icon, kind }   kind: 'plsql' | 'data' | 'text' | 'csv'
  const TYPES = {
    sql: { lang: 'oraclesql', icon: '🗄', kind: 'plsql' },
    pks: { lang: 'oraclesql', icon: '📦', kind: 'plsql' },
    pkb: { lang: 'oraclesql', icon: '📦', kind: 'plsql' },
    pls: { lang: 'oraclesql', icon: '🧩', kind: 'plsql' },
    prc: { lang: 'oraclesql', icon: '⚙', kind: 'plsql' },
    fnc: { lang: 'oraclesql', icon: 'ƒ', kind: 'plsql' },
    trg: { lang: 'oraclesql', icon: '⚡', kind: 'plsql' },
    typ: { lang: 'oraclesql', icon: '🔷', kind: 'plsql' },
    tps: { lang: 'oraclesql', icon: '🔷', kind: 'plsql' },
    vw: { lang: 'oraclesql', icon: '👁', kind: 'plsql' },
    csv: { lang: 'plaintext', icon: '📊', kind: 'csv' },
    dat: { lang: 'plaintext', icon: '📊', kind: 'csv' },
    xml: { lang: 'xml', icon: '📄', kind: 'data' },
    json: { lang: 'json', icon: '{ }', kind: 'data' },
    txt: { lang: 'plaintext', icon: '📃', kind: 'text' },
    log: { lang: 'plaintext', icon: '📜', kind: 'text' },
    ctl: { lang: 'plaintext', icon: '🎛', kind: 'text' }
  };

  function ext(name) {
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
  }
  function typeOf(name) {
    return TYPES[ext(name)] || { lang: 'plaintext', icon: '📄', kind: 'text' };
  }

  // ---- Sample files ---------------------------------------------------------
  const SAMPLES = {
    'welcome.sql':
`-- ============================================================================
--  Welcome to the Oracle PL/SQL IDE — Enterprise Edition
-- ============================================================================
--  Try these:
--   • Start typing  SELECT *   then press Space  -> FROM is predicted
--   • Type          beginblock + Tab            -> full BEGIN/EXCEPTION/END
--   • Type          FROM AP_                     -> Oracle EBS tables suggested
--   • Ctrl+Space    anywhere                     -> IntelliSense
--   • Ctrl+Shift+F                               -> format this file
--   • F5                                         -> simulate running the script
--   • Select code, then AI panel -> Explain / Optimize / Review
-- ============================================================================

DECLARE
    l_total   NUMBER(15,2) := 0;
    l_count   PLS_INTEGER  := 0;
BEGIN
    FOR rec IN (SELECT invoice_id, invoice_amount
                  FROM ap_invoices_all
                 WHERE org_id = FND_GLOBAL.org_id) LOOP
        l_total := l_total + NVL(rec.invoice_amount, 0);
        l_count := l_count + 1;
    END LOOP;

    DBMS_OUTPUT.PUT_LINE('Invoices: ' || l_count || '  Total: ' || l_total);
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        DBMS_OUTPUT.PUT_LINE('No invoices found.');
    WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('Error: ' || SQLERRM);
        RAISE;
END;
/
`,
    'employee_pkg.pks':
`CREATE OR REPLACE PACKAGE employee_pkg AS
    -- Public API for employee operations
    FUNCTION  get_full_name (p_emp_id IN NUMBER) RETURN VARCHAR2;
    PROCEDURE give_raise    (p_emp_id IN NUMBER, p_pct IN NUMBER);
    e_invalid_pct EXCEPTION;
END employee_pkg;
/
`,
    'employee_pkg.pkb':
`CREATE OR REPLACE PACKAGE BODY employee_pkg AS

    FUNCTION get_full_name (p_emp_id IN NUMBER) RETURN VARCHAR2 IS
        l_name VARCHAR2(200);
    BEGIN
        SELECT first_name || ' ' || last_name
          INTO l_name
          FROM per_all_people_f
         WHERE person_id = p_emp_id
           AND SYSDATE BETWEEN effective_start_date AND effective_end_date;
        RETURN l_name;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RETURN NULL;
    END get_full_name;

    PROCEDURE give_raise (p_emp_id IN NUMBER, p_pct IN NUMBER) IS
    BEGIN
        IF p_pct <= 0 OR p_pct > 50 THEN
            RAISE e_invalid_pct;
        END IF;

        UPDATE pay_element_entries_f
           SET screen_entry_value = screen_entry_value * (1 + p_pct/100)
         WHERE person_id = p_emp_id;
    END give_raise;

END employee_pkg;
/
`,
    'audit.trg':
`CREATE OR REPLACE TRIGGER trg_account_audit
AFTER UPDATE OF balance ON accounts
FOR EACH ROW
WHEN (OLD.balance <> NEW.balance)
BEGIN
    INSERT INTO audit_log (table_name, operation, old_balance, new_balance)
    VALUES ('ACCOUNTS', 'UPDATE', :OLD.balance, :NEW.balance);
END trg_account_audit;
/
`,
    'employees.csv':
`employee_id,first_name,last_name,department,salary,hire_date
100,Steven,King,Executive,24000,2003-06-17
101,Neena,Kochhar,Executive,17000,2005-09-21
102,Lex,De Haan,Executive,17000,2001-01-13
103,Alexander,Hunold,IT,9000,2006-01-03
104,Bruce,Ernst,IT,6000,2007-05-21
200,Jennifer,Whalen,Admin,4400,2003-09-17
`,
    'config.json':
`{
  "connection": "DEV",
  "schema": "APPS",
  "nls": { "date_format": "DD-MON-YYYY", "numeric_chars": ".," },
  "formatter": { "tabSize": 4, "uppercaseKeywords": true }
}
`,
    'report.xml':
`<?xml version="1.0" encoding="UTF-8"?>
<dataTemplate name="INVOICE_REGISTER" defaultPackage="XXAP_INV_REGISTER">
  <parameters>
    <parameter name="P_ORG_ID" dataType="number"/>
  </parameters>
  <dataQuery>
    <sqlStatement name="Q_MAIN"><![CDATA[
      SELECT invoice_num, invoice_amount, invoice_date
        FROM ap_invoices_all
       WHERE org_id = :P_ORG_ID
    ]]></sqlStatement>
  </dataQuery>
</dataTemplate>
`
  };

  // ---- Persistence ----------------------------------------------------------
  const KEY = 'oracle_ide_session_v1';
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }

  global.FileTypes = { TYPES: TYPES, ext: ext, typeOf: typeOf };
  global.Samples = SAMPLES;
  global.Persist = { save: save, load: load };
})(window);
