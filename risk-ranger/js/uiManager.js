import { renderThumbnail } from './characterArt.js';
import { formatScore, formatClock } from './utils.js';

const SCREEN_IDS = [
  'screen-loading',
  'screen-menu',
  'screen-how-to-play',
  'screen-character-select',
  'screen-settings',
  'screen-pause',
  'screen-quiz',
  'screen-gameover',
  'screen-tnc',
];

export class UIManager {
  constructor(callbacks) {
    this.cb = callbacks;
    this.el = {};
    for (const id of SCREEN_IDS) this.el[id] = document.getElementById(id);
    this.el.hud = document.getElementById('hud');
    this.el.tapHint = document.getElementById('tap-hint');
    this.el.hudTime = document.getElementById('hud-time');
    this.el.hudNextQuiz = document.getElementById('hud-next-quiz');
    this.el.hudQuizProgress = document.getElementById('hud-quiz-progress');
    this.el.hudDay = document.getElementById('hud-day');
    this.el.hudScore = document.getElementById('hud-score');
    this.el.hudCrossings = document.getElementById('hud-crossings');
    this.el.menuBest = document.getElementById('menu-best');
    this.el.charGrid = document.getElementById('character-grid');
    this.el.loadingFill = document.getElementById('loading-fill');
    this.el.goScore = document.getElementById('go-score');
    this.el.goCrossings = document.getElementById('go-crossings');
    this.el.goBest = document.getElementById('go-best');
    this.el.goFeedbackNote = document.getElementById('go-feedback-note');
    this.el.muteBtn = document.getElementById('btn-mute');
    this.el.quizProgressLabel = document.getElementById('quiz-progress-label');
    this.el.quizQuestion = document.getElementById('quiz-question');
    this.el.quizOptions = document.getElementById('quiz-options');

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

    this._on('btn-gameover-retry', () => cb.onGameOverRetry());
    this._on('btn-gameover-feedback', () => cb.onShareFeedback());

    this._on('btn-info', () => cb.onInfoIcon());
    this._on('btn-mute', () => cb.onMuteIcon());

    this._on('go-tnc-link', (e) => {
      e.preventDefault();
      this.showScreen('screen-tnc');
    });
    this._on('btn-tnc-back', () => this.showScreen('screen-gameover'));

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
    this.showTapHint(false);
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

  updateHud({ timeLeft, nextQuizIn, quizDone, quizTotal, day, score, crossings }) {
    this.el.hudTime.textContent = formatClock(timeLeft);
    this.el.hudNextQuiz.textContent = `${Math.max(0, Math.ceil(nextQuizIn))}s`;
    this.el.hudQuizProgress.textContent = `${quizDone} / ${quizTotal}`;
    this.el.hudDay.textContent = `Day ${day}`;
    this.el.hudScore.textContent = formatScore(score);
    this.el.hudCrossings.textContent = crossings;
  }

  updateMenuBest(best) {
    this.el.menuBest.textContent = formatScore(best);
  }

  setMuteIcon(muted) {
    this.el.muteBtn.textContent = muted ? '🔇' : '🔊';
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
    this.el.goScore.textContent = formatScore(stats.score);
    this.el.goCrossings.textContent = stats.crossings;
    this.el.goBest.textContent = formatScore(stats.best);
    this.el.goFeedbackNote.classList.add('hidden');
    this.showScreen('screen-gameover');
  }

  showFeedbackThanks() {
    this.el.goFeedbackNote.classList.remove('hidden');
  }

  showQuiz(question, index, total, onAnswer) {
    this.el.quizProgressLabel.textContent = `Quiz ${index + 1} of ${total}`;
    this.el.quizQuestion.textContent = question.q;
    const wrap = this.el.quizOptions;
    wrap.innerHTML = '';
    question.options.forEach((text, i) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-option-btn';
      btn.textContent = text;
      btn.addEventListener('click', () => {
        wrap.querySelectorAll('.quiz-option-btn').forEach((b, bi) => {
          b.disabled = true;
          if (bi === question.correct) b.classList.add('correct');
          else if (bi === i) b.classList.add('incorrect');
        });
        onAnswer(i === question.correct);
      });
      wrap.appendChild(btn);
    });
    this.showScreen('screen-quiz');
  }
}
