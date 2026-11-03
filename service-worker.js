const CACHE = "pwabuilder-GHM-v4.2.4";
const ASSET_CACHE = CACHE + "-assets";
const TILE_CACHE = CACHE + "-tiles";
const TILE_MAX = 1500;

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
  "/fonts/notosans-latin.woff2",
  "/fonts/notosans-latin-ext.woff2",
  "/fonts/NotoSans-OFL.txt"
];

const PRECACHE_LIB = [
  "/lib/leaflet/leaflet.css",
  "/lib/leaflet/leaflet.js",
  "/lib/leaflet/images/layers.png",
  "/lib/leaflet/images/layers-2x.png",
  "/lib/leaflet/images/marker-icon.png",
  "/lib/moment/moment.min.js",
  "/lib/moment-timezone/moment-timezone-with-data.min.js",
  "/lib/tz-lookup/tz.js",
  "/lib/maplibre-gl/maplibre-gl.css",
  "/lib/maplibre-gl/maplibre-gl.js",
  "/background_hero.webp"
];

const TILE_HOSTS = ["server.arcgisonline.com"];

const NO_CACHE_HOSTS = [
  "nominatim.openstreetmap.org",
  "tiles.openfreemap.org",
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
    await Promise.all(PRECACHE_LIB.map((url) => (/\.(js|css)$/.test(url) ? own : assets).add(url).catch(() => {})));
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
  ({ url }) => TILE_HOSTS.includes(url.hostname),
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: TILE_CACHE,
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
      new workbox.expiration.ExpirationPlugin({ maxEntries: TILE_MAX, purgeOnQuotaError: true })
    ]
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
