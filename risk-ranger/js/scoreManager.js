import { SCORE, STORAGE_KEYS } from './constants.js';
import { storage } from './storageManager.js';

export class ScoreManager {
  constructor() {
    this.score = 0;
    this.streak = 0;
    this.crossings = 0;
    this.best = storage.get(STORAGE_KEYS.BEST_SCORE, 0);
    this.bestCrossings = storage.get(STORAGE_KEYS.BEST_CROSSINGS, 0);
    this.bestStreak = storage.get(STORAGE_KEYS.BEST_STREAK, 0);
  }

  resetRun() {
    this.score = 0;
    this.streak = 0;
    this.crossings = 0;
  }

  registerCrossing({ perfect, golden }) {
    this.streak += 1;
    this.crossings += 1;

    let points = SCORE.BASE;
    if (perfect) points *= SCORE.PERFECT_MULT;
    if (golden) points += 15;

    const streakBonus = SCORE.STREAK_BONUS[this.streak] || 0;
    points += streakBonus;

    this.score += points;

    const newBestScore = this.score > this.best;
    if (newBestScore) this.best = this.score;
    if (this.crossings > this.bestCrossings) this.bestCrossings = this.crossings;
    if (this.streak > this.bestStreak) this.bestStreak = this.streak;

    this._persist();

    return { points, streakBonus, newBestScore, streak: this.streak };
  }

  breakStreak() {
    const had = this.streak;
    this.streak = 0;
    return had;
  }

  finalizeRun() {
    this._persist();
    return {
      score: this.score,
      crossings: this.crossings,
      streak: this.bestStreak,
      best: this.best,
      isNewBest: this.score >= this.best && this.score > 0,
    };
  }

  _persist() {
    storage.set(STORAGE_KEYS.BEST_SCORE, this.best);
    storage.set(STORAGE_KEYS.BEST_CROSSINGS, this.bestCrossings);
    storage.set(STORAGE_KEYS.BEST_STREAK, this.bestStreak);
  }
}
