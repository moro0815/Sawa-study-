/* オフラインでも開けるように。APIへの通信はキャッシュしない */
const CACHE = "sawa-navi-v19";
const ASSETS = [
  "./", "./index.html", "./share.html", "./manifest.json",
  "./css/style.css",
  "./js/evidence.js", "./js/curriculum.js", "./js/homework.js", "./js/learning.js", "./js/memory.js", "./js/luke.js", "./js/speech.js", "./js/english.js", "./js/careers.js",
  "./js/exam.js", "./js/admission.js", "./js/guardian.js", "./js/stage.js",
  "./js/personas.js", "./js/providers.js", "./js/api.js", "./js/app.js",
  "./icons/icon-180.png", "./icons/icon-192.png", "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) =>
    Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;           // 外部APIは触らない
  if (e.request.method !== "GET") return;
  if (url.pathname.includes("/api/")) return;           // バックアップ受け口はキャッシュしない
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
