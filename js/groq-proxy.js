// =============================================================================
//  KI-Anfragen laufen über die eigene Supabase Edge Function
// =============================================================================
//  Früher rief jede Stelle direkt api.groq.com auf und holte sich den Schlüssel
//  aus localStorage['groq_api_key']. Damit musste ihn jeder Nutzer selbst
//  eintragen, und er war auf jedem Gerät im Klartext auslesbar.
//
//  Jetzt geht jede Anfrage an supabase/functions/groq-proxy. Die Function prüft
//  die Anmeldung und hängt den Schlüssel serverseitig an — im Browser gibt es
//  ihn nicht mehr. Wer nicht angemeldet ist, bekommt 401 und sonst nichts.
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
        return basis ? basis.replace(/\/+$/, '') + '/functions/v1/groq-proxy' : '';
    }

    // Eine Response bauen, die sich für den Aufrufer wie eine Groq-Antwort
    // liest — sonst müsste jede Aufrufstelle zwei Fehlerformen kennen.
    function fehlerAntwort(nachricht, status) {
        return new Response(JSON.stringify({ error: { message: nachricht } }), {
            status: status,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    window.groqFetch = async function (payload) {
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

        try {
            return await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify(payload)
            });
        } catch (e) {
            return fehlerAntwort('Der KI-Dienst ist nicht erreichbar: ' + (e.message || e), 502);
        }
    };

    // Kurzer Selbsttest für die Einstellungen: läuft die Function, ist der
    // Schlüssel hinterlegt und die Anmeldung gültig?
    window.groqSelbsttest = async function () {
        const resp = await window.groqFetch({
            messages: [{ role: 'user', content: 'Antworte nur mit: ok' }],
            temperature: 0,
            max_tokens: 5
        });
        if (resp.ok) return { ok: true };
        let msg = 'Status ' + resp.status;
        try { const e = await resp.json(); msg = e.error?.message || msg; } catch (_) { }
        return { ok: false, message: msg };
    };
})();
