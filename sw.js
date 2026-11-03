/* KFZ-SV Wissen — Service Worker
   Strategie wie in der SV-Toolbox: App-Shell im Cache (stale-while-revalidate), KI-Aufrufe nie cachen.
   Die Unterlagen liegen in IndexedDB, nicht hier. */
const CACHE = 'kfz-sv-wissen-v5';
const SHELL = [
    './',
    './index.html',
    './suche.js?v=5',
    './speicher.js?v=5',
    './darstellung.js?v=5',
    './ki.js?v=5',
    './sprache.js?v=5',
    './vorlesen.js?v=5',
    './manifest.webmanifest',
    './icons/apple-touch-icon.png',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-512-maskable.png',
    './icons/favicon-64.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE)
            .then((c) => Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.startsWith('kfz-sv-wissen-')).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    // KI-Endpunkte und alles Fremde immer direkt aus dem Netz
    if (url.origin !== self.location.origin) return;

    // Navigation: Netz zuerst, bei Ausfall die gecachte Shell
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req)
                .then((res) => {
                    if (res && res.ok && res.type === 'basic') caches.open(CACHE).then((c) => c.put('./index.html', res.clone()));
                    return res;
                })
                .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
        );
        return;
    }

    event.respondWith(
        caches.match(req).then((cached) => {
            const net = fetch(req)
                .then((res) => {
                    if (res && res.ok && res.type === 'basic') caches.open(CACHE).then((c) => c.put(req, res.clone()));
                    return res;
                })
                .catch(() => cached);
            return cached || net;
        })
    );
});
