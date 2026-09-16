/* Matripa — service worker.
 *
 * Règles de sûreté appliquées ici, dans l'ordre d'importance :
 *  1. Seules les requêtes GET same-origin sont interceptées. Les Server Actions
 *     (POST vers la même URL) et les appels Supabase passent au réseau intact.
 *  2. Les payloads RSC (`?_rsc=`) ne sont jamais mis en cache : ils sont liés à
 *     une version du build et servir un payload périmé casse la navigation.
 *  3. Les caches sont versionnés et les anciens supprimés à l'activation, pour
 *     qu'un déploiement ne laisse jamais d'assets obsolètes.
 */

const VERSION = "v2";
const SHELL_CACHE = `matripa-shell-${VERSION}`;
const ASSET_CACHE = `matripa-assets-${VERSION}`;
const IMAGE_CACHE = `matripa-images-${VERSION}`;
const PAGE_CACHE = `matripa-pages-${VERSION}`;

const OFFLINE_URL = "/offline";
const SHELL_ASSETS = [OFFLINE_URL];

/** Nombre maximum de pages conservées hors ligne. */
const PAGE_CACHE_LIMIT = 40;
/** Nombre maximum d'images compressées conservées hors ligne pour bas débit. */
const IMAGE_CACHE_LIMIT = 80;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      // Un échec de précache ne doit pas empêcher l'installation.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL_CACHE, ASSET_CACHE, IMAGE_CACHE, PAGE_CACHE]);

  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/** Permet à la page de forcer l'activation d'un SW en attente. */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // 1. Jamais autre chose que GET (Server Actions, RPC Supabase, uploads…).
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 2. Uniquement same-origin : Supabase Storage et les tiers gardent leur
  //    propre politique de cache HTTP.
  if (url.origin !== self.location.origin) return;

  // 3. Ni les payloads RSC, ni les routes d'API/auth.
  if (url.searchParams.has("_rsc")) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/auth/")) return;

  // Assets immuables générés par Next : cache-first, ils sont hashés.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // Optimisation bas débit : Cache-First pour images Next.js optimisées (WebP/AVIF)
  // Permet d'éviter de retélécharger les photos des profils sur les réseaux 3G congolais.
  if (url.pathname.startsWith("/_next/image") || /\.(png|jpe?g|webp|avif|svg|ico)$/i.test(url.pathname)) {
    event.respondWith(cacheFirstWithRefresh(request, IMAGE_CACHE, IMAGE_CACHE_LIMIT));
    return;
  }

  // Polices : cache-first
  if (/\.(woff2?|ttf|otf)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // Navigations : réseau d'abord, cache en secours, page offline en dernier.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  }
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function cacheFirstWithRefresh(request, cacheName, limit) {
  const cached = await caches.match(request);
  if (cached) {
    // Revalidation en arrière-plan discrète pour ne pas consommer de données
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse.ok) {
          caches.open(cacheName).then((cache) => {
            cache.put(request, networkResponse);
            if (limit) trimCache(cacheName, limit);
          });
        }
      })
      .catch(() => undefined);
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
      if (limit) trimCache(cacheName, limit);
    }
    return response;
  } catch {
    return cached ?? new Response("", { status: 408 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached ?? network;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);

    if (response.ok) {
      const cache = await caches.open(PAGE_CACHE);
      await cache.put(request, response.clone());
      trimCache(PAGE_CACHE, PAGE_CACHE_LIMIT);
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;

    return new Response("Hors ligne", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

/** Éviction FIFO : le cache de pages ne doit pas croître indéfiniment. */
async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)));
}
