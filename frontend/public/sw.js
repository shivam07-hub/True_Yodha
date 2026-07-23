// Myro service worker — minimal, TWA/PWA install-criteria + offline fallback.
// NOT a full offline app: himyro.com is server-rendered and the API lives on a
// SEPARATE origin (api.himyro.com), so this SW only ever sees same-origin GETs.
// Contract:
//   • navigations  → network-first, fall back to the cached /offline shell.
//   • hashed static (/_next/static, /brand) → cache-first (immutable).
//   • everything else (cross-origin API, POSTs) → passthrough, untouched.
// Bump CACHE when the offline shell or precache list changes.
const CACHE = "myro-v1"
const OFFLINE_URL = "/offline"
const PRECACHE = [OFFLINE_URL, "/brand/icon-192.png", "/manifest.webmanifest"]

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", event => {
  const { request } = event
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // never touch the cross-origin API

  // Navigations: try the network, fall back to the offline shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then(r => r || new Response("", { status: 504 })),
      ),
    )
    return
  }

  // Immutable static assets: serve from cache, backfill on miss.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/")) {
    event.respondWith(
      caches.match(request).then(
        cached =>
          cached ||
          fetch(request).then(resp => {
            if (resp.ok) {
              const clone = resp.clone()
              caches.open(CACHE).then(cache => cache.put(request, clone))
            }
            return resp
          }),
      ),
    )
  }
})
