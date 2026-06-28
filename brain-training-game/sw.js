/* Service worker — offline-first cache for the NeuroForge PWA.
   Cache-first for app shell so the game runs with zero network. */
const CACHE = "neuroforge-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles/main.css",
  "./assets/icons/icon.svg",
  "./src/core/util.js",
  "./src/core/storage.js",
  "./src/core/audio.js",
  "./src/core/background.js",
  "./src/core/adaptive.js",
  "./src/core/progression.js",
  "./src/core/analytics.js",
  "./src/core/ui.js",
  "./src/core/screens.js",
  "./src/core/app.js",
  "./src/games/base.js",
  "./src/games/sequenceMemory.js",
  "./src/games/cardMatch.js",
  "./src/games/visualMemory.js",
  "./src/games/reactionTime.js",
  "./src/games/mentalMath.js",
  "./src/games/patternLogic.js",
  "./src/games/schulte.js",
  "./src/games/oddOneOut.js",
  "./src/games/mazeSpatial.js",
  "./src/games/registry.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("./index.html"))
    )
  );
});
