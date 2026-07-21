const CACHE_NAME = 'meetra-app-v18';

// App shell — lokal gecachte Dateien beim ersten Besuch
const PRECACHE = [
    'index.html',
    'style.css',
    'lib/supabase.min.js',
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
    'routeplanner.js',
    'listen.js',
    'meetra_logo_base64.js',
    'labels.js',
    'app.js',
    'lib/pdf.min.js',
    'lib/pdf.worker.min.js',
    'lib/jsbarcode.min.js',
    'lib/notosans-font.js',
    'meetra-logo-bw-source.png',
    'meetra_arrows_icon.png',
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

    // Navigation (Seite öffnen): Network-First — bei bestehendem Internet immer die aktuellste
    // Version laden (kein "ein Reload zu spät"-Effekt mehr). Ist das Gerät bereits als offline
    // erkannt, wird das Netzwerk gar nicht erst versucht — sonst wartet jede einzelne Datei auf
    // einen Netzwerk-Timeout, bevor sie aus dem Cache kommt, was auf dem iPad spürbar bremst.
    if (event.request.mode === 'navigate') {
        if (!self.navigator.onLine) {
            event.respondWith(caches.match('index.html').then(r => r || fetch(event.request)));
            return;
        }
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

    // Lokale JS/CSS-Dateien: Network-First — bei bestehendem Internet immer den aktuellsten Code
    // laden. Offline wird das Netzwerk gar nicht erst versucht (siehe oben) — direkt aus dem
    // Cache, ohne auf einen Timeout zu warten.
    if (url.origin === self.location.origin) {
        if (!self.navigator.onLine) {
            event.respondWith(caches.match(event.request, { ignoreSearch: true }).then(r => r || fetch(event.request)));
            return;
        }
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response.ok) {
                        caches.open(CACHE_NAME).then(c => c.put(event.request, response.clone()));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request, { ignoreSearch: true }))
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
