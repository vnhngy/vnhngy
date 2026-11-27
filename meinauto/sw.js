/* Mein Auto – Offline-Speicher: zeigt sofort die gespeicherte Version und holt im Hintergrund die neueste */
const CACHE = 'meinauto-v12';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

// Mitteilungen: der Server schickt nur anonyme Schlüssel – die Texte liegen auf dem iPhone
const pushText = k => new Promise(ok => {
  try {
    const q = indexedDB.open('meinauto-push', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('n');
    q.onerror = () => ok(null);
    q.onsuccess = () => {
      try {
        const g = q.result.transaction('n').objectStore('n').get(k);
        g.onsuccess = () => { ok(g.result || null); q.result.close(); };
        g.onerror = () => ok(null);
      } catch (e) { ok(null); }
    };
  } catch (e) { ok(null); }
});
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = {}; }
  const opt = (body, tag) => ({ body, tag, icon: 'icon-192.png', data: { url: './' } });
  e.waitUntil((async () => {
    if (d.t === 'test') return self.registration.showNotification('Mein Auto', opt('Mitteilungen funktionieren.', 'meinauto-test'));
    const ks = Array.isArray(d.ks) ? d.ks.slice(0, 8) : [];
    if (!ks.length) return self.registration.showNotification('Mein Auto', opt('Du hast eine Erinnerung.', 'meinauto'));
    for (const k of ks) {
      const n = await pushText(k);
      await self.registration.showNotification(n ? n.title : 'Mein Auto', opt(n ? n.body : 'Du hast eine Erinnerung – öffne die App.', 'meinauto-' + k));
    }
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
