/* =============================================================================
 * CSV grid editor.
 * Parses CSV/DAT text into an editable grid with sort, filter, search and
 * export. Handles quoted fields, embedded commas/newlines and delimiter
 * auto-detection. Exposed as window.CsvEditor.
 * ============================================================================= */
(function (global) {
  'use strict';

  function detectDelimiter(text) {
    const firstLine = text.split(/\r?\n/)[0] || '';
    const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
    Object.keys(counts).forEach(function (d) { counts[d] = firstLine.split(d).length - 1; });
    return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0] || ',';
  }

  function parse(text, delim) {
    delim = delim || detectDelimiter(text);
    const rows = [];
    let row = [], field = '', i = 0, inQ = false;
    while (i < text.length) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += ch; i++; continue;
      }
      if (ch === '"') { inQ = true; i++; continue; }
      if (ch === delim) { row.push(field); field = ''; i++; continue; }
      if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = ''; i++; continue;
      }
      field += ch; i++;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return { delim: delim, rows: rows };
  }

  function escape(v, delim) {
    v = v == null ? '' : String(v);
    if (v.indexOf('"') >= 0 || v.indexOf(delim) >= 0 || /[\n\r]/.test(v)) {
      return '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
  }

  function serialize(rows, delim) {
    delim = delim || ',';
    return rows.map(function (r) { return r.map(function (c) { return escape(c, delim); }).join(delim); }).join('\n');
  }

  // Renders an editable grid into container; returns an API to read it back.
  function render(container, text) {
    const parsed = parse(text);
    const delim = parsed.delim;
    let rows = parsed.rows;
    if (!rows.length) rows = [['']];
    const header = rows[0];
    let body = rows.slice(1);
    let sortCol = -1, sortDir = 1, filterText = '';

    function visibleBody() {
      let v = body;
      if (filterText) {
        const f = filterText.toLowerCase();
        v = v.filter(function (r) { return r.some(function (c) { return (c || '').toLowerCase().indexOf(f) >= 0; }); });
      }
      if (sortCol >= 0) {
        v = v.slice().sort(function (a, b) {
          const x = a[sortCol] || '', y = b[sortCol] || '';
          const nx = parseFloat(x), ny = parseFloat(y);
          if (!isNaN(nx) && !isNaN(ny)) return (nx - ny) * sortDir;
          return x.localeCompare(y) * sortDir;
        });
      }
      return v;
    }

    function draw() {
      const vb = visibleBody();
      const tbl = document.createElement('table');
      tbl.className = 'csv-grid';
      const thead = document.createElement('thead');
      const htr = document.createElement('tr');
      const corner = document.createElement('th'); corner.textContent = '#'; corner.className = 'csv-corner'; htr.appendChild(corner);
      header.forEach(function (h, ci) {
        const th = document.createElement('th');
        th.textContent = h || ('col' + (ci + 1));
        th.title = 'Click to sort';
        if (sortCol === ci) th.textContent += sortDir > 0 ? '  ▲' : '  ▼';
        th.onclick = function () { if (sortCol === ci) sortDir = -sortDir; else { sortCol = ci; sortDir = 1; } draw(); };
        htr.appendChild(th);
      });
      thead.appendChild(htr); tbl.appendChild(thead);

      const tb = document.createElement('tbody');
      vb.forEach(function (r, ri) {
        const tr = document.createElement('tr');
        const num = document.createElement('td'); num.textContent = ri + 1; num.className = 'csv-corner'; tr.appendChild(num);
        header.forEach(function (_, ci) {
          const td = document.createElement('td');
          td.contentEditable = 'true';
          td.textContent = r[ci] || '';
          td.spellcheck = false;
          td.oninput = function () {
            // map back to the real row in `body`
            const realIndex = body.indexOf(r);
            if (realIndex >= 0) body[realIndex][ci] = td.textContent;
          };
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
      tbl.appendChild(tb);

      container.innerHTML = '';
      const toolbar = document.createElement('div');
      toolbar.className = 'csv-toolbar';
      toolbar.innerHTML =
        '<input type="text" placeholder="Filter rows..." class="csv-filter">' +
        '<button class="csv-addrow">+ Row</button>' +
        '<button class="csv-addcol">+ Column</button>' +
        '<span class="csv-stats">' + vb.length + ' / ' + body.length + ' rows · ' + header.length + ' cols · delim "' + (delim === '\t' ? '\\t' : delim) + '"</span>';
      container.appendChild(toolbar);
      const wrap = document.createElement('div'); wrap.className = 'csv-scroll'; wrap.appendChild(tbl);
      container.appendChild(wrap);

      const fi = toolbar.querySelector('.csv-filter'); fi.value = filterText;
      fi.oninput = function () { filterText = fi.value; draw(); fi2focus(); };
      function fi2focus() { const e = container.querySelector('.csv-filter'); if (e) { e.focus(); e.selectionStart = e.value.length; } }
      toolbar.querySelector('.csv-addrow').onclick = function () { body.push(header.map(function () { return ''; })); draw(); };
      toolbar.querySelector('.csv-addcol').onclick = function () {
        const name = prompt('Column name?', 'col' + (header.length + 1));
        if (name === null) return;
        header.push(name); body.forEach(function (r) { r.push(''); }); draw();
      };
    }

    draw();

    return {
      getText: function () { return serialize([header].concat(body), delim); },
      getDelimiter: function () { return delim; }
    };
  }

  global.CsvEditor = { parse: parse, serialize: serialize, render: render, detectDelimiter: detectDelimiter };
})(window);
