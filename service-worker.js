const CACHE = "pwabuilder-GHM-v4.1.4";
const ASSET_CACHE = CACHE + "-assets";

importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.1.2/workbox-sw.js');

const offlineFallbackPage = "/index.html";

const PRECACHE_OWN = [
  "/index.html",
  "/base.css",
  "/app.js",
  "/suncalc.js",
  "/geolet.js",
  "/Control.OSMGeocoder.js",
  "/Control.OSMGeocoder.css",
  "/manifest.json",
  "/magnifying-glass-solid.svg",
  "/favicon-32x32.png",
  "/android-icon-192x192.png",
  "/icon-512x512.png",
  "/privacy.html"
];

const PRECACHE_FONTS = [
  "/fonts/outfit-latin.woff2",
  "/fonts/outfit-latin-ext.woff2",
  "/fonts/calsans-latin.woff2",
  "/fonts/calsans-latin-ext.woff2"
];

const PRECACHE_CDN = [
  "https://unpkg.com/leaflet@1.9.2/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.2/dist/leaflet.js",
  "https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.1/moment.min.js",
  "https://cdn.jsdelivr.net/npm/moment-timezone@0.5.34/builds/moment-timezone-with-data.min.js",
  "https://cdn.jsdelivr.net/npm/tz-lookup@6.1.25"
];

const NO_CACHE_HOSTS = [
  "nominatim.openstreetmap.org",
  "www.googletagmanager.com",
  "www.google-analytics.com"
];

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const own = await caches.open(CACHE);
    await own.add(offlineFallbackPage);
    await Promise.all(PRECACHE_OWN.map((url) => own.add(url).catch(() => {})));
    const assets = await caches.open(ASSET_CACHE);
    await Promise.all(PRECACHE_FONTS.map((url) => assets.add(url).catch(() => {})));
    await Promise.all(PRECACHE_CDN.map(async (url) => {
      try {
        const request = new Request(url, { mode: 'no-cors' });
        await assets.put(request, await fetch(request));
      } catch (e) { }
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => !n.startsWith(CACHE)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

const normaliseOwnKey = {
  cacheKeyWillBeUsed: async ({ request }) => {
    const u = new URL(request.url);
    u.search = '';
    if ((request.mode === 'navigate' && !/\.[a-z0-9]+$/i.test(u.pathname)) || u.pathname.endsWith('/')) u.pathname = '/index.html';
    return u.href;
  }
};

workbox.routing.registerRoute(
  ({ url, request }) => url.origin === self.location.origin && (
    request.mode === 'navigate' ||
    ['document', 'script', 'style', 'manifest'].includes(request.destination) ||
    /\.(html|js|css|json)$/.test(url.pathname)
  ),
  new workbox.strategies.NetworkFirst({
    cacheName: CACHE,
    networkTimeoutSeconds: 5,
    fetchOptions: { cache: 'no-cache' },
    plugins: [normaliseOwnKey]
  })
);

workbox.routing.registerRoute(
  ({ url }) => !NO_CACHE_HOSTS.includes(url.hostname),
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: ASSET_CACHE,
    plugins: [
      new workbox.expiration.ExpirationPlugin({ maxEntries: 800 })
    ]
  })
);

workbox.routing.setCatchHandler(async ({ event }) => {
  if (event.request.mode === 'navigate') {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(offlineFallbackPage);
    if (cached) return cached;
  }
  return Response.error();
});
