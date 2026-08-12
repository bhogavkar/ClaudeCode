import { storage } from './storageManager.js';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants.js';

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.unlocked = false;
    this.growNode = null;
    this.ambienceTimer = null;

    const settings = storage.get(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    this.musicOn = settings.music !== false;
    this.sfxOn = settings.sfx !== false;
  }

  _ensureContext() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1;
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicOn ? 0.35 : 0;
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxOn ? 0.9 : 0;
      this.sfxGain.connect(this.masterGain);
    } catch (e) {
      this.ctx = null;
    }
  }

  unlock() {
    this._ensureContext();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.unlocked) {
      this.unlocked = true;
      this._startAmbience();
    }
  }

  setMusicEnabled(on) {
    this.musicOn = on;
    if (this.musicGain) this.musicGain.gain.value = on ? 0.35 : 0;
  }

  setSfxEnabled(on) {
    this.sfxOn = on;
    if (this.sfxGain) this.sfxGain.gain.value = on ? 0.9 : 0;
  }

  _tone(freq, duration, { type = 'sine', gain = 0.22, when = 0, sweepTo = null, out } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t0 + duration);
    }
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.02, duration * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g);
    g.connect(out || this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  _noise(duration, { filterFreq = 1200, gain = 0.25, when = 0 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  playClick() {
    this._ensureContext();
    this._tone(520, 0.08, { type: 'triangle', gain: 0.18 });
  }

  startGrowLoop() {
    this._ensureContext();
    if (!this.ctx || this.growNode) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 180;
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.06, this.ctx.currentTime + 0.05);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start();
    this.growNode = { osc, g, startTime: this.ctx.currentTime };
  }

  updateGrowLoop(t01) {
    if (!this.growNode || !this.ctx) return;
    const freq = 180 + t01 * 260;
    this.growNode.osc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.05);
  }

  stopGrowLoop() {
    if (!this.growNode || !this.ctx) return;
    const { osc, g } = this.growNode;
    const t0 = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t0);
    g.gain.setValueAtTime(g.gain.value, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
    osc.stop(t0 + 0.1);
    this.growNode = null;
  }

  playWhoosh() {
    this._ensureContext();
    this._noise(0.28, { filterFreq: 900, gain: 0.16 });
  }

  playLand() {
    this._ensureContext();
    this._noise(0.12, { filterFreq: 500, gain: 0.3 });
    this._tone(90, 0.12, { type: 'sine', gain: 0.2 });
  }

  playSuccess() {
    this._ensureContext();
    this._tone(523, 0.12, { type: 'triangle', gain: 0.22 });
    this._tone(659, 0.16, { type: 'triangle', gain: 0.2, when: 0.08 });
  }

  playPerfect() {
    this._ensureContext();
    [523, 659, 784, 1046].forEach((f, i) => {
      this._tone(f, 0.18, { type: 'triangle', gain: 0.2, when: i * 0.07 });
    });
  }

  playCombo(streak) {
    this._ensureContext();
    const base = 440 + Math.min(streak, 12) * 24;
    this._tone(base, 0.1, { type: 'square', gain: 0.12 });
  }

  playFall() {
    this._ensureContext();
    this._tone(320, 0.5, { type: 'sawtooth', gain: 0.18, sweepTo: 60 });
    this._noise(0.3, { filterFreq: 700, gain: 0.2, when: 0.25 });
  }

  playGameOver() {
    this._ensureContext();
    [400, 340, 260, 180].forEach((f, i) => {
      this._tone(f, 0.22, { type: 'sine', gain: 0.18, when: i * 0.12 });
    });
  }

  _startAmbience() {
    if (!this.ctx || this.ambienceTimer) return;
    const drone1 = this.ctx.createOscillator();
    const drone2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    drone1.type = 'sine';
    drone2.type = 'sine';
    drone1.frequency.value = 110;
    drone2.frequency.value = 165;
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + 2);
    drone1.connect(g);
    drone2.connect(g);
    g.connect(this.musicGain);
    drone1.start();
    drone2.start();

    const scheduleChirp = () => {
      if (this.sfxOn && Math.random() < 0.6) {
        const f = 1400 + Math.random() * 900;
        this._tone(f, 0.12, { type: 'sine', gain: 0.05, sweepTo: f * 1.4 });
      }
      this.ambienceTimer = setTimeout(scheduleChirp, 4000 + Math.random() * 5000);
    };
    this.ambienceTimer = setTimeout(scheduleChirp, 3000);
  }
}
