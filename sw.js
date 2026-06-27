/* Service Worker — offline-first cache for the Diagram Designer PWA.
   Pre-caches the app shell so it works fully offline after first load. */
const CACHE = "dd-cache-v1";
const ASSETS = [
  "./", "./index.html", "./manifest.json",
  "./css/theme.css", "./css/layout.css", "./css/components.css", "./css/animations.css",
  "./js/utils.js", "./js/eventbus.js", "./js/store.js", "./js/history.js", "./js/shapes.js",
  "./js/connectors.js", "./js/canvas.js", "./js/sidebar.js", "./js/toolbar.js", "./js/properties.js",
  "./js/layers.js", "./js/templates.js", "./js/storage.js", "./js/export.js", "./js/import.js",
  "./js/shortcuts.js", "./js/app.js", "./assets/icons/app-icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => hit))
  );
});
