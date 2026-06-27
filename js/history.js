/* =====================================================================
   history.js — Undo/Redo via snapshot stack (Command-pattern friendly).
   Coalesces rapid mutations into single transactions for clean undo steps.
   ===================================================================== */
(function () {
  "use strict";
  const DD = window.DD;
  const { clone } = DD.util;
  const { bus, EV, store } = DD;

  class History {
    constructor(limit = 200) {
      this.limit = limit;
      this.undoStack = [];
      this.redoStack = [];
      this._pending = null;
      this._timer = null;
      this._snapshotBefore = null;
      this._captureBaseline();
      // Auto-capture on document mutation, coalesced.
      bus.on(EV.DOC_CHANGED, () => this._scheduleCommit());
      bus.on(EV.DOC_LOADED, () => { this.reset(); });
    }

    _snapshot() { return clone(store.doc); }
    _captureBaseline() { this._snapshotBefore = this._snapshot(); }

    /** Wrap a synchronous block so it becomes one undo step labelled `label`. */
    transaction(label, fn) {
      this._commit();             // flush anything pending
      const before = this._snapshot();
      try { fn(); } finally {
        this._push(label, before, this._snapshot());
      }
    }

    /** Coalesce drag/typing bursts: commit after a short idle. */
    _scheduleCommit() {
      clearTimeout(this._timer);
      if (!this._pending) this._pending = { before: this._snapshotBefore };
      this._timer = setTimeout(() => this._commit(), 400);
    }

    _commit(label = "Edit") {
      clearTimeout(this._timer);
      if (!this._pending) { this._snapshotBefore = this._snapshot(); return; }
      const after = this._snapshot();
      this._push(label, this._pending.before, after);
      this._pending = null;
    }

    _push(label, before, after) {
      if (JSON.stringify(before) === JSON.stringify(after)) { this._snapshotBefore = after; return; }
      this.undoStack.push({ label, before, after, t: Date.now() });
      if (this.undoStack.length > this.limit) this.undoStack.shift();
      this.redoStack.length = 0;
      this._snapshotBefore = after;
      bus.emit(EV.HISTORY, this.info());
    }

    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }

    undo() {
      this._commit();
      const entry = this.undoStack.pop();
      if (!entry) return;
      this.redoStack.push(entry);
      this._apply(entry.before);
      bus.emit(EV.HISTORY, this.info());
      DD.util.toast("Undo: " + entry.label);
    }

    redo() {
      const entry = this.redoStack.pop();
      if (!entry) return;
      this.undoStack.push(entry);
      this._apply(entry.after);
      bus.emit(EV.HISTORY, this.info());
      DD.util.toast("Redo: " + entry.label);
    }

    _apply(snap) {
      const sel = new Set(store.selection);
      store.load(clone(snap), { silent: true });
      // Restore selection where ids still exist.
      store.selection = new Set([...sel].filter((id) => store.getObject(id)));
      this._snapshotBefore = this._snapshot();
      this._pending = null;
      bus.emit(EV.DOC_LOADED, store.doc);
      bus.emit(EV.SELECTION, store.getSelection());
    }

    reset() { this.undoStack = []; this.redoStack = []; this._pending = null; this._captureBaseline(); bus.emit(EV.HISTORY, this.info()); }

    info() {
      return {
        canUndo: this.canUndo(), canRedo: this.canRedo(),
        undoLabel: (this.undoStack.at(-1) || {}).label,
        redoLabel: (this.redoStack.at(-1) || {}).label,
        entries: this.undoStack.map((e) => ({ label: e.label, t: e.t })),
      };
    }
  }

  DD.history = new History();
})();
