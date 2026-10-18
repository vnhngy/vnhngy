// Offline-Cache für die App-Dateien. Bei Änderungen an der App VERSION erhöhen.
const VERSION = 'drivo-1.2.0';
const FILES = ['./', './index.html', './i18n.js', './js/01-grundlagen.js', './js/02-tanken-fahrten-reifen.js', './js/03-fotos-notfall-gps.js', './js/04-dokumente-export.js', './js/05-formulare-ereignisse.js', './js/06-werkzeuge.js', './js/07-fahrzeuge-kosten.js', './js/08-uebersicht-suche.js', './js/09-notizen-termine-budget.js', './js/10-kompass-rueckblick-rekorde.js', './js/11-schaeden-leasing-steuer.js', './js/12-kosten-vergleich-erinnerung.js', './js/13-farbe-sperre-chronik.js', './js/14-werkstatt-daten-steuer.js', './js/15-versicherung-pannen-gewohnheiten.js', './js/16-pflege-gemeinschaft-quiz.js', './js/17-neu-galerie-kalender.js', './js/18-assistent-start.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Erst Netzwerk (damit Updates ankommen), bei Offline aus dem Cache.
self.addEventListener('fetch', (e) => {
  // Nur eigene Dateien cachen, keine Spritpreis-Abfragen
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    // no-cache: am Browser-Cache vorbei beim Server nachfragen, damit Updates sofort ankommen
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
