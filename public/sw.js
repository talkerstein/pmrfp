/*
 * PMRFP service worker. Deliberately minimal.
 *
 * It does exactly one thing: when a page load (a "navigate" request) can't
 * reach the network, it shows the cached /offline page instead of the
 * browser's error screen. Everything else goes straight to the network as if
 * this file didn't exist. Nothing but /offline is ever cached, so a deploy can
 * never leave anyone looking at stale HTML or old JS.
 *
 * To change what's cached, bump VERSION: the new worker installs, takes over,
 * and deletes the old pmrfp-* caches.
 */
const VERSION = "v1";
const CACHE_PREFIX = "pmrfp-";
const CACHE = `${CACHE_PREFIX}offline-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  // cache: "reload" skips the HTTP cache so we store a fresh copy.
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key)),
      );
      // Navigation preload starts the page request while the worker boots, so
      // having a worker never makes page loads slower.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // Only full page loads. Assets, API calls, RSC fetches, and anything that
  // isn't a GET are left alone (no respondWith = normal browser behaviour).
  if (request.mode !== "navigate" || request.method !== "GET") return;

  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
        return await fetch(request);
      } catch {
        // Network is down: the offline page, or the browser's own error if
        // /offline somehow isn't cached.
        const offline = await caches.match(OFFLINE_URL, { cacheName: CACHE });
        return offline ?? Response.error();
      }
    })(),
  );
});
