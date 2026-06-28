/* =========================================================================
   util.js — shared helpers + global namespace bootstrap
   ========================================================================= */
(function () {
  "use strict";

  /** Global namespace. Every module attaches to window.NF. */
  const NF = (window.NF = window.NF || {});

  const U = (NF.util = {
    /** clamp n into [min,max] */
    clamp(n, min, max) { return Math.max(min, Math.min(max, n)); },

    /** random int in [min,max] inclusive */
    randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; },

    /** random element of an array */
    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },

    /** Fisher–Yates shuffle (returns a new array) */
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },

    /** unique-ish id */
    uid() { return "id-" + Math.random().toString(36).slice(2, 9); },

    /** ms -> "1.23s" / "01:05" style formatting */
    fmtMs(ms) {
      if (ms < 10000) return (ms / 1000).toFixed(2) + "s";
      const s = Math.round(ms / 1000);
      return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
    },

    /** abbreviate large numbers (1234 -> 1.2k) */
    abbr(n) {
      if (n < 1000) return String(n);
      if (n < 1e6) return (n / 1000).toFixed(n < 1e4 ? 1 : 0) + "k";
      return (n / 1e6).toFixed(1) + "M";
    },

    /** today as YYYY-MM-DD (local) */
    today() {
      const d = new Date();
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    },

    /** days between two YYYY-MM-DD strings */
    daysBetween(a, b) {
      return Math.round((new Date(b) - new Date(a)) / 86400000);
    },

    /** create an element with attrs + children. Tiny hyperscript. */
    el(tag, attrs, children) {
      const node = document.createElement(tag);
      if (attrs) {
        for (const k in attrs) {
          if (k === "class") node.className = attrs[k];
          else if (k === "html") node.innerHTML = attrs[k];
          else if (k === "text") node.textContent = attrs[k];
          else if (k.startsWith("on") && typeof attrs[k] === "function") {
            node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
          } else if (k === "style" && typeof attrs[k] === "object") {
            Object.assign(node.style, attrs[k]);
          } else if (attrs[k] != null && attrs[k] !== false) {
            node.setAttribute(k, attrs[k]);
          }
        }
      }
      if (children != null) {
        (Array.isArray(children) ? children : [children]).forEach((c) => {
          if (c == null || c === false) return;
          node.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
        });
      }
      return node;
    },

    /** linear interpolation */
    lerp(a, b, t) { return a + (b - a) * t; },

    /** Promise-based delay */
    wait(ms) { return new Promise((r) => setTimeout(r, ms)); },

    /** map a 0..1 value to an HSL-ish status colour via CSS var fallbacks */
    grade(pct) {
      if (pct >= 0.85) return "var(--good)";
      if (pct >= 0.6) return "var(--c1)";
      if (pct >= 0.4) return "var(--warn)";
      return "var(--bad)";
    },
  });

  /** Tiny event bus so modules stay decoupled. */
  NF.bus = (function () {
    const map = {};
    return {
      on(ev, fn) { (map[ev] = map[ev] || []).push(fn); return () => this.off(ev, fn); },
      off(ev, fn) { if (map[ev]) map[ev] = map[ev].filter((f) => f !== fn); },
      emit(ev, data) { (map[ev] || []).forEach((f) => { try { f(data); } catch (e) { console.error(e); } }); },
    };
  })();

  void U;
})();
