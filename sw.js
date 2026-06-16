const CACHE_NAME = 'meetra-docs-v1';

// Local assets always cached on install
const PRECACHE = [
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

    // Cache-first for local lib files
    if (url.pathname.startsWith('/lib/')) {
        event.respondWith(
            caches.match(event.request).then(cached => cached || fetch(event.request))
        );
        return;
    }

    // Network-first for R2 document URLs, cache on success so they work offline after first open
    const isDocument = url.hostname.includes('r2') ||
        url.hostname.includes('cloudflare') ||
        /\.(pdf|jpg|jpeg|png|gif|webp|docx|xlsx|csv)$/i.test(url.pathname);

    if (isDocument) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
    }
});
