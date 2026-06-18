const CACHE_NAME = 'meetra-app-v6';

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

    // Navigation (Seite öffnen): Stale-While-Revalidate für index.html (sofortiger Start, Update im Hintergrund)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            caches.match('index.html').then(cachedResponse => {
                const fetchPromise = fetch(event.request)
                    .then(response => {
                        if (response.ok) {
                            caches.open(CACHE_NAME).then(c => c.put(event.request, response.clone()));
                        }
                        return response;
                    })
                    .catch(() => {});
                return cachedResponse || fetchPromise;
            })
        );
        return;
    }

    // Lokale JS/CSS-Dateien: Stale-While-Revalidate (sofort aus Cache für schnelle Ladezeiten, Update im Hintergrund)
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(event.request, { ignoreSearch: true }).then(cachedResponse => {
                const fetchPromise = fetch(event.request)
                    .then(response => {
                        if (response.ok) {
                            caches.open(CACHE_NAME).then(c => c.put(event.request, response.clone()));
                        }
                        return response;
                    })
                    .catch(() => {});
                return cachedResponse || fetchPromise;
            })
        );
        return;
    }

    // Supabase-API-Calls (rest/v1, auth, storage) NIE abfangen — immer frisch vom Netzwerk,
    // damit Daten online niemals veraltet aus dem Cache kommen. Offline schlägt der Request
    // natürlich fehl; das fängt die App selbst über den localStorage/IndexedDB-Cache auf.
    if (url.hostname.endsWith('.supabase.co')) {
        return;
    }

    // R2-Dokumente (PDF, Bilder): Cache-First (Bilder/PDFs laden sofort offline/online aus dem Cache)
    const isDocument = url.hostname.includes('r2') ||
        url.hostname.includes('cloudflare') ||
        /\.(pdf|jpg|jpeg|png|gif|webp|docx|xlsx|csv)$/i.test(url.pathname);

    if (isDocument) {
        event.respondWith(
            caches.match(event.request).then(cachedResponse => {
                if (cachedResponse) return cachedResponse; // Cache-Treffer sofort zurückgeben

                return fetch(event.request)
                    .then(response => {
                        if (response.ok) {
                            caches.open(CACHE_NAME).then(c => c.put(event.request, response.clone()));
                        }
                        return response;
                    })
                    .catch(() => {});
            })
        );
    }
});
