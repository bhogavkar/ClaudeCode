# Deployment Guide

NeuroForge is 100% static — deploy it anywhere that serves files over HTTPS. No server
runtime, database or environment variables are required.

## GitHub Pages
1. Push this repo to GitHub.
2. **Settings → Pages → Source:** deploy from your branch.
3. Set the folder to the repo root (or move the contents of `brain-training-game/` to the
   site root). Your game will be live at `https://<user>.github.io/<repo>/brain-training-game/`.

> Because all asset paths are **relative** (`./`, `src/...`), the app works from any
> sub-path without configuration.

## Netlify / Vercel / Cloudflare Pages
- **Build command:** *(none)*
- **Publish / output directory:** `brain-training-game`
- Drag-and-drop the folder, or connect the repo and deploy. Done.

## Any static host / CDN / S3
Upload the `brain-training-game/` folder as-is. Ensure these MIME types are served:
| Extension | Content-Type |
|-----------|--------------|
| `.js` | `text/javascript` |
| `.css` | `text/css` |
| `.webmanifest` | `application/manifest+json` |
| `.svg` | `image/svg+xml` |

## Self-hosting with a tiny server
```bash
npx serve brain-training-game
# or
docker run --rm -p 8080:80 -v "$PWD/brain-training-game":/usr/share/nginx/html:ro nginx
```

## PWA / caching notes
- The Service Worker (`sw.js`) uses a cache named `neuroforge-v1` and precaches the app shell.
- **When you ship an update, bump the `CACHE` constant** in `sw.js` (e.g. `neuroforge-v2`)
  so clients fetch the new files instead of serving stale ones.
- The SW only registers on `http(s)://` origins, so local `file://` use is unaffected.

## Verification checklist
- [ ] Page loads with no console errors.
- [ ] Lighthouse → PWA: *installable* ✓.
- [ ] Offline: load once, go offline, reload — still works.
- [ ] Export a save, reset, re-import — progress restored.
