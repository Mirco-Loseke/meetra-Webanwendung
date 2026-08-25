const CACHE_NAME = 'meetra-app-v312';

// App shell — lokal gecachte Dateien beim ersten Besuch
const PRECACHE = [
    'index.html',
    // Die HTML-Bausteine aus partials/ stecken fest im index.html (node build.js)
    // und müssen deshalb nicht einzeln gecacht werden.
    'css/style.css',
    'css/components/elements.css',
    'css/components/calendar-widget.css',
    'js/calendar-widget.js',
    'js/notifications.js',
    'js/reminder-alarm.js',
    'js/assignment-handoff.js',
    'css/components/reminder-alarm.css',
    'js/appointment-invite.js',
    'js/appointments.js',
    'css/base/variables.css',
    'css/base/tokens.css',
    'css/base/brand-accents.css',
    'css/base/reset.css',
    // Schriften: seit der Umstellung von Google Fonts auf lokale Dateien
    // muessen sie mit in den Cache, sonst faellt die App offline auf die
    // Systemschrift zurueck.
    'assets/fonts/inter-latin.woff2',
    'assets/fonts/inter-latin-ext.woff2',
    'assets/fonts/outfit-latin.woff2',
    'assets/fonts/outfit-latin-ext.woff2',
    'css/base/utilities.css',
    'css/base/responsive.css',
    'css/components/navigation.css',
    'css/components/modals.css',
    'css/components/buttons.css',
    'css/components/forms.css',
    'css/components/notifications.css',
    'css/components/calendar.css',
    'css/components/dropdowns.css',
    'css/components/dropdown-look.css',
    'css/components/focus-mode.css',
    'css/components/appointments.css',
    'css/views/documents.css',
    'css/views/protocols.css',
    'css/views/mietvereinbarung.css',
    'css/views/tasks.css',
    'css/views/workshop-tasks.css',
    'css/views/service-reports.css',
    'css/views/machines.css',
    'css/views/procurement.css',
    'css/views/settings.css',
    'css/views/accounting.css',
    'css/views/workshop.css',
    'css/views/dashboard.css',
    'css/views/listen.css',
    // Achtung: cache.addAll() ist atomar — ein einziger 404 laesst den
    // gesamten Precache scheitern und die App hat offline nichts. Diese
    // beiden Pfade zeigten auf css/ statt css/views/ und haben genau das
    // ausgeloest. Neue Eintraege deshalb immer gegen die Platte pruefen.
    'css/views/addressbook.css',
    'js/addressbook.js',
    'js/address-history.js',
    'js/addressbook-live.js',
    'js/autosave.js',
    'js/unsaved-guard.js',
    'js/process-autosave.js',
    'js/task-autosave.js',
    'js/process-open-hints.js',
    'css/views/routenplanung.css',
    'js/routenplanung.js',
    'lib/supabase.min.js',
    'js/offline-service.js',
    'assets/data/vorlage_base64.js',
    'js/machines-grouped.js',
    'js/protocols.js',
    'js/mietvereinbarung.js',
    'js/mietvereinbarung-vorlagen.js',
    'js/mietvereinbarung-liste.js',
    'js/assets-on-demand.js',
    'js/tasks.js',
    'js/task_templates.js',
    'js/protocol_templates.js',
    'js/file-upload-service-r2.js',
    'js/accounting.js',
    'js/documents-r2.js',
    'js/checklists.js',
    'js/customers.js',
    'js/routeplanner.js',
    'js/listen.js',
    'assets/data/meetra_logo_base64.js',
    'js/labels.js',
    'lib/pdf.min.js',
    'lib/pdf.worker.min.js',
    'lib/jsbarcode.min.js',
    'lib/notosans-font.js',
    'assets/images/meetra-logo-bw-source.png',
    'assets/icons/meetra_arrows_icon.png',
    // --- Aus dem index.html ausgelagerte Module (siehe CLAUDE.md) ---
    'js/ui-feedback.js',
    'js/permissions.js',
    'js/dashboard.js',
    'js/auto-nachladen.js',
    'js/app-core.js',
    'js/settings-uvv-plans.js',
    'js/machine-details-modal.js',
    'js/app-init.js',
    'js/machine-modal.js',
    'js/service-report-form.js',
    'js/service-list.js',
    'js/history-modal.js',
    'js/calendar-events.js',
    'js/processes-ui.js',
    'js/process-attachments.js',
    'css/components/process-attachments.css',
    'js/process-messages.js',
    'js/process-machine-select.js',
    'js/customer-matching.js',
    'js/ui-modals.js',
    'js/processes.js',
    'js/service-reports.js',
    'js/service-entries.js',
    'js/service-picker.js',
    'js/worklog-tables.js',
    'js/workshop-tasks.js',
    'js/signature-pads.js',
    'js/servicebericht-pdf.js',
    'js/modal-sections.js',
    'js/speech-input.js',
    'js/groq-proxy.js',
    'js/ai-quick-capture.js',
    'js/photo-lightbox.js',
    'js/documents-modal.js',
    'js/workshop-photos-modal.js',
    'js/workshop-photos-helper.js',
    'js/ai-address-task.js',
    'js/dropdown-position.js',
    'js/select-enhance.js',
    'js/auth.js',
    'js/users.js',
    'js/voice-dictation.js',
    // --- Zugehoerige Stylesheets ---
    'css/views/login.css',
    'css/views/history.css',
    'css/base/landscape.css',
    'css/components/voice-dictation.css',
    'css/views/machine-modal.css',
    'css/views/accounting-modal.css',
    'css/views/accounting-toggle.css',
    'css/views/accounting-finance-cards.css',
];

// Offline Fallback HTML
const FALLBACK_HTML = `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Meetra — Offline</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: system-ui, -apple-system, sans-serif;
            background: #0f172a;
            color: #f8fafc;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem;
            text-align: center;
        }
        .card {
            background: rgba(30, 41, 59, 0.7);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 24px;
            padding: 3rem 2rem;
            max-width: 480px;
            width: 100%;
            backdrop-filter: blur(12px);
        }
        .icon { font-size: 3.5rem; margin-bottom: 1.5rem; }
        h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.75rem; color: #fff; }
        p { color: #94a3b8; font-size: 0.95rem; line-height: 1.6; margin-bottom: 2rem; }
        .btn {
            background: #be1e2d;
            color: #fff;
            border: none;
            padding: 12px 28px;
            border-radius: 50px;
            font-weight: 600;
            font-size: 0.9rem;
            cursor: pointer;
            transition: transform 0.2s, background 0.2s;
        }
        .btn:hover { background: #a31825; transform: translateY(-2px); }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">📡</div>
        <h1>Keine Internetverbindung</h1>
        <p>Diese Seite ist offline noch nicht aufgerufen worden. Bitte verbinde dich mit dem Internet und versuche es erneut.</p>
        <button class="btn" onclick="window.location.reload()">Erneut versuchen</button>
    </div>
</body>
</html>
`;

// Install Event: App-Shell cachen
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Service Worker] Pre-caching App Shell (v50)...');
                return cache.addAll(PRECACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate Event: Alte Caches aufräumen
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Lösche alten Cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event: Stale-While-Revalidate für App-Shell, Network-First für API
self.addEventListener('fetch', event => {
    // Supabase API Requests: Nur Netzwerk (kein ServiceWorker-Interferieren)
    if (event.request.url.includes('supabase.co')) {
        return;
    }

    // Cloudflare R2 Uploads / Storage Requests: Nur Netzwerk
    if (event.request.url.includes('r2.cloudflarestorage.com') || event.request.url.includes('pub-')) {
        return;
    }

    // ------------------------------------------------------------------
    // Versionierte Dateien: ZUERST aus dem Cache
    // ------------------------------------------------------------------
    // Alle JS- und CSS-Dateien werden mit ?v=N eingebunden. Ändert sich
    // eine Datei, wird die Nummer hochgezählt — die URL ist dann eine
    // andere und liegt garantiert nicht im Cache. Deshalb ist "zuerst
    // Cache" hier gefahrlos und spart beim Start rund 120 Anfragen ans
    // Netz (gemessen: 155 Anfragen, 4,7 MB).
    //
    // Bewusst NICHT für index.html: dort stehen die Versionsnummern, die
    // Datei muss immer frisch kommen (weiter unten, Netz zuerst).
    const url = new URL(event.request.url);
    const istVersioniert = url.searchParams.has('v')
        && url.origin === self.location.origin
        && event.request.method === 'GET';

    if (istVersioniert) {
        event.respondWith(
            caches.match(event.request).then(gecacht => {
                if (gecacht) return gecacht;
                return fetch(event.request).then(response => {
                    if (response && response.status === 200 && response.type === 'basic') {
                        const kopie = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, kopie));
                    }
                    return response;
                }).catch(() =>
                    // Offline und noch nie geholt: notfalls die Fassung ohne
                    // Versionsnummer aus dem Vorrat (PRECACHE).
                    caches.match(event.request, { ignoreSearch: true })
                );
            })
        );
        return;
    }

    // Alles Übrige (index.html, Schriften, Bilder): Netz zuerst, Cache als Rückfall
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Wenn die Antwort gültig ist, in Cache klonen und zurückgeben
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => {
                // Netzwerk fehlgeschlagen -> aus Cache bedienen
                return caches.match(event.request).then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // Zweiter Versuch ohne ?v=N. Die PRECACHE-Liste enthält die
                    // Dateien ohne Query, angefragt werden sie aber mit — ohne
                    // diesen Schritt fehlt eine frisch hochgezählte Datei genau
                    // dann, wenn die App nach dem Update zuerst offline startet.
                    // Lieber eine ältere Fassung ausliefern als gar keine.
                    return caches.match(event.request, { ignoreSearch: true }).then(looseMatch => {
                        if (looseMatch) {
                            return looseMatch;
                        }
                        // Wenn HTML angefragt wurde und nicht im Cache ist: Fallback-Page
                        if (event.request.headers.get('accept')?.includes('text/html')) {
                            return new Response(FALLBACK_HTML, {
                                headers: { 'Content-Type': 'text/html; charset=utf-8' }
                            });
                        }
                    });
                });
            })
    );
});

// ==========================================================
// Klick auf eine Erinnerungs-Meldung (js/reminder-alarm.js)
// ==========================================================
// Ohne diesen Handler passiert beim Anklicken einer Windows-Meldung nichts.
// Ist die App schon offen, wird das vorhandene Fenster nach vorn geholt,
// statt einen zweiten Tab aufzumachen. Zusaetzlich wird der Seite gesagt,
// welcher Eintrag gemeint war — js/reminder-alarm.js oeffnet ihn dann.
self.addEventListener('notificationclick', (event) => {
    const ziel = (event.notification && event.notification.data) || {};
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((liste) => {
            for (const client of liste) {
                if ('focus' in client) {
                    if (ziel.zielId && client.postMessage) {
                        client.postMessage({ type: 'alarm-open', zielTyp: ziel.zielTyp, zielId: ziel.zielId });
                    }
                    return client.focus();
                }
            }
            if (self.clients.openWindow) return self.clients.openWindow('./index.html');
        })
    );
});
