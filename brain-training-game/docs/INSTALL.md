# Installation Guide

NeuroForge has **no dependencies and no build step**. You only need the files in this
folder and a modern browser (Chrome, Edge, Firefox or Safari).

## 1. Get the files
Clone the repository (or download this `brain-training-game/` folder):

```bash
git clone <repo-url>
cd ClaudeCode/brain-training-game
```

## 2. Run it

### Easiest: open directly
Open **`index.html`** in Chrome (double-click, or `File → Open`). The game is fully
playable from the `file://` protocol — all scripts are classic namespaced scripts, so
there are no ES-module CORS restrictions.

### Recommended: local web server
A local server unlocks the **PWA / offline / installable** features (which require an
`http(s)` origin for the Service Worker):

```bash
# Python 3 (preinstalled on most systems)
python3 -m http.server 8080

# Node
npx serve .

# PHP
php -S localhost:8080
```

Open <http://localhost:8080>.

## 3. Install as an app (optional)
With the local server (or any HTTPS host) running, Chrome shows an **Install** icon in the
address bar. Installing gives NeuroForge its own window and full offline play.

## Browser support
| Feature | Requirement |
|---------|-------------|
| Gameplay | Any evergreen browser (Chrome/Edge/Firefox/Safari) |
| Sound | Web Audio API (all modern browsers; unlocked on first tap/click) |
| Save data | LocalStorage |
| Offline / install | Service Worker — needs `http(s)://` origin |

## Troubleshooting
- **No sound at first?** Browsers block audio until you interact — click anywhere once.
- **PWA not installing?** You must be on `http://localhost` or `https://`, not `file://`.
- **Want a clean slate?** Settings → *Reset profile*, or clear site data for the origin.
