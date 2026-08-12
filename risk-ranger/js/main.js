import { Game } from './game.js';

function boot() {
  try {
    const game = new Game();
    game.init();
  } catch (err) {
    console.error('Risk Ranger failed to start:', err);
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML =
        '<div style="color:#fff;padding:40px;font-family:system-ui,sans-serif;text-align:center;">' +
        '<h1>Risk Ranger hit a snag</h1>' +
        '<p>Please refresh the page or try a different browser.</p></div>';
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
