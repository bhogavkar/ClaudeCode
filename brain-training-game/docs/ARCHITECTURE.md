# Architecture & Extension Guide

NeuroForge is built around a small set of decoupled core systems and a uniform game
contract. Everything hangs off a single global namespace `window.NF`, and modules
communicate through a tiny pub/sub **event bus** so they never import each other.

## Design principles
- **No build, no deps** — classic `<script>` tags load in dependency order; each file
  attaches to `NF`. This is what lets the game run from `file://` in Chrome.
- **Single source of truth** — `NF.store` holds the entire player profile and auto-saves.
- **Separation of concerns** — view (`screens`, `ui`) ⟂ domain (`progression`, `adaptive`,
  `analytics`) ⟂ persistence (`storage`) ⟂ games.
- **Open/closed for games** — add a game without touching the engine.

## Core systems (`src/core/`)

| Module | Responsibility |
|--------|----------------|
| `util.js` | `NF.util` helpers (`clamp`, `shuffle`, `el()` hyperscript, time/format) and `NF.bus` event bus |
| `storage.js` | `NF.store` — load/merge/save profile, per-game records, export/import |
| `audio.js` | `NF.audio` — synthesized SFX (oscillators) + generative ambient music |
| `background.js` | `NF.background` — particle field & moving light blobs on a capped 60 fps canvas loop (pauses when tab hidden / reduced-motion) |
| `adaptive.js` | `NF.adaptive` — per-game difficulty director (1–10) |
| `progression.js` | `NF.prog` — XP/levels/coins, Brain Score & Age, skills, achievements, daily/weekly, streaks |
| `analytics.js` | `NF.analytics` — derived insights + canvas radar/line/bar renderers |
| `ui.js` | `NF.ui` — HUD sync, toasts, modals, settings drawer, theme/accessibility application |
| `screens.js` | `NF.screens` — pure view functions for the five routes |
| `app.js` | `NF.app` — bootstrap, routing, chrome wiring, SW registration |

## The adaptive "AI" (`adaptive.js`)
After every session, `NF.adaptive.record(gameId, result)` builds a performance **signal**
in `[-1, 1]` by blending:
- **accuracy** (centred on 0.7 = neutral),
- **reaction time** vs the game's ideal target,
- **win/lose** nudge,
- **mistakes** penalty,
- a **fatigue** term that eases difficulty late in a long sitting.

The signal moves difficulty by at most ±0.8 per session (smoothing), clamped to 1–10.
`AI Infinite` additionally biases game selection toward skills with lower historical
accuracy, so weak areas get more reps.

## The game contract (`base.js`)
Every mini-game extends `NF.GameBase` and is wrapped by a `GameHost`, which renders the
chrome (score / combo / timer / lives / AI-difficulty pills) and exposes helpers:

```js
class MyGame extends NF.GameBase {
  mount(stage) { /* build UI into `stage`; read this.difficulty (1–10) */ }
  onKey(e)     { /* optional keyboard handling */ }
  destroy()    { /* clean up timers/listeners */ }
}
```

Helpers available on `this.host`:
| Call | Effect |
|------|--------|
| `host.addScore(n)` | add points (combo multiplier via `host.comboMult()`) |
| `host.hit(good)` | register a correct/incorrect action; manages combo + sound |
| `host.setLives(n)` / `host.loseLife()` | lives HUD; returns `true` when out |
| `host.startTimer(s, onEnd)` / `host.stopTimer()` / `host.countUp()` | timers |
| `host.finish({accuracy, reaction, won, mistakes, target})` | end the session |

`finish()` computes stars, awards progression, records adaptive difficulty + analytics,
emits `session-finished`, and shows the results modal — so games only worry about gameplay.

## Adding a new game (3 steps)
1. Create `src/games/myGame.js` with a class extending `NF.GameBase` that calls
   `host.finish(...)` when complete.
2. Register it:
   ```js
   NF.games.define({
     id: "my-game", name: "My Game", icon: "🎲",
     skill: "logic",            // one of the 8 tracked skills
     category: "Logic Arena",   // a training mode
     desc: "One-line description", tags: ["Reasoning"],
     create: (host) => new MyGame(host),
   });
   ```
3. Add a `<script src="src/games/myGame.js">` tag in `index.html` (before `registry.js`)
   and add the path to the `ASSETS` list in `sw.js`.

It now appears in its mode, with adaptive difficulty, scoring, analytics, achievements and
rewards wired automatically.

## Data model (LocalStorage key `neuroforge.save.v1`)
```jsonc
{
  "player": { "name": "Recruit", "avatar": "🧠" },
  "xp": 0, "coins": 0, "level": 1,
  "brainScore": 0, "bestBrainScore": 0, "streak": 0, "lastPlayed": "YYYY-MM-DD",
  "skills": { "memory": 0, "focus": 0, "speed": 0, "logic": 0,
              "observation": 0, "math": 0, "creativity": 0, "strategy": 0 },
  "games":  { "<id>": { "best": 0, "plays": 0, "difficulty": 1, "lastAccuracy": 0 } },
  "history": [ { "date": "...", "gameId": "...", "skill": "...",
                 "score": 0, "accuracy": 0, "reaction": 0, "durationMs": 0 } ],
  "achievements": { "<id>": "YYYY-MM-DD" },
  "settings": { "theme": "neon", "colorblind": false, "fontScale": 1,
                "sound": true, "music": false, "volume": 0.7, "reduceMotion": false },
  "daily":  { "date": "...", "claimed": false, "challengeGame": "...", "challengeDone": false },
  "weekly": { "weekStart": "...", "progress": 0, "goal": 7, "done": false }
}
```
`storage.js` merges old saves against the defaults, so adding new fields never breaks
existing profiles.

## Performance notes
- Background canvas caps to ~60 fps, halves work under reduced-motion, and stops entirely
  when the tab is hidden.
- Saves are debounced (300 ms) to avoid thrashing LocalStorage during rapid play.
- History is capped to the last 500 sessions.
