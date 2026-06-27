/* =============================================================================
 * Monaco editor themes for the Oracle PL/SQL IDE.
 * Each theme also carries a `chrome` palette used to skin the surrounding IDE.
 * Exposed as window.OracleThemes
 * ============================================================================= */
(function (global) {
  'use strict';

  // token rules shared structure builder
  function rules(c) {
    return [
      { token: 'keyword', foreground: c.kw, fontStyle: 'bold' },
      { token: 'type', foreground: c.type },
      { token: 'type.ebs', foreground: c.ebs, fontStyle: 'bold' },
      { token: 'type.identifier.pkg', foreground: c.pkg },
      { token: 'predefined', foreground: c.fn },
      { token: 'constant.exception', foreground: c.exc, fontStyle: 'italic' },
      { token: 'number', foreground: c.num },
      { token: 'number.float', foreground: c.num },
      { token: 'string', foreground: c.str },
      { token: 'string.quote', foreground: c.str },
      { token: 'identifier.quote', foreground: c.str },
      { token: 'comment', foreground: c.com, fontStyle: 'italic' },
      { token: 'variable.bind', foreground: c.bind, fontStyle: 'bold' },
      { token: 'metatag', foreground: c.meta },
      { token: 'operator', foreground: c.op },
      { token: 'delimiter', foreground: c.op },
      { token: 'identifier', foreground: c.id }
    ];
  }

  // [name, base, palette, chrome]
  const DEFS = {
    'oracle-dark': {
      base: 'vs-dark',
      c: { kw: 'ff6f3c', type: '4ec9b0', ebs: 'ffd166', pkg: '9cdcfe', fn: 'dcdcaa', exc: 'f48771', num: 'b5cea8', str: 'ce9178', com: '6a9955', bind: 'c586c0', meta: '569cd6', op: 'd4d4d4', id: 'd4d4d4', bg: '1b1b1f', fg: 'e6e6e6' },
      chrome: { '--bg': '#1b1b1f', '--panel': '#232328', '--panel2': '#2a2a30', '--border': '#34343c', '--fg': '#e6e6e6', '--muted': '#9a9aa6', '--accent': '#ff6f3c' }
    },
    'oracle-light': {
      base: 'vs',
      c: { kw: 'c0392b', type: '267f99', ebs: 'a6601c', pkg: '0070c1', fn: '795e26', exc: 'b5651d', num: '098658', str: 'a31515', com: '008000', bind: 'af00db', meta: '0000ff', op: '333333', id: '1f1f1f', bg: 'ffffff', fg: '1f1f1f' },
      chrome: { '--bg': '#ffffff', '--panel': '#f3f3f3', '--panel2': '#e9e9ec', '--border': '#d4d4d8', '--fg': '#1f1f1f', '--muted': '#6a6a72', '--accent': '#c0392b' }
    },
    'dracula': {
      base: 'vs-dark',
      c: { kw: 'ff79c6', type: '8be9fd', ebs: 'ffb86c', pkg: '8be9fd', fn: '50fa7b', exc: 'ff5555', num: 'bd93f9', str: 'f1fa8c', com: '6272a4', bind: 'ffb86c', meta: 'ff79c6', op: 'f8f8f2', id: 'f8f8f2', bg: '282a36', fg: 'f8f8f2' },
      chrome: { '--bg': '#282a36', '--panel': '#21222c', '--panel2': '#343746', '--border': '#44475a', '--fg': '#f8f8f2', '--muted': '#9aa0c0', '--accent': '#bd93f9' }
    },
    'monokai': {
      base: 'vs-dark',
      c: { kw: 'f92672', type: '66d9ef', ebs: 'fd971f', pkg: 'a6e22e', fn: 'a6e22e', exc: 'f92672', num: 'ae81ff', str: 'e6db74', com: '75715e', bind: 'fd971f', meta: 'f92672', op: 'f8f8f2', id: 'f8f8f2', bg: '272822', fg: 'f8f8f2' },
      chrome: { '--bg': '#272822', '--panel': '#1e1f1a', '--panel2': '#34352c', '--border': '#49483e', '--fg': '#f8f8f2', '--muted': '#a6a695', '--accent': '#a6e22e' }
    },
    'one-dark-pro': {
      base: 'vs-dark',
      c: { kw: 'c678dd', type: 'e5c07b', ebs: 'd19a66', pkg: '61afef', fn: '61afef', exc: 'e06c75', num: 'd19a66', str: '98c379', com: '7f848e', bind: 'e06c75', meta: '56b6c2', op: 'abb2bf', id: 'abb2bf', bg: '282c34', fg: 'abb2bf' },
      chrome: { '--bg': '#282c34', '--panel': '#21252b', '--panel2': '#2c313a', '--border': '#3e4451', '--fg': '#abb2bf', '--muted': '#828a99', '--accent': '#61afef' }
    },
    'github': {
      base: 'vs',
      c: { kw: 'd73a49', type: '6f42c1', ebs: 'e36209', pkg: '005cc5', fn: '6f42c1', exc: 'd73a49', num: '005cc5', str: '032f62', com: '6a737d', bind: 'e36209', meta: '22863a', op: '24292e', id: '24292e', bg: 'ffffff', fg: '24292e' },
      chrome: { '--bg': '#ffffff', '--panel': '#f6f8fa', '--panel2': '#eaeef2', '--border': '#d0d7de', '--fg': '#24292e', '--muted': '#57606a', '--accent': '#0969da' }
    },
    'solarized-dark': {
      base: 'vs-dark',
      c: { kw: '859900', type: 'b58900', ebs: 'cb4b16', pkg: '268bd2', fn: '2aa198', exc: 'dc322f', num: 'd33682', str: '2aa198', com: '586e75', bind: 'cb4b16', meta: '6c71c4', op: '93a1a1', id: '93a1a1', bg: '002b36', fg: '93a1a1' },
      chrome: { '--bg': '#002b36', '--panel': '#01313d', '--panel2': '#073642', '--border': '#0a4b59', '--fg': '#93a1a1', '--muted': '#657b83', '--accent': '#b58900' }
    },
    'solarized-light': {
      base: 'vs',
      c: { kw: '859900', type: 'b58900', ebs: 'cb4b16', pkg: '268bd2', fn: '2aa198', exc: 'dc322f', num: 'd33682', str: '2aa198', com: '93a1a1', bind: 'cb4b16', meta: '6c71c4', op: '586e75', id: '586e75', bg: 'fdf6e3', fg: '586e75' },
      chrome: { '--bg': '#fdf6e3', '--panel': '#eee8d5', '--panel2': '#e3ddc8', '--border': '#d6cfb5', '--fg': '#586e75', '--muted': '#93a1a1', '--accent': '#b58900' }
    },
    'nord': {
      base: 'vs-dark',
      c: { kw: '81a1c1', type: '8fbcbb', ebs: 'd08770', pkg: '88c0d0', fn: '88c0d0', exc: 'bf616a', num: 'b48ead', str: 'a3be8c', com: '616e88', bind: 'd08770', meta: '5e81ac', op: 'd8dee9', id: 'd8dee9', bg: '2e3440', fg: 'd8dee9' },
      chrome: { '--bg': '#2e3440', '--panel': '#272c36', '--panel2': '#3b4252', '--border': '#434c5e', '--fg': '#d8dee9', '--muted': '#8a93a5', '--accent': '#88c0d0' }
    },
    'night-owl': {
      base: 'vs-dark',
      c: { kw: 'c792ea', type: 'addb67', ebs: 'f78c6c', pkg: '82aaff', fn: '82aaff', exc: 'ef5350', num: 'f78c6c', str: 'ecc48d', com: '637777', bind: 'f78c6c', meta: '7fdbca', op: 'd6deeb', id: 'd6deeb', bg: '011627', fg: 'd6deeb' },
      chrome: { '--bg': '#011627', '--panel': '#01101d', '--panel2': '#0b2942', '--border': '#1d3b53', '--fg': '#d6deeb', '--muted': '#7a8a9a', '--accent': '#82aaff' }
    },
    'vs-dark': {
      base: 'vs-dark',
      c: { kw: '569cd6', type: '4ec9b0', ebs: 'd7ba7d', pkg: '9cdcfe', fn: 'dcdcaa', exc: 'd16969', num: 'b5cea8', str: 'ce9178', com: '6a9955', bind: 'c586c0', meta: '569cd6', op: 'd4d4d4', id: 'd4d4d4', bg: '1e1e1e', fg: 'd4d4d4' },
      chrome: { '--bg': '#1e1e1e', '--panel': '#252526', '--panel2': '#2d2d30', '--border': '#3c3c3c', '--fg': '#d4d4d4', '--muted': '#969696', '--accent': '#0e639c' }
    },
    'vs-light': {
      base: 'vs',
      c: { kw: '0000ff', type: '267f99', ebs: 'a6601c', pkg: '0070c1', fn: '795e26', exc: 'b5651d', num: '098658', str: 'a31515', com: '008000', bind: 'af00db', meta: '0000ff', op: '333333', id: '1f1f1f', bg: 'ffffff', fg: '1f1f1f' },
      chrome: { '--bg': '#ffffff', '--panel': '#f3f3f3', '--panel2': '#ececec', '--border': '#dddddd', '--fg': '#1f1f1f', '--muted': '#6a6a6a', '--accent': '#0066b8' }
    },
    'material-dark': {
      base: 'vs-dark',
      c: { kw: 'c792ea', type: 'ffcb6b', ebs: 'f78c6c', pkg: '82aaff', fn: '82aaff', exc: 'f07178', num: 'f78c6c', str: 'c3e88d', com: '546e7a', bind: 'f78c6c', meta: '89ddff', op: 'eeffff', id: 'eeffff', bg: '263238', fg: 'eeffff' },
      chrome: { '--bg': '#263238', '--panel': '#21292e', '--panel2': '#314048', '--border': '#3c4c54', '--fg': '#eeffff', '--muted': '#8a9aa2', '--accent': '#82aaff' }
    },
    'high-contrast': {
      base: 'hc-black',
      c: { kw: 'ffd700', type: '00ffff', ebs: 'ffa500', pkg: '00ff00', fn: '00ff00', exc: 'ff0000', num: 'ffffff', str: 'ffeb3b', com: '7ca668', bind: 'ff00ff', meta: '00ffff', op: 'ffffff', id: 'ffffff', bg: '000000', fg: 'ffffff' },
      chrome: { '--bg': '#000000', '--panel': '#0a0a0a', '--panel2': '#151515', '--border': '#6fc3df', '--fg': '#ffffff', '--muted': '#cccccc', '--accent': '#ffff00' }
    }
  };

  const labels = {
    'oracle-dark': 'Oracle Dark', 'oracle-light': 'Oracle Light', 'dracula': 'Dracula',
    'monokai': 'Monokai', 'one-dark-pro': 'One Dark Pro', 'github': 'GitHub',
    'solarized-dark': 'Solarized Dark', 'solarized-light': 'Solarized Light', 'nord': 'Nord',
    'night-owl': 'Night Owl', 'vs-dark': 'VS Dark', 'vs-light': 'VS Light',
    'material-dark': 'Material Dark', 'high-contrast': 'High Contrast'
  };

  function defineAll(monaco) {
    Object.keys(DEFS).forEach(function (name) {
      const d = DEFS[name];
      monaco.editor.defineTheme(name, {
        base: d.base,
        inherit: true,
        rules: rules(d.c),
        colors: {
          'editor.background': '#' + d.c.bg,
          'editor.foreground': '#' + d.c.fg,
          'editorLineNumber.foreground': '#' + d.chrome['--muted'].slice(1),
          'editorCursor.foreground': '#' + d.chrome['--accent'].slice(1),
          'editor.selectionBackground': '#' + d.c.kw + '33',
          'editor.lineHighlightBackground': '#' + d.chrome['--panel2'].slice(1) + '66'
        }
      });
    });
  }

  function applyChrome(name) {
    const d = DEFS[name];
    if (!d) return;
    const root = document.documentElement;
    Object.keys(d.chrome).forEach(function (k) { root.style.setProperty(k, d.chrome[k]); });
    root.setAttribute('data-base', d.base);
  }

  // Allow custom user-defined themes (persisted)
  function defineCustom(monaco, name, def) {
    DEFS[name] = def;
    labels[name] = def.label || name;
    monaco.editor.defineTheme(name, {
      base: def.base || 'vs-dark', inherit: true, rules: rules(def.c),
      colors: { 'editor.background': '#' + def.c.bg, 'editor.foreground': '#' + def.c.fg }
    });
  }

  global.OracleThemes = {
    DEFS: DEFS, labels: labels, defineAll: defineAll, applyChrome: applyChrome, defineCustom: defineCustom,
    names: function () { return Object.keys(DEFS); }
  };
})(window);
