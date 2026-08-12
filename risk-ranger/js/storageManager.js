const PREFIX = 'riskRanger.';

class StorageManager {
  constructor() {
    this.memory = {};
    this.available = this._test();
  }

  _test() {
    try {
      const k = `${PREFIX}__test__`;
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  get(key, fallback) {
    try {
      const raw = this.available ? window.localStorage.getItem(PREFIX + key) : this.memory[key];
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  set(key, value) {
    try {
      const raw = JSON.stringify(value);
      if (this.available) {
        window.localStorage.setItem(PREFIX + key, raw);
      } else {
        this.memory[key] = raw;
      }
    } catch (e) {
      // Quota exceeded or blocked; ignore, game continues without persistence.
    }
  }
}

export const storage = new StorageManager();
