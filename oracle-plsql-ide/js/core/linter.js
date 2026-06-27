/* =============================================================================
 * Live PL/SQL linter.
 * Static, heuristic analysis that runs on every change and produces Monaco
 * markers (error / warning / info) plus an issues list for the Problems panel.
 * Detects structural, style, performance and security issues.
 * Exposed as window.OracleLinter.analyze(model, monaco) -> {markers, issues}
 * ============================================================================= */
(function (global) {
  'use strict';

  function stripComments(line) {
    return line.replace(/--.*$/, '').replace(/'(?:''|[^'])*'/g, "''");
  }

  // Block matcher: pushes openers, expects matching END forms
  function checkBlockBalance(lines, push) {
    const stack = [];
    lines.forEach(function (raw, idx) {
      const line = stripComments(raw);
      const upper = line.toUpperCase();

      // openers
      let m;
      const reIf = /\bIF\b/g;
      while ((m = reIf.exec(upper))) {
        // ignore END IF and ELSIF
        const pre = upper.slice(Math.max(0, m.index - 4), m.index);
        if (!/END\s$/.test(pre) && !/ELS$/.test(pre)) stack.push({ type: 'IF', line: idx, col: m.index + 1 });
      }
      if (/\bLOOP\b/.test(upper) && !/END\s+LOOP/.test(upper)) stack.push({ type: 'LOOP', line: idx, col: upper.indexOf('LOOP') + 1 });
      if (/\bCASE\b/.test(upper) && !/END\s+CASE/.test(upper) && !/END\s*;/.test(upper)) {
        // CASE used as expression often ends with END (not END CASE) — track loosely
        stack.push({ type: 'CASE', line: idx, col: upper.indexOf('CASE') + 1 });
      }
      if (/\bBEGIN\b/.test(upper)) stack.push({ type: 'BEGIN', line: idx, col: upper.indexOf('BEGIN') + 1 });

      // closers
      if (/\bEND\s+IF\b/.test(upper)) popExpect(stack, 'IF', idx, push, 'END IF');
      else if (/\bEND\s+LOOP\b/.test(upper)) popExpect(stack, 'LOOP', idx, push, 'END LOOP');
      else if (/\bEND\s+CASE\b/.test(upper)) popExpect(stack, 'CASE', idx, push, 'END CASE');
      else if (/\bEND\b/.test(upper)) {
        // generic END closes BEGIN or CASE expression
        if (stack.length) stack.pop();
      }
    });

    // anything left open is unterminated
    stack.forEach(function (s) {
      const need = s.type === 'BEGIN' ? 'END;' : 'END ' + s.type;
      push(s.line, s.col, s.col + s.type.length, 'error',
        'Unterminated ' + s.type + ' block — missing ' + need + '.', 'PLS-block');
    });
  }

  function popExpect(stack, type, idx, push, label) {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].type === type) { stack.splice(i, 1); return; }
    }
    push(idx, 1, 80, 'error', 'Stray ' + label + ' with no matching ' + type + '.', 'PLS-block');
  }

  const LINE_RULES = [
    {
      // SELECT without FROM on same logical line (simple heuristic)
      test: function (u) { return /\bSELECT\b/.test(u) && !/\bFROM\b/.test(u) && !/\bINTO\b/.test(u) && /;/.test(u) && !/\bDUAL\b/.test(u); },
      sev: 'warning', code: 'SQL-from', msg: 'SELECT statement appears to have no FROM clause.'
    },
    {
      test: function (u) { return /\bIF\b/.test(u) && !/\bTHEN\b/.test(u) && /;\s*$/.test(u) && !/END\s+IF/.test(u); },
      sev: 'warning', code: 'PLS-then', msg: 'IF statement may be missing THEN.'
    },
    {
      // commit/rollback inside loop is detected at block scope below; here flag SELECT INTO w/o exception nearby is hard -> skip
      test: function (u) { return /\bUPDATE\b/.test(u) && !/\bWHERE\b/.test(u) && /;/.test(u); },
      sev: 'warning', code: 'SQL-where-upd', msg: 'UPDATE without WHERE affects every row.'
    },
    {
      test: function (u) { return /\bDELETE\b/.test(u) && /\bFROM\b/.test(u) && !/\bWHERE\b/.test(u) && /;/.test(u); },
      sev: 'warning', code: 'SQL-where-del', msg: 'DELETE without WHERE removes every row.'
    },
    {
      test: function (u) { return /=\s*NULL\b/.test(u) || /!=\s*NULL\b/.test(u) || /<>\s*NULL\b/.test(u); },
      sev: 'warning', code: 'PLS-null', msg: 'Comparison with = NULL is always FALSE — use IS NULL / IS NOT NULL.'
    },
    {
      test: function (u) { return /\bSELECT\s+\*/.test(u); },
      sev: 'info', code: 'SQL-star', msg: 'Avoid SELECT * — list explicit columns for stability and performance.'
    },
    {
      test: function (u, raw) { return /\bWHERE\b/.test(u) && /=\s*'\w+'/.test(raw) && /\b(AP_|AR_|GL_|PO_|MTL_|FND_)/.test(u); },
      sev: 'info', code: 'STD-hardcode', msg: 'Possible hardcoded literal in EBS query — consider a lookup/profile value.'
    },
    {
      test: function (u) { return /\|\|\s*['"]?\s*$|=\s*['"]\s*\|\|/.test(u) && /EXECUTE\s+IMMEDIATE/.test(u); },
      sev: 'error', code: 'SEC-inject', msg: 'Dynamic SQL built by concatenation — SQL injection risk. Use bind variables.'
    },
    {
      test: function (u) { return /\bEXECUTE\s+IMMEDIATE\b/.test(u) && /\|\|/.test(u); },
      sev: 'warning', code: 'SEC-inject2', msg: 'EXECUTE IMMEDIATE with concatenation — prefer USING bind variables.'
    },
    {
      test: function (u) { return /\bGOTO\b/.test(u); },
      sev: 'info', code: 'STD-goto', msg: 'GOTO reduces readability — consider structured control flow.'
    },
    {
      test: function (u) { return /\bDBMS_OUTPUT\.PUT_LINE\b/.test(u); },
      sev: 'info', code: 'STD-dbmsout', msg: 'DBMS_OUTPUT used — ensure this is removed or guarded for production / use FND_FILE in EBS.'
    }
  ];

  function analyze(model, monaco) {
    const text = model.getValue();
    const lines = text.split('\n');
    const markers = [];
    const issues = [];

    function push(lineIdx, startCol, endCol, sev, msg, code) {
      const severity = sev === 'error' ? monaco.MarkerSeverity.Error
        : sev === 'warning' ? monaco.MarkerSeverity.Warning
          : monaco.MarkerSeverity.Info;
      markers.push({
        startLineNumber: lineIdx + 1, startColumn: startCol,
        endLineNumber: lineIdx + 1, endColumn: endCol,
        message: msg, severity: severity, code: code, source: 'plsql'
      });
      issues.push({ line: lineIdx + 1, col: startCol, sev: sev, msg: msg, code: code });
    }

    // per-line rules
    let inLoop = 0;
    lines.forEach(function (raw, idx) {
      const u = stripComments(raw).toUpperCase();
      if (/\bLOOP\b/.test(u) && !/END\s+LOOP/.test(u)) inLoop++;
      if (/\bEND\s+LOOP\b/.test(u)) inLoop = Math.max(0, inLoop - 1);

      // commit/rollback inside loop
      if (inLoop > 0 && /\b(COMMIT|ROLLBACK)\b/.test(u)) {
        const c = u.search(/\b(COMMIT|ROLLBACK)\b/) + 1;
        push(idx, c, c + 6, 'warning', 'COMMIT/ROLLBACK inside a loop hurts performance and breaks read consistency.', 'PERF-commit-loop');
      }

      LINE_RULES.forEach(function (r) {
        if (r.test(u, raw)) {
          push(idx, 1, Math.min(raw.length + 1, 200), r.sev, r.msg, r.code);
        }
      });
    });

    // structural block balance
    checkBlockBalance(lines, push);

    // unused variable heuristic (declared but referenced only once)
    detectUnused(text, lines, push);

    return { markers: markers, issues: issues };
  }

  function detectUnused(text, lines, push) {
    const reDecl = /^\s*([a-z][a-z0-9_$#]*)\s+(?:CONSTANT\s+)?(?:NUMBER|VARCHAR2|CHAR|DATE|BOOLEAN|PLS_INTEGER|INTEGER|CLOB|BLOB|TIMESTAMP)\b/i;
    lines.forEach(function (raw, idx) {
      const m = raw.match(reDecl);
      if (!m) return;
      const name = m[1];
      // skip obvious params (inside parens) — rough check
      if (/\(/.test(raw) && !/\)\s*$/.test(raw)) return;
      const re = new RegExp('\\b' + name.replace(/[$#]/g, '\\$&') + '\\b', 'gi');
      const count = (text.match(re) || []).length;
      if (count <= 1) {
        push(idx, raw.indexOf(name) + 1, raw.indexOf(name) + 1 + name.length, 'info',
          'Variable "' + name + '" is declared but never used.', 'PLS-unused');
      }
    });
  }

  global.OracleLinter = { analyze: analyze };
})(window);
