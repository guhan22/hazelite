// Hazelite service worker: lets the installed app open offline with the last reading it saw, and
// shows haze alerts sent by the server (Web Push).
// Bump VERSION to drop old caches after changing caching behaviour.
const VERSION = "v1";
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const MAX_ASSETS = 150;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    // Navigation preload starts fetching the page while this worker boots, instead of after.
    Promise.resolve(self.registration.navigationPreload?.enable())
      .then(() => caches.keys())
      .then((keys) => Promise.all(keys.filter((k) => k !== PAGES && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Live data and other origins always go to the network.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(event));
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(req)); // content-hashed or versioned: safe to reuse
  } else if (url.pathname.startsWith("/_next/image")) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

// Haze alerts. The payload is JSON { title, body, tag } from our server; anything else is ignored.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {}
  const text = (v, fallback) => (typeof v === "string" ? v.slice(0, 200) : fallback);
  event.waitUntil(
    self.registration.showNotification(text(data.title, "Hazelite"), {
      body: text(data.body, ""),
      tag: text(data.tag, "hazelite"),
      renotify: true,
      icon: "/icons/icon-192.png",
    }),
  );
});

// Tapping an alert focuses the open app, or opens it. Always this site's home page, never a URL from the payload.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      return open ? open.focus() : self.clients.openWindow("/");
    }),
  );
});

/**
 * Pages: always try for fresh data; offline, show this page's last copy, else the newest saved one.
 * The response is returned as it streams (the loading screen shows straight away) and saved in the
 * background, rather than held back until the whole page has downloaded.
 */
async function networkFirst(event) {
  const req = event.request;
  const cache = await caches.open(PAGES);
  try {
    const res = (await event.preloadResponse) || (await fetch(req));
    if (res.ok) event.waitUntil(cache.put(req, res.clone()));
    return res;
  } catch {
    const keys = await cache.keys();
    return (await cache.match(req)) || (keys.length && (await cache.match(keys[keys.length - 1]))) || offlinePage();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    await trim(cache);
  }
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  const fresh = fetch(req)
    .then(async (res) => {
      if (res.ok) await cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || fresh;
}

/** Old build assets pile up across deploys; keep only the most recent entries. */
async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((k) => cache.delete(k)));
}

function offlinePage() {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hazelite — offline</title>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:1rem;text-align:center">
<div><h1 style="font-size:1.25rem">You're offline</h1><p>Hazelite needs a connection the first time. Try again when you're back online.</p></div>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
