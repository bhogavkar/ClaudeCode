import { rankForCrossings } from './constants.js';
import { renderThumbnail } from './characterArt.js';

const SCREEN_IDS = [
  'screen-loading',
  'screen-menu',
  'screen-how-to-play',
  'screen-character-select',
  'screen-settings',
  'screen-pause',
  'screen-gameover',
];

export class UIManager {
  constructor(callbacks) {
    this.cb = callbacks;
    this.el = {};
    for (const id of SCREEN_IDS) this.el[id] = document.getElementById(id);
    this.el.hud = document.getElementById('hud');
    this.el.tapHint = document.getElementById('tap-hint');
    this.el.hudScore = document.getElementById('hud-score');
    this.el.hudBest = document.getElementById('hud-best');
    this.el.hudLevel = document.getElementById('hud-level');
    this.el.hudStreak = document.getElementById('hud-streak');
    this.el.menuBest = document.getElementById('menu-best');
    this.el.charGrid = document.getElementById('character-grid');
    this.el.loadingFill = document.getElementById('loading-fill');
    this.el.goScore = document.getElementById('go-score');
    this.el.goCrossings = document.getElementById('go-crossings');
    this.el.goBest = document.getElementById('go-best');
    this.el.goRank = document.getElementById('go-rank');
    this.el.goNewBest = document.getElementById('gameover-newbest');
    this.el.muteBtn = document.getElementById('btn-mute');
    this.el.pauseBtn = document.getElementById('btn-pause');

    this._settingsReturnTo = 'screen-menu';
    this._bindButtons();
  }

  _on(id, handler) {
    const node = document.getElementById(id);
    if (node) {
      node.addEventListener('click', (e) => {
        if (this.cb.onAnyClick) this.cb.onAnyClick();
        handler(e);
      });
    }
  }

  _bindButtons() {
    const cb = this.cb;
    this._on('btn-play', () => cb.onPlay());
    this._on('btn-how-to-play', () => cb.onHowToPlayOpenFromMenu());
    this._on('btn-settings', () => {
      this._settingsReturnTo = 'screen-menu';
      this.showScreen('screen-settings');
    });
    this._on('btn-howto-back', () => cb.onHowToPlayBack());
    this._on('btn-howto-continue', () => cb.onHowToPlayContinue());

    this._on('btn-char-back', () => this.showScreen('screen-menu'));
    this._on('btn-char-confirm', () => cb.onCharConfirm());

    this._on('btn-settings-back', () => this.showScreen(this._settingsReturnTo));

    this._on('btn-resume', () => cb.onPauseResume());
    this._on('btn-pause-restart', () => cb.onPauseRestart());
    this._on('btn-pause-settings', () => {
      this._settingsReturnTo = 'screen-pause';
      this.showScreen('screen-settings');
    });
    this._on('btn-pause-menu', () => cb.onPauseMenu());

    this._on('btn-gameover-retry', () => cb.onGameOverRetry());
    this._on('btn-gameover-menu', () => cb.onGameOverMenu());

    this._on('btn-pause', () => cb.onPauseIcon());
    this._on('btn-mute', () => cb.onMuteIcon());

    this._on('toggle-music', (e) => this._toggleClicked(e, cb.onToggleMusic));
    this._on('toggle-sfx', (e) => this._toggleClicked(e, cb.onToggleSfx));
    this._on('toggle-vibration', (e) => this._toggleClicked(e, cb.onToggleVibration));

    const qualityWrap = document.getElementById('quality-buttons');
    if (qualityWrap) {
      qualityWrap.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (cb.onAnyClick) cb.onAnyClick();
          cb.onSetQuality(btn.dataset.q);
        });
      });
    }
  }

  _toggleClicked(e, handler) {
    const btn = e.currentTarget;
    const next = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(next));
    handler(next);
  }

  showScreen(id) {
    for (const sid of SCREEN_IDS) {
      if (!this.el[sid]) continue;
      this.el[sid].classList.toggle('hidden', sid !== id);
    }
  }

  hideAllScreens() {
    for (const sid of SCREEN_IDS) {
      if (this.el[sid]) this.el[sid].classList.add('hidden');
    }
  }

  setLoadingProgress(pct) {
    if (this.el.loadingFill) this.el.loadingFill.style.width = `${Math.round(pct * 100)}%`;
  }

  showHud(show) {
    this.el.hud.classList.toggle('hidden', !show);
  }

  showTapHint(show) {
    this.el.tapHint.classList.toggle('hidden', !show);
  }

  updateHud({ score, best, level, streak }) {
    this.el.hudScore.textContent = Math.round(score);
    this.el.hudBest.textContent = Math.round(best);
    this.el.hudLevel.textContent = `CANYON LEVEL ${level}`;
    if (streak >= 2) {
      this.el.hudStreak.textContent = `🔥 ×${streak}`;
      this.el.hudStreak.classList.remove('hidden');
    } else {
      this.el.hudStreak.classList.add('hidden');
    }
  }

  updateMenuBest(best) {
    this.el.menuBest.textContent = Math.round(best);
  }

  setMuteIcon(muted) {
    this.el.muteBtn.textContent = muted ? '🔇' : '🔊';
  }

  setPauseIcon(paused) {
    this.el.pauseBtn.textContent = paused ? '▶' : '⏸';
  }

  populateCharacterGrid(characters, selectedId, onSelect) {
    const grid = this.el.charGrid;
    grid.innerHTML = '';
    characters.forEach((ch) => {
      const card = document.createElement('button');
      card.className = 'char-card';
      card.dataset.id = ch.id;
      card.setAttribute('aria-label', `Select ${ch.name}`);
      card.classList.toggle('selected', ch.id === selectedId);

      const canvas = document.createElement('canvas');
      canvas.width = 140;
      canvas.height = 140;
      canvas.className = 'char-thumb';
      card.appendChild(canvas);

      const label = document.createElement('div');
      label.className = 'char-name';
      label.textContent = ch.name;
      card.appendChild(label);

      card.addEventListener('click', () => {
        grid.querySelectorAll('.char-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        onSelect(ch.id);
      });

      grid.appendChild(card);
      requestAnimationFrame(() => renderThumbnail(canvas, ch));
    });
  }

  applySettingsToUI(settings) {
    const map = { music: 'toggle-music', sfx: 'toggle-sfx', vibration: 'toggle-vibration' };
    for (const [key, id] of Object.entries(map)) {
      const btn = document.getElementById(id);
      if (btn) btn.setAttribute('aria-pressed', String(settings[key] !== false));
    }
    const qualityWrap = document.getElementById('quality-buttons');
    if (qualityWrap) {
      qualityWrap.querySelectorAll('button').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.q === settings.quality);
      });
    }
  }

  showGameOver(stats) {
    this.el.goScore.textContent = Math.round(stats.score);
    this.el.goCrossings.textContent = stats.crossings;
    this.el.goBest.textContent = Math.round(stats.best);
    this.el.goRank.textContent = rankForCrossings(stats.crossings);
    this.el.goNewBest.classList.toggle('hidden', !stats.isNewBest);
    this.showScreen('screen-gameover');
  }
}
