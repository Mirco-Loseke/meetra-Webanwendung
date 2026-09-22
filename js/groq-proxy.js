// =============================================================================
//  KI-Anfragen laufen über die eigene Supabase Edge Function
// =============================================================================
//  Früher rief jede Stelle direkt api.groq.com auf und holte sich den Schlüssel
//  aus localStorage['groq_api_key']. Damit musste ihn jeder Nutzer selbst
//  eintragen, und er war auf jedem Gerät im Klartext auslesbar.
//
//  Jetzt geht jede Anfrage an supabase/functions/ki-proxy (Gemini oder Groq, per
//  Secret AI_PROVIDER). Die Function prüft die Anmeldung und hängt den Schlüssel
//  serverseitig an — im Browser gibt es ihn nicht. Ohne Anmeldung: 401.
//
//  window.groqFetch(payload) verhält sich wie das frühere fetch(): es liefert
//  eine ganz normale Response mit Groqs Statuscode und Antworttext. Deshalb
//  funktioniert die vorhandene Fehlerbehandlung (429-Nachfassen, Modell-
//  Ausweichen, Meldungstexte) unverändert weiter.
//
//  Diese Datei muss VOR allen KI-Modulen geladen werden.
// =============================================================================
(function () {
    'use strict';

    function funktionsUrl() {
        const basis = (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL) || '';
        return basis ? basis.replace(/\/+$/, '') + '/functions/v1/ki-proxy' : '';
    }

    // Eine Response bauen, die sich für den Aufrufer wie eine Groq-Antwort
    // liest — sonst müsste jede Aufrufstelle zwei Fehlerformen kennen.
    function fehlerAntwort(nachricht, status, retryAfter) {
        return new Response(JSON.stringify({ error: { message: nachricht } }), {
            status: status,
            headers: retryAfter ? { 'Content-Type': 'application/json', 'retry-after': String(retryAfter) } : { 'Content-Type': 'application/json' }
        });
    }

    // 429 verständlich machen: Minutenlimit (kurz warten) oder Tageslimit
    // (morgen). Google nennt das Limit im Text („PerMinute", „PerDay",
    // „requests per day"), dazu oft eine Wartezeit (retryDelay / retry-after).
    function limitText(detail, retryAfter) {
        const d = String(detail || '');
        let sek = parseInt(retryAfter, 10) || 0;
        const m = /retry(?:Delay|.in)?["\s:]*([\d.]+)\s*s/i.exec(d);
        if (!sek && m) sek = Math.ceil(parseFloat(m[1]));
        const tag = /per.?day|daily|PerDay|RPD|Tages/i.test(d);
        const minute = /per.?minute|PerMinute|RPM|TPM/i.test(d);
        if (tag && !minute) return 'Das Tageskontingent der KI ist aufgebraucht — ab morgen früh geht es weiter. (Kostenloser Zugang, es entstehen keine Kosten.)';
        if (sek >= 120) return 'Zu viele KI-Anfragen — bitte in etwa ' + Math.ceil(sek / 60) + ' Minuten noch einmal versuchen.';
        if (sek > 0) return 'Zu viele KI-Anfragen in der Minute — bitte in ' + sek + ' Sekunden noch einmal versuchen.';
        return 'Zu viele KI-Anfragen in kurzer Zeit — bitte in 2–3 Minuten noch einmal versuchen.';
    }

    // ---- Gemini als TEST-Anbieter (2026-09-21) ----------------------------
    // Einstellungen → KI: Anbieter „Gemini (Test)" + Key je Browser in
    // localStorage. Bewusst nur zum Ausprobieren — der Key liegt damit im
    // Browser. Später wandert er wie bei Groq in die Edge Function.
    // Gemini spricht dasselbe OpenAI-Format, also bleiben alle Aufrufstellen
    // unverändert; nur Modellname und Reasoning-Stufe werden hier gesetzt.
    const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    window.kiAnbieter = function () { return localStorage.getItem('ki_anbieter') === 'gemini' && localStorage.getItem('gemini_api_key') ? 'gemini' : 'groq'; };
    window.geminiModell = function () { return localStorage.getItem('gemini_modell') || 'gemini-2.5-flash-lite'; };

    async function geminiFetch(payload) {
        const key = localStorage.getItem('gemini_api_key') || '';
        const stufen = ['none', 'minimal', 'low', null];   // was das Modell annimmt, wird durchprobiert
        let letzte = null;
        for (const s of stufen) {
            const body = Object.assign({}, payload, { model: window.geminiModell() });
            delete body.reasoning_effort; delete body.extra_body;
            if (s) body.reasoning_effort = s;
            if (s === 'none') body.extra_body = { google: { thinking_config: { thinking_budget: 0 } } };
            let resp;
            try {
                resp = await fetch(GEMINI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body: JSON.stringify(body) });
            } catch (e) { return fehlerAntwort('Gemini nicht erreichbar (Netzwerk/Firewall): ' + e.message, 502); }
            if (resp.ok) return resp;
            const text = await resp.text();
            let d = null; try { d = JSON.parse(text); if (Array.isArray(d)) d = d[0]; } catch (e) { /* egal */ }
            const msg = (d && d.error && d.error.message) || text.slice(0, 200);
            if (resp.status === 400 && /reasoning|thinking|budget/i.test(msg) && s !== null) { letzte = msg; continue; }
            // Google-Fehler in verständliche Sätze übersetzen
            let hinweis;
            if (/valid API key|API_KEY_INVALID/i.test(msg)) hinweis = 'Gemini-Key ungültig — Einstellungen → KI prüfen.';
            else if (resp.status === 404 || /no longer available|not found/i.test(msg)) hinweis = 'Gemini-Modell „' + window.geminiModell() + '" nicht verfügbar — in Einstellungen → KI ein anderes wählen.';
            else if (resp.status === 429) hinweis = limitText(msg, resp.headers.get('retry-after'));
            else if (resp.status === 403) hinweis = 'Gemini verweigert den Zugriff (Key eingeschränkt / API nicht aktiviert).';
            else hinweis = 'Gemini-Fehler.';
            return fehlerAntwort(hinweis + ' [' + resp.status + ': ' + msg.slice(0, 200) + ']', resp.status, resp.headers.get('retry-after'));
        }
        return fehlerAntwort('Gemini lehnt alle Reasoning-Stufen ab: ' + letzte, 400);
    }

    window.groqFetch = async function (payload) {
        if (window.kiAnbieter() === 'gemini') return geminiFetch(payload);
        const url = funktionsUrl();
        if (!url) {
            return fehlerAntwort('Die Verbindung zu Supabase fehlt — KI ist ohne Anmeldung nicht nutzbar.', 503);
        }
        if (!navigator.onLine) {
            return fehlerAntwort('Ohne Internetverbindung ist die KI nicht nutzbar.', 503);
        }
        if (!window.supabaseClient) {
            return fehlerAntwort('Nicht angemeldet — bitte neu anmelden.', 401);
        }

        // Das Zugriffstoken der laufenden Anmeldung. Ohne gültige Sitzung
        // lehnt die Edge Function ohnehin ab; hier wird das nur früher und
        // mit einer verständlichen Meldung abgefangen.
        let token = '';
        try {
            const { data } = await window.supabaseClient.auth.getSession();
            token = data && data.session ? data.session.access_token : '';
        } catch (e) {
            console.warn('Sitzung konnte nicht gelesen werden:', e);
        }
        if (!token) {
            return fehlerAntwort('Deine Anmeldung ist abgelaufen. Bitte neu anmelden, dann geht die KI wieder.', 401);
        }

        let resp;
        try {
            resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify(payload)
            });
        } catch (e) {
            // „Failed to fetch" heißt hier fast immer: die Function ist unter
            // /functions/v1/ki-proxy nicht ausgerollt (CORS-Preflight bekommt 404).
            return fehlerAntwort('Edge Function „ki-proxy" antwortet nicht — vermutlich nicht ausgerollt. '
                + 'Supabase → Edge Functions prüfen (supabase/SETUP_KI.txt). Technisch: ' + (e.message || e), 502);
        }
        // Fehler der Function selbst klar benennen, statt Groqs Text ungefiltert durchzureichen.
        if (!resp.ok) {
            let text = '';
            try { text = await resp.clone().text(); } catch (e) { /* egal */ }
            let detail = '';
            try { const j = JSON.parse(text); detail = (j.error && (j.error.message || j.error)) || j.message || j.msg || ''; } catch (e) { detail = text.slice(0, 200); }
            let hinweis = '';
            if (resp.status === 401) hinweis = 'Anmeldung von der Function abgelehnt — neu anmelden.';
            else if (resp.status === 404) hinweis = 'Edge Function „ki-proxy" ist nicht ausgerollt.';
            else if (resp.status === 500 && /GEMINI_API_KEY|GROQ_API_KEY|api key|apikey/i.test(detail)) hinweis = 'Auf dem Server fehlt der KI-Schlüssel (Secret GEMINI_API_KEY bzw. GROQ_API_KEY).';
            else if (/invalid api key|invalid_api_key|authentication/i.test(detail)) hinweis = 'Der auf dem Server hinterlegte KI-Schlüssel ist ungültig oder widerrufen — neuen Key erzeugen und als Secret (GEMINI_API_KEY / GROQ_API_KEY) setzen.';
            else if (resp.status === 429) hinweis = limitText(detail, resp.headers.get('retry-after'));
            else if (/model.*not found|decommissioned/i.test(detail)) hinweis = 'Das KI-Modell gibt es bei Groq nicht mehr — Modellname in der Function prüfen.';
            if (hinweis) {
                return fehlerAntwort(hinweis + (detail ? ' [' + resp.status + ': ' + String(detail).slice(0, 200) + ']' : ' [' + resp.status + ']'), resp.status, resp.headers.get('retry-after'));
            }
        }
        return resp;
    };

    // Antwort auslesen — gestreamt (SSE, payload.stream = true) oder als
    // ganzes JSON. Bei Streaming wird onText(bisherigerText) bei jedem Stück
    // aufgerufen, so steht der Text schon während des Schreibens im Fenster.
    // Liefert { text, usage }. Wirft bei Fehlerstatus oder leerer Antwort.
    // Ist die Function noch ohne Streaming ausgerollt, kommt JSON zurück —
    // das wird genauso verstanden, nur ohne Zwischenstände.
    window.kiAntwortLesen = async function (resp, onText) {
        if (!resp.ok) {
            let d = null; try { d = await resp.json(); } catch (e) { /* egal */ }
            throw new Error((d && d.error && (d.error.message || d.error)) || ('HTTP ' + resp.status));
        }
        const ct = resp.headers.get('content-type') || '';
        if (!/text\/event-stream/i.test(ct) || !resp.body) {
            const d = await resp.json();
            const text = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || '').trim();
            if (!text) throw new Error('Die KI hat keinen Text geliefert.');
            return { text, usage: d.usage || null };
        }
        const reader = resp.body.getReader();
        const dec = new TextDecoder();
        let puffer = '', text = '', usage = null;
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            puffer += dec.decode(value, { stream: true });
            const zeilen = puffer.split(/\r?\n/);
            puffer = zeilen.pop();
            for (const z of zeilen) {
                if (!z.startsWith('data:')) continue;
                const roh = z.slice(5).trim();
                if (!roh || roh === '[DONE]') continue;
                let d; try { d = JSON.parse(roh); } catch (e) { continue; }
                if (d.error) throw new Error(d.error.message || 'KI-Fehler');
                if (d.usage) usage = d.usage;
                const delta = d.choices && d.choices[0] && d.choices[0].delta && d.choices[0].delta.content;
                if (delta) { text += delta; if (onText) { try { onText(text); } catch (e) { /* egal */ } } }
            }
        }
        text = text.trim();
        if (!text) throw new Error('Die KI hat keinen Text geliefert.');
        return { text, usage };
    };

    // Kurzer Selbsttest für die Einstellungen: läuft die Function, ist der
    // Schlüssel hinterlegt und die Anmeldung gültig?
    window.groqSelbsttest = async function () {
        const resp = await window.groqFetch({
            messages: [{ role: 'user', content: 'Antworte nur mit: ok' }],
            temperature: 0,
            max_tokens: 5
        });
        if (resp.ok) {
            const anb = window.kiAnbieter() === 'gemini' ? 'Gemini im Browser (' + window.geminiModell() + ')' : ((resp.headers.get('x-ki-anbieter') || 'Server') + (resp.headers.get('x-ki-modell') ? ' · ' + resp.headers.get('x-ki-modell') : ''));
            return { ok: true, anbieter: anb };
        }
        let msg = 'Status ' + resp.status;
        try { const e = await resp.json(); msg = e.error?.message || msg; } catch (_) { }
        return { ok: false, message: msg };
    };
})();
