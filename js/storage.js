/* =====================================================================
   storage.js — Persistence: autosave + recent files via LocalStorage,
   with an IndexedDB-backed store for larger documents (graceful fallback).
   ===================================================================== */
(function () {
  "use strict";
  const DD = window.DD;
  const { bus, EV, store } = DD;
  const LS_AUTOSAVE = "dd.autosave";
  const LS_RECENT = "dd.recent";
  const DB_NAME = "dd-diagrams";

  /* -------------------------------------------------- IndexedDB */
  let _db = null;
  function openDB() {
    return new Promise((res) => {
      if (!("indexedDB" in window)) return res(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore("docs", { keyPath: "id" }); };
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(null);
    });
  }
  async function dbPut(doc) {
    _db = _db || (await openDB());
    if (!_db) return false;
    return new Promise((res) => {
      const tx = _db.transaction("docs", "readwrite");
      tx.objectStore("docs").put({ ...doc, savedAt: Date.now() });
      tx.oncomplete = () => res(true); tx.onerror = () => res(false);
    });
  }
  async function dbGet(id) {
    _db = _db || (await openDB());
    if (!_db) return null;
    return new Promise((res) => {
      const r = _db.transaction("docs").objectStore("docs").get(id);
      r.onsuccess = () => res(r.result); r.onerror = () => res(null);
    });
  }
  async function dbAll() {
    _db = _db || (await openDB());
    if (!_db) return [];
    return new Promise((res) => {
      const r = _db.transaction("docs").objectStore("docs").getAll();
      r.onsuccess = () => res(r.result || []); r.onerror = () => res([]);
    });
  }

  class Storage {
    constructor() {
      this.autosaveDelay = 1500;
      this._auto = DD.util.debounce(() => this.autosave(), this.autosaveDelay);
      bus.on(EV.DOC_CHANGED, () => this._auto());
      bus.on(EV.DOC_LOADED, () => this._auto());
      window.addEventListener("beforeunload", (e) => {
        this.autosave();
        if (store.isDirty()) { e.preventDefault(); e.returnValue = ""; }
      });
      this.restoreOnStart();
    }

    /* ---------------- save / load ---------------- */
    async save() {
      try {
        localStorage.setItem(LS_AUTOSAVE, JSON.stringify(store.doc));
        await dbPut(store.doc);
        this.pushRecent(store.doc);
        store.markClean();
        DD.util.toast("Saved", "success");
      } catch (err) { DD.util.toast("Save failed: " + err.message, "error"); }
    }

    autosave() {
      try {
        localStorage.setItem(LS_AUTOSAVE, JSON.stringify(store.doc));
        dbPut(store.doc);
        const st = document.getElementById("saveStatus");
        if (st) { st.textContent = "Saved"; st.dataset.dirty = "false"; }
      } catch (e) { /* quota — ignore, JSON export still works */ }
    }

    async open(id) {
      const doc = await dbGet(id);
      if (doc) { DD.history.transaction("Open", () => store.load(doc)); DD.util.toast("Opened: " + doc.name); setTimeout(() => DD.canvas.fit(), 30); }
    }

    restoreOnStart() {
      const raw = localStorage.getItem(LS_AUTOSAVE);
      if (raw) {
        try {
          const doc = JSON.parse(raw);
          store.load(doc);
          document.getElementById("docName").value = doc.name || "Untitled Diagram";
          setTimeout(() => DD.canvas.fit(), 40);
          return true;
        } catch (e) { /* fall through to demo */ }
      }
      // First run: seed a welcome diagram.
      DD.templates && DD.templates.apply("flowchart", { replace: true });
      return false;
    }

    /* ---------------- recent ---------------- */
    pushRecent(doc) {
      let recent = this.recent();
      recent = recent.filter((r) => r.id !== doc.id);
      recent.unshift({ id: doc.id, name: doc.name, modified: doc.modified });
      recent = recent.slice(0, 12);
      try { localStorage.setItem(LS_RECENT, JSON.stringify(recent)); } catch (e) {}
    }
    recent() { try { return JSON.parse(localStorage.getItem(LS_RECENT) || "[]"); } catch (e) { return []; } }
    async allDocs() { return dbAll(); }
  }

  DD.storage = new Storage();
})();
