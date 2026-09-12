const CACHE_NAME = "soro-soke-cache-v4";

const APP_FILES = [
  "./",
  "./index.html",
  "./dictionary.html",
  "./learn.html",
  "./lesson.html",
  "./contribute.html",
  "./styles.css",
  "./app.js",
  "./dictionary.json",
  "./manifest.json"
];

/* =========================================================
   INSTALL
========================================================= */

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_FILES);
    })
  );

  self.skipWaiting();
});

/* =========================================================
   ACTIVATE
========================================================= */

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});

/* =========================================================
   FETCH
========================================================= */

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);

  /*
   * IMPORTANT:
   * Only handle files belonging to Sọ̀rọ̀ Sókè.
   *
   * External files such as the Yoruba TTS model from
   * Hugging Face must go directly to the network.
   */

  if (url.origin !== self.location.origin) {
    return;
  }

  const isAppFile =
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".json");

  if (isAppFile) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (!response || !response.ok) {
            throw new Error(
              `Network response failed: ${response.status}`
            );
          }

          const copy = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, copy);
          });

          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );

    return;
  }

  /*
   * Other files belonging to this app:
   * cache first, then network.
   */

  event.respondWith(
    caches
      .match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request).then((response) => {
          if (!response || !response.ok) {
            return response;
          }

          const copy = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, copy);
          });

          return response;
        });
      })
  );
});