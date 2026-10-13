/**
 * Xizmat ishchisi (service worker).
 *
 * Diqqat: sahifalar HECH QACHON keshlanmaydi — ularda shaxsiy ma'lumot bo'ladi
 * va bitta telefondan ikki kishi kirsa, birining ma'lumoti ikkinchisiga
 * ko'rinib qolishi mumkin edi. Faqat o'zgarmaydigan statik fayllar saqlanadi,
 * internet uzilganda esa oddiy "aloqa yo'q" sahifasi ko'rsatiladi.
 */
// Ikonka yoki boshqa statik fayl almashtirilganda raqamni oshiring: statik
// fayllar keshdan olinadi, raqam o'zgarmasa telefon va brauzer eski rasmni
// (masalan eski ikonkani) abadiy ko'rsatib turadi.
const CACHE = "logoped-static-v2";
const OFFLINE_PAGE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([OFFLINE_PAGE, "/icon-192.png", "/apple-touch-icon.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // O'zgarmas statik fayllar: avval keshdan
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    /\.(png|jpg|jpeg|svg|ico|webp|woff2?)$/i.test(url.pathname);

  if (isStatic) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Sahifalar: doim serverdan. Internet yo'q bo'lsa — offline sahifa.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_PAGE)));
  }
});
