// ==========================================================
// EINSTELLUNGEN → OUTLOOK (partials/settings/outlook.html)
// ==========================================================
// Anwendungs-ID hinterlegen, an-/abmelden, Verbindung prüfen.
// Anmeldelogik: js/outlook-graph.js
// ==========================================================
(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = m => (typeof window.showToast === 'function' ? window.showToast(m) : console.log(m));

    function zeichnen() {
        const status = $('os-status'); if (!status) return;
        const k = window.outlookKonto && window.outlookKonto();
        const id = window.outlookClientId ? window.outlookClientId() : '';
        $('os-client-id').value = id;
        $('os-redirect').textContent = window.outlookRedirectUri ? window.outlookRedirectUri() : '';

        let text, klasse;
        if (!window.outlookVerfuegbar || !window.outlookVerfuegbar()) {
            text = location.protocol === 'file:'
                ? 'Nicht möglich per Doppelklick (file://) — die Microsoft-Anmeldung braucht http(s). Die App über den Server öffnen.'
                : 'Anmeldebibliothek fehlt: lib/msal-browser.min.js';
            klasse = 'aus';
        } else if (!id) { text = 'Keine Anwendungs-ID hinterlegt.'; klasse = 'aus'; }
        else if (!k) { text = 'Nicht angemeldet.'; klasse = 'aus'; }
        else {
            // Alle angemeldeten Konten (mirco@, info@ …); das aktive ist markiert, jedes einzeln abmeldbar
            const konten = window.outlookKonten ? window.outlookKonten() : [k];
            text = konten.map(x => '<div class="os-konto' + (x.username === k.username ? ' aktiv' : '') + '">'
                + '<strong>' + esc(x.name || '') + '</strong> · ' + esc(x.username || '')
                + (x.username === k.username ? ' <span class="text-muted-sm">(aktiv)</span>' : ' <button class="btn-secondary os-mini" data-aktiv="' + esc(x.username) + '">Aktiv setzen</button>')
                + ' <button class="btn-secondary os-mini" data-abmelden="' + esc(x.username) + '">Abmelden</button></div>').join('');
            klasse = 'an';
        }
        status.className = 'os-status ' + klasse;
        status.innerHTML = text;
        status.querySelectorAll('[data-aktiv]').forEach(b => b.addEventListener('click', () => window.outlookKontoWaehlen(b.dataset.aktiv)));
        status.querySelectorAll('[data-abmelden]').forEach(b => b.addEventListener('click', () => window.outlookAbmelden(b.dataset.abmelden)));
        $('os-anmelden').textContent = k ? 'Weiteres Konto anmelden' : 'Mit Microsoft anmelden';
        $('os-anmelden').disabled = !id || !(window.outlookVerfuegbar && window.outlookVerfuegbar());
        $('os-abmelden').hidden = true;
        $('os-pruefen').disabled = !k;
    }

    // Signatur (HTML) je Browser. Gelesen von js/mail-view.js beim Schreiben.
    const SIG_KEY = 'outlook_signatur';
    let sigEditor = null;
    window.outlookSignatur = function () { return localStorage.getItem(SIG_KEY) || ''; };
    function signaturEditor() {
        if (sigEditor || typeof window.Quill === 'undefined' || !$('os-signatur')) return;
        sigEditor = new Quill('#os-signatur', { theme: 'snow', placeholder: 'Mit freundlichen Grüßen …', modules: { toolbar: '#os-signatur-toolbar' } });
        const sig = window.outlookSignatur();
        if (sig) sigEditor.clipboard.dangerouslyPasteHTML(sig);
    }

    window.outlookSettingsRender = function () { zeichnen(); signaturEditor(); };
    document.addEventListener('outlook:status', zeichnen);

    document.addEventListener('DOMContentLoaded', function () {
        if (!$('settings-outlook')) return;
        $('os-id-speichern').addEventListener('click', () => {
            const id = $('os-client-id').value.trim();
            if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
                toast('Das sieht nicht wie eine Anwendungs-ID aus (Format 8-4-4-4-12 Zeichen).'); return;
            }
            window.outlookClientIdSetzen(id);
            toast(id ? 'Anwendungs-ID gespeichert.' : 'Anwendungs-ID entfernt.');
            zeichnen();
        });
        $('os-anmelden').addEventListener('click', async () => {
            const weiteres = !!(window.outlookKonto && window.outlookKonto());
            try { await window.outlookAnmelden(weiteres); toast(weiteres ? 'Konto hinzugefügt.' : 'Mit Outlook verbunden.'); }
            catch (e) { toast('Anmeldung fehlgeschlagen: ' + e.message); }
            zeichnen();
        });
        $('os-abmelden').addEventListener('click', async () => { await window.outlookAbmelden(); zeichnen(); });
        $('os-pruefen').addEventListener('click', async () => {
            const out = $('os-pruef-ergebnis');
            out.textContent = 'Wird geprüft …';
            try {
                const me = await window.graphFetch('/me?$select=displayName,mail,userPrincipalName');
                const inbox = await window.graphFetch('/me/mailFolders/inbox?$select=totalItemCount,unreadItemCount');
                out.textContent = 'OK — ' + (me.displayName || '') + ' (' + (me.mail || me.userPrincipalName || '') + '), Posteingang: '
                    + inbox.totalItemCount + ' Mails, ' + inbox.unreadItemCount + ' ungelesen.';
            } catch (e) { out.textContent = 'Fehler: ' + e.message; }
        });
        $('os-signatur-speichern').addEventListener('click', () => {
            if (!sigEditor) return;
            const leer = sigEditor.getLength() <= 1 && !sigEditor.root.querySelector('img');
            if (leer) localStorage.removeItem(SIG_KEY); else localStorage.setItem(SIG_KEY, sigEditor.root.innerHTML);
            toast(leer ? 'Signatur entfernt.' : 'Signatur gespeichert.');
        });
        $('os-signatur-leeren').addEventListener('click', () => { if (sigEditor) sigEditor.setContents([]); });
        $('os-redirect-kopieren').addEventListener('click', async () => {
            try { await navigator.clipboard.writeText($('os-redirect').textContent); toast('Kopiert.'); }
            catch (e) { toast('Kopieren nicht möglich — bitte markieren und Strg+C.'); }
        });
        zeichnen();
    });
})();
