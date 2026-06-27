/* =============================================================================
 * Offline Oracle AI Assistant.
 * Provides explain / generate / review / optimize / document capabilities using
 * deterministic, rule-based reasoning (no network required). It understands
 * common Oracle + EBS patterns and emits expert guidance and code.
 * If a remote LLM endpoint is later configured (window.AIConfig.endpoint),
 * `ask()` will transparently delegate to it.
 * Exposed as window.OracleAI
 * ============================================================================= */
(function (global) {
  'use strict';

  const D = global.OracleData;

  function md(s) { return s; }

  // ---- EXPLAIN --------------------------------------------------------------
  function explain(code) {
    if (!code || !code.trim()) return 'Select some code or open a file, then ask me to explain it.';
    const u = code.toUpperCase();
    const out = ['### Code explanation', ''];
    const facts = [];

    if (/CREATE\s+(OR\s+REPLACE\s+)?PACKAGE\s+BODY/.test(u)) facts.push('Defines a **package body** — the implementation of a package spec.');
    else if (/CREATE\s+(OR\s+REPLACE\s+)?PACKAGE/.test(u)) facts.push('Defines a **package specification** — the public contract (declared procedures/functions/types).');
    if (/CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/.test(u)) facts.push('Defines a **trigger** that fires automatically on DML/DDL events.');
    if (/CREATE\s+(OR\s+REPLACE\s+)?PROCEDURE/.test(u)) facts.push('Defines a **stored procedure**.');
    if (/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/.test(u)) facts.push('Defines a **function** returning a value.');
    if (/\bCURSOR\b/.test(u)) facts.push('Declares one or more **explicit cursors** to iterate query results.');
    if (/BULK\s+COLLECT/.test(u)) facts.push('Uses **BULK COLLECT** to fetch many rows in one round trip (reduces context switching).');
    if (/\bFORALL\b/.test(u)) facts.push('Uses **FORALL** to perform set-based bulk DML efficiently.');
    if (/EXCEPTION\b/.test(u)) facts.push('Contains **exception handling** for runtime errors.');
    if (/FND_REQUEST\.SUBMIT_REQUEST/.test(u)) facts.push('Submits an **Oracle EBS concurrent request**.');
    if (/FND_FILE\./.test(u)) facts.push('Writes to the **concurrent program log/output** via FND_FILE.');
    if (/MERGE\s+INTO/.test(u)) facts.push('Performs an **upsert** with MERGE (insert + update in one statement).');

    // referenced EBS modules
    const mods = Object.keys(D.EBS).filter(function (m) {
      return D.EBS[m].tables.some(function (t) { return u.indexOf(t) >= 0; }) ||
        D.EBS[m].apis.some(function (a) { return u.indexOf(a.toUpperCase()) >= 0; });
    });
    if (mods.length) facts.push('Touches Oracle EBS modules: ' + mods.map(function (m) { return '**' + m + '** (' + D.EBS[m].desc + ')'; }).join(', ') + '.');

    if (!facts.length) facts.push('This looks like a SQL/PL-SQL snippet. It executes statements against the database in order.');
    out.push(facts.map(function (f) { return '- ' + f; }).join('\n'));

    // line-count summary
    out.push('', '_Statements: ~' + (code.split(';').length - 1) + ' · Lines: ' + code.split('\n').length + '_');
    return out.join('\n');
  }

  // ---- REVIEW (delegates to linter heuristics + extra advice) ---------------
  function review(code) {
    const u = (code || '').toUpperCase();
    const findings = [];
    if (/SELECT\s+\*/.test(u)) findings.push(['⚠️', 'Avoid `SELECT *`; enumerate columns.']);
    if (/=\s*NULL|<>\s*NULL/.test(u)) findings.push(['❌', 'Replace `= NULL` with `IS NULL`.']);
    if (/\bWHEN\s+OTHERS\s+THEN\s+NULL/.test(u)) findings.push(['❌', 'Swallowing exceptions with `WHEN OTHERS THEN NULL` hides errors — log SQLERRM at minimum.']);
    if (/EXECUTE\s+IMMEDIATE/.test(u) && /\|\|/.test(u)) findings.push(['❌', 'Dynamic SQL via concatenation — use bind variables (`USING`) to prevent SQL injection.']);
    if (/COMMIT/.test(u) && /LOOP/.test(u)) findings.push(['⚠️', 'Looks like COMMIT may be inside a loop — commit once after the loop.']);
    if (!/EXCEPTION/.test(u) && /BEGIN/.test(u)) findings.push(['💡', 'No exception handler found — consider handling NO_DATA_FOUND / OTHERS.']);
    if (/AUTHID\s+CURRENT_USER/.test(u)) findings.push(['✅', 'Good: invoker rights (AUTHID CURRENT_USER) used.']);
    if (/FND_FILE\./.test(u)) findings.push(['✅', 'Good: EBS logging via FND_FILE.']);
    if (!findings.length) findings.push(['✅', 'No obvious issues detected by static review.']);

    return '### Code review\n' + findings.map(function (f) { return f[0] + ' ' + f[1]; }).join('\n');
  }

  // ---- OPTIMIZE -------------------------------------------------------------
  function optimize(code) {
    const u = (code || '').toUpperCase();
    const tips = [];
    if (/FOR\b[\s\S]*?\bLOOP[\s\S]*?\bINSERT|UPDATE|DELETE/.test(u) && !/FORALL/.test(u)) tips.push('Convert row-by-row DML inside loops to **FORALL** bulk DML.');
    if (/SELECT[\s\S]*?\bINTO\b/.test(u) && !/BULK\s+COLLECT/.test(u) && /LOOP/.test(u)) tips.push('Fetch sets with **BULK COLLECT** instead of single-row fetches in a loop.');
    if (/SELECT\s+\*/.test(u)) tips.push('Select only required columns to reduce I/O and enable index-only scans.');
    if (/LIKE\s+'%/.test(u)) tips.push('Leading-wildcard LIKE (`\'%...\'`) cannot use a normal index — consider Oracle Text or a function-based index.');
    if (/\bNVL\s*\([^,]+,[^)]+\)\s*=/.test(u)) tips.push('Wrapping an indexed column in NVL() suppresses index usage — restructure the predicate.');
    if (/TO_CHAR\s*\([^)]*\)\s*=/.test(u)) tips.push('Applying TO_CHAR/TRUNC to an indexed column blocks the index — compare on the raw column or add a function-based index.');
    if (!tips.length) tips.push('No obvious anti-patterns. For deeper tuning, capture an EXPLAIN PLAN / SQL Monitor report.');
    tips.push('Always validate with `EXPLAIN PLAN FOR ...;` then `SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY);`.');
    return '### Optimization suggestions\n' + tips.map(function (t) { return '- ' + t; }).join('\n');
  }

  // ---- GENERATE -------------------------------------------------------------
  function generate(prompt) {
    const p = (prompt || '').toLowerCase();
    if (/bulk\s*collect/.test(p)) return code(BULK_TEMPLATE);
    if (/forall/.test(p)) return code(FORALL_TEMPLATE);
    if (/trigger/.test(p)) return code(TRIGGER_TEMPLATE);
    if (/package\s*body/.test(p)) return code(PKG_BODY_TEMPLATE);
    if (/package/.test(p)) return code(PKG_SPEC_TEMPLATE);
    if (/concurrent|fnd_request|ebs/.test(p)) return code(EBS_CP_TEMPLATE);
    if (/cursor/.test(p)) return code(CURSOR_TEMPLATE);
    if (/exception/.test(p)) return code(EXC_TEMPLATE);
    if (/function/.test(p)) return code(FUNC_TEMPLATE);
    if (/procedure/.test(p)) return code(PROC_TEMPLATE);
    return 'I can generate: **procedure, function, package, package body, trigger, cursor, bulk collect, forall, exception block, EBS concurrent program**.\n\nExample: _"generate a package body for invoice processing"_.';
  }

  function code(s) { return '```sql\n' + s + '\n```'; }

  const PROC_TEMPLATE =
`CREATE OR REPLACE PROCEDURE process_record (
    p_id        IN  NUMBER,
    p_status    OUT VARCHAR2
) AS
BEGIN
    UPDATE my_table
       SET processed_flag = 'Y'
     WHERE id = p_id;
    p_status := 'SUCCESS';
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        p_status := 'NOT_FOUND';
    WHEN OTHERS THEN
        p_status := 'ERROR: ' || SQLERRM;
        RAISE;
END process_record;
/`;

  const FUNC_TEMPLATE =
`CREATE OR REPLACE FUNCTION get_full_name (
    p_emp_id IN NUMBER
) RETURN VARCHAR2 IS
    l_name VARCHAR2(200);
BEGIN
    SELECT first_name || ' ' || last_name
      INTO l_name
      FROM employees
     WHERE employee_id = p_emp_id;
    RETURN l_name;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RETURN NULL;
END get_full_name;
/`;

  const CURSOR_TEMPLATE =
`DECLARE
    CURSOR c_orders IS
        SELECT order_id, customer_id, total
          FROM orders
         WHERE status = 'OPEN';
BEGIN
    FOR r IN c_orders LOOP
        DBMS_OUTPUT.PUT_LINE('Order ' || r.order_id || ' = ' || r.total);
    END LOOP;
END;
/`;

  const BULK_TEMPLATE =
`DECLARE
    TYPE t_ids IS TABLE OF orders.order_id%TYPE;
    l_ids t_ids;
BEGIN
    SELECT order_id
      BULK COLLECT INTO l_ids
      FROM orders
     WHERE status = 'OPEN';

    DBMS_OUTPUT.PUT_LINE('Fetched ' || l_ids.COUNT || ' rows.');
END;
/`;

  const FORALL_TEMPLATE =
`DECLARE
    TYPE t_rows IS TABLE OF stg_table%ROWTYPE;
    l_rows t_rows;
BEGIN
    SELECT * BULK COLLECT INTO l_rows FROM stg_table;

    FORALL i IN 1 .. l_rows.COUNT SAVE EXCEPTIONS
        INSERT INTO target_table VALUES l_rows(i);

    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        FOR j IN 1 .. SQL%BULK_EXCEPTIONS.COUNT LOOP
            DBMS_OUTPUT.PUT_LINE('Row ' || SQL%BULK_EXCEPTIONS(j).ERROR_INDEX
                || ': ' || SQLERRM(-SQL%BULK_EXCEPTIONS(j).ERROR_CODE));
        END LOOP;
END;
/`;

  const TRIGGER_TEMPLATE =
`CREATE OR REPLACE TRIGGER trg_audit_balance
AFTER UPDATE OF balance ON accounts
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (table_name, operation, old_balance, new_balance)
    VALUES ('ACCOUNTS', 'UPDATE', :OLD.balance, :NEW.balance);
END trg_audit_balance;
/`;

  const PKG_SPEC_TEMPLATE =
`CREATE OR REPLACE PACKAGE invoice_pkg AS
    PROCEDURE create_invoice (p_supplier_id IN NUMBER, p_amount IN NUMBER);
    FUNCTION  get_balance   (p_invoice_id  IN NUMBER) RETURN NUMBER;
END invoice_pkg;
/`;

  const PKG_BODY_TEMPLATE =
`CREATE OR REPLACE PACKAGE BODY invoice_pkg AS

    PROCEDURE create_invoice (p_supplier_id IN NUMBER, p_amount IN NUMBER) IS
    BEGIN
        INSERT INTO ap_invoices_all (vendor_id, invoice_amount, creation_date)
        VALUES (p_supplier_id, p_amount, SYSDATE);
    END create_invoice;

    FUNCTION get_balance (p_invoice_id IN NUMBER) RETURN NUMBER IS
        l_bal NUMBER;
    BEGIN
        SELECT NVL(SUM(amount), 0) INTO l_bal
          FROM ap_payment_schedules_all
         WHERE invoice_id = p_invoice_id;
        RETURN l_bal;
    END get_balance;

END invoice_pkg;
/`;

  const EXC_TEMPLATE =
`EXCEPTION
    WHEN NO_DATA_FOUND THEN
        DBMS_OUTPUT.PUT_LINE('No matching row.');
    WHEN TOO_MANY_ROWS THEN
        DBMS_OUTPUT.PUT_LINE('Query returned more than one row.');
    WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('Error: ' || SQLERRM);
        DBMS_OUTPUT.PUT_LINE(DBMS_UTILITY.FORMAT_ERROR_BACKTRACE);
        RAISE;`;

  const EBS_CP_TEMPLATE =
`CREATE OR REPLACE PROCEDURE xxcust_load_invoices (
    errbuf  OUT VARCHAR2,
    retcode OUT VARCHAR2,
    p_org_id IN NUMBER
) AS
    l_count NUMBER := 0;
BEGIN
    FND_FILE.PUT_LINE(FND_FILE.LOG, 'Starting invoice load for org ' || p_org_id);

    FOR r IN (SELECT * FROM xxcust_interface_stg WHERE status = 'NEW') LOOP
        -- ... validation + AP_INVOICES insert ...
        l_count := l_count + 1;
    END LOOP;

    FND_FILE.PUT_LINE(FND_FILE.OUTPUT, 'Loaded ' || l_count || ' invoices.');
    retcode := 0;
EXCEPTION
    WHEN OTHERS THEN
        errbuf  := SQLERRM;
        retcode := 2;  -- error
        FND_FILE.PUT_LINE(FND_FILE.LOG, 'FATAL: ' || SQLERRM);
END xxcust_load_invoices;
/`;

  // ---- ORACLE ERROR EXPLAINER ----------------------------------------------
  const ORA_ERRORS = {
    'ORA-00001': 'Unique constraint violated — you inserted a duplicate key. Check the PK/unique index.',
    'ORA-00904': 'Invalid identifier — a column/alias name is misspelled or not in scope.',
    'ORA-00913': 'Too many values — INSERT/SELECT column counts do not match.',
    'ORA-00942': 'Table or view does not exist — name wrong, not granted, or wrong schema/synonym.',
    'ORA-01400': 'Cannot insert NULL into a NOT NULL column.',
    'ORA-01403': 'No data found — a SELECT INTO returned zero rows (NO_DATA_FOUND).',
    'ORA-01422': 'Exact fetch returns more than one row — SELECT INTO matched multiple rows.',
    'ORA-01722': 'Invalid number — a non-numeric string was used where a number was expected.',
    'ORA-01858': 'A non-numeric character was found where a numeric was expected (date format mismatch).',
    'ORA-02291': 'Integrity constraint violated - parent key not found (FK references a missing row).',
    'ORA-04063': 'Object has errors — package/procedure is INVALID; recompile and check USER_ERRORS.',
    'ORA-06502': 'PL/SQL numeric or value error — usually a string buffer too small or bad conversion.',
    'ORA-06550': 'PL/SQL compilation error — line/column points to the syntax problem.',
    'PLS-00201': 'Identifier must be declared — missing variable, or no privilege/synonym on an object.'
  };
  function explainError(text) {
    const m = (text || '').toUpperCase().match(/(ORA|PLS)-\d{5}/);
    if (!m) return 'Paste an Oracle error code (e.g. ORA-00942 or PLS-00201) and I will explain it.';
    const exp = ORA_ERRORS[m[0]];
    return exp ? '**' + m[0] + '** — ' + exp : '**' + m[0] + '** — see Oracle Error Messages reference; check object validity and privileges.';
  }

  // ---- generate documentation header ---------------------------------------
  function document(code) {
    const u = (code || '').toUpperCase();
    let name = 'OBJECT';
    const m = u.match(/(?:PROCEDURE|FUNCTION|PACKAGE|TRIGGER)\s+(?:BODY\s+)?([A-Z0-9_$#]+)/);
    if (m) name = m[1];
    return '```sql\n' +
`/* ============================================================================
 * Name        : ${name}
 * Type        : ${(/FUNCTION/.test(u) ? 'Function' : /PACKAGE/.test(u) ? 'Package' : /TRIGGER/.test(u) ? 'Trigger' : 'Procedure')}
 * Purpose     : <describe business purpose>
 * Parameters  : <p_name  IN/OUT  type  - description>
 * Returns     : <return value / OUT description>
 * Exceptions  : <named exceptions raised>
 * --------------------------------------------------------------------------
 * Author      : <author>
 * Created     : ${todayStr()}
 * --------------------------------------------------------------------------
 * Modification History
 * Ver   Date         Author        Description
 * 1.0   ${todayStr()}   <author>      Initial version
 * ==========================================================================*/` +
      '\n```';
  }
  function todayStr() {
    // avoid Date for determinism in non-browser; in browser it's fine
    try { return new Date().toISOString().slice(0, 10); } catch (e) { return 'YYYY-MM-DD'; }
  }

  // ---- router ---------------------------------------------------------------
  function ask(intent, payload) {
    // Optional remote delegation
    if (global.AIConfig && global.AIConfig.endpoint) {
      return remoteAsk(intent, payload);
    }
    switch (intent) {
      case 'explain': return Promise.resolve(explain(payload));
      case 'review': return Promise.resolve(review(payload));
      case 'optimize': return Promise.resolve(optimize(payload));
      case 'generate': return Promise.resolve(generate(payload));
      case 'document': return Promise.resolve(document(payload));
      case 'error': return Promise.resolve(explainError(payload));
      default: return Promise.resolve(freeform(payload));
    }
  }

  function freeform(text) {
    const t = (text || '').toLowerCase();
    if (/(ora|pls)-\d{5}/.test(t)) return Promise.resolve ? explainError(text) : explainError(text);
    if (/generate|create|write/.test(t)) return generate(text);
    if (/explain/.test(t)) return 'Select code in the editor and press **Explain**, or paste it here.';
    if (/optimi[sz]e|tune|slow|performance/.test(t)) return 'Select your SQL and press **Optimize**, or paste it here.';
    return "I'm your offline Oracle assistant. Try: _generate a trigger_, _optimize this query_, _explain ORA-01422_, or select code and use the buttons above.";
  }

  function remoteAsk(intent, payload) {
    const cfg = global.AIConfig;
    return fetch(cfg.endpoint, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, cfg.headers || {}),
      body: JSON.stringify({ intent: intent, input: payload })
    }).then(function (r) { return r.json(); }).then(function (j) { return j.text || j.content || JSON.stringify(j); })
      .catch(function (e) { return '_Remote AI unavailable (' + e.message + '). Falling back to offline._\n\n' + ({ explain: explain, review: review, optimize: optimize, generate: generate, document: document, error: explainError }[intent] || freeform)(payload); });
  }

  global.OracleAI = {
    ask: ask, explain: explain, review: review, optimize: optimize,
    generate: generate, document: document, explainError: explainError
  };
})(window);
