export class InputManager {
  constructor(target) {
    this.target = target;
    this.onPressStart = null;
    this.onPressEnd = null;
    this._active = false;

    this._onDown = this._onDown.bind(this);
    this._onUp = this._onUp.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
    this._onBlur = this._onBlur.bind(this);

    target.addEventListener('mousedown', this._onDown);
    window.addEventListener('mouseup', this._onUp);
    target.addEventListener('touchstart', this._onTouchStart, { passive: false });
    window.addEventListener('touchend', this._onTouchEnd, { passive: false });
    window.addEventListener('touchcancel', this._onTouchEnd, { passive: false });
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('visibilitychange', this._onBlur);
  }

  get isHeld() {
    return this._active;
  }

  _press() {
    if (this._active) return;
    this._active = true;
    if (this.onPressStart) this.onPressStart();
  }

  _release() {
    if (!this._active) return;
    this._active = false;
    if (this.onPressEnd) this.onPressEnd();
  }

  _onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    this._press();
  }

  _onUp() {
    this._release();
  }

  _onTouchStart(e) {
    e.preventDefault();
    this._press();
  }

  _onTouchEnd(e) {
    e.preventDefault();
    this._release();
  }

  _onKeyDown(e) {
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) this._press();
    }
  }

  _onKeyUp(e) {
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      this._release();
    }
  }

  _onBlur() {
    if (document.hidden === true || document.hasFocus?.() === false) {
      this._release();
    }
  }

  destroy() {
    this.target.removeEventListener('mousedown', this._onDown);
    window.removeEventListener('mouseup', this._onUp);
    this.target.removeEventListener('touchstart', this._onTouchStart);
    window.removeEventListener('touchend', this._onTouchEnd);
    window.removeEventListener('touchcancel', this._onTouchEnd);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('visibilitychange', this._onBlur);
  }
}
