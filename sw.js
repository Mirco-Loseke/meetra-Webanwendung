const CACHE_NAME = 'meetra-app-v2';

// App shell — lokal gecachte Dateien beim ersten Besuch
const PRECACHE = [
    'index.html',
    'style.css',
    'offline-service.js',
    'vorlage_base64.js',
    'machines-grouped.js',
    'protocols.js',
    'tasks.js',
    'task_templates.js',
    'protocol_templates.js',
    'file-upload-service-r2.js',
    'accounting.js',
    'documents-r2.js',
    'checklists.js',
    'customers.js',
    'app.js',
    'lib/pdf.min.js',
    'lib/pdf.worker.min.js',
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Navigation (Seite öffnen): erst Netzwerk, bei Fehler Cache
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response.ok) {
                        caches.open(CACHE_NAME).then(c => c.put(event.request, response.clone()));
                    }
                    return response;
                })
                .catch(() => caches.match('index.html'))
        );
        return;
    }

    // Lokale JS/CSS-Dateien: aus Cache sofort liefern, im Hintergrund aktualisieren
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(event.request, { ignoreSearch: true }).then(cached => {
                const networkFetch = fetch(event.request).then(response => {
                    if (response.ok) {
                        caches.open(CACHE_NAME).then(c => c.put(event.request, response.clone()));
                    }
                    return response;
                }).catch(() => null);
                return cached || networkFetch;
            })
        );
        return;
    }

    // Supabase-CDN: erst Cache, dann Netzwerk (damit es offline funktioniert)
    if (url.hostname.includes('unpkg.com') || url.hostname.includes('supabase')) {
        event.respondWith(
            caches.match(event.request).then(cached =>
                cached || fetch(event.request).then(response => {
                    if (response.ok) {
                        caches.open(CACHE_NAME).then(c => c.put(event.request, response.clone()));
                    }
                    return response;
                }).catch(() => cached)
            )
        );
        return;
    }

    // R2-Dokumente (PDF, Bilder): erst Netzwerk, bei Fehler Cache
    const isDocument = url.hostname.includes('r2') ||
        url.hostname.includes('cloudflare') ||
        /\.(pdf|jpg|jpeg|png|gif|webp|docx|xlsx|csv)$/i.test(url.pathname);

    if (isDocument) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response.ok) {
                        caches.open(CACHE_NAME).then(c => c.put(event.request, response.clone()));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
    }
});
