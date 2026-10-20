// Daraja Pulse service worker: makes the app installable and gives it an offline shell.
//
// Pages always come from the network when online, so a new deploy is picked up on
// the next load; the last good page is kept only for offline launches. Built files
// under /assets/ are fingerprinted (they never change once published), so they are
// served from cache. Everything else (Supabase, analytics, public files) is untouched.
//
// To retire this worker, replace this file with one that calls
// self.registration.unregister() in its activate handler.
const VERSION = "v1";
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;
const MAX_ASSETS = 250;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      const page = await fetch(new Request("/", { cache: "reload" }));
      if (page.ok && !page.redirected) await (await caches.open(SHELL_CACHE)).put("/", page);
    } catch {
      // Installed while offline: the first online visit fills the cache instead.
    }
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
    for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function trimAssets() {
  const cache = await caches.open(ASSET_CACHE);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(key);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.headers.has("range")) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        // Every route serves the same app page; a directly opened file (sitemap, image) is not it.
        const isPage = (fresh.headers.get("content-type") || "").includes("text/html");
        if (fresh.ok && fresh.type === "basic" && isPage) {
          const copy = fresh.clone();
          event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put("/", copy)).catch(() => {}));
        }
        return fresh;
      } catch {
        return (await caches.match("/", { cacheName: SHELL_CACHE })) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith((async () => {
      const cached = await caches.match(request, { cacheName: ASSET_CACHE });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        event.waitUntil(caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy)).then(trimAssets).catch(() => {}));
      }
      return response;
    })());
  }
});
