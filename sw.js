/* オフライン用サービスワーカー
   ・ページ本体（index.html）は「ネット優先」：つながっていれば最新版を読み、3秒で返事がなければ保存済みの版で開く
   ・アイコンなどは保存済みを優先。音声は「音声をダウンロード」で別のキャッシュに保存 */
const CACHE = "gakka-quiz-v35";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  // ブラウザのHTTPキャッシュを通さずに取り直す（古い版を保存しないように）
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && !k.startsWith("gakka-audio")).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isPage(req) {
  if (req.mode === "navigate") return true;
  const u = new URL(req.url);
  return u.origin === location.origin && (u.pathname.endsWith("/") || u.pathname.endsWith("/index.html"));
}

function networkFirst(req) {
  return new Promise(resolve => {
    let done = false;
    const fromCache = () => caches.match("./index.html").then(hit => hit || caches.match(req, { ignoreSearch: true }));
    const timer = setTimeout(() => { if (!done) fromCache().then(hit => { if (hit && !done) { done = true; resolve(hit); } }); }, 3000);
    fetch(req, { cache: "no-store" }).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put("./index.html", copy));
      }
      if (!done) { done = true; clearTimeout(timer); resolve(res); }
    }).catch(() => {
      fromCache().then(hit => { if (!done) { done = true; clearTimeout(timer); resolve(hit || Response.error()); } });
    });
  });
}

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (isPage(e.request)) { e.respondWith(networkFirst(e.request)); return; }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(e.request);
    })
  );
});
