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
            // Google meldet bei Überlast 503 („high demand") — meist nur kurz.
            // Ein weiterer Versuch nach 1 s, bevor aufgegeben wird.
            // (Die ki-proxy weicht zusätzlich selbst auf freie Modelle aus.)
            for (let versuch = 0; ; versuch++) {
                resp = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify(payload)
                });
                // Die Function probiert selbst schon alle Modelle parallel durch — hier nur noch ein kurzer Nachversuch.
                if (resp.status !== 503 || versuch >= 1) break;
                console.warn('KI überlastet (503) — neuer Versuch in 1 s');
                await new Promise(r => setTimeout(r, 1000));
            }
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
            else if (resp.status === 503 || /high demand|overloaded|UNAVAILABLE/i.test(detail + text)) hinweis = 'Die KI (Google) ist gerade überlastet — dreimal versucht. Bitte in ein, zwei Minuten noch einmal.';
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
        // Rückgabe: { text, usage, vollstaendig, grund }
        //   vollstaendig=false, wenn die Antwort abgeschnitten (Längenlimit) oder die
        //   Verbindung mittendrin abgerissen ist bzw. zu lange nichts mehr kam.
        //   grund: kurzer deutscher Text für den Hinweis im Fenster.
        // Bricht der Strom ab, NACHDEM schon Text da war, wird nicht geworfen, sondern
        // der Teiltext mit vollstaendig=false geliefert — so sieht der Nutzer, was kam,
        // UND dass es nicht alles ist.
        const ct = resp.headers.get('content-type') || '';
        if (!/text\/event-stream/i.test(ct) || !resp.body) {
            const d = await resp.json();
            const c0 = d.choices && d.choices[0];
            const text = (c0 && c0.message && c0.message.content || '').trim();
            if (!text) throw new Error('Die KI hat keinen Text geliefert.');
            const abgeschnitten = c0 && c0.finish_reason === 'length';
            return { text, usage: d.usage || null, vollstaendig: !abgeschnitten, grund: abgeschnitten ? 'Die Antwort hat die maximale Länge erreicht.' : '' };
        }
        const STILLE_MS = 45000;   // so lange ohne neue Daten ⇒ gilt als hängengeblieben
        const reader = resp.body.getReader();
        const dec = new TextDecoder();
        let puffer = '', text = '', usage = null, finish = null, fertigGemeldet = false, grund = '';
        for (;;) {
            let stille;
            const zeitAus = new Promise(r => { stille = setTimeout(() => r({ zeitAus: true }), STILLE_MS); });
            let teil;
            try { teil = await Promise.race([reader.read(), zeitAus]); }
            catch (e) { grund = 'Die Verbindung wurde unterbrochen.'; break; }
            finally { clearTimeout(stille); }
            if (teil.zeitAus) {
                grund = 'Es kam ' + Math.round(STILLE_MS / 1000) + ' Sekunden lang nichts mehr — die Antwort ist hängengeblieben.';
                try { reader.cancel(); } catch (e) { /* egal */ }
                break;
            }
            if (teil.done) break;
            puffer += dec.decode(teil.value, { stream: true });
            const zeilen = puffer.split(/\r?\n/);
            puffer = zeilen.pop();
            for (const z of zeilen) {
                if (!z.startsWith('data:')) continue;
                const roh = z.slice(5).trim();
                if (!roh) continue;
                if (roh === '[DONE]') { fertigGemeldet = true; continue; }
                let d; try { d = JSON.parse(roh); } catch (e) { continue; }
                if (d.error) {
                    if (text.trim()) { grund = 'Die KI hat mit einem Fehler abgebrochen: ' + (d.error.message || 'unbekannt'); break; }
                    throw new Error(d.error.message || 'KI-Fehler');
                }
                if (d.usage) usage = d.usage;
                const c0 = d.choices && d.choices[0];
                if (c0 && c0.finish_reason) finish = c0.finish_reason;
                const delta = c0 && c0.delta && c0.delta.content;
                if (delta) { text += delta; if (onText) { try { onText(text); } catch (e) { /* egal */ } } }
            }
            if (grund) break;
        }
        text = text.trim();
        if (!text) throw new Error(grund || 'Die KI hat keinen Text geliefert.');
        if (!grund && finish === 'length') grund = 'Die Antwort hat die maximale Länge erreicht.';
        if (!grund && finish && finish !== 'stop') grund = 'Die KI hat vorzeitig beendet (' + finish + ').';
        // Weder Ende-Signal noch Abschlussgrund: der Strom ist einfach abgerissen.
        if (!grund && !finish && !fertigGemeldet) grund = 'Die Verbindung ist vor dem Ende abgerissen.';
        return { text, usage, vollstaendig: !grund, grund };
    };

    // Hinweis unter dem Text, solange noch gestreamt wird — verschwindet, sobald fertig.
    window.kiSchreibtHtml = '<div class="ab-ai-summary-laden" style="margin-top:10px; opacity:0.8;"><span class="ab-ai-spinner"></span> wird noch geschrieben …</div>';

    // Warnkasten unter einer unvollständigen Antwort (beide Zusammenfassungen).
    window.kiUnvollstaendigHtml = function (grund) {
        const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        return '<div class="ki-unvollstaendig" role="alert" style="margin-top:14px; padding:12px 14px; border-radius:10px; border:1px solid rgba(251,146,60,0.7); background:rgba(251,146,60,0.12); color:#fed7aa;">'
            + '<strong style="color:#fb923c;">⚠️ Die Zusammenfassung ist NICHT vollständig.</strong><br>'
            + esc(grund || 'Die Antwort wurde unterbrochen.') + ' Der Text oben endet mittendrin — es gibt mehr dazu. '
            + 'Bitte auf <strong>„Neu erzeugen"</strong> klicken.</div>';
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
