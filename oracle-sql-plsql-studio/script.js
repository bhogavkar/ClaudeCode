/* =========================================================
   Oracle SQL & PL/SQL Formatter, Comparator & Merge Studio
   script.js — pure vanilla ES2023, no dependencies.
   ========================================================= */
"use strict";

const OracleStudio = {};

/* =========================================================
   1. LANGUAGE DATA
   ========================================================= */
OracleStudio.Lang = (() => {

  const KEYWORDS = new Set(`
    SELECT INSERT UPDATE DELETE MERGE FROM WHERE GROUP BY HAVING ORDER
    UNION ALL MINUS INTERSECT WITH AS INTO VALUES SET DISTINCT UNIQUE
    JOIN INNER OUTER LEFT RIGHT FULL CROSS NATURAL ON USING
    CONNECT START WITH PRIOR NOCYCLE SIBLINGS
    CASE WHEN THEN ELSE END IF ELSIF WHILE LOOP FOR EXIT CONTINUE RETURN
    DECLARE BEGIN EXCEPTION RAISE PRAGMA AUTONOMOUS_TRANSACTION
    PACKAGE BODY PROCEDURE FUNCTION IS AS CURSOR TYPE RECORD TABLE
    EXECUTE IMMEDIATE FORALL BULK COLLECT PIPELINED DETERMINISTIC
    TRIGGER BEFORE AFTER INSTEAD OF EACH ROW STATEMENT
    CREATE ALTER DROP REPLACE OR NOT NULL DEFAULT CHECK CONSTRAINT
    PRIMARY KEY FOREIGN REFERENCES UNIQUE INDEX SEQUENCE VIEW
    MATERIALIZED SYNONYM GRANT REVOKE COMMIT ROLLBACK SAVEPOINT
    TO FROM IN OUT NOCOPY VARCHAR2 NUMBER DATE TIMESTAMP BOOLEAN
    PLS_INTEGER BINARY_INTEGER CLOB BLOB CHAR LONG RAW ROWID XMLTYPE
    AND OR NOT LIKE BETWEEN EXISTS ANY ALL SOME IS NULL ASC DESC
    NULLS FIRST LAST OVER PARTITION ROWS RANGE PRECEDING FOLLOWING
    UNBOUNDED CURRENT ROW WINDOW LIMIT OFFSET FETCH NEXT ONLY TIES
    PIVOT UNPIVOT MODEL XMLTABLE JSON_TABLE COLUMNS DIMENSION
    RETURNING BULK OTHERS
    OPEN CLOSE FETCH INTO EXCEPTION_INIT PRAGMA AUTONOMOUS_TRANSACTION
    LANGUAGE TRUSTED WRAPPED AUTHID CURRENT_USER DEFINER
    GLOBAL TEMPORARY ON COMMIT PRESERVE ROWS DELETE ROWS
    PARALLEL NOPARALLEL APPEND NOAPPEND FULL HASH USE_NL USE_HASH
    LEADING ORDERED FIRST_ROWS ALL_ROWS NO_MERGE NO_INDEX INDEX_FFS
    GOTO NULL TRUE FALSE MATCHED
  `.trim().split(/\s+/));

  const DATATYPES = new Set(`VARCHAR2 NUMBER DATE TIMESTAMP BOOLEAN PLS_INTEGER BINARY_INTEGER
    CLOB BLOB CHAR NCHAR NVARCHAR2 LONG RAW ROWID XMLTYPE INTEGER FLOAT
    REAL DOUBLE INTERVAL YEAR MONTH DAY SECOND SIMPLE_INTEGER UROWID
    BFILE JSON`.trim().split(/\s+/));

  const BUILTIN_FUNCS = new Set(`
    NVL NVL2 COALESCE DECODE CAST CONVERT TO_CHAR TO_DATE TO_NUMBER TO_TIMESTAMP
    TRUNC ROUND MOD ABS SIGN POWER SQRT EXP LN LOG GREATEST LEAST
    SUBSTR SUBSTRB INSTR INSTRB LENGTH LENGTHB LOWER UPPER INITCAP
    LPAD RPAD LTRIM RTRIM TRIM REPLACE TRANSLATE CONCAT
    LISTAGG WM_CONCAT RANK DENSE_RANK ROW_NUMBER NTILE LAG LEAD
    FIRST_VALUE LAST_VALUE RATIO_TO_REPORT PERCENT_RANK CUME_DIST
    COUNT SUM AVG MIN MAX VARIANCE STDDEV MEDIAN
    SYS_CONTEXT USERENV DBMS_OUTPUT.PUT_LINE DBMS_LOB DBMS_SQL
    EXTRACT REGEXP_LIKE REGEXP_SUBSTR REGEXP_REPLACE REGEXP_INSTR REGEXP_COUNT
    XMLELEMENT XMLAGG XMLFOREST XMLCONCAT XMLQUERY XMLCAST XMLPARSE
    JSON_VALUE JSON_QUERY JSON_OBJECT JSON_ARRAY JSON_EXISTS JSON_ARRAYAGG
    SYSDATE SYSTIMESTAMP CURRENT_DATE CURRENT_TIMESTAMP USER UID UID
    NUMTODSINTERVAL NUMTOYMINTERVAL ADD_MONTHS MONTHS_BETWEEN LAST_DAY NEXT_DAY
    RAWTOHEX HEXTORAW CHR ASCII TO_MULTI_BYTE TO_SINGLE_BYTE
    EMPTY_CLOB EMPTY_BLOB RAISE_APPLICATION_ERROR DBMS_OUTPUT.PUT_LINE
    DBMS_OUTPUT.NEW_LINE UTL_FILE UTL_RAW SQLCODE SQLERRM SIMPLE_INTEGER
  `.trim().split(/\s+/));

  const EXCEPTIONS = new Set(`
    NO_DATA_FOUND TOO_MANY_ROWS INVALID_CURSOR CURSOR_ALREADY_OPEN
    DUP_VAL_ON_INDEX ZERO_DIVIDE VALUE_ERROR INVALID_NUMBER
    STORAGE_ERROR PROGRAM_ERROR ROWTYPE_MISMATCH NOT_LOGGED_ON
    LOGIN_DENIED TIMEOUT_ON_RESOURCE TRANSACTION_BACKED_OUT
    SUBSCRIPT_BEYOND_COUNT SUBSCRIPT_OUTSIDE_LIMIT COLLECTION_IS_NULL
    SELF_IS_NULL ACCESS_INTO_NULL CASE_NOT_FOUND OTHERS
  `.trim().split(/\s+/));

  const BLOCK_OPENERS = new Set(["BEGIN", "DECLARE", "PACKAGE", "PROCEDURE", "FUNCTION", "TRIGGER", "CURSOR", "TYPE", "IF", "LOOP", "CASE", "FOR", "WHILE"]);

  const EBS_MODULES = {
    AP: "Payables", AR: "Receivables", PO: "Purchasing", INV: "Inventory",
    GL: "General Ledger", FA: "Fixed Assets", CE: "Cash Management",
    IBY: "Payments (iByPay)", XLA: "Subledger Accounting", HR: "Human Resources",
    PER: "Human Resources (Person)", ONT: "Order Management", OE: "Order Entry",
    WSH: "Shipping Execution", BOM: "Bills of Material", WIP: "Work in Process",
    MSC: "Supply Chain Planning", QP: "Advanced Pricing", FND: "Foundation (FND)",
    AME: "Approvals Management", WF: "Workflow", XDO: "XML Publisher (BI Publisher)"
  };

  // Regex for a WHO column (audit) set — case-insensitive whole-word.
  const WHO_COLUMNS = /\b(CREATED_BY|CREATION_DATE|LAST_UPDATED_BY|LAST_UPDATE_DATE|LAST_UPDATE_LOGIN|PROGRAM_APPLICATION_ID|PROGRAM_ID|PROGRAM_UPDATE_DATE|REQUEST_ID)\b/i;

  const EBS_PREFIX_RE = /\b(XX[A-Z0-9_]*|APPS|AP|AR|PO|INV|GL|FA|CE|IBY|XLA|HR|PER|ONT|OE|WSH|BOM|WIP|MSC|QP|FND|AME|WF|XDO)_[A-Z0-9_]+\b/gi;

  return { KEYWORDS, DATATYPES, BUILTIN_FUNCS, EXCEPTIONS, BLOCK_OPENERS, EBS_MODULES, WHO_COLUMNS, EBS_PREFIX_RE };
})();

/* =========================================================
   2. LEXER — Oracle SQL / PL/SQL tokenizer
   ========================================================= */
OracleStudio.Lexer = class Lexer {
  // Token types: kw, func, ident, str, num, com_line, com_block, op, punct, ws, nl, hint, bind, exc, ddl, todo
  static tokenize(src) {
    const tokens = [];
    const n = src.length;
    let i = 0;
    let line = 1;

    const peek = (o = 0) => src[i + o];
    const isDigit = c => c >= "0" && c <= "9";
    const isIdentStart = c => c && /[A-Za-z_#$]/.test(c);
    const isIdentPart = c => c && /[A-Za-z0-9_#$]/.test(c);

    while (i < n) {
      const c = src[i];

      // Newline
      if (c === "\n") { tokens.push({ type: "nl", text: "\n", line }); i++; line++; continue; }

      // Whitespace (spaces/tabs/CR)
      if (c === " " || c === "\t" || c === "\r") {
        let j = i; while (j < n && (src[j] === " " || src[j] === "\t" || src[j] === "\r")) j++;
        tokens.push({ type: "ws", text: src.slice(i, j), line }); i = j; continue;
      }

      // Optimizer hint /*+ ... */
      if (c === "/" && peek(1) === "*" && peek(2) === "+") {
        let j = i + 3; while (j < n && !(src[j] === "*" && src[j + 1] === "/")) j++;
        j = Math.min(j + 2, n);
        const text = src.slice(i, j);
        tokens.push({ type: "hint", text, line: line + countNl(text) === line ? line : line });
        line += countNl(text); i = j; continue;
      }

      // Block comment
      if (c === "/" && peek(1) === "*") {
        let j = i + 2; while (j < n && !(src[j] === "*" && src[j + 1] === "/")) j++;
        j = Math.min(j + 2, n);
        const text = src.slice(i, j);
        tokens.push({ type: "com_block", text, line });
        line += countNl(text); i = j; continue;
      }

      // Line comment
      if (c === "-" && peek(1) === "-") {
        let j = i; while (j < n && src[j] !== "\n") j++;
        tokens.push({ type: "com_line", text: src.slice(i, j), line });
        i = j; continue;
      }

      // Q-quoted string  q'[...]'  q'{...}' q'<...>' q'(...)'
      if ((c === "q" || c === "Q") && peek(1) === "'" && /[\[\{\(\<!#\|]/.test(peek(2) || "")) {
        const open = peek(2);
        const close = { "[": "]", "{": "}", "(": ")", "<": ">" }[open] || open;
        let j = i + 3; let text = src.slice(i, i + 3);
        while (j < n) {
          if (src[j] === close && src[j + 1] === "'") { text += src.slice(j, j + 2); j += 2; break; }
          text += src[j]; j++;
        }
        tokens.push({ type: "str", text, line });
        line += countNl(text); i = j; continue;
      }

      // String literal '....' with '' escape
      if (c === "'") {
        let j = i + 1;
        while (j < n) { if (src[j] === "'" && src[j + 1] === "'") { j += 2; continue; } if (src[j] === "'") { j++; break; } j++; }
        const text = src.slice(i, j);
        tokens.push({ type: "str", text, line });
        line += countNl(text); i = j; continue;
      }

      // Quoted identifier "...."
      if (c === '"') {
        let j = i + 1; while (j < n && src[j] !== '"') j++;
        j = Math.min(j + 1, n);
        tokens.push({ type: "ident", text: src.slice(i, j), line, quoted: true });
        i = j; continue;
      }

      // Bind variable :name or :"name" or positional :1
      if (c === ":" && /[A-Za-z0-9_"]/.test(peek(1) || "")) {
        let j = i + 1; while (j < n && isIdentPart(src[j])) j++;
        tokens.push({ type: "bind", text: src.slice(i, j), line }); i = j; continue;
      }

      // Numbers (incl. decimals, exponents, trailing f/d)
      if (isDigit(c) || (c === "." && isDigit(peek(1) || ""))) {
        let j = i; while (j < n && isDigit(src[j])) j++;
        if (src[j] === ".") { j++; while (j < n && isDigit(src[j])) j++; }
        if (src[j] === "e" || src[j] === "E") { j++; if (src[j] === "+" || src[j] === "-") j++; while (j < n && isDigit(src[j])) j++; }
        if (src[j] === "f" || src[j] === "F" || src[j] === "d" || src[j] === "D") j++;
        tokens.push({ type: "num", text: src.slice(i, j), line }); i = j; continue;
      }

      // Identifiers / keywords / package.qualified names
      if (isIdentStart(c)) {
        let j = i; while (j < n && isIdentPart(src[j])) j++;
        let text = src.slice(i, j);
        const upper = text.toUpperCase();
        let type = "ident";
        if (upper === "TODO" || upper === "FIXME") type = "todo";
        else if (OracleStudio.Lang.EXCEPTIONS.has(upper)) type = "exc";
        else if (OracleStudio.Lang.DATATYPES.has(upper)) type = "kw";
        else if (OracleStudio.Lang.KEYWORDS.has(upper)) type = "kw";
        else if (OracleStudio.Lang.BUILTIN_FUNCS.has(upper)) type = "func";
        else {
          // lookahead: identifier followed by '(' => function/procedure call
          let k = j; while (k < n && (src[k] === " " || src[k] === "\t")) k++;
          if (src[k] === "(") type = "func";
        }
        tokens.push({ type, text, line, upper }); i = j; continue;
      }

      // Operators / punctuation clusters
      const three = src.substr(i, 3);
      const two = src.substr(i, 2);
      if ([":=", "=>", "||", "<=", ">=", "<>", "!=", "..", "**"].includes(two)) {
        tokens.push({ type: "op", text: two, line }); i += 2; continue;
      }
      if (/[=<>+\-*/%!~^]/.test(c)) { tokens.push({ type: "op", text: c, line }); i++; continue; }
      if (/[(),;.]/.test(c)) { tokens.push({ type: "punct", text: c, line }); i++; continue; }
      if (c === "@") { tokens.push({ type: "op", text: c, line }); i++; continue; }

      // Fallback — unknown char, keep as punct so nothing is lost
      tokens.push({ type: "punct", text: c, line }); i++;
    }

    function countNl(text) { let k = 0; for (const ch of text) if (ch === "\n") k++; return k; }
    return tokens;
  }
};
/* =========================================================
   3. FORMATTER — statement/block aware pretty printer
   ========================================================= */
OracleStudio.Formatter = (() => {
  const L = OracleStudio.Lang;

  const STYLE_PRESETS = {
    classic:    { indentSize: 2, selectListMode: "stacked", commaStyle: "trailing", align: true,  blankBetweenClauses: false, minimalMode: false },
    enterprise: { indentSize: 2, selectListMode: "stacked", commaStyle: "trailing", align: true,  blankBetweenClauses: true,  minimalMode: false },
    compact:    { indentSize: 2, selectListMode: "auto",    commaStyle: "trailing", align: false, blankBetweenClauses: false, minimalMode: false },
    minimal:    { indentSize: 2, selectListMode: "auto",    commaStyle: "trailing", align: false, blankBetweenClauses: false, minimalMode: true  },
    modern:     { indentSize: 2, selectListMode: "stacked", commaStyle: "leading",  align: true,  blankBetweenClauses: false, minimalMode: false },
    custom:     { indentSize: 2, selectListMode: "stacked", commaStyle: "trailing", align: true,  blankBetweenClauses: false, minimalMode: false }
  };

  // NOTE: END+IF/LOOP/CASE and CROSS/NATURAL+JOIN are deliberately NOT combined here —
  // they are handled token-by-token in dedicated switch cases so lookahead stays precise.
  const TWO_WORD = {
    "GROUP,BY": "GROUP BY", "ORDER,BY": "ORDER BY", "START,WITH": "START WITH",
    "CONNECT,BY": "CONNECT BY", "UNION,ALL": "UNION ALL", "PACKAGE,BODY": "PACKAGE BODY",
    "INSTEAD,OF": "INSTEAD OF", "NULLS,FIRST": "NULLS FIRST", "NULLS,LAST": "NULLS LAST",
    "WHEN,MATCHED": "WHEN MATCHED", "WHEN,NOT": "WHEN NOT", "PARTITION,BY": "PARTITION BY"
  };

  const CLAUSE_KEYWORDS = new Set(["SELECT", "FROM", "WHERE", "HAVING", "ORDER", "GROUP", "CONNECT", "START",
    "UNION", "MINUS", "INTERSECT", "WITH", "SET", "VALUES", "RETURNING", "USING", "INTO", "MODEL"]);

  const JOIN_LEAD = new Set(["JOIN", "INNER", "LEFT", "RIGHT", "FULL", "CROSS", "NATURAL"]);

  function isKw(t, word) { return t && t.type === "kw" && t.upper === word; }
  function upperize(t, cfg) {
    if (!cfg.uppercase) return t.text;
    if (t.type === "kw" || t.type === "exc" || t.type === "ddl") return t.text.toUpperCase();
    if (t.type === "func" && /^[A-Z_.]+$/i.test(t.text) && L.BUILTIN_FUNCS.has(t.upper)) return t.text.toUpperCase();
    return t.text;
  }

  class Printer {
    constructor(tokens, cfg) {
      this.toks = tokens;
      this.n = tokens.length;
      this.pos = 0;
      this.cfg = cfg;
      this.lines = [];
      this.cur = "";
      this.depth = 0;
      this.stmtBase = 0;      // indent level of the statement currently being printed
      this.inCondition = false; // true while inside WHERE/HAVING/ON/START WITH/CONNECT BY/IF-cond/etc.
      this.condStack = [];    // pairs conditional openers (IF/WHILE/CASEWHEN/EXC) with their closing THEN/LOOP
      this.betweenPending = 0;
      this.caseDepth = 0;
      this.pendingIsPush = null; // null=inline-only (alias/IS NULL), "temp"=CURSOR, "permanent"=proc/func/pkg/trigger
      this.blockStack = [];   // {opener}
      this.parenStack = [];   // {kind, savedDepth, savedStmtBase, savedInCondition, savedCondStack, savedClause}
      this.atLineStart = true;
      this.clauseCol = [];    // stack of {active} for comma-separated column/assignment lists
      this.markGlueNext = false;
    }

    indentStr(extra = 0) { return " ".repeat(this.cfg.indentSize * Math.max(0, this.depth + extra)); }

    newline(extra = 0) {
      this.lines.push(this.cur.replace(/[ \t]+$/, ""));
      this.cur = this.indentStr(extra);
      this.atLineStart = true;
    }

    blankLine() {
      if (this.lines.length && this.lines[this.lines.length - 1] === "" ) return;
      this.newline();
      this.lines.push("");
    }

    write(s, glueLeft) {
      if (s === "") return;
      // A pending "glue" flag (set by a preceding '(' , '.', or unary sign) always applies to
      // whichever token is written next, no matter which code path produced that token — so it
      // must be drained here, not just by the default token-handling branch.
      const glue = glueLeft || this.markGlueNext;
      this.markGlueNext = false;
      if (!this.atLineStart && this.cur.length && !glue && !/[ \t]$/.test(this.cur)) this.cur += " ";
      this.cur += s;
      this.atLineStart = false;
    }

    peek(o = 0) { return this.toks[this.pos + o]; }
    cur_() { return this.toks[this.pos]; }

    // Combine multi-word keyword sequences into a single logical unit text, returns {text, upper, count}
    lookAheadPhrase() {
      const t0 = this.peek();
      if (!t0 || t0.type !== "kw") return null;
      const t1 = this.peek(1);
      if (t1 && t1.type === "kw") {
        const key = t0.upper + "," + t1.upper;
        if (TWO_WORD[key]) return { upper: TWO_WORD[key].replace(" ", ""), count: 2, phrase: TWO_WORD[key] };
      }
      return { upper: t0.upper, count: 1, phrase: t0.text.toUpperCase() };
    }

    run() {
      while (this.pos < this.n) this.step();
      this.lines.push(this.cur.replace(/[ \t]+$/, ""));
      let text = this.lines.join("\n");
      if (this.cfg.collapseBlank) text = text.replace(/\n{3,}/g, "\n\n");
      text = text.replace(/[ \t]+\n/g, "\n").replace(/\n+$/g, "\n").trim() + "\n";
      return text;
    }

    step() {
      const t = this.cur_();
      const cfg = this.cfg;

      if (t.blankBefore && cfg.blankBetweenClauses !== false && !this.atLineStart) {
        // handled per-keyword below; fallthrough
      }

      switch (t.type) {
        case "com_line": {
          if (!this.atLineStart) this.write(t.text);
          else { this.cur += t.text; }
          this.newline();
          this.pos++;
          return;
        }
        case "com_block": case "hint": {
          const cls = t.type === "hint" ? "hint" : "com";
          this.write(t.text);
          this.pos++;
          return;
        }
        case "todo": {
          this.write(t.text);
          this.pos++;
          return;
        }
      }

      if (t.type === "punct" && t.text === ";") {
        this.write(";", true);
        this.pos++;
        // Hard reset: whatever clause-level indent drift happened during this statement is
        // discarded — depth snaps back to the true PL/SQL block nesting level.
        this.depth = this.blockStack.length;
        this.inCondition = false;
        this.condStack = [];
        this.betweenPending = 0;
        this.clauseCol = [];
        this.pendingIsPush = null;
        this.newline();
        return;
      }
      if (t.type === "punct" && t.text === ",") {
        if (cfg.commaStyle === "leading") {
          this.newline();
          this.write(",", false);
        } else {
          this.write(",", true);
          if (this.inColumnList()) this.newline();
        }
        this.pos++;
        return;
      }
      if (t.type === "punct" && t.text === ".") {
        this.write(".", true);
        this.pos++;
        this.markGlueNext = true;
        return;
      }
      if (t.type === "punct" && t.text === "(") { this.openParen(); return; }
      if (t.type === "punct" && t.text === ")") { this.closeParen(); return; }

      if (t.type === "kw") { this.handleKeyword(); return; }

      // default: identifiers, functions, strings, numbers, operators, bind vars, exceptions
      let glueLeft = this.markGlueNext || false;
      this.markGlueNext = false;
      const text = upperize(t, cfg);

      if (t.type === "op" && (t.text === "-" || t.text === "+")) {
        const prev = this.toks[this.pos - 1];
        const isUnary = !prev || prev.type === "op" || (prev.type === "punct" && prev.text !== ")") || prev.type === "kw";
        this.write(text, glueLeft);
        if (isUnary) this.markGlueNext = true;
        this.pos++;
        return;
      }

      this.write(text, glueLeft);
      this.pos++;
    }

    inColumnList() {
      const top = this.parenStack[this.parenStack.length - 1];
      if (top && (top.kind === "call" || top.kind === "group")) return false;
      return this.clauseCol.length > 0 && this.clauseCol[this.clauseCol.length - 1].active;
    }

    openParen() {
      const prev = this.toks[this.pos - 1];
      const next = this.peek(1);
      let kind = "group";
      if (prev && (prev.type === "func" || (prev.type === "ident" && !prev.quoted) || (prev.type === "kw" && L.DATATYPES.has(prev.upper)))) kind = "call";
      const isSubquery = next && next.type === "kw" && (next.upper === "SELECT" || next.upper === "WITH");
      if (isSubquery) kind = "subquery";
      this.write("(", kind === "call");
      this.parenStack.push({
        kind, savedDepth: this.depth, savedClause: this.clauseCol.slice(),
        savedStmtBase: this.stmtBase, savedInCondition: this.inCondition, savedCondStack: this.condStack.slice()
      });
      if (kind === "subquery") {
        this.depth++;
        this.newline();
        this.clauseCol = [];
        this.inCondition = false;
        this.condStack = [];
      }
      this.pos++;
      this.markGlueNext = true;
    }

    closeParen() {
      const top = this.parenStack.pop() || { kind: "group", savedDepth: this.depth, savedClause: [], savedStmtBase: this.stmtBase, savedInCondition: false, savedCondStack: [] };
      if (top.kind === "subquery") {
        this.depth = top.savedDepth;
        this.clauseCol = top.savedClause;
        // Only break to a new line if the subquery was a FROM-clause style block. A scalar
        // subquery used inline within a column/condition list should keep its closing ')'
        // (and whatever alias/operator follows it) on the same line.
        const inList = this.clauseCol.length && this.clauseCol[this.clauseCol.length - 1].active;
        if (!inList) this.newline();
      }
      this.stmtBase = top.savedStmtBase;
      this.inCondition = top.savedInCondition;
      this.condStack = top.savedCondStack;
      this.write(")", true);
      this.pos++;
    }

    pushBlock(opener) { this.blockStack.push({ opener }); this.depth++; }
    popBlock() {
      const fr = this.blockStack.pop();
      this.depth = Math.max(0, this.depth - 1);
      return fr;
    }
    popBranchIfOpen() {
      const top = this.blockStack[this.blockStack.length - 1];
      if (top && top.opener === "THENBODY") this.popBlock();
    }

    handleKeyword() {
      const cfg = this.cfg;
      const t = this.cur_();
      const ph = this.lookAheadPhrase();
      const word = ph.phrase;
      const upper = ph.upper;

      switch (upper) {
        case "SELECT": {
          this.stmtBase = this.depth;
          this.inCondition = false;
          this.newlineIfNeeded();
          this.write("SELECT");
          this.consumeOptionalModifiers(["DISTINCT", "UNIQUE", "ALL"]);
          const stacked = cfg.selectListMode !== "compact";
          this.clauseCol.push({ active: stacked });
          if (stacked) { this.depth = this.stmtBase + 1; this.newline(); }
          this.advance(ph.count);
          return;
        }
        case "INSERT": case "UPDATE": case "DELETE": case "MERGE": {
          this.stmtBase = this.depth;
          this.inCondition = false;
          this.newlineIfNeeded();
          this.write(t.text.toUpperCase());
          this.pos++;
          return;
        }
        case "FROM": {
          this.closeColumnListIfOpen();
          this.inCondition = false;
          this.depth = this.stmtBase;
          this.newline();
          this.write("FROM");
          this.depth = this.stmtBase + 1;
          this.newline();
          this.pos += ph.count;
          return;
        }
        case "WHERE": case "HAVING": case "CONNECTBY": case "STARTWITH": {
          this.closeColumnListIfOpen();
          this.depth = this.stmtBase;
          this.newline();
          this.write(word);
          this.depth = this.stmtBase + 1;
          this.newline();
          this.inCondition = true;
          this.pos += ph.count;
          return;
        }
        case "GROUPBY": case "ORDERBY": {
          this.closeColumnListIfOpen();
          this.inCondition = false;
          this.depth = this.stmtBase;
          this.newline();
          this.write(word);
          this.depth = this.stmtBase + 1;
          this.clauseCol.push({ active: true });
          this.newline();
          this.pos += ph.count;
          return;
        }
        case "RETURNING": case "MODEL": {
          this.closeColumnListIfOpen();
          this.inCondition = false;
          this.depth = this.stmtBase;
          this.newline();
          this.write(word);
          this.depth = this.stmtBase + 1;
          this.clauseCol.push({ active: true });
          this.newline();
          this.pos += ph.count;
          return;
        }
        case "SET": {
          this.closeColumnListIfOpen();
          this.inCondition = false;
          this.depth = this.stmtBase;
          this.newline();
          this.write("SET");
          this.depth = this.stmtBase + 1;
          this.clauseCol.push({ active: true });
          this.newline();
          this.pos += ph.count;
          return;
        }
        case "VALUES": {
          this.closeColumnListIfOpen();
          this.depth = this.stmtBase;
          this.newline();
          this.write("VALUES");
          this.pos += ph.count;
          return;
        }
        case "INTO": {
          const prev = this.toks[this.pos - 1];
          const inline = prev && prev.type === "kw" && (prev.upper === "INSERT" || prev.upper === "COLLECT" || prev.upper === "MERGE");
          if (inline) { this.write("INTO"); this.pos += ph.count; return; }
          this.closeColumnListIfOpen();
          this.depth = this.stmtBase;
          this.newline();
          this.write("INTO");
          this.depth = this.stmtBase + 1;
          this.clauseCol.push({ active: true });
          this.newline();
          this.pos += ph.count;
          return;
        }
        case "USING": {
          this.depth = this.stmtBase;
          this.newline();
          this.write("USING");
          this.pos += ph.count;
          return;
        }
        case "WITH": {
          this.stmtBase = this.depth;
          this.newlineIfNeeded();
          this.write("WITH");
          this.depth = this.stmtBase + 1;
          this.newline();
          this.pos += ph.count;
          return;
        }
        case "UNION": case "MINUS": case "INTERSECT": {
          this.closeColumnListIfOpen();
          this.inCondition = false;
          this.depth = this.stmtBase;
          this.newline();
          this.write(word);
          this.newline();
          this.pos += ph.count;
          return;
        }
        case "JOIN": {
          const prev = this.toks[this.pos - 1];
          const prevIsModifier = prev && prev.type === "kw" && ["INNER", "LEFT", "RIGHT", "FULL", "CROSS", "NATURAL"].includes(prev.upper);
          this.depth = this.stmtBase + 1;
          if (!prevIsModifier) this.newline();
          this.write("JOIN");
          this.pos++;
          return;
        }
        case "INNER": case "LEFT": case "RIGHT": case "FULL": case "CROSS": case "NATURAL": {
          this.depth = this.stmtBase + 1;
          this.newline();
          this.write(t.text.toUpperCase());
          this.pos++;
          return;
        }
        case "ON": {
          this.write("ON");
          this.inCondition = true;
          this.pos++;
          return;
        }
        case "BETWEEN": {
          this.write("BETWEEN");
          this.betweenPending++;
          this.pos++;
          return;
        }
        case "AND": case "OR": {
          if (upper === "AND" && this.betweenPending > 0) {
            this.betweenPending--;
            this.write("AND");
          } else if (this.inCondition) {
            this.newline();
            this.write(t.text.toUpperCase());
          } else {
            this.write(t.text.toUpperCase());
          }
          this.pos++;
          return;
        }
        case "WHENMATCHED": case "WHENNOT": {
          this.depth = this.stmtBase;
          this.newline();
          this.write(word);
          this.pos += ph.count;
          return;
        }
        case "THEN": {
          const kind = this.condStack.pop();
          this.inCondition = false;
          this.write("THEN");
          this.pos++;
          if (kind !== "CASEWHEN") { this.pushBlock("THENBODY"); this.newline(); }
          return;
        }
        // ---------- PL/SQL ----------
        case "DECLARE": {
          this.newlineIfNeeded();
          this.write("DECLARE");
          this.pushBlock("DECLARE");
          this.newline();
          this.pos++;
          return;
        }
        case "BEGIN": {
          const top = this.blockStack[this.blockStack.length - 1];
          if (top && (top.opener === "DECLARE" || top.opener === "ISBLOCK")) this.popBlock();
          this.newlineIfNeeded();
          this.write("BEGIN");
          this.pushBlock("BEGIN");
          this.newline();
          this.pos++;
          return;
        }
        case "EXCEPTION": {
          this.depth = Math.max(0, this.depth - 1);
          this.newlineIfNeeded();
          this.write("EXCEPTION");
          this.depth++;
          this.newline();
          this.pos++;
          return;
        }
        case "WHEN": {
          if (this.caseDepth > 0) {
            this.condStack.push("CASEWHEN");
            this.inCondition = true;
            this.newlineIfNeeded();
            this.write("WHEN");
          } else {
            this.popBranchIfOpen();
            this.condStack.push("EXC");
            this.inCondition = true;
            this.newlineIfNeeded();
            this.write("WHEN");
          }
          this.pos++;
          return;
        }
        case "END": {
          const next = this.peek(1);
          const nextUpper = next && next.type === "kw" ? next.upper : null;
          if (nextUpper === "IF" || nextUpper === "LOOP" || nextUpper === "CASE") {
            this.popBlock();
            this.newlineIfNeeded();
            this.write("END " + nextUpper);
            this.pos += 2;
            if (nextUpper === "CASE") this.caseDepth = Math.max(0, this.caseDepth - 1);
          } else {
            this.popBranchIfOpen();
            this.popBlock();
            this.newlineIfNeeded();
            this.write("END");
            this.pos++;
          }
          return;
        }
        case "IF": {
          this.newlineIfNeeded();
          this.write("IF");
          this.condStack.push("IF");
          this.inCondition = true;
          this.pos++;
          return;
        }
        case "ELSIF": {
          this.popBranchIfOpen();
          this.newlineIfNeeded();
          this.write("ELSIF");
          this.condStack.push("IF");
          this.inCondition = true;
          this.pos++;
          return;
        }
        case "ELSE": {
          if (this.caseDepth > 0) {
            this.newlineIfNeeded();
            this.write("ELSE");
            this.pos++;
            return;
          }
          this.popBranchIfOpen();
          this.newlineIfNeeded();
          this.write("ELSE");
          this.pushBlock("THENBODY");
          this.newline();
          this.pos++;
          return;
        }
        case "LOOP": {
          if (this.condStack[this.condStack.length - 1] === "WHILE") { this.condStack.pop(); this.inCondition = false; }
          this.write("LOOP");
          this.pushBlock("LOOP");
          this.newline();
          this.pos++;
          return;
        }
        case "FOR": {
          this.newlineIfNeeded();
          this.write("FOR");
          this.pos++;
          return;
        }
        case "WHILE": {
          this.newlineIfNeeded();
          this.write("WHILE");
          this.condStack.push("WHILE");
          this.inCondition = true;
          this.pos++;
          return;
        }
        case "CASE": {
          this.write("CASE");
          this.caseDepth = (this.caseDepth || 0) + 1;
          this.pushBlock("CASE");
          this.pos++;
          return;
        }
        case "CURSOR": {
          this.newlineIfNeeded();
          this.write("CURSOR");
          this.pendingIsPush = "temp";
          this.pos++;
          return;
        }
        case "TYPE": {
          this.newlineIfNeeded();
          this.write("TYPE");
          this.pendingIsPush = null;
          this.pos++;
          return;
        }
        case "TRIGGER": {
          this.write("TRIGGER");
          this.pendingIsPush = "permanent";
          this.pos++;
          return;
        }
        case "PACKAGE": case "PACKAGEBODY": {
          this.newlineIfNeeded();
          this.write(word);
          this.pendingIsPush = "permanent";
          this.pos += ph.count;
          return;
        }
        case "PROCEDURE": case "FUNCTION": {
          this.newlineIfNeeded();
          this.write(t.text.toUpperCase());
          this.pendingIsPush = "permanent";
          this.pos++;
          return;
        }
        case "IS": case "AS": {
          this.write(t.text.toUpperCase());
          this.pos++;
          const mode = this.pendingIsPush;
          this.pendingIsPush = null;
          const next = this.peek();
          if (mode === "permanent") {
            // Always push — even with an empty declare section — so BEGIN can always safely
            // pop exactly one frame that is guaranteed to be its own.
            this.pushBlock("ISBLOCK");
            this.newline();
          } else if (mode === "temp") {
            if (!(next && next.type === "punct" && next.text === ";")) { this.depth++; this.newline(); }
          }
          // mode === null: bare column/table alias, CTE "name AS (", "IS [NOT] NULL", etc. —
          // always stays inline, never triggers a declare-section indent.
          return;
        }
        case "PRAGMA": {
          this.newlineIfNeeded();
          this.write("PRAGMA");
          this.pos++;
          return;
        }
        case "RETURN": {
          if (this.toks[this.pos - 1] && this.toks[this.pos - 1].type === "punct" && this.toks[this.pos - 1].text === ")") {
            this.write("RETURN");
          } else { this.newlineIfNeeded(); this.write("RETURN"); }
          this.pos++;
          return;
        }
        case "EXIT": case "CONTINUE": case "RAISE": case "GOTO": {
          this.newlineIfNeeded();
          this.write(t.text.toUpperCase());
          this.pos++;
          return;
        }
        default: {
          this.write(t.text.toUpperCase());
          this.pos++;
          return;
        }
      }
    }

    advance(n) { this.pos += n; }
    consumeOptionalModifiers(list) {
      const n = this.peek();
      if (n && n.type === "kw" && list.includes(n.upper)) { this.write(n.upper); this.pos++; }
    }
    newlineIfNeeded() {
      // If a real newline isn't needed (we're already at the start of a blank line), still
      // refresh the indent prefix to the current depth — callers often change depth first.
      if (!this.atLineStart || this.cur.trim() !== "") this.newline();
      else this.cur = this.indentStr();
    }
    closeColumnListIfOpen() { if (this.clauseCol.length) this.clauseCol.pop(); }
  }

  function preprocess(rawTokens) {
    const toks = [];
    let blanks = 0, sawNl = false;
    for (const t of rawTokens) {
      if (t.type === "ws") continue;
      if (t.type === "nl") { if (sawNl) blanks++; sawNl = true; continue; }
      t.blankBefore = Math.min(blanks, 1);
      toks.push(t);
      blanks = 0; sawNl = false;
    }
    return toks;
  }

  function format(src, opts) {
    if (!src || !src.trim()) return src || "";
    const base = STYLE_PRESETS[opts && opts.style] || STYLE_PRESETS.enterprise;
    const cfg = Object.assign({ uppercase: true, collapseBlank: true }, base, opts || {});
    try {
      const raw = OracleStudio.Lexer.tokenize(src);
      const toks = preprocess(raw);
      const printer = new Printer(toks, cfg);
      return printer.run();
    } catch (e) {
      console.error("Formatter error", e);
      throw new Error("Unable to format: " + e.message);
    }
  }

  return { format, STYLE_PRESETS };
})();
/* =========================================================
   4. SYNTAX HIGHLIGHTER
   ========================================================= */
OracleStudio.Highlighter = (() => {
  const L = OracleStudio.Lang;

  const ESC_TEST = /[&<>]/;
  const ESC_RE = /[&<>]/g;
  const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
  function esc(s) {
    // Most tokens (keywords, identifiers, numbers) contain none of these characters, so a
    // single cheap test avoids the regex-replace machinery entirely for the common case —
    // this function runs once per token, so on a 50k-line file that's well over a million calls.
    if (!ESC_TEST.test(s)) return s;
    return s.replace(ESC_RE, (c) => ESC_MAP[c]);
  }

  function classFor(tok, ebsMode) {
    switch (tok.type) {
      case "kw": return "tok-kw";
      case "func": return "tok-func";
      case "str": return "tok-str";
      case "num": return "tok-num";
      case "com_line": case "com_block": return "tok-com";
      case "hint": return "tok-hint";
      case "exc": return "tok-exc";
      case "bind": return "tok-bind";
      case "todo": return "tok-todo";
      case "op": return "tok-op";
      case "ident": {
        if (ebsMode && L.EBS_PREFIX_RE.test(tok.text)) { L.EBS_PREFIX_RE.lastIndex = 0; return "tok-ident tok-ebs"; }
        return "tok-ident";
      }
      default: return null;
    }
  }

  // Renders full source text to HTML, preserving exact characters (ws/nl included) so
  // the overlay lines up 1:1 with a <textarea> holding the same raw text.
  // opts: { ebsMode, matches:[{start,end}], diffLineClass: (lineIndex)=>className|null, foldPlaceholders: Set<lineIndex> }
  function render(text, opts = {}) {
    const tokens = OracleStudio.Lexer.tokenize(text);
    const matches = opts.matches || [];
    let mi = 0;
    let openMark = false;
    let offset = 0;
    let out = [];
    let lineHtml = [];
    let lineIndex = 0;

    const flushLine = () => {
      const cls = opts.diffLineClass ? opts.diffLineClass(lineIndex) : null;
      const content = lineHtml.join("");
      if (cls) out.push(`<span class="${cls}">${content || " "}</span>`);
      else out.push(content);
      lineHtml = [];
      lineIndex++;
    };

    for (const tok of tokens) {
      if (tok.type === "nl") { flushLine(); out.push("\n"); offset++; continue; }
      const start = offset, end = offset + tok.text.length;
      offset = end;
      if (tok.type === "ws") { lineHtml.push(esc(tok.text)); continue; }

      const cls = classFor(tok, opts.ebsMode);
      let body;
      if (matches.length) {
        body = emitWithMatches(tok.text, start, matches, () => mi, (v) => (mi = v), openMark, (v) => (openMark = v));
      } else {
        body = esc(tok.text);
      }
      lineHtml.push(cls ? `<span class="${cls}">${body}</span>` : body);
    }
    flushLine();
    return out.join("");
  }

  // Splits a token's text against sorted global match ranges, wrapping matched spans in <mark>,
  // carrying "currently inside a match" state across token boundaries via getter/setter closures.
  function emitWithMatches(text, start, matches, getMi, setMi, openMark, setOpenMark) {
    let mi = getMi();
    while (mi < matches.length && matches[mi].end <= start) mi++;
    setMi(mi);
    const end = start + text.length;
    if (mi >= matches.length || matches[mi].start >= end) {
      if (openMark) { setOpenMark(false); return `</mark>${esc(text)}`; }
      return esc(text);
    }
    let res = "";
    let pos = start;
    let localOpen = openMark;
    while (pos < end) {
      const m = matches[mi];
      if (!m || m.start >= end) { res += esc(text.slice(pos - start)); pos = end; break; }
      if (localOpen) {
        const closeAt = Math.min(m.end, end);
        res += esc(text.slice(pos - start, closeAt - start));
        pos = closeAt;
        if (m.end <= end) { res += "</mark>"; localOpen = false; mi++; }
        continue;
      }
      if (m.start > pos) {
        const seg = Math.min(m.start, end);
        res += esc(text.slice(pos - start, seg - start));
        pos = seg;
        continue;
      }
      // m.start <= pos < end: open a mark here
      const cls = m.current ? "search-hl current" : "search-hl";
      res += `<mark class="${cls}">`;
      localOpen = true;
    }
    setOpenMark(localOpen);
    return res;
  }

  function toStaticHtml(text, opts) {
    return `<pre class="static-highlight">${render(text, opts)}</pre>`;
  }

  return { render, esc, toStaticHtml, classFor };
})();

/* =========================================================
   5. DIFF ENGINE — Myers O(ND) line diff + token-level inline diff
   ========================================================= */
OracleStudio.Diff = (() => {

  // Returns array of {type:'equal'|'insert'|'delete', aIndex, bIndex} operations (line-based).
  // Classic Myers O(ND) shortest-edit-script algorithm with array-indexed diagonals.
  function myersDiff(a, b) {
    const N = a.length, M = b.length;
    if (N === 0 && M === 0) return [];
    const MAX = N + M;
    if (MAX === 0) return [];
    const size = 2 * MAX + 1;
    const v = new Int32Array(size);
    const trace = [];
    let solved = false;

    outer:
    for (let d = 0; d <= MAX; d++) {
      trace.push(v.slice());
      for (let k = -d; k <= d; k += 2) {
        let x;
        if (k === -d) x = v[MAX + k + 1];
        else if (k === d) x = v[MAX + k - 1] + 1;
        else if (v[MAX + k - 1] < v[MAX + k + 1]) x = v[MAX + k + 1];
        else x = v[MAX + k - 1] + 1;
        let y = x - k;
        while (x < N && y < M && a[x] === b[y]) { x++; y++; }
        v[MAX + k] = x;
        if (x >= N && y >= M) { solved = true; break outer; }
      }
    }

    // Backtrack through the recorded traces to recover the path.
    const path = [];
    let x = N, y = M;
    for (let d = trace.length - 1; d >= 0; d--) {
      const vv = trace[d];
      const k = x - y;
      let prevK;
      if (k === -d) prevK = k + 1;
      else if (k === d) prevK = k - 1;
      else if (vv[MAX + k - 1] < vv[MAX + k + 1]) prevK = k + 1;
      else prevK = k - 1;
      const prevX = vv[MAX + prevK];
      const prevY = prevX - prevK;
      while (x > prevX && y > prevY) { path.push([x - 1, y - 1, x, y]); x--; y--; }
      if (d > 0) path.push([prevX, prevY, x, y]);
      x = prevX; y = prevY;
    }
    path.reverse();

    const ops = [];
    for (const [px, py, ex, ey] of path) {
      if (ex - px === 1 && ey - py === 1) ops.push({ type: "equal", aIndex: px, bIndex: py });
      else if (ex - px === 1) ops.push({ type: "delete", aIndex: px, bIndex: -1 });
      else if (ey - py === 1) ops.push({ type: "insert", aIndex: -1, bIndex: py });
    }
    return ops;
  }

  function normalizeLine(line, opts) {
    let s = line;
    if (opts.ignoreComments) s = s.replace(/--.*$/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    if (opts.ignoreWhitespace) s = s.replace(/\s+/g, " ").trim();
    if (opts.ignoreCase) s = s.toUpperCase();
    return s;
  }

  // High-level line diff with normalization options; groups consecutive ops into hunks and
  // classifies replace-hunks as pure "modified" (paired) vs pure add/delete.
  function diffLines(textA, textB, opts = {}) {
    const rawA = textA.split("\n");
    const rawB = textB.split("\n");
    const keyA = rawA.map(l => normalizeLine(l, opts));
    const keyB = rawB.map(l => normalizeLine(l, opts));
    const ops = myersDiff(keyA, keyB);

    // group into runs of delete/insert to pair up as "modify" when counts align
    const rows = [];
    let i = 0;
    while (i < ops.length) {
      const op = ops[i];
      if (op.type === "equal") { rows.push({ type: "equal", a: op.aIndex, b: op.bIndex }); i++; continue; }
      let dels = [], inss = [];
      let j = i;
      while (j < ops.length && ops[j].type !== "equal") {
        if (ops[j].type === "delete") dels.push(ops[j].aIndex);
        else inss.push(ops[j].bIndex);
        j++;
      }
      const pairCount = Math.min(dels.length, inss.length);
      for (let p = 0; p < pairCount; p++) {
        const a = dels[p], b = inss[p];
        const same = rawA[a] === rawB[b];
        rows.push({ type: same ? "equal" : "modify", a, b, wsOnly: same ? false : (keyA[a] === keyB[b]) });
      }
      for (let p = pairCount; p < dels.length; p++) rows.push({ type: "delete", a: dels[p], b: -1 });
      for (let p = pairCount; p < inss.length; p++) rows.push({ type: "insert", a: -1, b: inss[p] });
      i = j;
    }

    let stats = { added: 0, removed: 0, modified: 0, wsOnly: 0, equal: 0 };
    for (const r of rows) {
      if (r.type === "equal") stats.equal++;
      else if (r.type === "insert") stats.added++;
      else if (r.type === "delete") stats.removed++;
      else if (r.type === "modify") { if (r.wsOnly) stats.wsOnly++; else stats.modified++; }
    }
    return { rows, rawA, rawB, stats };
  }

  // Word/token-level diff for inline highlighting within a modified line pair.
  function diffWords(lineA, lineB) {
    const wa = lineA.match(/\s+|[A-Za-z_][A-Za-z0-9_$#.]*|\d+(?:\.\d+)?|.'|./g) || [];
    const wb = lineB.match(/\s+|[A-Za-z_][A-Za-z0-9_$#.]*|\d+(?:\.\d+)?|.'|./g) || [];
    const ops = myersDiff(wa, wb);
    const segA = [], segB = [];
    for (const op of ops) {
      if (op.type === "equal") { segA.push({ t: wa[op.aIndex], d: false }); segB.push({ t: wb[op.bIndex], d: false }); }
      else if (op.type === "delete") segA.push({ t: wa[op.aIndex], d: true });
      else segB.push({ t: wb[op.bIndex], d: true });
    }
    return { segA, segB };
  }

  return { myersDiff, diffLines, diffWords, normalizeLine };
})();
/* =========================================================
   6. FOLD REGION FINDER (best-effort, used only for gutter folding UI)
   ========================================================= */
OracleStudio.Folding = (() => {
  function regions(text) {
    let toks;
    try { toks = OracleStudio.Lexer.tokenize(text).filter(t => t.type !== "ws" && t.type !== "nl"); }
    catch (e) { return []; }
    const stack = [];
    const out = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.type !== "kw") continue;
      const next = toks[i + 1];
      const nextUpper = next && next.type === "kw" ? next.upper : null;
      if (t.upper === "BEGIN" || t.upper === "PACKAGE" || t.upper === "LOOP" || t.upper === "RECORD" || t.upper === "TRIGGER") {
        stack.push({ kind: t.upper, startLine: t.line });
      } else if (t.upper === "IF") {
        stack.push({ kind: "IF", startLine: t.line });
      } else if (t.upper === "CASE") {
        stack.push({ kind: "CASE", startLine: t.line });
      } else if (t.upper === "PROCEDURE" || t.upper === "FUNCTION") {
        stack.push({ kind: "PROCFUNC", startLine: t.line });
      } else if (t.upper === "END") {
        const top = stack[stack.length - 1];
        if (!top) continue;
        if (nextUpper === "IF" || nextUpper === "LOOP" || nextUpper === "CASE") {
          if (top.kind === nextUpper) { stack.pop(); if (t.line > top.startLine) out.push({ startLine: top.startLine, endLine: t.line, kind: top.kind }); }
        } else if (["BEGIN", "PACKAGE", "PROCFUNC", "TRIGGER"].includes(top.kind)) {
          stack.pop();
          if (t.line > top.startLine) out.push({ startLine: top.startLine, endLine: t.line, kind: top.kind });
        }
      }
    }
    return out.sort((a, b) => a.startLine - b.startLine);
  }
  return { regions };
})();

/* =========================================================
   7. CODE EDITOR — textarea + syntax-highlighted overlay, no external deps.
   ========================================================= */
OracleStudio.CodeEditor = class CodeEditor {
  constructor(container, opts = {}) {
    this.container = container;
    this.opts = Object.assign({ value: "", readOnly: false, ebsMode: false, fontSize: 14, wordWrap: false, onChange: null, onCursor: null }, opts);
    this.foldedRanges = new Map(); // placeholder line index -> { text, startLine, endLine }
    this.searchMatches = [];
    this.currentMatchIndex = -1;
    this.diffLineClasses = null; // function(lineIndex) => class name or null
    this._buildDom();
    this.setValue(this.opts.value, { silent: true });
    this._bindEvents();
  }

  _buildDom() {
    this.el = document.createElement("div");
    this.el.className = "code-editor";
    this.el.style.setProperty("--editor-font-size", this.opts.fontSize + "px");

    this.gutter = document.createElement("div");
    this.gutter.className = "gutter";

    this.scroll = document.createElement("div");
    this.scroll.className = "editor-scroll";

    this.stack = document.createElement("div");
    this.stack.className = "editor-stack";

    this.pre = document.createElement("pre");
    this.pre.className = "highlight-layer";

    this.textarea = document.createElement("textarea");
    this.textarea.className = "input-layer";
    this.textarea.spellcheck = false;
    this.textarea.autocomplete = "off";
    this.textarea.autocapitalize = "off";
    this.textarea.wrap = "off";
    if (this.opts.readOnly) this.textarea.readOnly = true;

    this.stack.appendChild(this.pre);
    this.stack.appendChild(this.textarea);
    this.scroll.appendChild(this.stack);
    this.el.appendChild(this.gutter);
    this.el.appendChild(this.scroll);
    this.container.appendChild(this.el);
  }

  _bindEvents() {
    this.textarea.addEventListener("input", () => { this._onInput(); });
    this.textarea.addEventListener("scroll", () => {
      this.gutter.scrollTop = this.textarea.scrollTop;
      this.pre.parentElement.scrollLeft = this.textarea.scrollLeft;
    });
    this.textarea.addEventListener("click", () => this._reportCursor());
    this.textarea.addEventListener("keyup", () => this._reportCursor());
    this.textarea.addEventListener("keydown", (e) => this._onKeydown(e));
    this.gutter.addEventListener("click", (e) => {
      const foldBtn = e.target.closest(".gutter-fold");
      if (foldBtn) { this.toggleFold(parseInt(foldBtn.dataset.line, 10)); }
    });
  }

  _onKeydown(e) {
    if (e.key === "Tab" && !this.opts.readOnly) {
      e.preventDefault();
      this._indentSelection(!e.shiftKey);
    }
  }

  _indentSelection(indent) {
    const ta = this.textarea;
    const { selectionStart: s, selectionEnd: en, value } = ta;
    let lineStart = value.lastIndexOf("\n", s - 1) + 1;
    let lineEndSearch = value.indexOf("\n", en);
    let lineEnd = lineEndSearch === -1 ? value.length : lineEndSearch;
    const block = value.slice(lineStart, lineEnd);
    let newBlock, deltaStart = 0, deltaEnd = 0;
    if (indent) {
      newBlock = block.replace(/^/gm, "  ");
      deltaStart = 2; deltaEnd = newBlock.length - block.length;
    } else {
      newBlock = block.replace(/^  |^\t/gm, "");
      deltaStart = -(block.length - block.replace(/^  |^\t/, "").length);
      deltaEnd = newBlock.length - block.length;
    }
    ta.value = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);
    ta.selectionStart = Math.max(lineStart, s + deltaStart);
    ta.selectionEnd = Math.max(ta.selectionStart, en + deltaEnd);
    this._onInput();
  }

  _onInput() {
    clearTimeout(this._debounce);
    this._syncHeight();
    this._renderGutterFast();
    this._debounce = setTimeout(() => { this._renderHighlight(); this._reportCursor(); }, 60);
    if (this.opts.onChange) this.opts.onChange(this.getValue());
  }

  _lineHeightPx() {
    // Cached: getComputedStyle resolves cheaply (style-only), unlike scrollHeight which forces
    // a full synchronous layout pass — that distinction matters a lot once a document has
    // tens of thousands of lines, so this is computed once and reused, not re-measured live.
    if (!this._cachedLineHeight) this._cachedLineHeight = parseFloat(getComputedStyle(this.pre).lineHeight) || this.opts.fontSize * 1.55;
    return this._cachedLineHeight;
  }

  _syncHeight() {
    // Avoid reading textarea.scrollHeight — on a multi-megabyte value that forces a synchronous
    // layout of the whole content and is the single biggest cost on large files. Line count is
    // computed with a cheap character scan instead, and height derived from the known line-height.
    const text = this.textarea.value;
    let lines = 1;
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lines++;
    const h = Math.max(lines * this._lineHeightPx() + 20, this.el.clientHeight);
    this.textarea.style.height = h + "px";
    this.pre.style.height = h + "px";
  }

  _renderGutterFast() {
    const lines = this.textarea.value.split("\n");
    const foldSet = this._foldStartLines();
    let html = "";
    for (let i = 0; i < lines.length; i++) {
      const foldable = foldSet.has(i);
      html += `<div class="gutter-line">${foldable ? `<span class="gutter-fold" data-line="${i}">${this.foldedRanges.has(i) ? "▸" : "▾"}</span>` : ""}${i + 1}</div>`;
    }
    this.gutter.innerHTML = html;
  }

  _foldStartLines() {
    const set = new Set();
    for (const [line] of this.foldedRanges) set.add(line);
    // Fold-region detection re-tokenizes the whole buffer, doubling the cost of every render —
    // on very large files that's a real cost for a convenience feature, so it's skipped past a
    // size threshold rather than dragging every keystroke down with it.
    if (this.textarea.value.length > 400000) return set;
    if (!this._foldRegionsCache || this._foldRegionsCacheKey !== this.textarea.value.length) {
      this._foldRegionsCache = OracleStudio.Folding.regions(this.textarea.value);
      this._foldRegionsCacheKey = this.textarea.value.length;
    }
    for (const r of this._foldRegionsCache) set.add(r.startLine - 1);
    return set;
  }

  _renderHighlight() {
    const text = this.textarea.value;
    const html = OracleStudio.Highlighter.render(text, {
      ebsMode: this.opts.ebsMode,
      matches: this.searchMatches,
      diffLineClass: this.diffLineClasses
    });
    this.pre.innerHTML = html + "​";
  }

  _reportCursor() {
    if (!this.opts.onCursor) return;
    const pos = this.textarea.selectionStart;
    const value = this.textarea.value;
    let line = 1, col = 1;
    for (let i = 0; i < pos; i++) { if (value[i] === "\n") { line++; col = 1; } else col++; }
    const selLen = Math.abs(this.textarea.selectionEnd - this.textarea.selectionStart);
    this.opts.onCursor({ line, col, selLen, totalLines: value.split("\n").length });
  }

  // ---------- Public API ----------
  getValue() { return this._expandFoldsInValue(this.textarea.value); }
  getRawValue() { return this.textarea.value; }

  setValue(text, opts = {}) {
    this.foldedRanges.clear();
    this.textarea.value = text || "";
    this._syncHeight();
    this._renderGutterFast();
    this._renderHighlight();
    this._reportCursor();
    if (!opts.silent && this.opts.onChange) this.opts.onChange(this.getValue());
  }

  setEbsMode(on) { this.opts.ebsMode = on; this._renderHighlight(); }
  setFontSize(px) { this.opts.fontSize = px; this._cachedLineHeight = null; this.el.style.setProperty("--editor-font-size", px + "px"); this._syncHeight(); }
  setWordWrap(on) { this.el.classList.toggle("wrap", !!on); }
  setReadOnly(on) { this.textarea.readOnly = !!on; }
  focus() { this.textarea.focus(); }

  setDiffLineClasses(fn) { this.diffLineClasses = fn; this._renderHighlight(); }

  getCursor() {
    const pos = this.textarea.selectionStart;
    const value = this.textarea.value;
    let line = 0; for (let i = 0; i < pos; i++) if (value[i] === "\n") line++;
    return { line, offset: pos };
  }

  scrollToLine(lineIndex, center = true) {
    const lh = this._lineHeightPx();
    const target = lineIndex * lh;
    if (center) this.scroll.scrollTop = Math.max(0, target - this.scroll.clientHeight / 2);
    else this.scroll.scrollTop = Math.max(0, target - lh);
  }

  setCursorToLine(lineIndex, col = 0) {
    const lines = this.textarea.value.split("\n");
    let offset = 0;
    for (let i = 0; i < lineIndex && i < lines.length; i++) offset += lines[i].length + 1;
    offset += col;
    this.textarea.focus();
    this.textarea.selectionStart = this.textarea.selectionEnd = offset;
    this.scrollToLine(lineIndex);
    this._reportCursor();
  }

  // ---------- Search ----------
  search(query, opts = {}) {
    this.searchMatches = [];
    this.currentMatchIndex = -1;
    if (!query) { this._renderHighlight(); return { count: 0 }; }
    const text = this.textarea.value;
    let re;
    try {
      let pattern = opts.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (opts.wholeWord) pattern = `\\b${pattern}\\b`;
      re = new RegExp(pattern, opts.caseSensitive ? "g" : "gi");
    } catch (e) { return { count: 0, error: "Invalid regex" }; }
    let m;
    let guard = 0;
    while ((m = re.exec(text)) && guard < 200000) {
      guard++;
      if (m[0] === "") { re.lastIndex++; continue; }
      this.searchMatches.push({ start: m.index, end: m.index + m[0].length });
    }
    if (this.searchMatches.length) this.currentMatchIndex = 0;
    this._applyCurrentMatchFlag();
    this._renderHighlight();
    return { count: this.searchMatches.length };
  }

  _applyCurrentMatchFlag() {
    this.searchMatches.forEach((m, i) => { m.current = i === this.currentMatchIndex; });
  }

  findNext() {
    if (!this.searchMatches.length) return null;
    this.currentMatchIndex = (this.currentMatchIndex + 1) % this.searchMatches.length;
    this._applyCurrentMatchFlag();
    this._renderHighlight();
    this._gotoMatch(this.searchMatches[this.currentMatchIndex]);
    return this.currentMatchIndex;
  }

  findPrev() {
    if (!this.searchMatches.length) return null;
    this.currentMatchIndex = (this.currentMatchIndex - 1 + this.searchMatches.length) % this.searchMatches.length;
    this._applyCurrentMatchFlag();
    this._renderHighlight();
    this._gotoMatch(this.searchMatches[this.currentMatchIndex]);
    return this.currentMatchIndex;
  }

  _gotoMatch(m) {
    const value = this.textarea.value;
    let line = 0; for (let i = 0; i < m.start; i++) if (value[i] === "\n") line++;
    this.textarea.focus();
    this.textarea.selectionStart = m.start;
    this.textarea.selectionEnd = m.end;
    this.scrollToLine(line);
  }

  replaceCurrent(replacement) {
    if (this.currentMatchIndex < 0 || !this.searchMatches[this.currentMatchIndex]) return false;
    const m = this.searchMatches[this.currentMatchIndex];
    const value = this.textarea.value;
    this.textarea.value = value.slice(0, m.start) + replacement + value.slice(m.end);
    this._onInput();
    return true;
  }

  replaceAll(query, replacement, opts = {}) {
    const text = this.textarea.value;
    let re;
    try {
      let pattern = opts.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (opts.wholeWord) pattern = `\\b${pattern}\\b`;
      re = new RegExp(pattern, opts.caseSensitive ? "g" : "gi");
    } catch (e) { return 0; }
    let count = 0;
    const newText = text.replace(re, (m) => { count++; return replacement; });
    this.textarea.value = newText;
    this._onInput();
    return count;
  }

  // ---------- Folding ----------
  toggleFold(lineIndex) {
    if (this.foldedRanges.has(lineIndex)) this.unfold(lineIndex);
    else this.fold(lineIndex);
  }

  fold(lineIndex) {
    const region = this._foldRegionsCache && this._foldRegionsCache.find(r => r.startLine - 1 === lineIndex);
    if (!region) return;
    const lines = this.textarea.value.split("\n");
    const startLine = region.startLine - 1;
    const endLine = region.endLine - 1;
    if (endLine <= startLine) return;
    const hidden = lines.slice(startLine + 1, endLine + 1).join("\n");
    const count = endLine - startLine;
    const placeholder = `${lines[startLine]} ⟦… ${count} lines folded ⟧`;
    this.foldedRanges.set(startLine, { text: hidden, startLine, endLine });
    lines.splice(startLine, endLine - startLine + 1, placeholder);
    const cursorLine = this.getCursor().line;
    this.textarea.value = lines.join("\n");
    this._afterFoldChange();
  }

  unfold(lineIndex) {
    const data = this.foldedRanges.get(lineIndex);
    if (!data) return;
    const lines = this.textarea.value.split("\n");
    const placeholder = lines[lineIndex];
    const original = placeholder.replace(/ ⟦… \d+ lines folded ⟧$/, "");
    lines.splice(lineIndex, 1, original, data.text);
    this.foldedRanges.delete(lineIndex);
    this.textarea.value = lines.join("\n");
    this._afterFoldChange();
  }

  _afterFoldChange() {
    this._syncHeight();
    this._renderGutterFast();
    this._renderHighlight();
    if (this.opts.onChange) this.opts.onChange(this.getValue());
  }

  _expandFoldsInValue(raw) {
    if (!this.foldedRanges.size) return raw;
    const lines = raw.split("\n");
    // Expand from the bottom-most fold upward so earlier indices stay valid.
    const entries = [...this.foldedRanges.entries()].sort((a, b) => b[0] - a[0]);
    for (const [lineIndex, data] of entries) {
      const placeholder = lines[lineIndex];
      if (placeholder === undefined) continue;
      const original = placeholder.replace(/ ⟦… \d+ lines folded ⟧$/, "");
      lines.splice(lineIndex, 1, original, data.text);
    }
    return lines.join("\n");
  }

  destroy() { this.el.remove(); }
};
/* =========================================================
   8. OUTLINE PARSER — packages / procedures / functions / cursors / types / exceptions
   ========================================================= */
OracleStudio.Outline = (() => {
  const L = OracleStudio.Lang;

  // Scans forward from a procedure/function/trigger signature to decide whether it has a
  // body (IS/AS ... BEGIN ... END) or is a bare spec declaration ending directly in ';'.
  function hasBody(toks, startIdx) {
    let depth = 0;
    for (let i = startIdx; i < toks.length; i++) {
      const t = toks[i];
      if (t.type === "punct" && t.text === "(") depth++;
      else if (t.type === "punct" && t.text === ")") depth--;
      else if (depth <= 0 && t.type === "punct" && t.text === ";") return false;
      else if (depth <= 0 && t.type === "kw" && (t.upper === "IS" || t.upper === "AS")) return true;
    }
    return false;
  }

  function ebsInfo(name) {
    const m = /^(XX[A-Z0-9_]*|APPS|AP|AR|PO|INV|GL|FA|CE|IBY|XLA|HR|PER|ONT|OE|WSH|BOM|WIP|MSC|QP|FND|AME|WF|XDO)_/i.exec(name || "");
    if (!m) return null;
    const prefix = m[1].toUpperCase();
    const isCustom = prefix.startsWith("XX");
    const moduleKey = isCustom ? prefix.replace(/^XX/, "").replace(/_?\d*$/, "") : prefix;
    return { prefix, isCustom, module: L.EBS_MODULES[moduleKey] || L.EBS_MODULES[prefix] || (isCustom ? "Custom (XX)" : null) };
  }

  function parse(text) {
    let toks;
    try { toks = OracleStudio.Lexer.tokenize(text).filter(t => t.type !== "ws" && t.type !== "nl"); }
    catch (e) { return []; }
    const root = [];
    const stack = [{ children: root }];
    let caseDepth = 0;

    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.type !== "kw") continue;

      if (t.upper === "PACKAGE") {
        const isBody = toks[i + 1] && toks[i + 1].type === "kw" && toks[i + 1].upper === "BODY";
        const nameIdx = i + (isBody ? 2 : 1);
        const nameTok = toks[nameIdx];
        const name = nameTok ? nameTok.text : "?";
        const node = { type: isBody ? "package_body" : "package", name, line: t.line, endLine: null, children: [], ebs: ebsInfo(name) };
        stack[stack.length - 1].children.push(node);
        stack.push(node);
        i = nameIdx;
      } else if (t.upper === "PROCEDURE" || t.upper === "FUNCTION") {
        const nameTok = toks[i + 1];
        const name = nameTok ? nameTok.text : "?";
        const body = hasBody(toks, i + 1);
        const node = { type: t.upper.toLowerCase(), name, line: t.line, endLine: null, children: [], hasBody: body, ebs: ebsInfo(name) };
        stack[stack.length - 1].children.push(node);
        if (body) stack.push(node);
      } else if (t.upper === "TRIGGER") {
        const nameTok = toks[i + 1];
        const name = nameTok ? nameTok.text : "?";
        const node = { type: "trigger", name, line: t.line, endLine: null, children: [], ebs: ebsInfo(name) };
        stack[stack.length - 1].children.push(node);
        stack.push(node);
      } else if (t.upper === "CURSOR") {
        const nameTok = toks[i + 1];
        stack[stack.length - 1].children.push({ type: "cursor", name: nameTok ? nameTok.text : "?", line: t.line, children: [] });
      } else if (t.upper === "TYPE") {
        const nameTok = toks[i + 1];
        stack[stack.length - 1].children.push({ type: "type", name: nameTok ? nameTok.text : "?", line: t.line, children: [] });
      } else if (t.upper === "EXCEPTION") {
        const next = toks[i + 1];
        if (next && next.type === "ident") {
          // exception declaration: "my_exc EXCEPTION;"
        }
      } else if (t.upper === "CASE") {
        caseDepth++;
      } else if (t.upper === "END") {
        const next = toks[i + 1];
        const nextUpper = next && next.type === "kw" ? next.upper : null;
        if (nextUpper === "CASE") { caseDepth = Math.max(0, caseDepth - 1); continue; }
        if (nextUpper === "IF" || nextUpper === "LOOP") continue;
        if (stack.length > 1) {
          const closed = stack.pop();
          closed.endLine = t.line;
        }
      }
    }
    // Any unterminated containers (malformed/partial code) still get a best-effort endLine.
    for (let s = 1; s < stack.length; s++) if (stack[s].endLine == null) stack[s].endLine = toks.length ? toks[toks.length - 1].line : 1;
    return root;
  }

  function flatten(nodes, depth = 0, out = []) {
    for (const n of nodes) {
      out.push({ node: n, depth });
      if (n.children && n.children.length) flatten(n.children, depth + 1, out);
    }
    return out;
  }

  function countByType(nodes, counts = {}) {
    for (const n of nodes) {
      counts[n.type] = (counts[n.type] || 0) + 1;
      if (n.children && n.children.length) countByType(n.children, counts);
    }
    return counts;
  }

  return { parse, flatten, countByType, ebsInfo, hasBody };
})();

/* =========================================================
   9. ORACLE EBS SMART MODE — module/prefix/WHO-column/API recognition
   ========================================================= */
OracleStudio.EbsMode = (() => {
  const L = OracleStudio.Lang;

  const SEEDED_API_HINT = /\b(FND_|HR_|PER_|AP_|AR_|GL_|PO_|INV_|WF_|AME_)[A-Z0-9_]*\s*\.\s*[A-Z0-9_]+\s*\(/gi;
  const CONCURRENT_PROGRAM_HINT = /\b(FND_REQUEST\.SUBMIT_REQUEST|FND_SUBMIT|FND_STANDARD|APPS\.FND_)/gi;
  const WORKFLOW_HINT = /\bWF_(ENGINE|CORE|NOTIFICATION|ITEM)\b/gi;
  const XDO_HINT = /\bXDO_[A-Z0-9_]+\b/gi;

  function analyze(text) {
    const prefixCounts = {};
    let m;
    L.EBS_PREFIX_RE.lastIndex = 0;
    while ((m = L.EBS_PREFIX_RE.exec(text))) {
      const full = m[0].toUpperCase();
      const prefixMatch = /^(XX[A-Z0-9_]*|[A-Z]+)_/i.exec(full);
      const prefix = prefixMatch ? prefixMatch[1] : full;
      prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
    }
    const whoMatches = (text.match(L.WHO_COLUMNS) || []).length;
    const seededApiCalls = (text.match(SEEDED_API_HINT) || []).length;
    const workflowRefs = (text.match(WORKFLOW_HINT) || []).length;
    const xdoRefs = (text.match(XDO_HINT) || []).length;
    const isConcurrentProgram = CONCURRENT_PROGRAM_HINT.test(text);

    const modules = Object.entries(prefixCounts)
      .map(([prefix, count]) => {
        const isCustom = prefix.startsWith("XX");
        const key = isCustom ? prefix.replace(/^XX/, "").replace(/_?\d*$/, "") : prefix;
        const label = L.EBS_MODULES[key] || L.EBS_MODULES[prefix] || (isCustom ? "Custom Extension" : prefix);
        return { prefix, count, isCustom, label };
      })
      .sort((a, b) => b.count - a.count);

    const detected = modules.length > 0 || whoMatches > 0 || seededApiCalls > 0;

    return {
      detected, modules, whoColumnCount: whoMatches, seededApiCalls,
      workflowRefs, xdoRefs, isConcurrentProgram,
      customObjectCount: modules.filter(m => m.isCustom).reduce((a, m) => a + m.count, 0)
    };
  }

  return { analyze };
})();
/* =========================================================
   10. CODE QUALITY & PERFORMANCE ANALYZER
   ========================================================= */
OracleStudio.QualityAnalyzer = (() => {

  function lineOf(text, offset) {
    let line = 1;
    for (let i = 0; i < offset && i < text.length; i++) if (text[i] === "\n") line++;
    return line;
  }

  function pushIssue(list, cat, severity, title, line, description) {
    list.push({ category: cat, severity, title, line, description });
  }

  function stripCommentsAndStrings(text) {
    // Replace comment/string contents with spaces of equal length (preserving line numbers
    // and offsets) so later regex scans don't false-positive inside them.
    return text.replace(/(--[^\n]*)|(\/\*[\s\S]*?\*\/)|('(?:[^']|'')*')/g, (m) => {
      return m.replace(/[^\n]/g, " ");
    });
  }

  function analyze(text) {
    const issues = [];
    if (!text || !text.trim()) return issues;
    const clean = stripCommentsAndStrings(text);
    const loopRegions = OracleStudio.Folding.regions(text).filter(r => r.kind === "LOOP");
    const outline = OracleStudio.Outline.parse(text);

    // ---------- SELECT * ----------
    {
      const re = /\bSELECT\s+\*/gi;
      let m;
      while ((m = re.exec(clean))) {
        const after = clean.slice(m.index, m.index + 40);
        if (/COUNT\s*\(\s*\*/i.test(clean.slice(Math.max(0, m.index - 8), m.index + 8))) continue;
        pushIssue(issues, "quality", "medium", "SELECT * used", lineOf(text, m.index),
          "Avoid SELECT * — list explicit columns to prevent breakage when the table shape changes and to cut unnecessary I/O.");
      }
    }

    // ---------- WHEN OTHERS without RAISE ----------
    {
      const re = /\bWHEN\s+OTHERS\s+THEN\b/gi;
      let m;
      while ((m = re.exec(clean))) {
        const bodyStart = m.index + m[0].length;
        const rest = clean.slice(bodyStart);
        const nextBoundary = rest.search(/\bEND\b|\bWHEN\b/i);
        const body = nextBoundary === -1 ? rest : rest.slice(0, nextBoundary);
        if (!/\bRAISE\b|\bRAISE_APPLICATION_ERROR\b/i.test(body)) {
          pushIssue(issues, "quality", "high", "WHEN OTHERS without RAISE", lineOf(text, m.index),
            "This handler swallows all exceptions silently. Re-raise (RAISE;) or call RAISE_APPLICATION_ERROR so failures aren't hidden.");
        }
      }
    }

    // ---------- COMMIT / ROLLBACK inside loops ----------
    for (const region of loopRegions) {
      const lines = text.split("\n").slice(region.startLine - 1, region.endLine);
      const idx = lines.findIndex(l => /(?<![A-Z_])\bCOMMIT\b/i.test(stripCommentsAndStrings(l)));
      if (idx !== -1) {
        pushIssue(issues, "quality", "high", "COMMIT inside a loop", region.startLine + idx,
          "Committing on every loop iteration hurts performance and can leave data in an inconsistent state if the job fails midway. Commit once after the loop (or in controlled batches).");
      }
    }

    // ---------- Missing bulk processing (row-by-row DML in a loop) ----------
    for (const region of loopRegions) {
      const body = text.split("\n").slice(region.startLine - 1, region.endLine).join("\n");
      const cleanBody = stripCommentsAndStrings(body);
      if (/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/i.test(cleanBody) && !/\bFORALL\b/i.test(cleanBody)) {
        pushIssue(issues, "performance", "medium", "Row-by-row DML inside a loop", region.startLine,
          "DML statements executed once per loop iteration are much slower than BULK COLLECT + FORALL. Consider bulk processing for large data volumes.");
      }
    }

    // ---------- Nested loops ----------
    for (const outer of loopRegions) {
      const inner = loopRegions.find(r => r !== outer && r.startLine > outer.startLine && r.endLine < outer.endLine);
      if (inner) {
        pushIssue(issues, "performance", "low", "Nested loops detected", outer.startLine,
          "Nested loops over data sets can lead to quadratic behavior. Verify the inner loop can't be replaced with a join or a single bulk operation.");
        break;
      }
    }

    // ---------- Unused cursors ----------
    for (const item of OracleStudio.Outline.flatten(outline)) {
      if (item.node.type !== "cursor") continue;
      const name = item.node.name;
      const re = new RegExp("\\b" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi");
      const count = (clean.match(re) || []).length;
      if (count <= 1) {
        pushIssue(issues, "quality", "low", `Cursor "${name}" appears unused`, item.node.line,
          "This cursor is declared but never referenced (OPEN/FOR loop/FETCH) elsewhere in the code.");
      }
    }

    // ---------- Unused local variables (simple v_/l_ heuristic declarations) ----------
    {
      const declRe = /^\s*([A-Za-z_][A-Za-z0-9_$#]*)\s+(?:CONSTANT\s+)?[A-Za-z_][\w.]*(?:\([^)]*\))?\s*(?::=.*)?;/gim;
      let m;
      const seen = new Set();
      while ((m = declRe.exec(clean))) {
        const name = m[1];
        if (seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        if (OracleStudio.Lang.KEYWORDS.has(name.toUpperCase())) continue;
        const re = new RegExp("\\b" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi");
        const count = (clean.match(re) || []).length;
        if (count <= 1) {
          pushIssue(issues, "quality", "low", `Variable "${name}" appears unused`, lineOf(text, m.index),
            "Declared but not referenced anywhere else — safe to remove if confirmed dead code.");
        }
      }
    }

    // ---------- Hardcoded literals in WHERE comparisons ----------
    {
      const re = /\bWHERE\b[\s\S]{0,400}?[\w."]\s*=\s*(\d{2,})\b/gi;
      let m;
      let count = 0;
      while ((m = re.exec(clean)) && count < 15) {
        count++;
        pushIssue(issues, "quality", "low", "Hardcoded numeric literal in WHERE", lineOf(text, m.index),
          `Magic number "${m[1]}" found in a comparison — consider a named constant, lookup table, or bind variable.`);
      }
    }

    // ---------- Dynamic SQL / SQL injection risk ----------
    {
      const re = /\bEXECUTE\s+IMMEDIATE\b/gi;
      let m;
      while ((m = re.exec(clean))) {
        const tail = clean.slice(m.index, m.index + 300);
        if (/\|\|\s*[A-Za-z_:]/.test(tail) && !/USING\b/i.test(tail)) {
          pushIssue(issues, "quality", "high", "Dynamic SQL built with string concatenation", lineOf(text, m.index),
            "EXECUTE IMMEDIATE concatenates a variable directly into the SQL text without USING bind variables — a SQL injection risk. Use bind placeholders (:1, USING ...) instead.");
        }
      }
    }

    // ---------- Repeated / duplicate SQL statements ----------
    {
      const stmtRe = /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b[\s\S]*?;/gi;
      const seen = new Map();
      let m;
      while ((m = stmtRe.exec(clean))) {
        const norm = m[0].replace(/\s+/g, " ").trim().toUpperCase();
        if (norm.length < 25) continue;
        if (!seen.has(norm)) seen.set(norm, []);
        seen.get(norm).push(m.index);
      }
      for (const [norm, positions] of seen) {
        if (positions.length > 1) {
          pushIssue(issues, "quality", "low", "Duplicate SQL statement", lineOf(text, positions[0]),
            `The same statement appears ${positions.length} times (also at line${positions.length > 2 ? "s" : ""} ${positions.slice(1).map(p => lineOf(text, p)).join(", ")}). Consider extracting it into a cursor/function.`);
        }
      }
    }

    // ---------- Missing exception handling on bodies with real work ----------
    for (const item of OracleStudio.Outline.flatten(outline)) {
      const n = item.node;
      if ((n.type === "procedure" || n.type === "function") && n.hasBody && n.endLine) {
        const body = text.split("\n").slice(n.line - 1, n.endLine).join("\n");
        const clnBody = stripCommentsAndStrings(body);
        const substantial = (clnBody.match(/;/g) || []).length > 3;
        if (substantial && !/\bEXCEPTION\b/i.test(clnBody)) {
          pushIssue(issues, "quality", "medium", `"${n.name}" has no EXCEPTION handler`, n.line,
            "This routine has no exception section — unhandled errors will propagate with a generic ORA- message. Add an EXCEPTION block for predictable error handling.");
        }
      }
    }

    // ---------- Performance: Cartesian join risk (comma joins, no matching WHERE condition) ----------
    {
      const re = /\bFROM\s+([\w."]+\s+\w+\s*,\s*[\w."\s,]+?)\s*(WHERE|GROUP\s+BY|ORDER\s+BY|;|$)/gi;
      let m;
      while ((m = re.exec(clean))) {
        const tableList = m[1];
        const tableCount = tableList.split(",").length;
        if (tableCount < 2) continue;
        const whereStart = m.index + m[0].length;
        const whereText = clean.slice(whereStart, whereStart + 500);
        const eqJoins = (whereText.match(/[\w"]+\s*\.\s*[\w"]+\s*=\s*[\w"]+\s*\.\s*[\w"]+/g) || []).length;
        if (eqJoins < tableCount - 1) {
          pushIssue(issues, "performance", "high", "Possible Cartesian join", lineOf(text, m.index),
            `${tableCount} tables listed with comma-join syntax but only ${eqJoins} equality join condition(s) found in WHERE — check for a missing join predicate.`);
        }
      }
    }

    // ---------- Performance: function on column blocks index usage ----------
    {
      const re = /\bWHERE\b[\s\S]{0,300}?\b(UPPER|LOWER|TRUNC|TO_CHAR|NVL|SUBSTR)\s*\(\s*[\w."]+\s*\)\s*(=|LIKE|<|>)/gi;
      let m;
      let count = 0;
      while ((m = re.exec(clean)) && count < 15) {
        count++;
        pushIssue(issues, "performance", "medium", `${m[1].toUpperCase()}() applied to a column in WHERE`, lineOf(text, m.index),
          "Wrapping an indexed column in a function usually prevents the optimizer from using a normal index. Consider a function-based index or restructuring the predicate.");
      }
    }

    // ---------- Performance: leading-wildcard LIKE (forces full scan) ----------
    {
      const re = /\bLIKE\s+'%[^']*'/gi;
      let m;
      let count = 0;
      while ((m = re.exec(clean)) && count < 15) {
        count++;
        pushIssue(issues, "performance", "medium", "Leading-wildcard LIKE", lineOf(text, m.index),
          "A LIKE pattern starting with '%' can't use a standard B-tree index and forces a full scan. Consider a reversed/function-based index or full-text search if this is on a large table.");
      }
    }

    // ---------- Performance: NOT IN (SELECT ...) vs NOT EXISTS ----------
    {
      const re = /\bNOT\s+IN\s*\(\s*SELECT\b/gi;
      let m;
      while ((m = re.exec(clean))) {
        pushIssue(issues, "performance", "medium", "NOT IN with a subquery", lineOf(text, m.index),
          "NOT IN against a subquery returns no rows if the subquery yields any NULL, and often performs worse than NOT EXISTS. Prefer NOT EXISTS for anti-joins.");
      }
    }
    {
      const re = /(?<!NOT\s)\bIN\s*\(\s*SELECT\b/gi;
      let m;
      let count = 0;
      while ((m = re.exec(clean)) && count < 15) {
        count++;
        pushIssue(issues, "performance", "low", "IN with a subquery", lineOf(text, m.index),
          "IN (SELECT ...) can sometimes be rewritten as EXISTS (correlated) for better performance on large driving sets, depending on selectivity.");
      }
    }

    // ---------- Performance: UNION vs UNION ALL ----------
    {
      const re = /\bUNION\b(?!\s+ALL)/gi;
      let m;
      while ((m = re.exec(clean))) {
        pushIssue(issues, "performance", "low", "UNION without ALL", lineOf(text, m.index),
          "Plain UNION performs an implicit sort/de-duplication. If the branches are already mutually exclusive or duplicates are acceptable, UNION ALL avoids that cost.");
      }
    }

    // ---------- Performance: legacy (+) outer join syntax ----------
    {
      const re = /\(\s*\+\s*\)/g;
      let m;
      let flagged = false;
      while ((m = re.exec(clean))) {
        if (!flagged) {
          pushIssue(issues, "performance", "low", "Legacy Oracle outer-join syntax (+)", lineOf(text, m.index),
            "The (+) outer join operator is legacy syntax with known ambiguity issues (e.g. combining with OR). Prefer ANSI LEFT/RIGHT/FULL JOIN ... ON syntax.");
          flagged = true;
        }
      }
    }

    // ---------- Performance: nested subqueries depth ----------
    {
      let depth = 0, maxDepth = 0, maxOffset = 0;
      const stack = [];
      for (let i = 0; i < clean.length; i++) {
        if (clean[i] === "(") stack.push(i);
        else if (clean[i] === ")") stack.pop();
        if (clean.substr(i, 6).toUpperCase() === "SELECT") {
          const d = stack.length;
          if (d > maxDepth) { maxDepth = d; maxOffset = i; }
        }
      }
      if (maxDepth >= 3) {
        pushIssue(issues, "performance", "low", `Deeply nested subqueries (depth ${maxDepth})`, lineOf(text, maxOffset),
          "Multiple levels of nested subqueries make the plan harder for the optimizer (and for humans) to reason about. Consider WITH clauses (CTEs) or views to flatten the logic.");
      }
    }

    return issues.sort((a, b) => a.line - b.line);
  }

  return { analyze };
})();

/* =========================================================
   11. STATISTICS PANEL
   ========================================================= */
OracleStudio.Stats = (() => {

  function compute(text) {
    if (!text) text = "";
    const lines = text.split("\n");
    const outline = OracleStudio.Outline.parse(text);
    const counts = OracleStudio.Outline.countByType(outline);
    const flat = OracleStudio.Outline.flatten(outline);

    let toks = [];
    try { toks = OracleStudio.Lexer.tokenize(text); } catch (e) { /* ignore */ }

    let commentCount = 0, blankLines = 0;
    for (const t of toks) if (t.type === "com_line" || t.type === "com_block") commentCount++;
    for (const l of lines) if (l.trim() === "") blankLines++;

    let complexity = 1;
    for (const t of toks) {
      if (t.type === "kw" && ["IF", "ELSIF", "LOOP", "WHEN", "AND", "OR", "CASE"].includes(t.upper)) complexity++;
    }

    // Longest single SQL statement, by character span between top-level statement boundaries.
    const statementRe = /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO)\b[\s\S]*?;/gi;
    let longest = { length: 0, line: 0, preview: "" };
    let m;
    const clean = text;
    while ((m = statementRe.exec(clean))) {
      if (m[0].length > longest.length) {
        let line = 1; for (let i = 0; i < m.index; i++) if (clean[i] === "\n") line++;
        longest = { length: m[0].length, line, preview: m[0].replace(/\s+/g, " ").trim().slice(0, 90) };
      }
    }

    const nonBlank = lines.length - blankLines;
    const avgLineLen = nonBlank ? lines.reduce((a, l) => a + l.length, 0) / lines.length : 0;
    const commentRatio = lines.length ? commentCount / lines.length : 0;
    let readability = 100;
    if (avgLineLen > 100) readability -= Math.min(30, (avgLineLen - 100) / 3);
    if (commentRatio < 0.03) readability -= 10;
    readability -= Math.min(25, Math.max(0, complexity - 15));
    readability = Math.max(5, Math.min(100, Math.round(readability)));

    return {
      lines: lines.length,
      linesOfCode: nonBlank,
      blankLines,
      commentCount,
      packages: (counts.package || 0) + (counts.package_body || 0),
      procedures: counts.procedure || 0,
      functions: counts.function || 0,
      cursors: counts.cursor || 0,
      variablesDeclared: flat.filter(f => f.node.type === "type").length,
      triggers: counts.trigger || 0,
      complexity,
      longest,
      readability
    };
  }

  return { compute };
})();
/* =========================================================
   12. COMPARE CONTROLLER
   ========================================================= */
OracleStudio.CompareController = class CompareController {
  constructor(leftEditor, rightEditor, ui) {
    this.left = leftEditor;
    this.right = rightEditor;
    this.ui = ui; // { diffCountEl, prevBtn, nextBtn, bannerHost }
    this.rows = [];
    this.diffLineIndexes = []; // indexes into rows that are non-equal (for prev/next nav)
    this.currentDiffIndex = -1;
  }

  run(opts) {
    const leftText = this.left.getValue();
    const rightText = this.right.getValue();
    const result = OracleStudio.Diff.diffLines(leftText, rightText, {
      ignoreWhitespace: opts.ignoreWhitespace, ignoreCase: opts.ignoreCase, ignoreComments: opts.ignoreComments
    });
    this.rows = result.rows;
    this.rawA = result.rawA;
    this.rawB = result.rawB;

    const leftClass = (i) => {
      const r = this.rows.find(r => r.a === i);
      if (!r) return null;
      if (r.type === "delete") return "line-del";
      if (r.type === "modify") return r.wsOnly ? "line-ws" : "line-mod";
      return null;
    };
    const rightClass = (i) => {
      const r = this.rows.find(r => r.b === i);
      if (!r) return null;
      if (r.type === "insert") return "line-add";
      if (r.type === "modify") return r.wsOnly ? "line-ws" : "line-mod";
      return null;
    };
    this.left.setDiffLineClasses(leftClass);
    this.right.setDiffLineClasses(rightClass);

    this.diffLineIndexes = [];
    this.rows.forEach((r, idx) => { if (r.type !== "equal") this.diffLineIndexes.push(idx); });
    this.currentDiffIndex = this.diffLineIndexes.length ? 0 : -1;
    this._updateNavUI();

    if (opts.smartEbs) this._runSmartEbs(leftText, rightText);
    else this._clearBanner();

    return result.stats;
  }

  _runSmartEbs(leftText, rightText) {
    const leftOutline = OracleStudio.Outline.flatten(OracleStudio.Outline.parse(leftText))
      .filter(f => f.node.type === "procedure" || f.node.type === "function");
    const rightOutline = OracleStudio.Outline.flatten(OracleStudio.Outline.parse(rightText))
      .filter(f => f.node.type === "procedure" || f.node.type === "function");
    const leftNames = new Set(leftOutline.map(f => f.node.name.toLowerCase()));
    const rightNames = new Set(rightOutline.map(f => f.node.name.toLowerCase()));
    const added = rightOutline.filter(f => !leftNames.has(f.node.name.toLowerCase()));
    const removed = leftOutline.filter(f => !rightNames.has(f.node.name.toLowerCase()));
    const changed = [];
    for (const lf of leftOutline) {
      const rf = rightOutline.find(f => f.node.name.toLowerCase() === lf.node.name.toLowerCase());
      if (!rf) continue;
      const lBody = this.rawA.slice(lf.node.line - 1, lf.node.endLine || lf.node.line).join("\n");
      const rBody = this.rawB.slice(rf.node.line - 1, rf.node.endLine || rf.node.line).join("\n");
      const d = OracleStudio.Diff.diffLines(lBody, rBody, { ignoreWhitespace: true, ignoreCase: true, ignoreComments: true });
      if (d.stats.added || d.stats.removed || d.stats.modified) changed.push(lf.node.name);
    }
    this._renderBanner({ added, removed, changed });
  }

  _renderBanner({ added, removed, changed }) {
    if (!this.ui.bannerHost) return;
    if (!added.length && !removed.length && !changed.length) {
      this.ui.bannerHost.innerHTML = `<div class="ebs-compare-banner">Smart EBS Compare: no procedure/function signature changes detected.</div>`;
      return;
    }
    const parts = [];
    if (added.length) parts.push(`<b>${added.length}</b> added: ${added.map(f => f.node.name).join(", ")}`);
    if (removed.length) parts.push(`<b>${removed.length}</b> removed: ${removed.map(f => f.node.name).join(", ")}`);
    if (changed.length) parts.push(`<b>${changed.length}</b> changed: ${changed.join(", ")}`);
    this.ui.bannerHost.innerHTML = `<div class="ebs-compare-banner">Smart EBS Compare — ${parts.join(" &nbsp;|&nbsp; ")}</div>`;
  }

  _clearBanner() { if (this.ui.bannerHost) this.ui.bannerHost.innerHTML = ""; }

  _updateNavUI() {
    const total = this.diffLineIndexes.length;
    const cur = total ? this.currentDiffIndex + 1 : 0;
    if (this.ui.diffCountEl) this.ui.diffCountEl.textContent = `${cur}/${total}`;
  }

  gotoDiff(dir) {
    if (!this.diffLineIndexes.length) return;
    this.currentDiffIndex = (this.currentDiffIndex + dir + this.diffLineIndexes.length) % this.diffLineIndexes.length;
    const rowIdx = this.diffLineIndexes[this.currentDiffIndex];
    const row = this.rows[rowIdx];
    const line = row.a >= 0 ? row.a : row.b;
    this.left.scrollToLine(row.a >= 0 ? row.a : line);
    this.right.scrollToLine(row.b >= 0 ? row.b : line);
    this._updateNavUI();
  }
};

/* =========================================================
   13. MERGE CONTROLLER
   ========================================================= */
OracleStudio.MergeController = class MergeController {
  constructor(leftEditor, rightEditor, resultEditor, ui) {
    this.left = leftEditor;
    this.right = rightEditor;
    this.result = resultEditor;
    this.ui = ui; // { countEl }
    this.hunks = [];
    this.currentConflict = -1;
    this.undoStack = [];
    this.redoStack = [];
  }

  detect() {
    const leftText = this.left.getValue();
    const rightText = this.right.getValue();
    const { rows, rawA, rawB } = OracleStudio.Diff.diffLines(leftText, rightText, {});
    this.rawA = rawA; this.rawB = rawB;
    const hunks = [];
    let i = 0;
    while (i < rows.length) {
      const r = rows[i];
      if (r.type === "equal") {
        const start = i;
        while (i < rows.length && rows[i].type === "equal") i++;
        hunks.push({ type: "equal", lines: rows.slice(start, i).map(x => rawA[x.a]) });
      } else {
        const start = i;
        while (i < rows.length && rows[i].type !== "equal") i++;
        const seg = rows.slice(start, i);
        const leftLines = seg.filter(x => x.a >= 0).map(x => rawA[x.a]);
        const rightLines = seg.filter(x => x.b >= 0).map(x => rawB[x.b]);
        hunks.push({ type: "conflict", leftLines, rightLines, resolution: null });
      }
    }
    this.hunks = hunks;
    this.undoStack = []; this.redoStack = [];
    this.currentConflict = this._firstUnresolved();
    this.render();
    return this.conflictCount();
  }

  conflictCount() { return this.hunks.filter(h => h.type === "conflict").length; }
  unresolvedCount() { return this.hunks.filter(h => h.type === "conflict" && !h.resolution).length; }

  _firstUnresolved() {
    return this.hunks.findIndex(h => h.type === "conflict" && !h.resolution);
  }

  _conflictIndexes() {
    const out = [];
    this.hunks.forEach((h, i) => { if (h.type === "conflict") out.push(i); });
    return out;
  }

  gotoConflict(dir) {
    const idxs = this._conflictIndexes();
    if (!idxs.length) return;
    let pos = idxs.indexOf(this.currentConflict);
    pos = (pos + dir + idxs.length) % idxs.length;
    this.currentConflict = idxs[pos];
    this._updateCountUI();
  }

  _snapshot() { return this.hunks.map(h => h.resolution); }
  _pushUndo() {
    this.undoStack.push(this._snapshot());
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  resolveCurrent(resolution) {
    if (this.currentConflict < 0 || !this.hunks[this.currentConflict]) return;
    this._pushUndo();
    this.hunks[this.currentConflict].resolution = resolution;
    const next = this._firstUnresolved();
    if (next !== -1) this.currentConflict = next;
    this.render();
  }

  resolveAllSmart() {
    this._pushUndo();
    for (const h of this.hunks) {
      if (h.type !== "conflict" || h.resolution) continue;
      if (h.leftLines.length === 0) h.resolution = "right";
      else if (h.rightLines.length === 0) h.resolution = "left";
      else h.resolution = "right";
    }
    this.currentConflict = -1;
    this.render();
  }

  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this._snapshot());
    const snap = this.undoStack.pop();
    snap.forEach((res, i) => { if (this.hunks[i]) this.hunks[i].resolution = res; });
    this.currentConflict = this._firstUnresolved();
    this.render();
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this._snapshot());
    const snap = this.redoStack.pop();
    snap.forEach((res, i) => { if (this.hunks[i]) this.hunks[i].resolution = res; });
    this.currentConflict = this._firstUnresolved();
    this.render();
  }

  render() {
    const parts = [];
    const diffClasses = [];
    let lineNo = 0;
    const track = (n, cls) => { for (let k = 0; k < n; k++) diffClasses[lineNo++] = cls; };

    for (const h of this.hunks) {
      if (h.type === "equal") { parts.push(...h.lines); track(h.lines.length, null); continue; }
      if (h.resolution === "left") { parts.push(...h.leftLines); track(h.leftLines.length, "line-mod"); }
      else if (h.resolution === "right") { parts.push(...h.rightLines); track(h.rightLines.length, "line-add"); }
      else if (h.resolution === "both") { parts.push(...h.leftLines, ...h.rightLines); track(h.leftLines.length + h.rightLines.length, "line-mod"); }
      else {
        parts.push("<<<<<<< LEFT"); track(1, "line-del");
        parts.push(...h.leftLines); track(h.leftLines.length, "line-del");
        parts.push("======="); track(1, "line-del");
        parts.push(...h.rightLines); track(h.rightLines.length, "line-add");
        parts.push(">>>>>>> RIGHT"); track(1, "line-add");
      }
    }
    this.result.setValue(parts.join("\n"), { silent: true });
    this.result.setDiffLineClasses((i) => diffClasses[i] || null);
    this.result._renderHighlight();
    this._updateCountUI();
  }

  _updateCountUI() {
    if (!this.ui.countEl) return;
    const total = this.conflictCount();
    const unresolved = this.unresolvedCount();
    this.ui.countEl.textContent = `${unresolved}/${total} conflicts`;
  }
};
/* =========================================================
   14. STORAGE MANAGER (localStorage autosave)
   ========================================================= */
OracleStudio.Storage = (() => {
  const K_SETTINGS = "oss.settings.v1";
  const K_BUFFERS = "oss.buffers.v1";
  const K_RECENT = "oss.recentFiles.v1";
  const K_CLIPBOARD = "oss.clipboardHistory.v1";
  const K_FORMAT_HIST = "oss.formatHistory.v1";
  const K_COMPARE_HIST = "oss.comparisonHistory.v1";

  const DEFAULTS = {
    theme: "dark", style: "enterprise", indentSize: 2, fontSize: 14,
    uppercase: true, align: true, commaStyle: "trailing", collapseBlank: true,
    wordWrap: false, autoSave: true, ebsMode: false
  };

  function get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  }
  function set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }
  function pushCapped(key, item, cap) {
    const list = get(key, []);
    list.unshift(item);
    set(key, list.slice(0, cap));
  }

  return {
    DEFAULTS,
    loadSettings: () => Object.assign({}, DEFAULTS, get(K_SETTINGS, {})),
    saveSettings: (s) => set(K_SETTINGS, s),
    loadBuffers: () => get(K_BUFFERS, null),
    saveBuffers: (b) => set(K_BUFFERS, b),
    addRecentFile: (name) => pushCapped(K_RECENT, { name, at: Date.now() }, 20),
    getRecentFiles: () => get(K_RECENT, []),
    addClipboardEntry: (text) => pushCapped(K_CLIPBOARD, { text: text.slice(0, 2000), at: Date.now() }, 20),
    getClipboardHistory: () => get(K_CLIPBOARD, []),
    addFormatHistoryEntry: (meta) => pushCapped(K_FORMAT_HIST, meta, 30),
    getFormatHistory: () => get(K_FORMAT_HIST, []),
    addCompareHistoryEntry: (meta) => pushCapped(K_COMPARE_HIST, meta, 30),
    getCompareHistory: () => get(K_COMPARE_HIST, [])
  };
})();

/* =========================================================
   15. EXPORT MANAGER
   ========================================================= */
OracleStudio.Export = (() => {
  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const HTML_TEMPLATE_CSS = `
    body{background:#0e1116;color:#e8edf5;font-family:ui-monospace,"Cascadia Code",Consolas,monospace;
      font-size:13px;line-height:1.55;padding:20px;white-space:pre-wrap;word-break:break-word;}
    .tok-kw{color:#c586e0;font-weight:600}.tok-func{color:#4fb0e0}.tok-str{color:#ce9178}
    .tok-num{color:#b5cea8}.tok-com{color:#6a9955;font-style:italic}.tok-hint{color:#f0b429;font-style:italic}
    .tok-exc{color:#ff8686;font-weight:600}.tok-bind{color:#e6923a}.tok-ident{color:#e8edf5}
    .tok-ddl{color:#c586e0;font-weight:700}.tok-todo{color:#f0b429;font-weight:700}
  `;

  function toHtmlDocument(content, title, opts) {
    const body = OracleStudio.Highlighter.render(content, opts || {});
    return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${HTML_TEMPLATE_CSS}</style></head><body>${body}</body></html>`;
  }

  function toMarkdown(content) {
    return "```sql\n" + content.replace(/```/g, "​```") + "\n```\n";
  }

  async function copyToClipboard(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); ta.remove();
        return true;
      } catch (e2) { return false; }
    }
  }

  function printForPdf(content, title) {
    const win = window.open("", "_blank");
    if (!win) return false;
    win.document.write(toHtmlDocument(content, title || "Export"));
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 300);
    return true;
  }

  return { download, toHtmlDocument, toMarkdown, copyToClipboard, printForPdf };
})();
/* =========================================================
   16. APP — wires the whole UI together
   ========================================================= */
OracleStudio.App = class App {
  constructor() {
    this.$ = (sel) => document.querySelector(sel);
    this.$$ = (sel) => Array.from(document.querySelectorAll(sel));
    this.settings = OracleStudio.Storage.loadSettings();
    this.buffers = [];
    this.activeBufferId = null;
    this.mode = "editor";
    this.nextBufferSeq = 1;
    this.replaceVisible = false;
  }

  init() {
    this._applyTheme(this.settings.theme);
    this._buildEditors();
    this._restoreBuffersOrSeed();
    this._bindToolbar();
    this._bindTabs();
    this._bindSidebar();
    this._bindSplitters();
    this._bindFindBar();
    this._bindCompareView();
    this._bindMergeView();
    this._bindInsightTabs();
    this._bindModals();
    this._bindDragDrop();
    this._bindKeyboard();
    this._applySettingsToControls();
    this._renderActiveBuffer();
    setInterval(() => this._autoSave(), 15000);
    window.addEventListener("beforeunload", () => this._autoSave());
    this.toast("Oracle SQL & PL/SQL Studio ready.", "success");
  }

  // ---------- Editors ----------
  _buildEditors() {
    const cursorHandler = (info) => {
      this.$("#statCursor").textContent = `Ln ${info.line}, Col ${info.col}`;
      this.$("#statSel").textContent = `${info.selLen} selected`;
      this.$("#statLines").textContent = `${info.totalLines} lines`;
    };
    const changeHandler = () => { this._onEditorChange(); };

    this.mainEditor = new OracleStudio.CodeEditor(this.$("#editorPane"), {
      value: "", fontSize: this.settings.fontSize, ebsMode: this.settings.ebsMode,
      onChange: changeHandler, onCursor: cursorHandler
    });
    this.compareLeftEditor = new OracleStudio.CodeEditor(this.$("#compareLeftEditor"), {
      value: "", fontSize: this.settings.fontSize, ebsMode: this.settings.ebsMode
    });
    this.compareRightEditor = new OracleStudio.CodeEditor(this.$("#compareRightEditor"), {
      value: "", fontSize: this.settings.fontSize, ebsMode: this.settings.ebsMode
    });
    this.mergeLeftEditor = new OracleStudio.CodeEditor(this.$("#mergeLeftEditor"), {
      value: "", fontSize: this.settings.fontSize
    });
    this.mergeRightEditor = new OracleStudio.CodeEditor(this.$("#mergeRightEditor"), {
      value: "", fontSize: this.settings.fontSize
    });
    this.mergeResultEditor = new OracleStudio.CodeEditor(this.$("#mergeResultEditor"), {
      value: "", fontSize: this.settings.fontSize
    });

    this.compareCtrl = new OracleStudio.CompareController(this.compareLeftEditor, this.compareRightEditor, {
      diffCountEl: this.$("#diffCount"), bannerHost: this.$("#compareBanner")
    });
    this.mergeCtrl = new OracleStudio.MergeController(this.mergeLeftEditor, this.mergeRightEditor, this.mergeResultEditor, {
      countEl: this.$("#conflictCount")
    });
  }

  _onEditorChange() {
    const buf = this.getActiveBuffer();
    if (buf) {
      const text = this.mainEditor.getValue();
      buf.dirty = text !== buf.savedContent;
      buf.content = text;
      this._renderTabs();
    }
    this._refreshInsights();
    this._refreshOutline();
  }

  // ---------- Buffers / Tabs ----------
  _restoreBuffersOrSeed() {
    const saved = OracleStudio.Storage.loadBuffers();
    if (saved && Array.isArray(saved.buffers) && saved.buffers.length) {
      this.buffers = saved.buffers.map(b => ({ ...b, dirty: false, savedContent: b.content }));
      this.activeBufferId = saved.activeBufferId && this.buffers.some(b => b.id === saved.activeBufferId)
        ? saved.activeBufferId : this.buffers[0].id;
      this.nextBufferSeq = (saved.nextBufferSeq || this.buffers.length + 1);
    } else {
      this.newBuffer("Welcome.sql", SAMPLE_WELCOME_SQL);
    }
    this._renderTabs();
  }

  newBuffer(name, content = "") {
    const id = "buf-" + (this.nextBufferSeq++);
    const buf = { id, name, content, savedContent: content, dirty: false };
    this.buffers.push(buf);
    this.activeBufferId = id;
    this._renderTabs();
    this._renderActiveBuffer();
    return buf;
  }

  getActiveBuffer() { return this.buffers.find(b => b.id === this.activeBufferId); }

  switchBuffer(id) {
    if (id === this.activeBufferId) return;
    this.activeBufferId = id;
    this._renderTabs();
    this._renderActiveBuffer();
  }

  closeBuffer(id) {
    const idx = this.buffers.findIndex(b => b.id === id);
    if (idx === -1) return;
    const buf = this.buffers[idx];
    if (buf.dirty && !confirm(`"${buf.name}" has unsaved changes. Close anyway?`)) return;
    this.buffers.splice(idx, 1);
    if (!this.buffers.length) { this.newBuffer("Untitled-" + this.nextBufferSeq + ".sql", ""); return; }
    if (this.activeBufferId === id) this.activeBufferId = this.buffers[Math.max(0, idx - 1)].id;
    this._renderTabs();
    this._renderActiveBuffer();
  }

  _renderActiveBuffer() {
    const buf = this.getActiveBuffer();
    if (!buf) return;
    this.mainEditor.setValue(buf.content, { silent: true });
    this.$("#statFileType").textContent = (buf.name.split(".").pop() || "sql").toUpperCase();
    this._refreshInsights();
    this._refreshOutline();
  }

  _renderTabs() {
    const bar = this.$("#tabbar");
    bar.innerHTML = "";
    for (const buf of this.buffers) {
      const tab = document.createElement("div");
      tab.className = "tab" + (buf.id === this.activeBufferId ? " active" : "") + (buf.dirty ? " dirty" : "");
      tab.innerHTML = `<span class="tab-dirty"></span><span class="tab-name">${OracleStudio.Highlighter.esc(buf.name)}</span>
        <span class="tab-close"><svg class="icon"><use href="#ic-close"/></svg></span>`;
      tab.addEventListener("click", (e) => {
        if (e.target.closest(".tab-close")) { this.closeBuffer(buf.id); return; }
        this.switchBuffer(buf.id);
      });
      bar.appendChild(tab);
    }
    const addBtn = document.createElement("div");
    addBtn.className = "tab-add";
    addBtn.title = "New file";
    addBtn.innerHTML = `<svg class="icon"><use href="#ic-plus"/></svg>`;
    addBtn.addEventListener("click", () => this.newBuffer(`Untitled-${this.nextBufferSeq}.sql`, ""));
    bar.appendChild(addBtn);
    this._refreshSourceSelects();
  }

  _refreshSourceSelects() {
    for (const sel of [this.$("#cmpLeftSource"), this.$("#cmpRightSource")]) {
      if (!sel) continue;
      const cur = sel.value;
      sel.innerHTML = `<option value="">— paste/type manually —</option>` +
        this.buffers.map(b => `<option value="${b.id}">${OracleStudio.Highlighter.esc(b.name)}</option>`).join("");
      if (cur) sel.value = cur;
    }
  }

  // ---------- Toolbar ----------
  _bindToolbar() {
    this.$("#btnNewFile").addEventListener("click", () => this.newBuffer(`Untitled-${this.nextBufferSeq}.sql`, ""));
    this.$("#btnOpenFile").addEventListener("click", () => this.$("#fileInput").click());
    this.$("#fileInput").addEventListener("change", (e) => this._openFiles(e.target.files));
    this.$("#btnSave").addEventListener("click", () => this.saveActive());
    this.$("#btnDownload").addEventListener("click", () => this.openModal("modalExport"));

    this.$("#btnFormat").addEventListener("click", () => this.formatActive());
    const styleSelect = this.$("#styleSelect");
    styleSelect.value = this.settings.style;
    styleSelect.addEventListener("change", () => {
      this.settings.style = styleSelect.value;
      this.$("#statStyle").textContent = styleSelect.options[styleSelect.selectedIndex].text;
      OracleStudio.Storage.saveSettings(this.settings);
    });
    this.$("#statStyle").textContent = styleSelect.options[styleSelect.selectedIndex].text;

    this.$$(".mode-btn").forEach(btn => btn.addEventListener("click", () => this.setMode(btn.dataset.mode)));

    this.$("#btnSearch").addEventListener("click", () => this.openFindBar(false));
    this.$("#btnReplace").addEventListener("click", () => this.openFindBar(true));
    this.$("#btnStats").addEventListener("click", () => { this._openSidebarRight(); this._selectInsightTab("stats"); });
    this.$("#btnQuality").addEventListener("click", () => { this._openSidebarRight(); this._selectInsightTab("quality"); });
    this.$("#btnEbsMode").addEventListener("click", () => this.toggleEbsMode());

    this.$("#btnTheme").addEventListener("click", () => this._applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"));
    this.$("#btnSettings").addEventListener("click", () => this.openModal("modalSettings"));
    this.$("#btnHelp").addEventListener("click", () => this.openModal("modalHelp"));
  }

  setMode(mode) {
    this.mode = mode;
    this.$$(".mode-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
    this.$("#view-editor").hidden = mode !== "editor";
    this.$("#view-compare").hidden = mode !== "compare";
    this.$("#view-merge").hidden = mode !== "merge";
    setTimeout(() => {
      [this.mainEditor, this.compareLeftEditor, this.compareRightEditor, this.mergeLeftEditor, this.mergeRightEditor, this.mergeResultEditor]
        .forEach(ed => ed && ed._syncHeight && ed._syncHeight());
    }, 10);
  }

  formatActive() {
    const buf = this.getActiveBuffer();
    if (!buf) return;
    try {
      const cfg = this._formatterConfig();
      const out = OracleStudio.Formatter.format(this.mainEditor.getValue(), cfg);
      this.mainEditor.setValue(out);
      buf.content = out;
      OracleStudio.Storage.addFormatHistoryEntry({ name: buf.name, style: cfg.style, at: Date.now() });
      this.toast("Formatted using " + this._styleLabel(cfg.style) + " style.", "success");
    } catch (e) {
      this.toast("Format failed: " + e.message, "error");
    }
  }

  _formatterConfig() {
    return {
      style: this.settings.style, indentSize: this.settings.indentSize, uppercase: this.settings.uppercase,
      align: this.settings.align, commaStyle: this.settings.commaStyle, collapseBlank: this.settings.collapseBlank
    };
  }
  _styleLabel(v) {
    const sel = this.$("#styleSelect");
    const opt = Array.from(sel.options).find(o => o.value === v);
    return opt ? opt.text : v;
  }

  toggleEbsMode() {
    this.settings.ebsMode = !this.settings.ebsMode;
    OracleStudio.Storage.saveSettings(this.settings);
    this.$("#btnEbsMode").classList.toggle("active", this.settings.ebsMode);
    this.$("#statEbs").hidden = !this.settings.ebsMode;
    [this.mainEditor, this.compareLeftEditor, this.compareRightEditor].forEach(ed => ed.setEbsMode(this.settings.ebsMode));
    this._refreshOutline();
    this.toast("Oracle EBS Smart Mode " + (this.settings.ebsMode ? "enabled" : "disabled"), "success");
  }

  // ---------- File I/O ----------
  _openFiles(fileList) {
    const files = Array.from(fileList || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        this.newBuffer(file.name, String(reader.result || ""));
        OracleStudio.Storage.addRecentFile(file.name);
        this.toast(`Opened ${file.name}`, "success");
      };
      reader.onerror = () => this.toast(`Could not read ${file.name}`, "error");
      reader.readAsText(file);
    });
    this.$("#fileInput").value = "";
  }

  saveActive() {
    const buf = this.getActiveBuffer();
    if (!buf) return;
    buf.content = this.mainEditor.getValue();
    buf.savedContent = buf.content;
    buf.dirty = false;
    this._renderTabs();
    this._autoSave();
    this.toast(`Saved "${buf.name}" to browser storage.`, "success");
  }

  _autoSave() {
    if (!this.settings.autoSave) return;
    const buf = this.getActiveBuffer();
    if (buf && this.mode === "editor") buf.content = this.mainEditor.getValue();
    OracleStudio.Storage.saveBuffers({
      buffers: this.buffers.map(b => ({ id: b.id, name: b.name, content: b.content })),
      activeBufferId: this.activeBufferId, nextBufferSeq: this.nextBufferSeq
    });
  }

  // ---------- Tabs binding (delegated in _renderTabs) ----------
  _bindTabs() { /* handled per-render in _renderTabs */ }

  // ---------- Sidebar (outline + insights) ----------
  _bindSidebar() {
    this.$$(".sidebar-collapse").forEach(btn => {
      btn.addEventListener("click", () => {
        const target = this.$("#" + btn.dataset.target);
        target.classList.toggle("collapsed");
      });
    });
    this.$("#outlineFilter").addEventListener("input", () => this._refreshOutline());
  }

  _openSidebarRight() { this.$("#sidebarRight").classList.remove("collapsed"); }

  _bindInsightTabs() {
    this.$$(".insight-tab").forEach(tab => tab.addEventListener("click", () => this._selectInsightTab(tab.dataset.panel)));
  }
  _selectInsightTab(panel) {
    this.$$(".insight-tab").forEach(t => t.classList.toggle("active", t.dataset.panel === panel));
    ["stats", "quality", "perf"].forEach(p => { this.$("#panel-" + p).hidden = p !== panel; });
  }

  _refreshOutline() {
    const text = this.mainEditor.getValue();
    const tree = OracleStudio.Outline.parse(text);
    const filter = (this.$("#outlineFilter").value || "").toLowerCase();
    const host = this.$("#outlineTree");
    host.innerHTML = "";
    if (!tree.length) { host.innerHTML = `<div class="empty-hint">No objects detected yet. Start typing or open a file.</div>`; }
    else {
      const frag = document.createDocumentFragment();
      const anyMatch = this._renderOutlineNodes(tree, frag, filter);
      if (filter && !anyMatch) host.innerHTML = `<div class="empty-hint">No objects match "${OracleStudio.Highlighter.esc(filter)}".</div>`;
      else host.appendChild(frag);
    }

    if (this.settings.ebsMode) {
      const info = OracleStudio.EbsMode.analyze(text);
      const area = this.$("#ebsBadgeArea");
      if (!info.detected) area.innerHTML = "No Oracle EBS patterns detected.";
      else {
        area.innerHTML = info.modules.slice(0, 6).map(m =>
          `<div class="tree-badge ebs" style="display:inline-block;margin:2px 4px 2px 0;">${OracleStudio.Highlighter.esc(m.label)} × ${m.count}</div>`
        ).join("") + (info.whoColumnCount ? `<div style="margin-top:6px;">WHO columns: ${info.whoColumnCount}</div>` : "");
      }
    } else {
      this.$("#ebsBadgeArea").innerHTML = "";
    }
  }

  _renderOutlineNodes(nodes, container, filter) {
    let any = false;
    const icons = { package: "ic-cube", package_body: "ic-cube", procedure: "ic-func", function: "ic-func", cursor: "ic-cursor", type: "ic-database", trigger: "ic-zap" };
    for (const node of nodes) {
      const selfMatch = !filter || node.name.toLowerCase().includes(filter);
      const childWrap = document.createElement("div");
      const childHasMatch = node.children && node.children.length ? this._renderOutlineNodes(node.children, childWrap, filter) : false;
      if (!selfMatch && !childHasMatch) continue;
      any = true;
      const row = document.createElement("div");
      row.className = "tree-node";
      const hasKids = node.children && node.children.length > 0;
      row.innerHTML = `<div class="tree-row" data-line="${node.line - 1}">
          <span class="twist">${hasKids ? '<svg class="icon"><use href="#ic-chevron-down"/></svg>' : ""}</span>
          <svg class="icon"><use href="#${icons[node.type] || "ic-file"}"/></svg>
          <span>${OracleStudio.Highlighter.esc(node.name)}</span>
          ${node.ebs ? `<span class="tree-badge ebs">${OracleStudio.Highlighter.esc(node.ebs.module || "EBS")}</span>` : ""}
        </div>`;
      const rowEl = row.querySelector(".tree-row");
      rowEl.addEventListener("click", (e) => {
        if (e.target.closest(".twist") && hasKids) { childWrap.classList.toggle("collapsed"); return; }
        this.mainEditor.setCursorToLine(node.line - 1);
        this.mainEditor.focus();
      });
      childWrap.className = "tree-children";
      row.appendChild(childWrap);
      container.appendChild(row);
    }
    return any;
  }

  _refreshInsights() {
    const text = this.mainEditor.getValue();
    this._renderStats(OracleStudio.Stats.compute(text));
    this._renderQuality(OracleStudio.QualityAnalyzer.analyze(text));
  }

  _renderStats(s) {
    const host = this.$("#panel-stats");
    host.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-value">${s.packages}</div><div class="stat-label">Packages</div></div>
        <div class="stat-card"><div class="stat-value">${s.procedures}</div><div class="stat-label">Procedures</div></div>
        <div class="stat-card"><div class="stat-value">${s.functions}</div><div class="stat-label">Functions</div></div>
        <div class="stat-card"><div class="stat-value">${s.cursors}</div><div class="stat-label">Cursors</div></div>
        <div class="stat-card"><div class="stat-value">${s.triggers}</div><div class="stat-label">Triggers</div></div>
        <div class="stat-card"><div class="stat-value">${s.linesOfCode}</div><div class="stat-label">Lines of Code</div></div>
        <div class="stat-card"><div class="stat-value">${s.commentCount}</div><div class="stat-label">Comments</div></div>
        <div class="stat-card"><div class="stat-value">${s.blankLines}</div><div class="stat-label">Blank Lines</div></div>
        <div class="stat-card"><div class="stat-value">${s.complexity}</div><div class="stat-label">Complexity Score</div></div>
        <div class="stat-card"><div class="stat-value">${s.lines}</div><div class="stat-label">Total Lines</div></div>
        <div class="stat-card stat-full">
          <div class="stat-label">Readability Score</div>
          <div class="stat-value">${s.readability}/100</div>
          <div class="score-bar"><div class="score-bar-fill" style="width:${s.readability}%"></div></div>
        </div>
        <div class="stat-card stat-full">
          <div class="stat-label">Longest Query (line ${s.longest.line || "—"}, ${s.longest.length} chars)</div>
          <div style="font-family:ui-monospace,monospace;font-size:11px;color:var(--text-1);margin-top:4px;word-break:break-all;">${OracleStudio.Highlighter.esc(s.longest.preview || "—")}</div>
        </div>
      </div>`;
  }

  _renderQuality(issues) {
    const quality = issues.filter(i => i.category === "quality");
    const perf = issues.filter(i => i.category === "performance");
    this.$("#panel-quality").innerHTML = this._issuesHtml(quality, "No code quality issues detected.");
    this.$("#panel-perf").innerHTML = this._issuesHtml(perf, "No performance issues detected.");
    this.$$("#panel-quality .issue-item, #panel-perf .issue-item").forEach(el => {
      el.addEventListener("click", () => { this.mainEditor.setCursorToLine(parseInt(el.dataset.line, 10) - 1); this.mainEditor.focus(); });
    });
  }

  _issuesHtml(list, emptyMsg) {
    if (!list.length) return `<div class="issue-empty">${emptyMsg}</div>`;
    return list.map(i => `
      <div class="issue-item issue-sev-${i.severity}" data-line="${i.line}">
        <div class="issue-title"><svg class="icon"><use href="#ic-warning"/></svg>${OracleStudio.Highlighter.esc(i.title)}<span class="issue-line">Ln ${i.line}</span></div>
        <div class="issue-desc">${OracleStudio.Highlighter.esc(i.description)}</div>
      </div>`).join("");
  }

  // ---------- Splitters ----------
  _bindSplitters() {
    this._makeSplitter(this.$("#splitLeft"), this.$("#sidebarLeft"), 1);
    this._makeSplitter(this.$("#splitRight"), this.$("#sidebarRight"), -1);
  }
  _makeSplitter(handle, panel, dir) {
    let dragging = false, startX = 0, startW = 0;
    handle.addEventListener("mousedown", (e) => {
      dragging = true; startX = e.clientX; startW = panel.getBoundingClientRect().width;
      handle.classList.add("dragging"); e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const delta = (e.clientX - startX) * dir;
      panel.style.width = Math.max(160, Math.min(480, startW + delta)) + "px";
    });
    window.addEventListener("mouseup", () => { dragging = false; handle.classList.remove("dragging"); });
  }

  // ---------- Find / Replace ----------
  _bindFindBar() {
    const bar = this.$("#findbar");
    this.$("#findInput").addEventListener("input", () => this._runSearch());
    this.$("#optRegex").addEventListener("change", () => this._runSearch());
    this.$("#optWholeWord").addEventListener("change", () => this._runSearch());
    this.$("#optCaseSensitive").addEventListener("change", () => this._runSearch());
    this.$("#findNext").addEventListener("click", () => this._activeSearchEditor().findNext());
    this.$("#findPrev").addEventListener("click", () => this._activeSearchEditor().findPrev());
    this.$("#findInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.shiftKey ? this._activeSearchEditor().findPrev() : this._activeSearchEditor().findNext(); }
      if (e.key === "Escape") this.closeFindBar();
    });
    this.$("#replaceOne").addEventListener("click", () => {
      this._activeSearchEditor().replaceCurrent(this.$("#replaceInput").value);
      this._runSearch();
    });
    this.$("#replaceAll").addEventListener("click", () => {
      const n = this._activeSearchEditor().replaceAll(this.$("#findInput").value, this.$("#replaceInput").value, this._searchOpts());
      this.toast(`Replaced ${n} occurrence${n === 1 ? "" : "s"}.`, "success");
      this._runSearch();
    });
    this.$("#findbarClose").addEventListener("click", () => this.closeFindBar());
  }

  _activeSearchEditor() {
    if (this.mode === "compare") return this.compareRightEditor;
    if (this.mode === "merge") return this.mergeResultEditor;
    return this.mainEditor;
  }
  _searchOpts() {
    return { regex: this.$("#optRegex").checked, wholeWord: this.$("#optWholeWord").checked, caseSensitive: this.$("#optCaseSensitive").checked };
  }
  _runSearch() {
    const q = this.$("#findInput").value;
    const res = this._activeSearchEditor().search(q, this._searchOpts());
    if (res.error) { this.$("#findCount").textContent = "err"; return; }
    this.$("#findCount").textContent = res.count ? `1/${res.count}` : "0/0";
  }
  openFindBar(withReplace) {
    this.$("#findbar").hidden = false;
    this.replaceVisible = withReplace;
    ["#replaceInput", "#replaceOne", "#replaceAll"].forEach(sel => this.$(sel).hidden = !withReplace);
    this.$("#findInput").focus();
    this.$("#findInput").select();
  }
  closeFindBar() {
    this.$("#findbar").hidden = true;
    this._activeSearchEditor().search("", {});
    this.$("#findCount").textContent = "0/0";
    this.mainEditor.focus();
  }

  // ---------- Compare view ----------
  _bindCompareView() {
    this.$("#btnCompareRun").addEventListener("click", () => this._runCompare());
    this.$("#btnCompareSwap").addEventListener("click", () => {
      const l = this.compareLeftEditor.getValue(), r = this.compareRightEditor.getValue();
      this.compareLeftEditor.setValue(r); this.compareRightEditor.setValue(l);
      this._runCompare();
    });
    this.$("#cmpLeftSource").addEventListener("change", (e) => this._loadCompareSource("left", e.target.value));
    this.$("#cmpRightSource").addEventListener("change", (e) => this._loadCompareSource("right", e.target.value));
    this.$("#cmpViewSideBySide").addEventListener("click", () => this._setCompareViewMode("side"));
    this.$("#cmpViewInline").addEventListener("click", () => this._setCompareViewMode("inline"));
    this.$("#diffPrev").addEventListener("click", () => this.compareCtrl.gotoDiff(-1));
    this.$("#diffNext").addEventListener("click", () => this.compareCtrl.gotoDiff(1));
    ["#cmpIgnoreWhitespace", "#cmpIgnoreCase", "#cmpIgnoreComments", "#cmpSmartEbs"].forEach(sel =>
      this.$(sel).addEventListener("change", () => this._runCompare()));
  }

  _loadCompareSource(side, bufferId) {
    const nameEl = this.$(side === "left" ? "#cmpLeftName" : "#cmpRightName");
    const editor = side === "left" ? this.compareLeftEditor : this.compareRightEditor;
    if (!bufferId) return;
    const buf = this.buffers.find(b => b.id === bufferId);
    if (!buf) return;
    editor.setValue(buf.content);
    nameEl.textContent = buf.name;
    this._runCompare();
  }

  _setCompareViewMode(v) {
    this.$("#compareBody").classList.toggle("inline-mode", v === "inline");
    this.$$("#btnCompareRun ~ .toolbar-group [data-cmpview]").forEach(b => b.classList.toggle("active", b.dataset.cmpview === v));
  }

  _runCompare() {
    const stats = this.compareCtrl.run({
      ignoreWhitespace: this.$("#cmpIgnoreWhitespace").checked,
      ignoreCase: this.$("#cmpIgnoreCase").checked,
      ignoreComments: this.$("#cmpIgnoreComments").checked,
      smartEbs: this.$("#cmpSmartEbs").checked
    });
    OracleStudio.Storage.addCompareHistoryEntry({ at: Date.now(), stats });
    this.toast(`Compared: +${stats.added} / -${stats.removed} / ~${stats.modified} (${stats.wsOnly} whitespace-only)`, "success");
  }

  // ---------- Merge view ----------
  _bindMergeView() {
    this.$("#mergeRun").addEventListener("click", () => {
      const n = this.mergeCtrl.detect();
      this.toast(`${n} conflict region${n === 1 ? "" : "s"} detected.`, n ? "warn" : "success");
    });
    this.$("#mergeAll").addEventListener("click", () => { this.mergeCtrl.resolveAllSmart(); this.toast("Auto-resolved remaining conflicts.", "success"); });
    this.$("#mergeUndo").addEventListener("click", () => this.mergeCtrl.undo());
    this.$("#mergeRedo").addEventListener("click", () => this.mergeCtrl.redo());
    this.$("#conflictPrev").addEventListener("click", () => this.mergeCtrl.gotoConflict(-1));
    this.$("#conflictNext").addEventListener("click", () => this.mergeCtrl.gotoConflict(1));
    this.$("#takeLeft").addEventListener("click", () => this.mergeCtrl.resolveCurrent("left"));
    this.$("#takeRight").addEventListener("click", () => this.mergeCtrl.resolveCurrent("right"));
    this.$("#takeBoth").addEventListener("click", () => this.mergeCtrl.resolveCurrent("both"));
    this.$("#mergePreview").addEventListener("click", () => {
      const unresolved = this.mergeCtrl.unresolvedCount();
      this.toast(unresolved ? `${unresolved} conflict(s) still unresolved.` : "All conflicts resolved — merge is ready to download.", unresolved ? "warn" : "success");
    });
    this.$("#mergeDownload").addEventListener("click", () => {
      OracleStudio.Export.download("merged.sql", this.mergeResultEditor.getValue(), "text/plain");
      this.toast("Merged result downloaded.", "success");
    });
  }

  // ---------- Modals ----------
  _bindModals() {
    this.$$(".modal-close").forEach(btn => btn.addEventListener("click", () => this.closeModals()));
    this.$("#modalBackdrop").addEventListener("click", () => this.closeModals());

    this.$("#settingsSave").addEventListener("click", () => this._saveSettingsFromModal());
    this.$("#settingsReset").addEventListener("click", () => { this.settings = { ...OracleStudio.Storage.DEFAULTS }; this._applySettingsToControls(); this._applyAllSettings(); OracleStudio.Storage.saveSettings(this.settings); this.toast("Settings reset to defaults.", "success"); });

    this.$$(".export-opt").forEach(btn => btn.addEventListener("click", () => this._doExport(btn.dataset.fmt)));
  }

  openModal(id) { this.$("#modalBackdrop").hidden = false; this.$("#" + id).hidden = false; }
  closeModals() { this.$("#modalBackdrop").hidden = true; this.$$(".modal").forEach(m => m.hidden = true); }

  _applySettingsToControls() {
    this.$("#setTheme").value = this.settings.theme;
    this.$("#setStyle").value = this.settings.style;
    this.$("#setIndent").value = this.settings.indentSize;
    this.$("#setFontSize").value = this.settings.fontSize;
    this.$("#setUppercase").checked = this.settings.uppercase;
    this.$("#setAlign").checked = this.settings.align;
    this.$("#setCommaStyle").value = this.settings.commaStyle;
    this.$("#setCollapseBlank").checked = this.settings.collapseBlank;
    this.$("#setWordWrap").checked = this.settings.wordWrap;
    this.$("#setAutoSave").checked = this.settings.autoSave;
    this.$("#setEbsMode").checked = this.settings.ebsMode;
    this.$("#styleSelect").value = this.settings.style;
    this.$("#btnEbsMode").classList.toggle("active", this.settings.ebsMode);
    this.$("#statEbs").hidden = !this.settings.ebsMode;
  }

  _saveSettingsFromModal() {
    this.settings.theme = this.$("#setTheme").value;
    this.settings.style = this.$("#setStyle").value;
    this.settings.indentSize = parseInt(this.$("#setIndent").value, 10) || 2;
    this.settings.fontSize = parseInt(this.$("#setFontSize").value, 10) || 14;
    this.settings.uppercase = this.$("#setUppercase").checked;
    this.settings.align = this.$("#setAlign").checked;
    this.settings.commaStyle = this.$("#setCommaStyle").value;
    this.settings.collapseBlank = this.$("#setCollapseBlank").checked;
    this.settings.wordWrap = this.$("#setWordWrap").checked;
    this.settings.autoSave = this.$("#setAutoSave").checked;
    this.settings.ebsMode = this.$("#setEbsMode").checked;
    OracleStudio.Storage.saveSettings(this.settings);
    this._applyAllSettings();
    this.closeModals();
    this.toast("Settings saved.", "success");
  }

  _applyAllSettings() {
    this._applyTheme(this.settings.theme);
    this.$("#styleSelect").value = this.settings.style;
    this.$("#statStyle").textContent = this._styleLabel(this.settings.style);
    [this.mainEditor, this.compareLeftEditor, this.compareRightEditor, this.mergeLeftEditor, this.mergeRightEditor, this.mergeResultEditor]
      .forEach(ed => { ed.setFontSize(this.settings.fontSize); ed.setWordWrap(this.settings.wordWrap); });
    [this.mainEditor, this.compareLeftEditor, this.compareRightEditor].forEach(ed => ed.setEbsMode(this.settings.ebsMode));
    this.$("#btnEbsMode").classList.toggle("active", this.settings.ebsMode);
    this.$("#statEbs").hidden = !this.settings.ebsMode;
  }

  _applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    this.settings.theme = theme;
    OracleStudio.Storage.saveSettings(this.settings);
    const icon = this.$("#btnTheme svg use");
    if (icon) icon.setAttribute("href", theme === "dark" ? "#ic-moon" : "#ic-sun");
  }

  async _doExport(fmt) {
    const buf = this.getActiveBuffer();
    const content = this.mainEditor.getValue();
    const base = (buf ? buf.name.replace(/\.[^.]+$/, "") : "export");
    if (fmt === "sql") OracleStudio.Export.download(base + ".sql", content, "text/plain");
    else if (fmt === "txt") OracleStudio.Export.download(base + ".txt", content, "text/plain");
    else if (fmt === "html") OracleStudio.Export.download(base + ".html", OracleStudio.Export.toHtmlDocument(content, base, { ebsMode: this.settings.ebsMode }), "text/html");
    else if (fmt === "md") OracleStudio.Export.download(base + ".md", OracleStudio.Export.toMarkdown(content), "text/markdown");
    else if (fmt === "pdf") OracleStudio.Export.printForPdf(content, base);
    else if (fmt === "clipboard") {
      const ok = await OracleStudio.Export.copyToClipboard(content);
      OracleStudio.Storage.addClipboardEntry(content);
      this.toast(ok ? "Copied to clipboard." : "Clipboard copy failed.", ok ? "success" : "error");
    }
    this.closeModals();
  }

  // ---------- Drag & drop ----------
  _bindDragDrop() {
    const overlay = this.$("#dropOverlay");
    let counter = 0;
    window.addEventListener("dragenter", (e) => { e.preventDefault(); counter++; overlay.hidden = false; });
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("dragleave", () => { counter = Math.max(0, counter - 1); if (counter === 0) overlay.hidden = true; });
    window.addEventListener("drop", (e) => {
      e.preventDefault(); counter = 0; overlay.hidden = true;
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) this._openFiles(e.dataTransfer.files);
    });
  }

  // ---------- Keyboard shortcuts ----------
  _bindKeyboard() {
    document.addEventListener("keydown", (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) { if (e.key === "Escape") this.closeFindBar(); return; }
      const k = e.key.toLowerCase();
      if (k === "b" && !e.shiftKey) { e.preventDefault(); this.formatActive(); }
      else if (k === "b" && e.shiftKey) { e.preventDefault(); this.setMode("compare"); }
      else if (k === "m") { e.preventDefault(); this.setMode("merge"); }
      else if (k === "f") { e.preventDefault(); this.openFindBar(false); }
      else if (k === "h") { e.preventDefault(); this.openFindBar(true); }
      else if (k === "s" && e.shiftKey) { e.preventDefault(); this.openModal("modalExport"); }
      else if (k === "s") { e.preventDefault(); this.saveActive(); }
      else if (k === "/") { e.preventDefault(); this._toggleComment(); }
    });
  }

  _toggleComment() {
    const ta = this.mainEditor.textarea;
    const { selectionStart: s, selectionEnd: en, value } = ta;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const lineEndSearch = value.indexOf("\n", en);
    const lineEnd = lineEndSearch === -1 ? value.length : lineEndSearch;
    const block = value.slice(lineStart, lineEnd);
    const lines = block.split("\n");
    const allCommented = lines.every(l => /^\s*--/.test(l) || l.trim() === "");
    const newLines = allCommented ? lines.map(l => l.replace(/^(\s*)--\s?/, "$1")) : lines.map(l => l.length ? "-- " + l : l);
    const newBlock = newLines.join("\n");
    ta.value = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);
    ta.selectionStart = lineStart; ta.selectionEnd = lineStart + newBlock.length;
    this.mainEditor._onInput();
  }

  // ---------- Toast ----------
  toast(message, type) {
    const stack = this.$("#toastStack");
    const el = document.createElement("div");
    el.className = "toast" + (type ? " toast-" + type : "");
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 4200);
    this.$("#statMessage").textContent = message;
  }
};

const SAMPLE_WELCOME_SQL = `-- Welcome to the Oracle SQL & PL/SQL Formatter, Comparator & Merge Studio.
-- Paste or open a .sql / .pkb / .pks / .pkg / .txt file, then press Ctrl+B to format.

CREATE OR REPLACE PACKAGE BODY xx_ap_invoice_utils AS

  PROCEDURE validate_invoice(p_invoice_id IN NUMBER) IS
    v_status VARCHAR2(15);
    CURSOR c_lines IS
      SELECT line_id, line_amount
      FROM   xx_ap_invoice_lines
      WHERE  invoice_id = p_invoice_id;
  BEGIN
    FOR r IN c_lines LOOP
      IF r.line_amount < 0 THEN
        raise_application_error(-20001, 'Negative line amount on line ' || r.line_id);
      END IF;
    END LOOP;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      v_status := 'NOT_FOUND';
    WHEN OTHERS THEN
      RAISE;
  END validate_invoice;

END xx_ap_invoice_utils;
`;

document.addEventListener("DOMContentLoaded", () => {
  window.app = new OracleStudio.App();
  window.app.init();
});
/* == END-OF-CHUNK marker: 16-app == */
