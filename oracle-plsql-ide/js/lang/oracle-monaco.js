/* =============================================================================
 * Oracle PL/SQL language definition for Monaco
 * - Monarch tokenizer (rich syntax highlighting)
 * - Language configuration (comments, brackets, auto-close, folding)
 * - Smart completion provider (keywords, functions, packages, EBS, snippets,
 *   project-learned identifiers, context-aware next-keyword prediction)
 * - Hover provider (docs for built-ins + EBS objects)
 * - On-type smart block closing (BEGIN/IF/LOOP/CASE -> END ...)
 * Exposed as window.OracleLang.register(monaco)
 * ============================================================================= */
(function (global) {
  'use strict';

  const D = global.OracleData;
  const LANG_ID = 'oraclesql';

  // Identifiers harvested from open documents (tables, vars, procs ...)
  const projectSymbols = new Set();
  function learnFromText(text) {
    if (!text) return;
    // declared variables / constants:  name TYPE ;
    const reVar = /\b([a-z][a-z0-9_$#]*)\s+(?:CONSTANT\s+)?(?:NUMBER|VARCHAR2|CHAR|DATE|BOOLEAN|PLS_INTEGER|CLOB|BLOB|TIMESTAMP|INTEGER)/gi;
    // created objects
    const reObj = /\b(?:TABLE|VIEW|PROCEDURE|FUNCTION|PACKAGE|TRIGGER|TYPE|SEQUENCE|CURSOR)\s+(?:BODY\s+)?([a-z][a-z0-9_$#.]*)/gi;
    let m;
    while ((m = reVar.exec(text))) projectSymbols.add(m[1]);
    while ((m = reObj.exec(text))) projectSymbols.add(m[1]);
  }

  function register(monaco) {
    monaco.languages.register({
      id: LANG_ID,
      extensions: ['.sql', '.pks', '.pkb', '.pls', '.prc', '.fnc', '.trg', '.typ', '.tps', '.vw'],
      aliases: ['Oracle SQL', 'PL/SQL', 'plsql']
    });

    // ---- Monarch tokenizer --------------------------------------------------
    monaco.languages.setMonarchTokensProvider(LANG_ID, {
      ignoreCase: true,
      defaultToken: '',
      keywords: D.KEYWORDS,
      datatypes: D.DATATYPES,
      functions: D.FUNCTIONS,
      exceptions: D.EXCEPTIONS,
      builtinPkgs: Object.keys(D.BUILTIN_PACKAGES),
      ebsTables: D.EBS_TABLES,
      operators: ['+', '-', '*', '/', '%', '=', '<>', '!=', '<', '>', '<=', '>=',
        ':=', '||', '=>', '..', '**'],
      symbols: /[=><!~?:&|+\-*\/\^%]+/,
      tokenizer: {
        root: [
          // bind variables  :name  &name
          [/[:&][a-z_][\w$]*/i, 'variable.bind'],
          // labels  <<label>>
          [/<<\s*[a-z_]\w*\s*>>/i, 'metatag'],
          // qualified identifier  PKG.MEMBER
          [/[a-z_][\w$#]*(?=\.)/i, {
            cases: {
              '@builtinPkgs': 'type.identifier.pkg',
              '@default': 'identifier'
            }
          }],
          // words
          [/[a-z_][\w$#]*/i, {
            cases: {
              '@keywords': 'keyword',
              '@datatypes': 'type',
              '@functions': 'predefined',
              '@exceptions': 'constant.exception',
              '@ebsTables': 'type.ebs',
              '@default': 'identifier'
            }
          }],
          // numbers
          [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
          [/\d+/, 'number'],
          // whitespace + comments
          { include: '@whitespace' },
          // strings
          [/q'\[/, { token: 'string.quote', next: '@qstring_bracket' }],
          [/q'\{/, { token: 'string.quote', next: '@qstring_brace' }],
          [/'/, { token: 'string.quote', next: '@string' }],
          [/"/, { token: 'string.quote', next: '@dquote' }],
          // delimiters / operators
          [/[;,.]/, 'delimiter'],
          [/[()\[\]]/, '@brackets'],
          [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],
          // sqlplus slash terminator
          [/^\s*\/\s*$/, 'metatag']
        ],
        whitespace: [
          [/[ \t\r\n]+/, ''],
          [/--.*$/, 'comment'],
          [/\/\*/, { token: 'comment', next: '@comment' }]
        ],
        comment: [
          [/[^/*]+/, 'comment'],
          [/\*\//, { token: 'comment', next: '@pop' }],
          [/[/*]/, 'comment']
        ],
        string: [
          [/[^']+/, 'string'],
          [/''/, 'string'],
          [/'/, { token: 'string.quote', next: '@pop' }]
        ],
        dquote: [
          [/[^"]+/, 'identifier.quote'],
          [/"/, { token: 'string.quote', next: '@pop' }]
        ],
        qstring_bracket: [[/[^\]]+/, 'string'], [/\]'/, { token: 'string.quote', next: '@pop' }], [/./, 'string']],
        qstring_brace: [[/[^}]+/, 'string'], [/}'/, { token: 'string.quote', next: '@pop' }], [/./, 'string']]
      }
    });

    // ---- Language configuration --------------------------------------------
    monaco.languages.setLanguageConfiguration(LANG_ID, {
      comments: { lineComment: '--', blockComment: ['/*', '*/'] },
      brackets: [['(', ')'], ['[', ']']],
      autoClosingPairs: [
        { open: '(', close: ')' },
        { open: '[', close: ']' },
        { open: "'", close: "'", notIn: ['string', 'comment'] },
        { open: '"', close: '"', notIn: ['string'] }
      ],
      surroundingPairs: [
        { open: '(', close: ')' }, { open: "'", close: "'" }, { open: '"', close: '"' }
      ],
      folding: {
        markers: {
          start: /\b(BEGIN|LOOP|CASE|IF|DECLARE|PACKAGE|PROCEDURE|FUNCTION)\b/i,
          end: /\b(END)\b/i
        }
      },
      onEnterRules: [
        {
          // indent after block openers
          beforeText: /\b(BEGIN|LOOP|THEN|ELSE|ELSIF|DECLARE|IS|AS)\s*$/i,
          action: { indentAction: monaco.languages.IndentAction.Indent }
        }
      ]
    });

    // ---- Completion provider -----------------------------------------------
    registerCompletion(monaco);
    registerHover(monaco);
    registerSignatureHelp(monaco);
  }

  // Returns the "context" word immediately before the cursor for prediction
  function lastSignificantToken(textBefore) {
    const tokens = textBefore.replace(/--.*$/gm, ' ').match(/[\w%]+|[*;,()]/g);
    return tokens && tokens.length ? tokens[tokens.length - 1].toUpperCase() : '';
  }

  // Context aware "next keyword" predictions
  const NEXT_KEYWORD = {
    'SELECT': ['FROM', 'DISTINCT', '*'],
    '*': ['FROM'],
    'FROM': ['WHERE', 'JOIN', 'GROUP BY', 'ORDER BY'],
    'WHERE': ['AND', 'OR', 'EXISTS', 'NOT'],
    'INSERT': ['INTO'],
    'UPDATE': ['SET'],
    'DELETE': ['FROM'],
    'GROUP': ['BY'],
    'ORDER': ['BY'],
    'BEGIN': ['NULL;', 'IF', 'FOR', 'DECLARE'],
    'THEN': ['NULL;', 'RETURN', 'EXIT'],
    'OPEN': ['FETCH'],
    'FETCH': ['INTO', 'BULK COLLECT INTO'],
    'BULK': ['COLLECT'],
    'COLLECT': ['INTO'],
    'EXCEPTION': ['WHEN'],
    'WHEN': D.EXCEPTIONS.slice(0, 8).concat(['OTHERS THEN']),
    'RAISE': D.EXCEPTIONS.slice(0, 6),
    'IS': ['BEGIN'],
    'AS': ['BEGIN'],
    'RETURN': ['NULL;']
  };

  function registerCompletion(monaco) {
    monaco.languages.registerCompletionItemProvider(LANG_ID, {
      triggerCharacters: ['.', ' ', '_', '%'],
      provideCompletionItems: function (model, position) {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
          startColumn: word.startColumn, endColumn: word.endColumn
        };
        const lineToCursor = model.getValueInRange({
          startLineNumber: position.lineNumber, startColumn: 1,
          endLineNumber: position.lineNumber, endColumn: position.column
        });

        const K = monaco.languages.CompletionItemKind;
        const suggestions = [];

        // --- member completion after PKG.  -----------------------------------
        const dotMatch = lineToCursor.match(/([a-z_][\w$#]*)\.\s*$/i);
        if (dotMatch) {
          const pkg = dotMatch[1].toUpperCase();
          if (D.BUILTIN_PACKAGES[pkg]) {
            D.BUILTIN_PACKAGES[pkg].forEach(function (mem) {
              suggestions.push({
                label: mem, kind: K.Method, insertText: mem, range: range,
                detail: pkg + ' member', sortText: '0' + mem
              });
            });
            return { suggestions: suggestions };
          }
          // EBS package APIs
          const apis = D.EBS_APIS.filter(function (a) { return a.toUpperCase().indexOf(pkg + '.') === 0; });
          if (apis.length) {
            apis.forEach(function (a) {
              const mem = a.split('.').slice(1).join('.');
              suggestions.push({ label: mem, kind: K.Method, insertText: mem, range: range, detail: 'EBS API (' + pkg + ')', sortText: '0' + mem });
            });
            return { suggestions: suggestions };
          }
        }

        // --- snippets --------------------------------------------------------
        D.SNIPPETS.forEach(function (s) {
          suggestions.push({
            label: s.label, kind: K.Snippet, insertText: s.insert,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: s.detail, documentation: { value: '```sql\n' + s.insert.replace(/\$\{\d+:?([^}]*)\}/g, '$1').replace(/\$\d+/g, '') + '\n```' },
            range: range, sortText: '1' + s.label
          });
        });

        // --- context-aware predicted next keywords ---------------------------
        const ctx = lastSignificantToken(lineToCursor.replace(new RegExp(word.word + '$'), ''));
        if (NEXT_KEYWORD[ctx]) {
          NEXT_KEYWORD[ctx].forEach(function (kw, i) {
            suggestions.push({
              label: kw, kind: K.Event, insertText: kw + (kw.endsWith(';') ? '' : ' '),
              detail: '↵ predicted after ' + ctx, range: range, preselect: i === 0, sortText: '0_' + i
            });
          });
        }

        // --- keywords --------------------------------------------------------
        D.KEYWORDS.forEach(function (kw) {
          suggestions.push({ label: kw, kind: K.Keyword, insertText: kw, range: range, sortText: '5' + kw });
        });
        D.DATATYPES.forEach(function (t) {
          suggestions.push({ label: t, kind: K.TypeParameter, insertText: t, range: range, detail: 'datatype', sortText: '4' + t });
        });
        D.FUNCTIONS.forEach(function (f) {
          suggestions.push({
            label: f, kind: K.Function, insertText: f + '($0)',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: 'built-in function', range: range, sortText: '3' + f
          });
        });
        D.EXCEPTIONS.forEach(function (e) {
          suggestions.push({ label: e, kind: K.Constant, insertText: e, detail: 'exception', range: range, sortText: '4' + e });
        });
        Object.keys(D.BUILTIN_PACKAGES).forEach(function (p) {
          suggestions.push({ label: p, kind: K.Module, insertText: p, detail: 'built-in package', range: range, sortText: '3' + p });
        });
        D.PSEUDO.forEach(function (p) {
          suggestions.push({ label: p, kind: K.Variable, insertText: p, detail: 'pseudocolumn', range: range, sortText: '4' + p });
        });

        // --- EBS objects (tables + apis) -------------------------------------
        D.EBS_TABLES.forEach(function (t) {
          suggestions.push({ label: t, kind: K.Struct, insertText: t, detail: 'Oracle EBS table', range: range, sortText: '2' + t });
        });
        D.EBS_APIS.forEach(function (a) {
          suggestions.push({ label: a, kind: K.Interface, insertText: a, detail: 'Oracle EBS API', range: range, sortText: '2' + a });
        });

        // --- project-learned identifiers -------------------------------------
        projectSymbols.forEach(function (s) {
          suggestions.push({ label: s, kind: K.Variable, insertText: s, detail: 'project symbol', range: range, sortText: '1z' + s });
        });

        return { suggestions: suggestions };
      }
    });
  }

  // ---- Hover docs -----------------------------------------------------------
  function registerHover(monaco) {
    monaco.languages.registerHoverProvider(LANG_ID, {
      provideHover: function (model, position) {
        const w = model.getWordAtPosition(position);
        if (!w) return null;
        const word = w.word.toUpperCase();
        const md = [];
        if (D.BUILTIN_PACKAGES[word]) {
          md.push('**' + word + '** — Oracle supplied package');
          md.push('Members: `' + D.BUILTIN_PACKAGES[word].join('`, `') + '`');
        } else if (D.EBS_TABLES.indexOf(word) >= 0) {
          const mod = Object.keys(D.EBS).find(function (m) { return D.EBS[m].tables.indexOf(word) >= 0; });
          md.push('**' + word + '** — Oracle EBS table');
          if (mod) md.push('Module **' + mod + '** · ' + D.EBS[mod].desc);
        } else if (D.FUNCTIONS.indexOf(word) >= 0) {
          md.push('**' + word + '()** — built-in SQL/PL-SQL function');
        } else if (D.EXCEPTIONS.indexOf(word) >= 0) {
          md.push('**' + word + '** — predefined exception');
        } else if (D.KEYWORDS.indexOf(word) >= 0) {
          md.push('**' + word + '** — Oracle keyword');
        } else if (D.DATATYPES.indexOf(word) >= 0) {
          md.push('**' + word + '** — Oracle datatype');
        }
        if (!md.length) return null;
        return { contents: md.map(function (t) { return { value: t }; }) };
      }
    });
  }

  // ---- Signature help for a few common built-ins ----------------------------
  const SIGS = {
    NVL: ['NVL(expr1, expr2)', 'Returns expr2 if expr1 is NULL.'],
    DECODE: ['DECODE(expr, search, result [, search, result]..., default)', 'If/else style value mapping.'],
    SUBSTR: ['SUBSTR(char, position [, length])', 'Substring of char.'],
    INSTR: ['INSTR(string, substring [, position [, occurrence]])', 'Position of substring.'],
    TO_CHAR: ['TO_CHAR(expr [, format [, nlsparam]])', 'Convert number/date to string.'],
    TO_DATE: ['TO_DATE(char [, format [, nlsparam]])', 'Convert string to date.'],
    'FND_REQUEST.SUBMIT_REQUEST': ['FND_REQUEST.SUBMIT_REQUEST(application, program, description, start_time, sub_request, argument1..n)', 'Submit a concurrent request in EBS.']
  };
  function registerSignatureHelp(monaco) {
    monaco.languages.registerSignatureHelpProvider(LANG_ID, {
      signatureHelpTriggerCharacters: ['(', ','],
      provideSignatureHelp: function (model, position) {
        const line = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column });
        const m = line.match(/([a-z_][\w$#.]*)\s*\([^()]*$/i);
        if (!m) return null;
        const fn = m[1].toUpperCase();
        const sig = SIGS[fn];
        if (!sig) return null;
        return {
          value: {
            signatures: [{ label: sig[0], documentation: sig[1], parameters: [] }],
            activeSignature: 0, activeParameter: 0
          },
          dispose: function () {}
        };
      }
    });
  }

  global.OracleLang = {
    LANG_ID: LANG_ID,
    register: register,
    learnFromText: learnFromText,
    projectSymbols: projectSymbols
  };
})(window);
