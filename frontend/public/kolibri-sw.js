const CACHE_NAME = "kolibri-cache-v1";
const ABSOLUTE_URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const MAX_WASM_SIZE_BYTES = Number(self.KOLIBRI_MAX_WASM_BYTES || 60 * 1024 * 1024);

const metricsState = {
  installTimestamp: typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now(),
  coldStartMs: null,
  wasmBytes: null,
  offlineFallback: false,
  degradedReason: null,
};

const ensureDirectoryUrl = (input) => {
  const url = new URL(input.href);
  url.hash = "";
  url.search = "";
  if (!url.pathname.endsWith("/")) {
    const index = url.pathname.lastIndexOf("/");
    url.pathname = index >= 0 ? url.pathname.slice(0, index + 1) : "/";
  }
  if (!url.pathname.startsWith("/")) {
    url.pathname = `/${url.pathname}`;
  }
  if (!url.pathname) {
    url.pathname = "/";
  }
  return url;
};

const deriveBaseDirectory = () => {
  try {
    if (self.registration && self.registration.scope) {
      return ensureDirectoryUrl(new URL(self.registration.scope));
    }
  } catch (error) {
    console.warn("[kolibri-sw] Не удалось обработать scope service worker.", error);
  }

  try {
    return ensureDirectoryUrl(new URL(self.location.href));
  } catch (error) {
    console.warn("[kolibri-sw] Не удалось обработать текущий URL service worker.", error);
  }

  const fallbackOrigin = self.location?.origin ?? "https://kolibri.invalid";
  return ensureDirectoryUrl(new URL("/", fallbackOrigin));
};

const baseDirectory = deriveBaseDirectory();
const baseOrigin = baseDirectory.origin;
const BASE_PATH = baseDirectory.pathname.endsWith("/") ? baseDirectory.pathname : `${baseDirectory.pathname}/`;

const snapshotMetrics = () => ({ ...metricsState });

const broadcastMetrics = async (targets) => {
  try {
    const payload = { type: "kolibri:pwa-metrics", payload: snapshotMetrics() };
    const recipients =
      targets && targets.length
        ? targets
        : await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
    recipients.forEach((client) => {
      try {
        client.postMessage(payload);
      } catch (error) {
        console.warn("[kolibri-sw] Не удалось отправить метрики клиенту.", error);
      }
    });
  } catch (error) {
    console.warn("[kolibri-sw] Не удалось разослать метрики.", error);
  }
};

const markDegraded = (reason) => {
  if (!metricsState.degradedReason) {
    metricsState.degradedReason = reason;
  }
};

const recordColdStart = () => {
  if (metricsState.coldStartMs == null) {
    const now = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
    metricsState.coldStartMs = Math.max(0, now - metricsState.installTimestamp);
  }
};

const resolveBasePath = (path = "") => {
  if (!path) {
    return BASE_PATH;
  }

  if (ABSOLUTE_URL_PATTERN.test(path)) {
    return path;
  }

  if (path.startsWith("/")) {
    return path;
  }

  if (path.startsWith("./") || path.startsWith("../")) {
    return new URL(path, baseDirectory).pathname;
  }

  return `${BASE_PATH}${path}`.replace(/\/{2,}/g, "/");
};

const toAbsoluteUrl = (path = "") => {
  if (!path) {
    return `${baseOrigin}${BASE_PATH}`;
  }

  if (ABSOLUTE_URL_PATTERN.test(path)) {
    return path;
  }

  if (path.startsWith("/")) {
    return `${baseOrigin}${path}`;
  }

  return `${baseOrigin}${resolveBasePath(path)}`;
};

self.addEventListener("install", (event) => {
  metricsState.installTimestamp =
    typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      recordColdStart();
      await self.clients.claim();
      await broadcastMetrics();
    })(),
  );
});

const OFFLINE_URL = resolveBasePath("index.html");
const MANIFEST_URL = resolveBasePath("manifest.webmanifest");
const ICON_URL = resolveBasePath("kolibri.svg");
const PRECACHE_URLS = Array.from(new Set([BASE_PATH, OFFLINE_URL, MANIFEST_URL, ICON_URL]));

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

let wasmUrl = resolveBasePath("kolibri.wasm");
let wasmInfoUrl = resolveBasePath("kolibri.wasm.txt");
let knowledgeUrl = resolveBasePath("kolibri-knowledge.json");
const ASSETS_PREFIX = resolveBasePath("assets/");

let knowledgeDatasetPromise = null;
let knowledgeDataset = null;
let knowledgeMetadata = { status: "unavailable", documents: 0, generatedAt: null };
let knowledgeFeedbackLog = [];
let knowledgeTeachLog = [];
let knowledgeStats = {
  requests: 0,
  localHits: 0,
  localMisses: 0,
};
let knowledgeMode = "local";

const knowledgeMutex = {
  locked: false,
  queue: [],
};

const acquireKnowledgeLock = () =>
  new Promise((resolve) => {
    if (!knowledgeMutex.locked) {
      knowledgeMutex.locked = true;
      resolve();
      return;
    }
    knowledgeMutex.queue.push(resolve);
  });

const releaseKnowledgeLock = () => {
  const next = knowledgeMutex.queue.shift();
  if (next) {
    next();
    return;
  }
  knowledgeMutex.locked = false;
};

const tokenStripper = (() => {
  try {
    return new RegExp("[^\\p{L}\\p{N}]+", "gu");
  } catch (error) {
    console.warn("[kolibri-sw] Unicode token stripper недоступен.", error);
    return /[^a-z0-9]+/gi;
  }
})();

const normaliseText = (value) => {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (typeof trimmed.normalize === "function") {
    try {
      return trimmed.normalize("NFKC");
    } catch (error) {
      console.warn("[kolibri-sw] Не удалось нормализовать текст.", error);
    }
  }
  return trimmed;
};

const tokenize = (text) => {
  const normalised = normaliseText(String(text).toLowerCase());
  if (!normalised) {
    return [];
  }
  const stripped = normalised.replace(tokenStripper, " ");
  return stripped
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
};

const countTokens = (text) => {
  const tokens = tokenize(text);
  const counts = Object.create(null);
  for (const token of tokens) {
    counts[token] = (counts[token] ?? 0) + 1;
  }
  return counts;
};

const resetKnowledgeDataset = () => {
  knowledgeDatasetPromise = null;
  knowledgeDataset = null;
  knowledgeMetadata = { status: "unavailable", documents: 0, generatedAt: null };
};

const updateKnowledgeMetadata = (dataset) => {
  if (!dataset || !Array.isArray(dataset.documents)) {
    knowledgeMetadata = { status: "unavailable", documents: 0, generatedAt: null };
    return;
  }
  const documents = dataset.documents.length;
  if (!documents) {
    knowledgeMetadata = {
      status: knowledgeUrl ? "empty" : "unavailable",
      documents: 0,
      generatedAt: dataset.generatedAt ?? null,
    };
    return;
  }
  knowledgeMetadata = {
    status: "local",
    documents,
    generatedAt: dataset.generatedAt ?? null,
  };
};

const normaliseDocument = (entry, index) => {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : `doc-${index}`;
  const title = typeof entry.title === "string" && entry.title.trim() ? entry.title.trim() : "Без названия";
  const content = typeof entry.content === "string" && entry.content.trim() ? entry.content.trim() : "";
  const source = typeof entry.source === "string" && entry.source.trim() ? entry.source.trim() : id;
  if (!content) {
    return null;
  }
  return {
    id,
    title,
    content,
    source,
    tokens: countTokens(`${title} ${content}`),
  };
};

const loadKnowledgeDataset = async () => {
  if (!knowledgeUrl) {
    throw new Error("Локальный индекс знаний не задан.");
  }

  await acquireKnowledgeLock();
  try {
    if (knowledgeDatasetPromise) {
      return knowledgeDatasetPromise;
    }

    knowledgeDatasetPromise = (async () => {
      const cache = await caches.open(CACHE_NAME);
      const request = new Request(knowledgeUrl, { credentials: "same-origin" });
      let response = await cache.match(request);
      if (!response) {
        response = await fetch(request);
        if (!response.ok) {
          throw new Error(`Не удалось загрузить локальный индекс знаний: ${response.status}`);
        }
        await cache.put(request, response.clone());
      }

      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        throw new Error("Локальный индекс знаний повреждён (некорректный JSON).");
      }

      const rawDocuments = Array.isArray(payload?.documents) ? payload.documents : [];
      const documents = rawDocuments
        .map((doc, index) => normaliseDocument(doc, index))
        .filter((doc) => Boolean(doc) && Object.keys(doc.tokens).length > 0);

      const dataset = {
        version: Number(payload?.version) || 1,
        generatedAt:
          typeof payload?.generatedAt === "string" && payload.generatedAt.trim()
            ? payload.generatedAt
            : null,
        documents,
      };

      knowledgeDataset = dataset;
      updateKnowledgeMetadata(dataset);
      return dataset;
    })();

    knowledgeDatasetPromise.catch(() => {
      knowledgeDatasetPromise = null;
      knowledgeDataset = null;
      updateKnowledgeMetadata(null);
    });

    return knowledgeDatasetPromise;
  } finally {
    releaseKnowledgeLock();
  }
};

const ensureKnowledgeDataset = async () => {
  if (knowledgeDataset) {
    return knowledgeDataset;
  }
  return loadKnowledgeDataset();
};

const warmKnowledgeDataset = async () => {
  try {
    await ensureKnowledgeDataset();
  } catch (error) {
    console.warn("[kolibri-sw] Не удалось прогреть локальный индекс знаний.", error);
  }
};

const respondWithJson = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...(init.headers || {}),
    },
  });

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

const MAX_LOG_ENTRIES = 50;

const appendLogEntry = (log, entry) => {
  log.push(entry);
  if (log.length > MAX_LOG_ENTRIES) {
    log.shift();
  }
};

const buildSnippets = (dataset, query, limit) => {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  if (!dataset || !Array.isArray(dataset.documents) || !dataset.documents.length) {
    return [];
  }

  const queryCounts = countTokens(trimmed);
  const queryTokens = Object.keys(queryCounts);
  if (!queryTokens.length) {
    return [];
  }

  return dataset.documents
    .map((doc) => {
      let score = 0;
      for (const token of queryTokens) {
        const docFrequency = doc.tokens[token];
        if (docFrequency) {
          const queryFrequency = queryCounts[token] ?? 1;
          score += docFrequency * queryFrequency;
        }
      }
      if (score <= 0) {
        return null;
      }
      return {
        id: doc.id,
        title: doc.title,
        content: doc.content,
        source: doc.source,
        score,
      };
    })
    .filter((snippet) => Boolean(snippet))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};

const handleKnowledgeSearch = async (url) => {
  knowledgeStats.requests += 1;
  let dataset;
  try {
    dataset = await ensureKnowledgeDataset();
  } catch (error) {
    knowledgeStats.localMisses += 1;
    return respondWithJson(
      {
        error: "Локальный индекс знаний недоступен.",
        detail: error instanceof Error ? error.message : String(error),
        snippets: [],
      },
      { status: 503 },
    );
  }

  const params = url.searchParams;
  const query = params.get("q") || "";
  const limitParam = params.get("limit");
  const parsedLimit = Number.parseInt(limitParam ?? "", 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 20) : 5;

  const snippets = buildSnippets(dataset, query, limit);
  if (snippets.length) {
    knowledgeStats.localHits += 1;
  } else {
    knowledgeStats.localMisses += 1;
  }

  return respondWithJson({
    snippets,
    source: "service-worker",
    generatedAt: dataset.generatedAt,
  });
};

const parseBodyParams = async (request) => {
  if (request.method !== "POST") {
    return null;
  }
  try {
    const cloned = request.clone();
    const contentType = cloned.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = await cloned.json();
      if (json && typeof json === "object") {
        return json;
      }
    }
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await cloned.text();
      const formParams = new URLSearchParams(text);
      const record = {};
      for (const [key, value] of formParams.entries()) {
        record[key] = value;
      }
      return record;
    }
  } catch (error) {
    console.warn("[kolibri-sw] Не удалось разобрать тело запроса.", error);
  }
  return null;
};

const extractQueryParams = (url, bodyParams) => {
  const params = new URLSearchParams(url.search);
  const get = (key) => {
    if (bodyParams && typeof bodyParams[key] === "string") {
      return bodyParams[key];
    }
    return params.get(key);
  };
  return {
    rating: get("rating"),
    q: get("q"),
    a: get("a"),
  };
};

const handleKnowledgeFeedback = async (request, url) => {
  const bodyParams = await parseBodyParams(request);
  const { rating, q, a } = extractQueryParams(url, bodyParams);

  appendLogEntry(knowledgeFeedbackLog, {
    rating: rating || "unknown",
    question: q || "",
    answer: a || "",
    receivedAt: new Date().toISOString(),
  });

  return respondWithJson({ status: "stored", pendingSync: true });
};

const handleKnowledgeTeach = async (request, url) => {
  const bodyParams = await parseBodyParams(request);
  const { q, a } = extractQueryParams(url, bodyParams);

  appendLogEntry(knowledgeTeachLog, {
    question: q || "",
    answer: a || "",
    receivedAt: new Date().toISOString(),
  });

  return respondWithJson({ status: "queued", pendingSync: true });
};

const handleKnowledgeHealthz = async () => {
  if (!knowledgeDataset && !knowledgeDatasetPromise) {
    void warmKnowledgeDataset();
  }

  if (!knowledgeUrl) {
    return respondWithJson(
      {
        status: "unavailable",
        documents: 0,
        generatedAt: null,
        detail: "Локальный пакет знаний не сконфигурирован.",
      },
      { status: 503 },
    );
  }

  try {
    await ensureKnowledgeDataset();
  } catch (error) {
    return respondWithJson(
      {
        status: "unavailable",
        documents: 0,
        generatedAt: null,
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 503 },
    );
  }

  return respondWithJson({
    status: knowledgeMetadata.status,
    documents: knowledgeMetadata.documents,
    generatedAt: knowledgeMetadata.generatedAt,
    mode: "local",
  });
};

const handleKnowledgeMetrics = () => {
  const lines = [
    "# HELP kolibri_local_requests_total Количество запросов к локальному сервису знаний",
    "# TYPE kolibri_local_requests_total counter",
    `kolibri_local_requests_total ${knowledgeStats.requests}`,
    "# HELP kolibri_local_hits_total Успешные локальные ответы на поиск",
    "# TYPE kolibri_local_hits_total counter",
    `kolibri_local_hits_total ${knowledgeStats.localHits}`,
    "# HELP kolibri_local_misses_total Количество пустых или ошибочных локальных ответов",
    "# TYPE kolibri_local_misses_total counter",
    `kolibri_local_misses_total ${knowledgeStats.localMisses}`,
  ];
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};

const handleKnowledgeApi = async (request, url) => {
  const pathname = url.pathname;
  if (pathname.startsWith("/api/knowledge/search")) {
    return handleKnowledgeSearch(url);
  }
  if (pathname.startsWith("/api/knowledge/healthz")) {
    return handleKnowledgeHealthz();
  }
  if (pathname.startsWith("/api/knowledge/feedback")) {
    return handleKnowledgeFeedback(request, url);
  }
  if (pathname.startsWith("/api/knowledge/teach")) {
    return handleKnowledgeTeach(request, url);
  }
  if (pathname.startsWith("/api/knowledge/metrics")) {
    return handleKnowledgeMetrics();
  }

  return respondWithJson({ error: "Неизвестный эндпоинт." }, { status: 404 });
};

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

  if (ABSOLUTE_URL_PATTERN.test(path) && !path.startsWith(baseOrigin)) {
    return;
  }

  const cache = await caches.open(CACHE_NAME);
  try {
    const request = new Request(toAbsoluteUrl(path), { credentials: "same-origin" });
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
  } catch (error) {
    console.warn(`[kolibri-sw] Не удалось закэшировать ${path}.`, error);
    metricsState.offlineFallback = true;
    markDegraded(`cache-failure:${path}`);
    void broadcastMetrics();
  }
}

async function evaluateWasmBudget(path) {
  try {
    const request = new Request(toAbsoluteUrl(path), { method: "HEAD", credentials: "same-origin" });
    const response = await fetch(request);
    if (!response || !response.ok) {
      return true;
    }
    const lengthHeader = response.headers.get("Content-Length");
    if (lengthHeader) {
      const parsed = Number(lengthHeader);
      if (!Number.isNaN(parsed) && parsed > 0) {
        metricsState.wasmBytes = parsed;
        if (parsed > MAX_WASM_SIZE_BYTES) {
          metricsState.offlineFallback = true;
          markDegraded("wasm-over-budget");
          await broadcastMetrics();
          return false;
        }
      }
    }
  } catch (error) {
    console.warn("[kolibri-sw] Не удалось оценить размер wasm.", error);
  }
  await broadcastMetrics();
  return true;
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") {
    return;
  }

  if (data.type === "GET_STARTUP_METRICS") {
    recordColdStart();
    const target = event.source ? [event.source] : undefined;
    event.waitUntil(broadcastMetrics(target));
    return;
  }

  if (data.type === "SET_WASM_ARTIFACTS") {
    const tasks = [];
    if (typeof data.url === "string" && data.url) {
      wasmUrl = resolveBasePath(data.url);
      tasks.push(
        (async () => {
          const allowed = await evaluateWasmBudget(wasmUrl);
          if (allowed) {
            await precacheResource(wasmUrl);
          }
        })(),
      );
    }
    if (typeof data.infoUrl === "string" && data.infoUrl) {
      wasmInfoUrl = resolveBasePath(data.infoUrl);
      tasks.push(precacheResource(wasmInfoUrl));
    }
    if (tasks.length > 0) {
      event.waitUntil(Promise.all(tasks).then(() => broadcastMetrics()));
    }
  }

  if (data.type === "SET_KNOWLEDGE_ARTIFACTS") {
    if (typeof data.url === "string" && data.url) {
      const nextUrl = resolveBasePath(data.url);
      const changed = knowledgeUrl !== nextUrl;
      knowledgeUrl = nextUrl;
      if (changed) {
        resetKnowledgeDataset();
      }
      event.waitUntil(
        precacheResource(knowledgeUrl)
          .then(() => warmKnowledgeDataset())
          .then(() => broadcastMetrics()),
      );
    }
  }

  if (data.type === "SET_KNOWLEDGE_MODE") {
    if (typeof data.mode === "string" && data.mode) {
      knowledgeMode = data.mode;
    }
    if (typeof data.url === "string" && data.url) {
      const nextUrl = resolveBasePath(data.url);
      const changed = knowledgeUrl !== nextUrl;
      knowledgeUrl = nextUrl;
      if (changed) {
        resetKnowledgeDataset();
      }
      event.waitUntil(
        precacheResource(knowledgeUrl).then(() => broadcastMetrics()),
      );
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

  if (knowledgeMode !== "remote" && url.pathname.startsWith("/api/knowledge")) {
    event.respondWith(handleKnowledgeApi(request, url));
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
          metricsState.offlineFallback = true;
          markDegraded("offline");
          void broadcastMetrics();
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

  if (url.pathname.startsWith(ASSETS_PREFIX)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
