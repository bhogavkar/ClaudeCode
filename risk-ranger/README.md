# Risk Ranger

_"Hold. Release. Risk it all."_

A timed browser session (7 minutes) where you hold to grow a bamboo stick, release to drop it across a gap, and cross a canyon one platform at a time as one of three dinosaur rangers. Land in the red target zone for a 2X score bonus. A quiz pops up periodically (14 total) and a "Day" counter tracks which calendar day of play this is; the session ends positively ("The herd made it!") when time runs out, regardless of how you did — falling short just respawns you to try that gap again. Every visual is drawn live on `<canvas>` — no image assets — and every sound effect is synthesized at runtime with the Web Audio API, so the game runs from nothing but the files in this folder.

The quiz questions are generic placeholder risk-awareness trivia (`js/quizBank.js`) — swap them for real content if you have it. The end screen's "you've entered today's sweepstakes for Vantage Points" message is flavor text matching a requested visual reference; there's no backend, so nothing is actually entered anywhere (the in-game "T&C Apply" link says so explicitly).

## Run it locally

**Quickest option:** double-click **`standalone.html`**. It's a single self-contained file (same game, everything inlined) with no server required — open it directly in any browser.

**Developing on the source:** `index.html` loads the game as ES modules from `js/`, which browsers block from `file://` for CORS reasons, so serve the folder instead of double-clicking it:

```bash
cd risk-ranger
python3 -m http.server 8080
# then open http://localhost:8080 in a browser
```

Any static file server works (`npx serve`, `php -S localhost:8080`, the VS Code "Live Server" extension, etc). `standalone.html` is generated from the `js/` source and `style.css` — if you change the source, regenerate it (concatenate the files listed below in dependency order, stripping `import`/`export`, and inline the result plus the CSS into one HTML file) before shipping it as the double-click-to-play copy.

## How to play

- **Hold** the mouse button, spacebar, or a touch to grow the stick.
- **Release** at the right moment to drop it across the gap.
- Land **on the platform** to cross safely (+1.00). Land **in the red zone** for a perfect crossing (+2.00, "2X"). Miss short or overshoot past the far edge and you fall — you respawn on the same platform to try again, no penalty beyond losing that attempt's points.
- Chain crossings for streak bonuses. Difficulty (gap size, platform width, target size) ramps up gradually as your crossing count climbs, and is always generated so a correctly-timed release can reach it — misses come from timing, not bad luck.
- Every so often a quiz interrupts with a quick multiple-choice question; answer it and play resumes. The session itself ends when the 7-minute clock runs out.

Controls work identically on desktop (mouse/space) and mobile (touch). Best score, best crossings, your chosen ranger, the campaign start date (used to compute "Day N"), and all settings persist in `localStorage`.

## Project structure

```
risk-ranger/
├── standalone.html      Single-file bundle of everything below — just open it
├── index.html          All screens (menu, how-to-play, character select,
│                        settings, pause, game over) + HUD + canvas
├── style.css            Visual styling, responsive layout, stone-tablet UI
└── js/
    ├── main.js           Boot entry point
    ├── game.js           State machine + main loop, wires every system together
    ├── constants.js       Tunable numbers (stick speed, difficulty curve, session/quiz timing, etc.)
    ├── quizBank.js          14 placeholder risk-awareness quiz questions
    ├── utils.js            Math helpers (lerp, easing, random ranges, date/score formatting)
    ├── stick.js            Bamboo stick growth/rotation physics
    ├── platformManager.js  Procedural platform generation + fairness constraints
    ├── difficulty.js       Difficulty curve (gap/width/target ranges by level)
    ├── player.js           Ranger state machine (idle/charging/walking/falling)
    ├── characterArt.js     Canvas-drawn dinosaur ranger art (3 palettes)
    ├── camera.js           Camera follow + screen shake
    ├── renderer.js         All canvas drawing: parallax sky, canyon, stick, player
    ├── particleSystem.js   Pooled particles + floating score text
    ├── audioManager.js     Procedural Web Audio sound effects + ambience
    ├── inputManager.js     Unified mouse / touch / spacebar press-hold-release
    ├── scoreManager.js     Score, streak, best-score persistence
    ├── uiManager.js        DOM screen/HUD wiring
    └── storageManager.js   Safe localStorage wrapper (falls back to memory)
```

No build step, no dependencies, no backend — open it and play.
