// ==========================================================
// OUTLOOK / MICROSOFT GRAPH — Anmeldung und Abfragen
// ==========================================================
// Einmalige Anmeldung beim Microsoft-Konto (MSAL, lib/msal-browser.min.js),
// danach Zugriff auf Postfach und Kontakte über Microsoft Graph. Kein
// Schlüssel, kein Secret: die App ist eine „öffentliche" SPA, Microsoft
// fragt den Nutzer beim ersten Mal nach Zustimmung und stellt ein Ticket aus.
//
// Voraussetzungen:
//  - App-Registrierung in Entra (Einstellungen → Outlook zeigt die Klickfolge),
//    Rückleitungs-URI = Adresse, unter der die App läuft (Typ SPA).
//  - http(s): über file:// kann Microsoft nicht zurückleiten.
//
// Die Anwendungs-ID ist kein Geheimnis und liegt je Browser in localStorage.
// Das Ticket hält MSAL selbst in localStorage; beim Laden wird die Anmeldung
// still fortgesetzt (outlookFortsetzen). Änderungen melden sich über das
// Ereignis 'outlook:status' am document.
// ==========================================================
(function () {
    'use strict';

    const SCHLUESSEL_ID = 'outlook_client_id';
    const SCHLUESSEL_AKTIV = 'outlook_aktiv';   // zuletzt gewähltes Postfach (Benutzername)
    // Mail.ReadWrite nur für „In Outlook öffnen": legt den Entwurf im Ordner Entwürfe an.
    const BERECHTIGUNGEN = ['User.Read', 'Mail.Read', 'Mail.ReadWrite', 'Mail.Send', 'Contacts.Read'];
    const GRAPH = 'https://graph.microsoft.com/v1.0';

    let anwendung = null;   // MSAL-Instanz (NICHT "msal" nennen — so heißt die Bibliothek)
    let konto = null;

    function redirectUri() { return location.origin + location.pathname; }
    function libVorhanden() { return typeof window.msal !== 'undefined'; }

    function melde() {
        try { document.dispatchEvent(new CustomEvent('outlook:status', { detail: { konto } })); } catch (e) { /* egal */ }
    }

    function client() {
        if (!libVorhanden()) throw new Error('Die Anmeldebibliothek fehlt (lib/msal-browser.min.js).');
        const id = window.outlookClientId();
        if (!id) throw new Error('Keine Anwendungs-ID hinterlegt — Einstellungen → Outlook.');
        if (!anwendung || anwendung.config.auth.clientId !== id) {
            anwendung = new msal.PublicClientApplication({
                auth: {
                    clientId: id,
                    authority: 'https://login.microsoftonline.com/common', // Firmen- UND Privatkonten
                    redirectUri: redirectUri()
                },
                cache: { cacheLocation: 'localStorage' }
            });
        }
        return anwendung;
    }

    // ---------- öffentliche API ----------
    window.outlookClientId = function () { return (localStorage.getItem(SCHLUESSEL_ID) || '').trim(); };
    window.outlookClientIdSetzen = function (id) {
        localStorage.setItem(SCHLUESSEL_ID, (id || '').trim());
        anwendung = null;
    };
    window.outlookRedirectUri = redirectUri;
    window.outlookKonto = function () { return konto; };
    window.outlookVerfuegbar = function () { return libVorhanden() && location.protocol !== 'file:'; };
    window.outlookBerechtigungen = BERECHTIGUNGEN.slice();

    // Alle im Browser angemeldeten Konten (mirco@, info@ …), stabil sortiert.
    window.outlookKonten = function () {
        try { return client().getAllAccounts().slice().sort((a, b) => (a.username || '').localeCompare(b.username || '')); }
        catch (e) { return []; }
    };
    function kontoZu(username) {
        const u = (username || '').toLowerCase();
        return window.outlookKonten().find(k => (k.username || '').toLowerCase() === u) || null;
    }
    // Aktives Postfach (Posteingang, Kontakte) wechseln; Wahl je Browser gemerkt.
    window.outlookKontoWaehlen = function (username) {
        const k = kontoZu(username);
        if (!k) return null;
        konto = k;
        localStorage.setItem(SCHLUESSEL_AKTIV, k.username);
        melde();
        return k;
    };

    // weiteres = true: zusätzliches Konto anmelden (Kontoauswahl erzwingen), wird aktiv.
    window.outlookAnmelden = async function (weiteres) {
        if (location.protocol === 'file:') throw new Error('Die Microsoft-Anmeldung braucht http(s) — bitte die App über den Server öffnen, nicht per Doppelklick.');
        const c = client();
        const bekannt = weiteres ? null : c.getAllAccounts()[0];
        let antwort = null;
        // Erst still über die Microsoft-Sitzung im Browser (iframe); Popup nur, wenn das scheitert.
        if (!weiteres) {
            try { antwort = await c.ssoSilent({ scopes: BERECHTIGUNGEN, loginHint: bekannt ? bekannt.username : undefined }); }
            catch (e) { antwort = null; }
        }
        if (!antwort) {
            antwort = await c.loginPopup(bekannt
                ? { scopes: BERECHTIGUNGEN, loginHint: bekannt.username }
                : { scopes: BERECHTIGUNGEN, prompt: 'select_account' });
        }
        konto = antwort.account;
        localStorage.setItem(SCHLUESSEL_AKTIV, konto.username);
        melde();
        return konto;
    };

    // Ohne Angabe: aktives Konto. Bleiben andere übrig, wird das erste davon aktiv.
    window.outlookAbmelden = async function (username) {
        const k = username ? kontoZu(username) : konto;
        if (!k) return;
        const rest = window.outlookKonten().filter(x => x.homeAccountId !== k.homeAccountId);
        konto = rest[0] || null;
        if (konto) localStorage.setItem(SCHLUESSEL_AKTIV, konto.username); else localStorage.removeItem(SCHLUESSEL_AKTIV);
        melde();
        if (anwendung) {
            try { await anwendung.logoutPopup({ account: k }); } catch (e) { /* Fenster zu — egal */ }
        }
        melde();
    };

    // Vorhandene Tickets still weiterverwenden (Seite neu geladen).
    window.outlookFortsetzen = async function () {
        if (!window.outlookVerfuegbar() || !window.outlookClientId()) return null;
        try {
            const c = client();
            let konten = c.getAllAccounts();
            if (!konten.length) {
                // Kein Konto im Cache, aber evtl. noch bei Microsoft im Browser angemeldet.
                await c.ssoSilent({ scopes: BERECHTIGUNGEN });
                konten = c.getAllAccounts();
            }
            for (const k of konten) {
                try { await c.acquireTokenSilent({ scopes: BERECHTIGUNGEN, account: k }); }
                catch (e) {
                    // Refresh-Token abgelaufen (SPA: 24 h) — die Browser-Sitzung bei Microsoft hält meist länger.
                    try { await c.ssoSilent({ scopes: BERECHTIGUNGEN, loginHint: k.username }); } catch (e2) { /* Popup dann bei Bedarf in token() */ }
                }
            }
            konto = kontoZu(localStorage.getItem(SCHLUESSEL_AKTIV)) || window.outlookKonten()[0] || null;
            melde();
            return konto;
        } catch (e) {
            konto = null;
            return null;
        }
    };

    // Ticket für ein bestimmtes Konto (Senden „von"), sonst für das aktive.
    async function token(username) {
        const k = username ? kontoZu(username) : konto;
        if (!k) throw new Error(username ? 'Konto ' + username + ' ist nicht angemeldet.' : 'Nicht bei Outlook angemeldet.');
        const c = client();
        const anfrage = { scopes: BERECHTIGUNGEN, account: k };
        try { return (await c.acquireTokenSilent(anfrage)).accessToken; }
        catch (e) { return (await c.acquireTokenPopup(anfrage)).accessToken; }
    }

    // Graph-Aufruf. pfad relativ ('/me/messages…') oder eine volle nextLink-URL.
    // alsKonto: Benutzername eines anderen angemeldeten Kontos (z. B. info@ zum Senden).
    window.graphFetch = async function (pfad, methode, rumpf, alsKonto) {
        const t = await token(alsKonto);
        const url = /^https?:/i.test(pfad) ? pfad : GRAPH + pfad;
        const res = await fetch(url, {
            method: methode || 'GET',
            headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
            body: rumpf ? JSON.stringify(rumpf) : undefined
        });
        const text = await res.text();
        let daten = null;
        try { daten = text ? JSON.parse(text) : null; } catch (e) { daten = text; }
        if (!res.ok) {
            const msg = (daten && daten.error && daten.error.message) || text || ('HTTP ' + res.status);
            const err = new Error(msg);
            err.status = res.status;
            throw err;
        }
        return daten;
    };

    // Alle Seiten einer Liste einsammeln (max. Zeilen als Bremse).
    window.graphAlle = async function (pfad, max) {
        let alle = [], weiter = pfad;
        while (weiter && alle.length < (max || 5000)) {
            const d = await window.graphFetch(weiter);
            alle = alle.concat(d.value || []);
            weiter = d['@odata.nextLink'] || null;
        }
        return alle;
    };

    document.addEventListener('DOMContentLoaded', function () { window.outlookFortsetzen(); });
})();
