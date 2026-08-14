import { Camera } from './camera.js';
import { PlatformManager } from './platformManager.js';
import { Player, PlayerState } from './player.js';
import { Stick, StickPhase } from './stick.js';
import { Renderer } from './renderer.js';
import { ParticleSystem } from './particleSystem.js';
import { AudioManager } from './audioManager.js';
import { InputManager } from './inputManager.js';
import { ScoreManager } from './scoreManager.js';
import { UIManager } from './uiManager.js';
import { storage } from './storageManager.js';
import { levelForCrossings } from './difficulty.js';
import { QUIZ_BANK } from './quizBank.js';
import { todayDateString, daysSince } from './utils.js';
import {
  CHARACTERS,
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
  GROUND_Y,
  PLATFORM,
  VIRTUAL_HEIGHT,
  STICK,
  SESSION,
  QUIZ,
} from './constants.js';

const AppState = {
  LOADING: 'loading',
  MENU: 'menu',
  HOW_TO_PLAY: 'how_to_play',
  CHARACTER_SELECT: 'character_select',
  SETTINGS: 'settings',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAME_OVER: 'game_over',
};

const RoundPhase = {
  IDLE: 'idle',
  CHARGING: 'charging',
  ROTATING: 'rotating',
  WALKING_TO_LANDING: 'walking_to_landing',
  CELEBRATING: 'celebrating',
  SETTLING: 'settling',
  FALLING: 'falling',
};

export class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new Renderer(this.canvas);
    this.camera = new Camera();
    this.platforms = new PlatformManager();
    this.particles = new ParticleSystem();
    this.audio = new AudioManager();
    this.score = new ScoreManager();
    this.stick = new Stick();

    this.settings = Object.assign({}, DEFAULT_SETTINGS, storage.get(STORAGE_KEYS.SETTINGS, {}));
    this.renderer.setQuality(this.settings.quality);
    this.audio.setMusicEnabled(this.settings.music);
    this.audio.setSfxEnabled(this.settings.sfx);

    this.selectedCharacterId = storage.get(STORAGE_KEYS.CHARACTER, CHARACTERS[0].id);
    this.pendingCharacterId = this.selectedCharacterId;
    this.player = new Player(this._paletteFor(this.selectedCharacterId));

    this.appState = AppState.LOADING;
    this.roundPhase = RoundPhase.IDLE;
    this.currentIndex = 0;
    this.timeSec = 0;
    this.lastTs = 0;
    this._flashAlpha = 0;
    this._respawnPending = false;
    this._tutorialContext = 'menu';
    this._roundTimer = 0;

    this.dayNumber = this._computeDayNumber();
    this.sessionTimeLeft = SESSION.TOTAL_SECONDS;
    this.nextQuizIn = QUIZ.FIRST_INTERVAL_SECONDS;
    this.quizIndex = 0;
    this.quizActive = false;
    this.quizAnswered = false;
    this.quizCloseTimer = 0;

    this.ui = new UIManager(this._buildCallbacks());
    this.input = new InputManager(this.canvas);
    this.input.onPressStart = () => this._onPressStart();
    this.input.onPressEnd = () => this._onPressEnd();

    window.addEventListener('resize', () => this._handleResize());
    document.addEventListener('visibilitychange', () => this._handleVisibility());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') this._togglePause();
    });

    const unlockOnce = () => this.audio.unlock();
    ['pointerdown', 'keydown', 'touchstart'].forEach((evt) =>
      document.addEventListener(evt, unlockOnce, { once: true, passive: true })
    );
  }

  init() {
    this.platforms.init();
    this._placePlayerOnPlatform(this.platforms.get(0));
    this._handleResize();
    this.camera.snap(this.player.x, this.renderer.viewWidth);

    this.ui.applySettingsToUI(this.settings);
    this._syncMuteIcon();
    this.ui.updateMenuBest(this.score.best);

    let progress = 0;
    const step = () => {
      progress += 0.34;
      this.ui.setLoadingProgress(Math.min(progress, 1));
      if (progress >= 1) {
        this._goToMenu();
      } else {
        setTimeout(step, 90);
      }
    };
    step();

    requestAnimationFrame((ts) => this._loop(ts));
  }

  _computeDayNumber() {
    let start = storage.get(STORAGE_KEYS.CAMPAIGN_START, null);
    if (!start) {
      start = todayDateString();
      storage.set(STORAGE_KEYS.CAMPAIGN_START, start);
    }
    return daysSince(start) + 1;
  }

  _paletteFor(id) {
    return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
  }

  _pivotOfPlatform(p) {
    return p.x + p.width - PLATFORM.EDGE_INSET;
  }

  _placePlayerOnPlatform(p) {
    this.player.setPosition(this._pivotOfPlatform(p), GROUND_Y);
    this.player.setState(PlayerState.IDLE);
  }

  _buildCallbacks() {
    return {
      onAnyClick: () => {
        this.audio.unlock();
        this.audio.playClick();
      },
      onPlay: () => this._goToCharacterSelect(),
      onHowToPlayOpenFromMenu: () => {
        this._tutorialContext = 'menu';
        this.ui.showScreen('screen-how-to-play');
      },
      onInfoIcon: () => {
        if (this.appState === AppState.PLAYING) {
          this._pause();
          this._tutorialContext = 'pause-info';
        } else {
          this._tutorialContext = 'menu';
        }
        this.ui.showScreen('screen-how-to-play');
      },
      onHowToPlayBack: () => {
        if (this._tutorialContext === 'pause-info') {
          this.ui.showScreen('screen-pause');
        } else {
          this.ui.showScreen('screen-menu');
        }
      },
      onHowToPlayContinue: () => {
        storage.set(STORAGE_KEYS.SEEN_TUTORIAL, true);
        if (this._tutorialContext === 'preplay') {
          this._startRun();
        } else if (this._tutorialContext === 'pause-info') {
          this.ui.showScreen('screen-pause');
        } else {
          this._goToMenu();
        }
      },
      onCharConfirm: () => this._confirmCharacterAndStart(),
      onPauseResume: () => this._resume(),
      onGameOverRetry: () => this._startRun(),
      onShareFeedback: () => this.ui.showFeedbackThanks(),
      onMuteIcon: () => this._toggleMuteFromIcon(),
      onToggleMusic: (on) => {
        this.settings.music = on;
        this.audio.setMusicEnabled(on);
        this._saveSettings();
        this._syncMuteIcon();
      },
      onToggleSfx: (on) => {
        this.settings.sfx = on;
        this.audio.setSfxEnabled(on);
        this._saveSettings();
        this._syncMuteIcon();
      },
      onToggleVibration: (on) => {
        this.settings.vibration = on;
        this._saveSettings();
      },
      onSetQuality: (q) => {
        this.settings.quality = q;
        this.renderer.setQuality(q);
        this._saveSettings();
        this.ui.applySettingsToUI(this.settings);
      },
    };
  }

  _goToMenu() {
    this.appState = AppState.MENU;
    this.roundPhase = RoundPhase.IDLE;
    this.ui.showHud(false);
    this.ui.showTapHint(false);
    this.ui.updateMenuBest(this.score.best);
    this.ui.showScreen('screen-menu');
  }

  _goToCharacterSelect() {
    this.pendingCharacterId = this.selectedCharacterId;
    this.ui.populateCharacterGrid(CHARACTERS, this.pendingCharacterId, (id) => {
      this.pendingCharacterId = id;
    });
    this.ui.showScreen('screen-character-select');
  }

  _confirmCharacterAndStart() {
    this.selectedCharacterId = this.pendingCharacterId || CHARACTERS[0].id;
    storage.set(STORAGE_KEYS.CHARACTER, this.selectedCharacterId);
    this.player.palette = this._paletteFor(this.selectedCharacterId);

    const seenTutorial = storage.get(STORAGE_KEYS.SEEN_TUTORIAL, false);
    if (!seenTutorial) {
      this._tutorialContext = 'preplay';
      this.ui.showScreen('screen-how-to-play');
    } else {
      this._startRun();
    }
  }

  _startRun() {
    this.ui.hideAllScreens();
    this.ui.showHud(true);
    this.score.resetRun();
    this.platforms.init();
    this._placePlayerOnPlatform(this.platforms.get(0));
    this.camera.snap(this.player.x, this.renderer.viewWidth);
    this.currentIndex = 0;
    this._respawnPending = false;
    this.dayNumber = this._computeDayNumber();
    this.sessionTimeLeft = SESSION.TOTAL_SECONDS;
    this.nextQuizIn = QUIZ.FIRST_INTERVAL_SECONDS;
    this.quizIndex = 0;
    this.quizActive = false;
    this.quizAnswered = false;
    this.stick.reset(this._pivotOfPlatform(this.platforms.get(0)), GROUND_Y);
    this.appState = AppState.PLAYING;
    this._updateHud();
    this._onRoundBecomesIdle();
    if (this.roundPhase === RoundPhase.IDLE) {
      this.ui.showTapHint(true);
    }
  }

  _onRoundBecomesIdle() {
    this.roundPhase = RoundPhase.IDLE;
    if (this.input.isHeld) {
      this._onPressStart();
    }
  }

  _onPressStart() {
    if (this.appState !== AppState.PLAYING || this.roundPhase !== RoundPhase.IDLE || this.quizActive) return;
    this.ui.showTapHint(false);
    this.roundPhase = RoundPhase.CHARGING;
    this.player.setState(PlayerState.CHARGING);
    const pivotX = this._pivotOfPlatform(this.platforms.get(this.currentIndex));
    this.stick.startGrowing(pivotX, GROUND_Y);
    this.audio.startGrowLoop();
  }

  _onPressEnd() {
    if (this.roundPhase !== RoundPhase.CHARGING) return;
    this.roundPhase = RoundPhase.ROTATING;
    this.stick.release();
    this.audio.stopGrowLoop();
    this.audio.playWhoosh();
  }

  _resolveStickLanding() {
    const next = this.platforms.get(this.currentIndex + 1);
    const tipWorldX = this.stick.pivotX + this.stick.length;
    const nextLeft = next.x;
    const nextRight = next.x + next.width;

    if (tipWorldX < nextLeft || tipWorldX > nextRight) {
      this._failCrossing(tipWorldX);
      return;
    }

    const perfect =
      next.targetStart != null &&
      tipWorldX >= next.x + next.targetStart &&
      tipWorldX <= next.x + next.targetStart + next.targetWidth;

    this.roundPhase = RoundPhase.WALKING_TO_LANDING;
    this.player.setState(PlayerState.WALKING);
    this.player.startWalk(tipWorldX, () => this._onLandingWalkDone(next, perfect));
  }

  _onLandingWalkDone(platform, perfect) {
    this.player.bounceSquash();
    this.audio.playLand();
    const result = this.score.registerCrossing({ perfect, golden: platform.variant === 'golden' });
    this._spawnCrossingFeedback(result, perfect, platform);

    this.currentIndex += 1;
    const level = levelForCrossings(this.score.crossings);
    this.platforms.generateNext(level);
    this._updateHud();

    this.roundPhase = RoundPhase.CELEBRATING;
    this._roundTimer = perfect ? 0.85 : 0.4;
    this.player.setState(perfect ? PlayerState.CELEBRATE : PlayerState.IDLE);
  }

  _beginSettle() {
    const cur = this.platforms.get(this.currentIndex);
    const settleX = this._pivotOfPlatform(cur);
    this.roundPhase = RoundPhase.SETTLING;
    this.player.setState(PlayerState.WALKING);
    this.player.startWalk(settleX, () => {
      this.stick.reset(settleX, GROUND_Y);
      this._onRoundBecomesIdle();
    });
  }

  _failCrossing(fallX) {
    this.roundPhase = RoundPhase.FALLING;
    this.audio.playFall();
    this.score.breakStreak();
    this.player.startWalk(fallX, null, { thenFall: true });
    this.camera.shake(6, 0.4);
    this._vibrate(35);
    this._respawnPending = true;
    this._updateHud();
  }

  _respawn() {
    const cur = this.platforms.get(this.currentIndex);
    const pivotX = this._pivotOfPlatform(cur);
    this.player.tilt = 0;
    this.player.fallVy = 0;
    this.player.setPosition(pivotX, GROUND_Y);
    this.player.setState(PlayerState.IDLE);
    this.stick.reset(pivotX, GROUND_Y);
    this._onRoundBecomesIdle();
  }

  _spawnCrossingFeedback(result, perfect, platform) {
    const px = this.player.x;
    const py = this.player.y - 60;

    if (perfect) {
      this.audio.playPerfect();
      this.particles.spawnBurst(px, py, 14, { color: '#ffd76a', speed: 210, life: 0.85 });
      this.particles.spawnBurst(px, py, 10, { color: '#ff6b6b', speed: 190, life: 0.8 });
      this.particles.spawnBurst(px, py, 10, { color: '#6bc7ff', speed: 190, life: 0.8 });
      this.particles.spawnFloatingText(px, py - 6, `+${result.points.toFixed(2)}`, { color: '#ffd76a', size: 24 });
      this.particles.spawnFloatingText(px, py - 30, 'PERFECT! 2X', { color: '#fff', size: 15, life: 1.3, vy: -30 });
      this._flashAlpha = 0.45;
      this._vibrate([15, 30, 15]);
    } else {
      this.audio.playSuccess();
      this.particles.spawnBurst(px, py, 8, { color: '#d8c9a0', speed: 90, life: 0.5, gravity: 320 });
      this.particles.spawnFloatingText(px, py - 6, `+${result.points.toFixed(2)}`, { color: '#fff', size: 19 });
    }

    if (result.streakBonus) {
      this.particles.spawnFloatingText(px, py - (perfect ? 52 : 30), `STREAK BONUS +${result.streakBonus.toFixed(2)}`, {
        color: '#ff9d5c',
        size: 15,
        life: 1.3,
        vy: -26,
      });
      this.audio.playCombo(result.streak);
    }

    if (platform.variant === 'golden') {
      this.particles.spawnFloatingText(px, py - (perfect ? 70 : 48), 'GOLDEN BONUS', {
        color: '#ffe27a',
        size: 14,
        life: 1.2,
        vy: -24,
      });
    }
  }

  _triggerQuiz() {
    this.quizActive = true;
    this.quizAnswered = false;
    this.audio.stopGrowLoop();
    const q = QUIZ_BANK[this.quizIndex % QUIZ_BANK.length];
    this.ui.showQuiz(q, this.quizIndex, QUIZ.TOTAL, () => {
      this.quizAnswered = true;
      this.quizCloseTimer = 0.9;
    });
  }

  _closeQuiz() {
    this.quizIndex += 1;
    this.nextQuizIn = QUIZ.INTERVAL_SECONDS;
    this.quizActive = false;
    this.ui.hideAllScreens();
    this._updateHud();
  }

  _endRun() {
    this.appState = AppState.GAME_OVER;
    this.quizActive = false;
    this.audio.playSessionComplete();
    this._vibrate([20, 30, 20, 30, 40]);
    const stats = this.score.finalizeRun();
    this.ui.showHud(false);
    this.ui.showGameOver(stats);
    this.ui.updateMenuBest(stats.best);
  }

  _togglePause() {
    if (this.appState === AppState.PLAYING) this._pause();
    else if (this.appState === AppState.PAUSED) this._resume();
  }

  _pause() {
    if (this.appState !== AppState.PLAYING) return;
    this.appState = AppState.PAUSED;
    this.ui.showTapHint(false);
    this.ui.showScreen('screen-pause');
    this.audio.stopGrowLoop();
  }

  _resume() {
    if (this.appState !== AppState.PAUSED) return;
    this.appState = AppState.PLAYING;
    if (this.quizActive) {
      this.ui.showScreen('screen-quiz');
    } else {
      this.ui.hideAllScreens();
      if (this.roundPhase === RoundPhase.IDLE && this.currentIndex === 0) {
        this.ui.showTapHint(true);
      }
    }
    this.lastTs = 0;
  }

  _toggleMuteFromIcon() {
    const turnOn = !(this.settings.music || this.settings.sfx);
    this.settings.music = turnOn;
    this.settings.sfx = turnOn;
    this.audio.setMusicEnabled(turnOn);
    this.audio.setSfxEnabled(turnOn);
    this._saveSettings();
    this.ui.applySettingsToUI(this.settings);
    this._syncMuteIcon();
  }

  _syncMuteIcon() {
    this.ui.setMuteIcon(!(this.settings.music || this.settings.sfx));
  }

  _saveSettings() {
    storage.set(STORAGE_KEYS.SETTINGS, this.settings);
  }

  _vibrate(pattern) {
    if (!this.settings.vibration) return;
    if (navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        // Vibration API unsupported or blocked; ignore.
      }
    }
  }

  _handleResize() {
    this.renderer.resize();
    this.camera.follow(this.player.x, this.renderer.viewWidth);
  }

  _handleVisibility() {
    if (document.hidden && this.appState === AppState.PLAYING) {
      this._pause();
    }
  }

  _updateHud() {
    this.ui.updateHud({
      timeLeft: this.sessionTimeLeft,
      nextQuizIn: this.nextQuizIn,
      quizDone: this.quizIndex,
      quizTotal: QUIZ.TOTAL,
      day: this.dayNumber,
      score: this.score.score,
      crossings: this.score.crossings,
    });
  }

  _loop(ts) {
    requestAnimationFrame((t) => this._loop(t));
    if (!this.lastTs) this.lastTs = ts;
    let dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    dt = Math.min(Math.max(dt, 0), 0.05);
    this.timeSec += dt;

    if (this.appState !== AppState.PAUSED) {
      if (this.appState === AppState.PLAYING) {
        this._update(dt);
      } else {
        this._updateIdleBackground(dt);
      }
      this.particles.update(dt);
      if (this._flashAlpha > 0) this._flashAlpha = Math.max(0, this._flashAlpha - dt * 1.6);
    }

    this._render();
  }

  _updateIdleBackground(dt) {
    this.camera.targetX += dt * 14;
    this.camera.update(dt);
    this.player.update(dt);
  }

  _update(dt) {
    if (this.quizActive) {
      if (this.quizAnswered) {
        this.quizCloseTimer -= dt;
        if (this.quizCloseTimer <= 0) this._closeQuiz();
      }
      return;
    }

    this.stick.update(dt);
    this.player.update(dt);

    if (this.roundPhase === RoundPhase.ROTATING && this.stick.phase === StickPhase.DONE) {
      this._resolveStickLanding();
    } else if (this.roundPhase === RoundPhase.CELEBRATING) {
      this._roundTimer -= dt;
      if (this._roundTimer <= 0) this._beginSettle();
    } else if (this.roundPhase === RoundPhase.CHARGING) {
      this.audio.updateGrowLoop(this.stick.length / STICK.MAX_LENGTH);
    }

    if (this.player.state === PlayerState.FALLING && this.player.y > VIRTUAL_HEIGHT + 120 && this._respawnPending) {
      this._respawnPending = false;
      this._respawn();
    }

    this.camera.follow(this.player.x, this.renderer.viewWidth);
    this.camera.update(dt);
    this.platforms.pruneBefore(this.camera.x - 260);

    this.sessionTimeLeft -= dt;
    if (this.sessionTimeLeft <= 0) {
      this.sessionTimeLeft = 0;
      this._updateHud();
      this._endRun();
      return;
    }

    if (this.quizIndex < QUIZ.TOTAL) {
      this.nextQuizIn -= dt;
      if (this.nextQuizIn <= 0) {
        this._triggerQuiz();
        this._updateHud();
        return;
      }
    }

    this._updateHud();
  }

  _render() {
    this.renderer.begin(this.camera);
    this.renderer.drawBackground(this.camera, this.timeSec);
    this.renderer.drawCanyon(this.camera, this.platforms.platforms, this.timeSec);
    this.renderer.drawStick(this.camera, this.stick);
    this.renderer.drawPlayer(this.camera, this.player);
    this.particles.draw(this.renderer.ctx, this.camera);
    if (this._flashAlpha > 0) this.renderer.drawFlash(this._flashAlpha);
  }
}
