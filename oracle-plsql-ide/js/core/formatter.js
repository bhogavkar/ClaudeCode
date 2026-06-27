/* =============================================================================
 * Oracle PL/SQL formatter.
 * A pragmatic, dependency-free pretty-printer that:
 *  - uppercases keywords
 *  - re-indents blocks (BEGIN/END, IF/END IF, LOOP, CASE, package/proc/func)
 *  - puts major SQL clauses (FROM/WHERE/GROUP BY/ORDER BY/AND/OR) on new lines
 *  - preserves strings and comments
 * Not a full grammar formatter, but produces clean, consistent output.
 * Exposed as window.OracleFormatter.format(text, opts)
 * ============================================================================= */
(function (global) {
  'use strict';

  const KW = new Set((global.OracleData.KEYWORDS)
    .concat(global.OracleData.DATATYPES)
    .concat(global.OracleData.FUNCTIONS)
    .map(function (k) { return k.toUpperCase(); }));

  // tokens that increase indent for following lines
  const INDENT_OPEN = /^(BEGIN|LOOP|IF|CASE|DECLARE)\b/i;
  // major clauses to break onto their own line
  const CLAUSE = /\b(FROM|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|CONNECT\s+BY|START\s+WITH|UNION(?:\s+ALL)?|INTERSECT|MINUS|RETURNING|INTO|VALUES|SET)\b/i;

  // Backtick is invalid in Oracle SQL, so `<idx>` placeholders never collide
  // with real content such as numeric literals (e.g. NUMBER(15,2)).
  function maskLiterals(text) {
    const store = [];
    function stash(m) { store.push(m); return '`' + (store.length - 1) + '`'; }
    text = text.replace(/\/\*[\s\S]*?\*\//g, stash);   // block comments
    text = text.replace(/--[^\n]*/g, stash);            // line comments
    text = text.replace(/'(?:''|[^'])*'/g, stash);      // strings
    return { text: text, store: store };
  }
  function unmask(text, store) {
    return text.replace(/`(\d+)`/g, function (_, i) { return store[+i]; });
  }

  function uppercaseKeywords(line) {
    return line.replace(/\b[a-z_][a-z0-9_$#]*\b/gi, function (w) {
      return KW.has(w.toUpperCase()) ? w.toUpperCase() : w;
    });
  }

  function format(text, opts) {
    opts = opts || {};
    const tab = opts.insertSpaces === false ? '\t' : ' '.repeat(opts.tabSize || 4);

    const masked = maskLiterals(text);
    let src = masked.text;

    // normalise internal whitespace
    src = src.replace(/[ \t]+/g, ' ');

    // break before major SQL clauses
    src = src.replace(CLAUSE, function (m) { return '\n' + m; });
    // AND / OR predicates onto new lines
    src = src.replace(/\s+\b(AND|OR)\b\s+/gi, '\n$1 ');
    // semicolon ends a line
    src = src.replace(/;\s*/g, ';\n');
    // block keywords on their own line
    src = src.replace(/\b(BEGIN|EXCEPTION|END\s+IF|END\s+LOOP|END\s+CASE|END)\b/gi, '\n$1');
    src = src.replace(/\b(THEN|ELSE|ELSIF|LOOP)\b/gi, '$1\n');

    const rawLines = src.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l.length; });

    let indent = 0;
    const out = [];
    rawLines.forEach(function (line) {
      let l = uppercaseKeywords(line);

      // dedent BEFORE printing
      if (/^(END\b|EXCEPTION\b|ELSE\b|ELSIF\b|WHEN\b)/i.test(l)) indent = Math.max(0, indent - 1);
      if (/^\)/.test(l)) indent = Math.max(0, indent - 1);

      // SQL sub-clauses get a hang indent
      const hang = /^(AND|OR)\b/i.test(l) ? 1 : 0;

      out.push(tab.repeat(indent + hang) + l);

      // indent AFTER printing
      if (INDENT_OPEN.test(l) || /\b(THEN|ELSE|LOOP)\s*$/i.test(l) || /\b(IS|AS)\s*$/i.test(l)) {
        if (!/^END/i.test(l)) indent++;
      }
      if (/^(EXCEPTION|ELSE|ELSIF.*THEN|WHEN.*THEN)/i.test(l)) indent++;
      if (/\($/.test(l)) indent++;
    });

    let result = out.join('\n');
    result = unmask(result, masked.store);
    // tidy excess blank lines / trailing spaces
    result = result.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n');
    return result.trimEnd() + '\n';
  }

  global.OracleFormatter = { format: format };
})(window);
