const CACHE_NAME = "kolibri-cache-v1";
const OFFLINE_URL = "/index.html";
const PRECACHE_URLS = ["/", OFFLINE_URL];

let wasmUrl = "/kolibri.wasm";
let wasmInfoUrl = "/kolibri.wasm.txt";
let knowledgeUrl = "/kolibri-knowledge.json";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch((error) => {
        console.warn("[kolibri-sw] Не удалось выполнить предзагрузку ресурсов.", error);
      }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response && response.ok) {
    void cache.put(request, response.clone());
  }
  return response;
}

async function precacheResource(path) {
  if (!path) {
    return;
  }

  const cache = await caches.open(CACHE_NAME);
  try {
    const request = new Request(path, { credentials: "same-origin" });
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
  } catch (error) {
    console.warn(`[kolibri-sw] Не удалось закэшировать ${path}.`, error);
  }
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") {
    return;
  }

  if (data.type === "SET_WASM_ARTIFACTS") {
    if (typeof data.url === "string" && data.url) {
      wasmUrl = data.url;
      event.waitUntil(precacheResource(wasmUrl));
    }
    if (typeof data.infoUrl === "string" && data.infoUrl) {
      wasmInfoUrl = data.infoUrl;
      event.waitUntil(precacheResource(wasmInfoUrl));
    }
  }

  if (data.type === "SET_KNOWLEDGE_ARTIFACTS") {
    if (typeof data.url === "string" && data.url) {
      knowledgeUrl = data.url;
      event.waitUntil(precacheResource(knowledgeUrl));
    }
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname === wasmUrl || url.pathname === wasmInfoUrl) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.pathname === knowledgeUrl) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          event.waitUntil(
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(request, copy))
              .catch((error) => {
                console.warn("[kolibri-sw] Не удалось обновить кэш для ", request.url, error);
              }),
          );
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const fallback = await cache.match(OFFLINE_URL);
          if (fallback) {
            return fallback;
          }
          throw new Error("Offline cache missing offline page");
        }),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
