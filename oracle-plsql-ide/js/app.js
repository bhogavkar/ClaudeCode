/* =============================================================================
 * Oracle PL/SQL IDE — application controller.
 * Boots Monaco, manages tabs/models, wires every panel, command palette,
 * keyboard shortcuts, linting, formatting, simulated run/compile, AI, search,
 * DB explorer, quality dashboard, git tracking and session persistence.
 * ============================================================================= */
(function () {
  'use strict';

  const $ = function (s, r) { return (r || document).querySelector(s); };
  const $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  const esc = function (s) { return (s || '').replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };

  let monaco, editor;
  const files = {};            // id -> { id, name, kind, lang, model, dirty, csvApi }
  let active = null;           // active file id
  let seq = 1;
  let lintTimer = null;
  let currentTheme = 'oracle-dark';

  // ---- Monaco bootstrap -----------------------------------------------------
  // Called by the resilient loader in index.html once a CDN (or local copy)
  // of the AMD loader has been resolved. `vsPath` points at the .../min/vs dir.
  window.__bootIDE = function (vsPath) {
    require.config({ paths: { vs: vsPath } });
    require(['vs/editor/editor.main'], onMonacoReady);
  };

  function onMonacoReady(m) {
    monaco = m;
    window.monaco = m;
    OracleThemes.defineAll(monaco);
    OracleLang.register(monaco);

    editor = monaco.editor.create($('#editor'), {
      value: '',
      language: 'oraclesql',
      theme: currentTheme,
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 13,
      fontFamily: 'var(--mono)',
      lineNumbers: 'on',
      renderWhitespace: 'selection',
      tabSize: 4,
      insertSpaces: true,
      wordWrap: 'off',
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      bracketPairColorization: { enabled: true },
      'semanticHighlighting.enabled': true,
      suggestOnTriggerCharacters: true,
      quickSuggestions: { other: true, comments: false, strings: false },
      stickyScroll: { enabled: true },
      glyphMargin: true
    });

    setupThemeSelect();
    OracleThemes.applyChrome(currentTheme);
    bindEditorEvents();
    setupAutoClose();
    setupShortcuts();
    buildSampleTree();
    buildDatabaseExplorer();
    registerCommands();

    restoreSession();
    if (!Object.keys(files).length) openContent('welcome.sql', Samples['welcome.sql']);

    setInterval(persist, 5000);
    window.addEventListener('beforeunload', persist);
    setStatus();
  }

  // ---- Theme ---------------------------------------------------------------
  function setupThemeSelect() {
    const sel = $('#theme-select');
    OracleThemes.names().forEach(function (n) {
      const o = document.createElement('option');
      o.value = n; o.textContent = OracleThemes.labels[n] || n;
      sel.appendChild(o);
    });
    sel.value = currentTheme;
    sel.onchange = function () { applyTheme(sel.value); };
  }
  function applyTheme(name) {
    currentTheme = name;
    monaco.editor.setTheme(name);
    OracleThemes.applyChrome(name);
    $('#theme-select').value = name;
    $('#st-theme').textContent = OracleThemes.labels[name] || name;
    persist();
  }

  // ---- Tabs & files --------------------------------------------------------
  function openContent(name, content) {
    // de-dupe by name
    const existing = Object.keys(files).find(function (id) { return files[id].name === name; });
    if (existing) { activate(existing); return existing; }

    const t = FileTypes.typeOf(name);
    const id = 'f' + (seq++);
    const model = monaco.editor.createModel(content != null ? content : '', t.lang);
    files[id] = { id: id, name: name, kind: t.kind, lang: t.lang, icon: t.icon, model: model, dirty: false, csvApi: null };

    model.onDidChangeContent(function () {
      files[id].dirty = true;
      if (id === active) { scheduleLint(); renderTabs(); trackGit(); }
    });

    OracleLang.learnFromText(content || '');
    renderTabs();
    renderFileTree();
    activate(id);
    return id;
  }

  function activate(id) {
    if (!files[id]) return;
    active = id;
    const f = files[id];
    const isCsv = f.kind === 'csv';
    $('#editor').hidden = isCsv;
    $('#csv-host').hidden = !isCsv;

    if (isCsv) {
      f.csvApi = CsvEditor.render($('#csv-host'), f.model.getValue());
    } else {
      editor.setModel(f.model);
      editor.focus();
      runLint();
    }
    renderTabs();
    renderFileTree();
    updateBreadcrumb();
    setStatus();
  }

  function closeFile(id) {
    if (!files[id]) return;
    if (files[id].dirty && !confirm('Discard unsaved changes in ' + files[id].name + '?')) return;
    files[id].model.dispose();
    delete files[id];
    if (active === id) {
      const rest = Object.keys(files);
      active = null;
      if (rest.length) activate(rest[rest.length - 1]);
      else { editor.setModel(monaco.editor.createModel('', 'oraclesql')); $('#csv-host').hidden = true; $('#editor').hidden = false; }
    }
    renderTabs(); renderFileTree(); persist();
  }

  function renderTabs() {
    const host = $('#tabs');
    host.innerHTML = '';
    Object.keys(files).forEach(function (id) {
      const f = files[id];
      const tab = document.createElement('div');
      tab.className = 'tab' + (id === active ? ' active' : '');
      tab.innerHTML = '<span class="ft">' + f.icon + '</span><span class="nm">' + esc(f.name) + '</span>' +
        (f.dirty ? '<span class="dot">●</span>' : '<span class="x">✕</span>');
      tab.onclick = function (e) {
        if (e.target.classList.contains('x')) { closeFile(id); return; }
        if (f.kind === 'csv' && f.csvApi && active === id) {} // keep
        activate(id);
      };
      tab.querySelector('.nm').ondblclick = function () { renameFile(id); };
      host.appendChild(tab);
    });
  }

  function renameFile(id) {
    const cur = files[id].name;
    const name = prompt('File name', cur);
    if (!name || name === cur) return;
    files[id].name = name;
    const t = FileTypes.typeOf(name);
    files[id].kind = t.kind; files[id].lang = t.lang; files[id].icon = t.icon;
    monaco.editor.setModelLanguage(files[id].model, t.lang);
    renderTabs(); renderFileTree(); updateBreadcrumb();
  }

  function renderFileTree() {
    const tree = $('#file-tree');
    tree.innerHTML = '';
    Object.keys(files).forEach(function (id) {
      const f = files[id];
      const li = document.createElement('li');
      li.className = id === active ? 'active' : '';
      li.innerHTML = '<span class="ic">' + f.icon + '</span><span>' + esc(f.name) + '</span>' +
        (f.dirty ? '<span class="meta">●</span>' : '');
      li.onclick = function () { activate(id); };
      tree.appendChild(li);
    });
    if (!Object.keys(files).length) tree.innerHTML = '<li class="group">No open files</li>';
  }

  function buildSampleTree() {
    const tree = $('#sample-tree');
    Object.keys(Samples).forEach(function (name) {
      const t = FileTypes.typeOf(name);
      const li = document.createElement('li');
      li.innerHTML = '<span class="ic">' + t.icon + '</span><span>' + esc(name) + '</span>';
      li.onclick = function () { openContent(name, Samples[name]); };
      tree.appendChild(li);
    });
  }

  // ---- Editor events -------------------------------------------------------
  function bindEditorEvents() {
    editor.onDidChangeCursorPosition(function (e) {
      $('#st-pos').textContent = 'Ln ' + e.position.lineNumber + ', Col ' + e.position.column;
      updateBreadcrumb();
    });
    editor.onDidChangeCursorSelection(function (e) {
      const sel = editor.getModel() && editor.getModel().getValueInRange(e.selection);
      $('#st-sel').textContent = sel && sel.length ? '(' + sel.length + ' selected)' : '';
    });
    // breakpoints on glyph margin
    editor.onMouseDown(function (e) {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) toggleBreakpoint(e.target.position.lineNumber);
    });
  }

  function scheduleLint() { clearTimeout(lintTimer); lintTimer = setTimeout(runLint, 350); }
  function runLint() {
    const f = files[active];
    if (!f || f.lang !== 'oraclesql') { setProblems([]); return; }
    OracleLang.learnFromText(f.model.getValue());
    const res = OracleLinter.analyze(f.model, monaco);
    monaco.editor.setModelMarkers(f.model, 'plsql', res.markers);
    setProblems(res.issues);
  }

  function setProblems(issues) {
    const list = $('#problems-list');
    list.innerHTML = '';
    const errs = issues.filter(function (i) { return i.sev === 'error'; }).length;
    const warns = issues.filter(function (i) { return i.sev === 'warning'; }).length;
    $('#problem-count').textContent = issues.length;
    $('#st-problems').textContent = errs + ' ✖  ' + warns + ' ⚠';
    if (!issues.length) { list.innerHTML = '<li class="group">No problems detected 🎉</li>'; return; }
    issues.sort(function (a, b) { return a.line - b.line; }).forEach(function (i) {
      const li = document.createElement('li');
      const icon = i.sev === 'error' ? '✖' : i.sev === 'warning' ? '⚠' : 'ℹ';
      li.innerHTML = '<span class="ic sev-' + i.sev + '">' + icon + '</span>' +
        '<span>' + esc(i.msg) + '</span>' +
        '<span class="prob-loc">[' + i.line + ':' + i.col + ']</span>' +
        '<span class="prob-code">' + esc(i.code) + '</span>';
      li.onclick = function () {
        editor.revealLineInCenter(i.line);
        editor.setPosition({ lineNumber: i.line, column: i.col });
        editor.focus();
      };
      list.appendChild(li);
    });
  }

  function updateBreadcrumb() {
    const bc = $('#breadcrumb');
    const f = files[active];
    if (!f) { bc.innerHTML = ''; return; }
    const crumbs = ['Project', f.name];
    if (f.lang === 'oraclesql') {
      const sym = enclosingSymbol();
      if (sym) crumbs.push(sym);
    }
    bc.innerHTML = crumbs.map(function (c) { return '<span class="crumb">' + esc(c) + '</span>'; }).join('');
  }
  function enclosingSymbol() {
    if (!editor.getModel() || editor.getModel() !== files[active].model) return '';
    const pos = editor.getPosition(); if (!pos) return '';
    const text = files[active].model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: pos.lineNumber, endColumn: 1 });
    const re = /\b(PROCEDURE|FUNCTION|PACKAGE|TRIGGER|CURSOR)\s+(?:BODY\s+)?([a-z0-9_$#]+)/gi;
    let m, last = '';
    while ((m = re.exec(text))) last = m[1].charAt(0) + m[1].slice(1).toLowerCase() + ' ' + m[2];
    return last;
  }

  // ---- Smart block auto-close ----------------------------------------------
  let suppressAuto = false;
  function setupAutoClose() {
    editor.onDidChangeModelContent(function (e) {
      if (suppressAuto || !e.changes.length) return;
      const ch = e.changes[0];
      if (ch.text.indexOf('\n') === -1 || ch.text.replace(/\s/g, '') !== '') return; // only a bare Enter
      const model = editor.getModel();
      const pos = editor.getPosition();
      if (pos.lineNumber < 2) return;
      const prev = model.getLineContent(pos.lineNumber - 1);
      const trimmed = prev.trim().toUpperCase();
      const indent = (prev.match(/^\s*/) || [''])[0];

      let closer = null;
      if (/\bBEGIN$/.test(trimmed)) closer = 'END;';
      else if (/\bLOOP$/.test(trimmed) && !/END\s+LOOP/.test(trimmed)) closer = 'END LOOP;';
      else if (/^IF\b.*\bTHEN$/.test(trimmed)) closer = 'END IF;';
      else if (/^CASE\b/.test(trimmed) && !/END/.test(trimmed)) closer = 'END CASE;';
      if (!closer) return;

      // only auto-close when typing at the end of the buffer (don't disturb existing code)
      const tail = model.getValueInRange({
        startLineNumber: pos.lineNumber, startColumn: pos.column,
        endLineNumber: model.getLineCount(), endColumn: model.getLineMaxColumn(model.getLineCount())
      });
      if (tail.trim() !== '') return;

      const unit = model.getOptions().insertSpaces ? ' '.repeat(model.getOptions().tabSize) : '\t';
      suppressAuto = true;
      editor.executeEdits('autoclose', [{
        range: new monaco.Range(pos.lineNumber, 1, pos.lineNumber, model.getLineMaxColumn(pos.lineNumber)),
        text: indent + unit + '\n' + indent + closer
      }]);
      editor.setPosition({ lineNumber: pos.lineNumber, column: indent.length + unit.length + 1 });
      suppressAuto = false;
    });
  }

  // ---- Breakpoints (visual) ------------------------------------------------
  const breakpoints = {};
  let bpDecorations = [];
  function toggleBreakpoint(line) {
    const f = files[active]; if (!f) return;
    breakpoints[f.name] = breakpoints[f.name] || {};
    if (breakpoints[f.name][line]) delete breakpoints[f.name][line];
    else breakpoints[f.name][line] = true;
    renderBreakpoints();
  }
  function renderBreakpoints() {
    const f = files[active]; if (!f) return;
    const bps = breakpoints[f.name] || {};
    const decos = Object.keys(bps).map(function (ln) {
      return { range: new monaco.Range(+ln, 1, +ln, 1), options: { glyphMarginClassName: 'bp-glyph', glyphMarginHoverMessage: { value: 'Breakpoint' } } };
    });
    bpDecorations = editor.deltaDecorations(bpDecorations, decos);
    let total = 0; Object.keys(breakpoints).forEach(function (k) { total += Object.keys(breakpoints[k]).length; });
    $('#bp-count').textContent = total;
  }

  // ---- Format --------------------------------------------------------------
  function formatActive() {
    const f = files[active];
    if (!f || f.lang !== 'oraclesql') { output('Formatting is available for SQL/PL-SQL files only.'); return; }
    const opts = f.model.getOptions();
    const formatted = OracleFormatter.format(f.model.getValue(), { tabSize: opts.tabSize, insertSpaces: opts.insertSpaces });
    editor.executeEdits('format', [{ range: f.model.getFullModelRange(), text: formatted }]);
    output('Formatted ' + f.name + '.');
  }

  // ---- Simulated run / compile ---------------------------------------------
  function nowTime() { try { return new Date().toLocaleTimeString(); } catch (e) { return ''; } }
  function runScript(selectionOnly) {
    const f = files[active]; if (!f) return;
    showPanel('output');
    const sql = selectionOnly && editor.getSelection() && !editor.getSelection().isEmpty()
      ? f.model.getValueInRange(editor.getSelection())
      : f.model.getValue();
    const stmts = sql.split(/;\s*\n|\n\s*\/\s*\n|\n\s*\/\s*$/).map(function (s) { return s.trim(); }).filter(Boolean);
    output('— Run ' + (selectionOnly ? '(selection) ' : '') + 'started ' + nowTime() + ' —');

    // surface real lint errors first
    const res = OracleLinter.analyze(f.model, monaco);
    const errs = res.issues.filter(function (i) { return i.sev === 'error'; });
    if (errs.length) {
      errs.forEach(function (e) { output('  ✖ Line ' + e.line + ': ' + e.msg + ' (' + e.code + ')'); });
      output('Aborted: ' + errs.length + ' compile error(s). [simulated]');
      return;
    }

    const t0 = Date.now ? safeNow() : 0;
    stmts.forEach(function (s, i) {
      const head = s.split(/\s+/).slice(0, 2).join(' ').toUpperCase();
      const rows = simulatedRows(s);
      output('  [' + (i + 1) + '] ' + head + ' … ' + (rows >= 0 ? rows + ' row(s)' : 'OK'));
    });
    output('Completed ' + stmts.length + ' statement(s) in ' + (12 + stmts.length * 7) + ' ms. [simulated — connect a DB backend to execute live]');

    // DBMS_OUTPUT capture (very rough): collect DBMS_OUTPUT.PUT_LINE string literals
    const dbms = [];
    const re = /DBMS_OUTPUT\.PUT_LINE\s*\(\s*('(?:''|[^'])*')/gi; let m;
    while ((m = re.exec(sql))) dbms.push(m[1].replace(/^'|'$/g, '').replace(/''/g, "'") + '  …');
    if (dbms.length) { $('#dbms-output').textContent = dbms.join('\n'); }
    setStatus();
  }
  function safeNow() { try { return Date.now(); } catch (e) { return 0; } }
  function simulatedRows(s) {
    const u = s.toUpperCase().trim();
    if (/^SELECT/.test(u)) return Math.floor((u.length % 17) + 1);
    if (/^(INSERT|UPDATE|DELETE|MERGE)/.test(u)) return Math.floor((u.length % 9));
    return -1;
  }
  function compileObject() {
    const f = files[active]; if (!f) return;
    showPanel('output');
    const res = OracleLinter.analyze(f.model, monaco);
    const errs = res.issues.filter(function (i) { return i.sev === 'error'; });
    const name = (enclosingSymbol() || f.name);
    if (errs.length) {
      output('Compilation of ' + name + ' produced errors: [simulated]');
      errs.forEach(function (e) { output('  ' + e.line + '/' + e.col + '  PLS: ' + e.msg); });
      output('Status: INVALID');
    } else {
      output(name + ' compiled. Status: VALID  ✓  [simulated]');
    }
  }

  // ---- Explain plan (simulated) --------------------------------------------
  function showExplainPlan() {
    const f = files[active]; if (!f) return;
    showPanel('plan');
    const sql = (editor.getSelection() && !editor.getSelection().isEmpty())
      ? f.model.getValueInRange(editor.getSelection()) : f.model.getValue();
    const tables = (sql.toUpperCase().match(/\bFROM\s+([A-Z0-9_$#]+)/g) || []).map(function (s) { return s.replace(/FROM\s+/i, ''); });
    const lines = [
      '<pre>Plan hash value: ' + (1000000 + (sql.length * 7) % 8999999),
      '',
      '----------------------------------------------------------------------',
      '| Id | Operation                     | Name            | Rows | Cost |',
      '----------------------------------------------------------------------',
      '|  0 | SELECT STATEMENT              |                 |  ' + pad(((sql.length % 900) + 1)) + ' | ' + pad((sql.length % 50) + 3) + ' |'
    ];
    (tables.length ? tables : ['DUAL']).forEach(function (t, i) {
      const idx = /WHERE/i.test(sql);
      lines.push('|  ' + (i + 1) + ' |  ' + (idx ? 'TABLE ACCESS BY INDEX ROWID' : 'TABLE ACCESS FULL          ') + '| ' + padR(t, 15) + ' |  ' + pad((t.length * 3) % 900) + ' | ' + pad((t.length % 40) + 2) + ' |');
    });
    lines.push('----------------------------------------------------------------------');
    lines.push('');
    lines.push('Note: simulated plan. Connect a database to run EXPLAIN PLAN / DBMS_XPLAN.</pre>');
    $('#explain-plan').innerHTML = lines.join('\n');
  }
  function pad(n) { n = String(n); return n.length < 4 ? ' '.repeat(4 - n.length) + n : n; }
  function padR(s, n) { s = String(s); return s.length < n ? s + ' '.repeat(n - s.length) : s.slice(0, n); }

  // ---- Output / panels -----------------------------------------------------
  function output(line) {
    const el = $('#output-console');
    el.textContent += (el.textContent ? '\n' : '') + line;
    el.scrollTop = el.scrollHeight;
  }
  function showPanel(name) {
    $$('.ptab').forEach(function (b) { b.classList.toggle('active', b.dataset.panel === name); });
    $$('.pview').forEach(function (v) { v.classList.toggle('active', v.dataset.panel === name); });
    const bp = $('#bottom-panel'); bp.classList.remove('collapsed');
  }

  // ---- Database explorer (demo metadata) -----------------------------------
  function buildDatabaseExplorer() {
    const tree = $('#conn-tree');
    const envs = ['DEV', 'TEST', 'SIT', 'UAT', 'PREPROD', 'PROD'];
    const objectGroups = ['Tables', 'Views', 'Packages', 'Procedures', 'Functions', 'Triggers', 'Sequences', 'Types', 'Synonyms'];
    envs.forEach(function (env) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="ic">⛁</span><span>' + env + '</span><span class="meta">' + (env === 'PROD' ? 'read-only' : '') + '</span>';
      tree.appendChild(li);
      let expanded = false; let childEls = [];
      li.onclick = function () {
        if (expanded) { childEls.forEach(function (c) { c.remove(); }); childEls = []; expanded = false; return; }
        expanded = true;
        const schema = document.createElement('li');
        schema.className = 'child group'; schema.textContent = 'APPS (schema)';
        li.after(schema); childEls.push(schema);
        let anchor = schema;
        objectGroups.forEach(function (g) {
          const gli = document.createElement('li'); gli.className = 'child';
          gli.innerHTML = '<span class="ic">📁</span><span>' + g + '</span>';
          anchor.after(gli); anchor = gli; childEls.push(gli);
          if (g === 'Tables') {
            let a2 = gli;
            OracleData.EBS_TABLES.slice(0, 8).forEach(function (t) {
              const o = document.createElement('li'); o.className = 'child2';
              o.innerHTML = '<span class="ic">▦</span><span>' + t + '</span>';
              o.title = 'Drag/click to insert';
              o.onclick = function (e) { e.stopPropagation(); insertAtCursor(t); };
              a2.after(o); a2 = o; childEls.push(o);
            });
            anchor = a2;
          }
        });
        $('#st-conn').textContent = '⛁ ' + env + ' · APPS';
      };
    });
  }
  function insertAtCursor(text) {
    if (!editor || files[active].kind === 'csv') return;
    const sel = editor.getSelection();
    editor.executeEdits('insert', [{ range: sel, text: text, forceMoveMarkers: true }]);
    editor.focus();
  }

  // ---- Search --------------------------------------------------------------
  function runSearch() {
    const q = $('#search-input').value;
    const list = $('#search-results'); list.innerHTML = '';
    if (!q) return;
    const useRe = $('#search-regex').checked;
    const cs = $('#search-case').checked;
    let re;
    try { re = useRe ? new RegExp(q, cs ? 'g' : 'gi') : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs ? 'g' : 'gi'); }
    catch (e) { list.innerHTML = '<li class="group">Bad regex</li>'; return; }

    let total = 0;
    Object.keys(files).forEach(function (id) {
      const f = files[id];
      const lines = f.model.getValue().split('\n');
      const hits = [];
      lines.forEach(function (ln, i) { if (re.test(ln)) hits.push({ line: i + 1, text: ln.trim() }); re.lastIndex = 0; });
      if (!hits.length) return;
      const head = document.createElement('li'); head.className = 'group';
      head.textContent = f.name + ' (' + hits.length + ')'; list.appendChild(head);
      hits.forEach(function (h) {
        total++;
        const li = document.createElement('li'); li.className = 'child';
        li.innerHTML = '<span class="prob-loc">' + h.line + '</span><span>' + esc(h.text.slice(0, 80)) + '</span>';
        li.onclick = function () { activate(id); setTimeout(function () { editor.revealLineInCenter(h.line); editor.setPosition({ lineNumber: h.line, column: 1 }); editor.focus(); }, 30); };
        list.appendChild(li);
      });
    });
    if (!total) list.innerHTML = '<li class="group">No matches</li>';
  }
  function replaceAllInFile() {
    const f = files[active]; if (!f || f.kind === 'csv') return;
    const q = $('#search-input').value, r = $('#replace-input').value;
    if (!q) return;
    const useRe = $('#search-regex').checked, cs = $('#search-case').checked;
    let re;
    try { re = useRe ? new RegExp(q, cs ? 'g' : 'gi') : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs ? 'g' : 'gi'); }
    catch (e) { return; }
    const next = f.model.getValue().replace(re, r);
    editor.executeEdits('replace', [{ range: f.model.getFullModelRange(), text: next }]);
    output('Replaced occurrences in ' + f.name + '.');
  }

  // ---- Git (in-session tracking) -------------------------------------------
  function trackGit() {
    const list = $('#git-changes'); list.innerHTML = '';
    const dirty = Object.keys(files).filter(function (id) { return files[id].dirty; });
    if (!dirty.length) { list.innerHTML = '<li class="group">No changes</li>'; return; }
    dirty.forEach(function (id) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="ic sev-warning">M</span><span>' + esc(files[id].name) + '</span>';
      li.onclick = function () { activate(id); };
      list.appendChild(li);
    });
  }

  // ---- Quality dashboard ---------------------------------------------------
  function analyzeQuality() {
    const f = files[active];
    const box = $('#quality-report');
    if (!f || f.lang !== 'oraclesql') { box.innerHTML = '<div class="view-note">Open a SQL/PL-SQL file to analyze.</div>'; return; }
    const text = f.model.getValue();
    const res = OracleLinter.analyze(f.model, monaco);
    const errs = res.issues.filter(function (i) { return i.sev === 'error'; }).length;
    const warns = res.issues.filter(function (i) { return i.sev === 'warning'; }).length;
    const infos = res.issues.filter(function (i) { return i.sev === 'info'; }).length;
    const lines = text.split('\n').length;
    const comments = (text.match(/--|\/\*/g) || []).length;
    const hasExc = /EXCEPTION/i.test(text);
    const hasDoc = /\/\*[\s\S]*?(Purpose|Author)[\s\S]*?\*\//i.test(text);

    const metrics = {
      Readability: clamp(100 - warns * 4 - (lines > 400 ? 10 : 0)),
      Performance: clamp(100 - res.issues.filter(function (i) { return /PERF|SQL-star/.test(i.code); }).length * 12),
      Maintainability: clamp(60 + (comments / Math.max(1, lines) * 200) - errs * 10),
      'Oracle Standards': clamp(100 - res.issues.filter(function (i) { return /STD/.test(i.code); }).length * 8),
      Documentation: hasDoc ? 95 : clamp(comments / Math.max(1, lines) * 300),
      Security: clamp(100 - res.issues.filter(function (i) { return /SEC/.test(i.code); }).length * 25),
      Complexity: clamp(100 - (text.match(/\b(IF|LOOP|CASE)\b/gi) || []).length * 2),
      Formatting: clamp(100 - (text.match(/\t \t| {5,}\S/g) || []).length * 3)
    };
    const overall = Math.round(Object.keys(metrics).reduce(function (a, k) { return a + metrics[k]; }, 0) / Object.keys(metrics).length);

    let html = '<div style="text-align:center;margin:8px 0">' +
      '<div style="font-size:34px;font-weight:800;color:' + scoreColor(overall) + '">' + overall + '</div>' +
      '<div class="view-note" style="padding:0">Overall quality score</div></div>';
    Object.keys(metrics).forEach(function (k) {
      const v = metrics[k];
      html += '<div style="margin:7px 0"><div class="kv"><span>' + k + '</span><b>' + v + '</b></div>' +
        '<div style="height:6px;background:var(--panel2);border-radius:4px;overflow:hidden">' +
        '<div style="height:100%;width:' + v + '%;background:' + scoreColor(v) + '"></div></div></div>';
    });
    html += '<div class="hr"></div><div class="view-note" style="padding:0">' +
      errs + ' error(s) · ' + warns + ' warning(s) · ' + infos + ' hint(s)' +
      (hasExc ? '' : '<br>• Add exception handling') +
      (hasDoc ? '' : '<br>• Add a documentation header (AI ▸ Document)') + '</div>';
    box.innerHTML = html;
  }
  function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }
  function scoreColor(v) { return v >= 80 ? 'var(--ok)' : v >= 55 ? 'var(--warn)' : 'var(--error)'; }

  // ---- AI panel ------------------------------------------------------------
  function aiAsk(intent, explicitText) {
    const f = files[active];
    const sel = editor && editor.getSelection && !editor.getSelection().isEmpty() ? f.model.getValueInRange(editor.getSelection()) : null;
    const code = explicitText != null ? explicitText : (sel || (f ? f.model.getValue() : ''));
    if (intent !== 'freeform') aiAppend('user', (intent.charAt(0).toUpperCase() + intent.slice(1)) + (sel ? ' (selection)' : ' (file)'));
    else aiAppend('user', code);
    const thinking = aiAppend('bot', '_thinking…_');
    OracleAI.ask(intent, code).then(function (ans) {
      thinking.innerHTML = renderMd(ans);
      wireCopy(thinking);
      $('#ai-thread').scrollTop = $('#ai-thread').scrollHeight;
    });
  }
  function aiAppend(role, text) {
    const div = document.createElement('div');
    div.className = 'ai-msg ' + role;
    div.innerHTML = role === 'user' ? esc(text) : renderMd(text);
    $('#ai-thread').appendChild(div);
    $('#ai-thread').scrollTop = $('#ai-thread').scrollHeight;
    return div;
  }
  function wireCopy(scope) {
    $$('pre', scope).forEach(function (pre) {
      const b = document.createElement('button'); b.className = 'copy'; b.textContent = 'copy';
      b.onclick = function () { navigator.clipboard && navigator.clipboard.writeText(pre.textContent); b.textContent = 'copied'; setTimeout(function () { b.textContent = 'copy'; }, 1200); };
      pre.parentNode.insertBefore(b, pre);
    });
  }
  // tiny, safe markdown renderer
  function renderMd(s) {
    s = s || '';
    const blocks = s.split(/```/);
    let html = '';
    blocks.forEach(function (b, i) {
      if (i % 2 === 1) {
        const code = b.replace(/^sql\n/i, '');
        html += '<pre>' + esc(code.replace(/\n$/, '')) + '</pre>';
      } else {
        html += b.split('\n').map(function (line) {
          if (/^###\s+/.test(line)) return '<h4 style="margin:6px 0">' + esc(line.replace(/^###\s+/, '')) + '</h4>';
          if (/^-\s+/.test(line)) return '<div>• ' + inline(line.replace(/^-\s+/, '')) + '</div>';
          if (line.trim() === '') return '<br>';
          return '<div>' + inline(line) + '</div>';
        }).join('');
      }
    });
    return html;
  }
  function inline(s) {
    return esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/_([^_]+)_/g, '<i>$1</i>');
  }
  function toggleAi() { $('#ai-panel').classList.toggle('hidden'); }

  // ---- Command palette -----------------------------------------------------
  const COMMANDS = [];
  function registerCommands() {
    COMMANDS.push(
      { name: 'New File', key: 'Ctrl+N', run: function () { newFile(); } },
      { name: 'Open File…', key: 'Ctrl+O', run: function () { $('#file-input').click(); } },
      { name: 'Save / Download', key: 'Ctrl+S', run: saveFile },
      { name: 'Format Document', key: 'Ctrl+Shift+F', run: formatActive },
      { name: 'Run Script', key: 'F5', run: function () { runScript(false); } },
      { name: 'Run Selection', key: '', run: function () { runScript(true); } },
      { name: 'Compile Object', key: 'F9', run: compileObject },
      { name: 'Explain Plan', key: '', run: showExplainPlan },
      { name: 'Toggle AI Assistant', key: '', run: toggleAi },
      { name: 'Comment / Uncomment', key: 'Ctrl+/', run: function () { editor.getAction('editor.action.commentLine').run(); } },
      { name: 'Go to Line…', key: 'Ctrl+G', run: function () { editor.getAction('editor.action.gotoLine').run(); } },
      { name: 'Go to Symbol…', key: '', run: function () { editor.getAction('editor.action.quickOutline').run(); } },
      { name: 'Find', key: 'Ctrl+F', run: function () { editor.getAction('actions.find').run(); } },
      { name: 'Replace', key: 'Ctrl+H', run: function () { editor.getAction('editor.action.startFindReplaceAction').run(); } },
      { name: 'Duplicate Line', key: 'Ctrl+D', run: function () { editor.getAction('editor.action.copyLinesDownAction').run(); } },
      { name: 'Delete Line', key: 'Ctrl+Shift+K', run: function () { editor.getAction('editor.action.deleteLines').run(); } },
      { name: 'AI: Generate…', key: '', run: function () { const p = prompt('Generate what? (e.g. trigger, package body, forall)'); if (p) { showAi(); aiAsk('generate', p); } } },
      { name: 'AI: Explain Selection', key: '', run: function () { showAi(); aiAsk('explain'); } },
      { name: 'Analyze Code Quality', key: '', run: function () { switchView('quality'); analyzeQuality(); } }
    );
    OracleThemes.names().forEach(function (n) {
      COMMANDS.push({ name: 'Theme: ' + (OracleThemes.labels[n] || n), key: '', run: function () { applyTheme(n); } });
    });
  }
  function openPalette() {
    const pal = $('#palette'); pal.hidden = false;
    const input = $('#palette-input'); input.value = ''; input.focus();
    renderPalette('');
  }
  function renderPalette(q) {
    const list = $('#palette-list'); list.innerHTML = '';
    const ql = q.toLowerCase();
    const matches = COMMANDS.filter(function (c) { return c.name.toLowerCase().indexOf(ql) >= 0; }).slice(0, 50);
    matches.forEach(function (c, i) {
      const li = document.createElement('li'); if (i === 0) li.classList.add('sel');
      li.innerHTML = '<span>' + esc(c.name) + '</span><span class="key">' + esc(c.key) + '</span>';
      li.onclick = function () { closePalette(); c.run(); };
      list.appendChild(li);
    });
  }
  function closePalette() { $('#palette').hidden = true; editor && editor.focus(); }

  // ---- File new / open / save ----------------------------------------------
  function newFile() {
    const name = prompt('New file name (with extension)', 'untitled.sql');
    if (!name) return;
    openContent(name, '');
  }
  function saveFile() {
    const f = files[active]; if (!f) return;
    const content = f.kind === 'csv' && f.csvApi ? f.csvApi.getText() : f.model.getValue();
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = f.name; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    f.dirty = false; renderTabs(); renderFileTree(); trackGit();
    output('Saved ' + f.name + ' (downloaded).');
  }
  function openFromDisk(fileList) {
    Array.prototype.forEach.call(fileList, function (file) {
      const reader = new FileReader();
      reader.onload = function () { openContent(file.name, reader.result); };
      reader.readAsText(file);
    });
  }

  // ---- View switching ------------------------------------------------------
  function switchView(view) {
    $$('.act').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
    $$('#sidebar .view').forEach(function (v) { v.classList.toggle('active', v.dataset.view === view); });
    if (view === 'ai') showAi();
    if (view === 'git') trackGit();
  }
  function showAi() { $('#ai-panel').classList.remove('hidden'); }

  // ---- Shortcuts -----------------------------------------------------------
  function setupShortcuts() {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, function () { saveFile(); });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN, function () { newFile(); });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyO, function () { $('#file-input').click(); });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, function () { formatActive(); });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, function () { openPalette(); });
    editor.addCommand(monaco.KeyCode.F5, function () { runScript(false); });
    editor.addCommand(monaco.KeyCode.F9, function () { compileObject(); });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, function () { runScript(true); });

    document.addEventListener('keydown', function (e) {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); openPalette(); }
      if (e.key === 'Escape') closePalette();
      if (!$('#palette').hidden) handlePaletteKeys(e);
    });
  }
  function handlePaletteKeys(e) {
    const items = $$('#palette-list li');
    let idx = items.findIndex(function (li) { return li.classList.contains('sel'); });
    if (e.key === 'ArrowDown') { e.preventDefault(); if (idx >= 0) items[idx].classList.remove('sel'); items[Math.min(items.length - 1, idx + 1)].classList.add('sel'); items[Math.min(items.length - 1, idx + 1)].scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (idx >= 0) items[idx].classList.remove('sel'); items[Math.max(0, idx - 1)].classList.add('sel'); items[Math.max(0, idx - 1)].scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); const sel = $('#palette-list li.sel'); if (sel) sel.click(); }
  }

  // ---- Status bar ----------------------------------------------------------
  function setStatus() {
    const f = files[active];
    $('#st-lang').textContent = f ? (f.lang === 'oraclesql' ? 'Oracle SQL / PL-SQL' : f.lang.toUpperCase()) : 'Oracle SQL';
    $('#st-theme').textContent = OracleThemes.labels[currentTheme] || currentTheme;
  }

  // ---- Persistence ---------------------------------------------------------
  function persist() {
    const state = { theme: currentTheme, active: active, files: [] };
    Object.keys(files).forEach(function (id) {
      state.files.push({ id: id, name: files[id].name, content: files[id].kind === 'csv' && files[id].csvApi ? files[id].csvApi.getText() : files[id].model.getValue() });
    });
    Persist.save(state);
  }
  function restoreSession() {
    const s = Persist.load();
    if (!s || !s.files || !s.files.length) return;
    if (s.theme && OracleThemes.labels[s.theme]) applyTheme(s.theme);
    s.files.forEach(function (fdef) { openContent(fdef.name, fdef.content); });
    const want = s.files.find(function (f) { return f.id === s.active; });
    if (want) { const id = Object.keys(files).find(function (k) { return files[k].name === want.name; }); if (id) activate(id); }
  }

  // ---- Global event wiring -------------------------------------------------
  document.addEventListener('click', function (e) {
    const actBtn = e.target.closest('[data-action]');
    if (actBtn) { handleAction(actBtn.dataset.action); return; }
    const act = e.target.closest('.act');
    if (act) { switchView(act.dataset.view); return; }
    const ptab = e.target.closest('.ptab');
    if (ptab) { showPanel(ptab.dataset.panel); return; }
    const aiBtn = e.target.closest('[data-ai]');
    if (aiBtn) { showAi(); aiAsk(aiBtn.dataset.ai); return; }
  });

  function handleAction(a) {
    switch (a) {
      case 'new-file': newFile(); break;
      case 'open-file': $('#file-input').click(); break;
      case 'save-file': saveFile(); break;
      case 'format': formatActive(); break;
      case 'run': runScript(false); break;
      case 'run-selection': runScript(true); break;
      case 'compile': compileObject(); break;
      case 'palette': openPalette(); break;
      case 'toggle-ai': toggleAi(); break;
      case 'replace-all': replaceAllInFile(); break;
      case 'analyze-quality': analyzeQuality(); break;
      case 'git-commit': output('Commit (simulated): "' + ($('#commit-msg').value || 'update') + '". Use the git CLI to push.'); Object.keys(files).forEach(function (id) { files[id].dirty = false; }); renderTabs(); trackGit(); break;
      case 'add-conn': output('Add connection: configure a backend service to enable live DB connectivity.'); break;
      case 'clear-panel': $('#output-console').textContent = ''; $('#dbms-output').textContent = ''; $('#explain-plan').innerHTML = ''; break;
      case 'toggle-bottom': $('#bottom-panel').classList.toggle('collapsed'); break;
    }
  }

  $('#file-input').addEventListener('change', function (e) { openFromDisk(e.target.files); e.target.value = ''; });
  $('#search-input') && ($('#search-input').oninput = function () { clearTimeout(window._st); window._st = setTimeout(runSearch, 250); });
  $('#palette-input') && ($('#palette-input').oninput = function () { renderPalette(this.value); });
  $('#ai-send') && ($('#ai-send').onclick = function () { const t = $('#ai-text').value.trim(); if (!t) return; $('#ai-text').value = ''; aiAsk(routeIntent(t), t); });
  $('#ai-text') && ($('#ai-text').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#ai-send').click(); } }));

  function routeIntent(t) {
    const l = t.toLowerCase();
    if (/(ora|pls)-\d{5}/i.test(t)) return 'error';
    if (/generate|create|write|make/.test(l)) return 'generate';
    if (/optimi[sz]e|tune|slow|faster|performance/.test(l)) return 'optimize';
    if (/review|smell|bad/.test(l)) return 'review';
    if (/explain|what does|describe/.test(l)) return 'explain';
    if (/document|header|comment block/.test(l)) return 'document';
    return 'freeform';
  }

  // splitters
  setupSplitter('#split-sidebar', '--sidebar-w', 1, 180, 520);
  setupSplitter('#split-ai', '--ai-w', -1, 240, 600);
  setupSplitter('#split-panel', '--bottom-h', -1, 80, 600, true);
  function setupSplitter(sel, varName, sign, min, max, vertical) {
    const el = document.querySelector(sel); if (!el) return;
    el.addEventListener('mousedown', function (start) {
      start.preventDefault();
      const startVal = parseInt(getComputedStyle(document.documentElement).getPropertyValue(varName)) || 280;
      const startPos = vertical ? start.clientY : start.clientX;
      function move(ev) {
        const cur = vertical ? ev.clientY : ev.clientX;
        let delta = (cur - startPos) * (vertical ? -1 : sign);
        let v = Math.max(min, Math.min(max, startVal + delta));
        document.documentElement.style.setProperty(varName, v + 'px');
      }
      function up() { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); }
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    });
  }

})();
