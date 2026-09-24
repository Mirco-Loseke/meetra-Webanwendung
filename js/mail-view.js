// MAIL-ANSICHT — Posteingang, Outlook-Kontakte, Mail schreiben
// ==========================================================
// Alles kommt live aus Outlook (js/outlook-graph.js). Es wird nichts
// kopiert; gespeichert wird nur die Zuordnung „Absender-Adresse → Kunde",
// wenn der Nutzer sie von Hand trifft (Tabelle mail_zuordnungen, Rückfall
// localStorage, solange die Migration nicht gelaufen ist).
//
// Kunden-Erkennung an einer Mail, in dieser Reihenfolge:
//   1. E-Mail-Adresse eines Ansprechpartners (customer_contacts.email)
//      oder der Firma (customers.email)
//   2. handschriftliche Zuordnung (mail_zuordnungen)
//   3. Firmen-Domain (@kunde.de), wenn sie eindeutig zu einem Kunden gehört
//      und keine Freemail-Domain ist
// ==========================================================
(function () {
    'use strict';

    const MAILFELDER = '$select=id,subject,from,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments,webLink';
    const FREEMAIL = /^(gmail|googlemail|web|gmx|t-online|outlook|hotmail|live|yahoo|icloud|me|aol|freenet|posteo|mail|arcor|online|1und1|vodafone|o2online|magenta)\.(de|com|net|at|ch)$/i;

    const S = {
        tab: 'posteingang',
        mails: [],            // Posteingang
        mailsNext: null,      // nextLink
        ordner: 'inbox',      // inbox / sentitems / drafts
        mailAktiv: null,
        kontakte: [],         // Outlook-Kontakte
        kontakteGeladen: false,
        kontaktAktiv: null,
        // Kunden-Index
        adrZuKunde: new Map(),   // email -> { kunde, kontakt }
        domainZuKunde: new Map(),// domain -> kunde | null (null = mehrdeutig)
        zuordnungen: new Map(),  // email -> customer_id (von Hand)
        indexBereit: false,
        indexLaeuft: null
    };

    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, typ) => (typeof window.showToast === 'function' ? window.showToast(m, typ) : console.log(m));

    function initialen(s) {
        const t = (s || '?').replace(/<.*?>/g, '').trim().split(/[\s.@_-]+/).filter(Boolean);
        return ((t[0] || '?')[0] + (t[1] ? t[1][0] : '')).toUpperCase();
    }
    function datumKurz(iso) {
        if (!iso) return '';
        const d = new Date(iso), heute = new Date();
        if (d.toDateString() === heute.toDateString()) return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        if ((heute - d) / 86400000 < 7) return d.toLocaleDateString('de-DE', { weekday: 'short' });
        return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: d.getFullYear() === heute.getFullYear() ? undefined : '2-digit' });
    }
    function datumLang(iso) { return iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short' }) : ''; }
    function eigeneAdresse() { const k = window.outlookKonto && window.outlookKonto(); return ((k && k.username) || '').toLowerCase(); }
    function domainVon(adr) { const i = (adr || '').lastIndexOf('@'); return i < 0 ? '' : adr.slice(i + 1).toLowerCase(); }
    function kAdressen(k) { return (k.emailAddresses || []).map(e => (e.address || '').toLowerCase()).filter(Boolean); }
    function kName(k) { return k.displayName || [k.givenName, k.surname].filter(Boolean).join(' ') || kAdressen(k)[0] || 'Ohne Namen'; }

    // ---------- Kunden-Index ----------
    async function indexBauen() {
        if (S.indexBereit) return;
        if (S.indexLaeuft) return S.indexLaeuft;
        S.indexLaeuft = (async () => {
            S.adrZuKunde = new Map(); S.domainZuKunde = new Map(); S.zuordnungen = new Map();
            const kunden = typeof window.customerCacheGet === 'function' ? await window.customerCacheGet() : [];
            const kundeById = new Map(kunden.map(k => [String(k.id), k]));
            const domainKandidaten = new Map(); // domain -> Set(customer_id)
            const merke = (adr, kunde, kontakt) => {
                adr = (adr || '').toLowerCase().trim();
                if (!adr || !kunde) return;
                if (!S.adrZuKunde.has(adr)) S.adrZuKunde.set(adr, { kunde, kontakt: kontakt || null });
                const dom = domainVon(adr);
                if (dom && !FREEMAIL.test(dom)) {
                    if (!domainKandidaten.has(dom)) domainKandidaten.set(dom, new Set());
                    domainKandidaten.get(dom).add(String(kunde.id));
                }
            };
            kunden.forEach(k => merke(k.email, k, null));
            if (window.supabaseClient) {
                try {
                    const { data } = await window.supabaseClient.from('customer_contacts').select('id, customer_id, name, email');
                    (data || []).forEach(c => merke(c.email, kundeById.get(String(c.customer_id)), c));
                } catch (e) { console.warn('Mail: Ansprechpartner nicht ladbar', e); }
                try {
                    const { data, error } = await window.supabaseClient.from('mail_zuordnungen').select('email, customer_id');
                    if (!error) (data || []).forEach(z => S.zuordnungen.set((z.email || '').toLowerCase(), String(z.customer_id)));
                    else throw error;
                } catch (e) {
                    // Migration fehlt → lokaler Rückfall
                    try { Object.entries(JSON.parse(localStorage.getItem('outlook_mail_zuordnungen') || '{}')).forEach(([a, id]) => S.zuordnungen.set(a, String(id))); } catch (e2) { /* egal */ }
                }
            }
            domainKandidaten.forEach((ids, dom) => S.domainZuKunde.set(dom, ids.size === 1 ? kundeById.get([...ids][0]) : null));
            S.kundeById = kundeById;
            S.indexBereit = true;
            S.indexLaeuft = null;
        })();
        return S.indexLaeuft;
    }
    document.addEventListener('addressbook:changed', () => { S.indexBereit = false; });

    // Liefert { kunde, kontakt, quelle } oder null.
    function kundeZuAdresse(adr) {
        adr = (adr || '').toLowerCase().trim();
        if (!adr || !S.indexBereit) return null;
        const direkt = S.adrZuKunde.get(adr);
        if (direkt) return { kunde: direkt.kunde, kontakt: direkt.kontakt, quelle: 'kontakt' };
        const hand = S.zuordnungen.get(adr);
        if (hand && S.kundeById.get(hand)) return { kunde: S.kundeById.get(hand), kontakt: null, quelle: 'zuordnung' };
        const dom = S.domainZuKunde.get(domainVon(adr));
        if (dom) return { kunde: dom, kontakt: null, quelle: 'domain' };
        return null;
    }

    async function zuordnungSpeichern(adr, customerId) {
        adr = (adr || '').toLowerCase().trim();
        if (!adr || !customerId) return;
        S.zuordnungen.set(adr, String(customerId));
        let gespeichert = false;
        if (window.supabaseClient) {
            try {
                const { error } = await window.supabaseClient.from('mail_zuordnungen')
                    .upsert({ email: adr, customer_id: customerId, user_id: window.activeUser ? window.activeUser.id : null }, { onConflict: 'email' });
                gespeichert = !error;
            } catch (e) { /* unten Rückfall */ }
        }
        if (!gespeichert) {
            try {
                const alle = JSON.parse(localStorage.getItem('outlook_mail_zuordnungen') || '{}');
                alle[adr] = customerId;
                localStorage.setItem('outlook_mail_zuordnungen', JSON.stringify(alle));
            } catch (e) { /* egal */ }
        }
    }

    // ---------- Ansicht ----------
    function kontoAnzeigen() {
        const box = $('mv-konto'); if (!box) return;
        const k = window.outlookKonto && window.outlookKonto();
        const sec = $('mail');
        if (!k) {
            box.innerHTML = '';
            if (sec) sec.classList.remove('verbunden');
            const txt = $('mv-nicht-verbunden-text');
            if (txt) {
                if (!window.outlookVerfuegbar || !window.outlookVerfuegbar()) {
                    txt.textContent = location.protocol === 'file:'
                        ? 'Die Microsoft-Anmeldung funktioniert nur, wenn die App über einen Server (http/https) geöffnet ist — nicht per Doppelklick.'
                        : 'Die Anmeldebibliothek fehlt (lib/msal-browser.min.js).';
                } else if (!window.outlookClientId()) {
                    txt.textContent = 'Zuerst unter Einstellungen → Outlook die Anwendungs-ID hinterlegen, dann hier anmelden.';
                }
            }
            return;
        }
        // Mehrere Konten (mirco@, info@ …): Auswahl schaltet das Postfach um
        const konten = window.outlookKonten ? window.outlookKonten() : [k];
        box.innerHTML = '<div class="mv-avatar rot">' + esc(initialen(k.name || k.username)) + '</div>'
            + '<select id="mv-konto-wahl" class="mv-konto-wahl" data-no-enhance title="Postfach wechseln">'
            + konten.map(x => '<option value="' + esc(x.username) + '"' + (x.username === k.username ? ' selected' : '') + '>'
                + esc(x.name || x.username) + ' · ' + esc(x.username) + '</option>').join('')
            + '</select>'
            + '<button class="btn-secondary" id="mv-konto-plus" title="Weiteres Konto anmelden (z. B. info@)">+ Konto</button>'
            + '<button class="btn-secondary" id="mv-abmelden" title="Dieses Konto abmelden">Abmelden</button>';
        $('mv-konto-wahl').onchange = e => window.outlookKontoWaehlen(e.target.value);
        $('mv-konto-plus').onclick = async () => {
            try { await window.outlookAnmelden(true); toast('Konto hinzugefügt.', 'success'); }
            catch (e) { toast('Anmeldung fehlgeschlagen: ' + e.message, 'error'); }
        };
        $('mv-abmelden').onclick = () => window.outlookAbmelden();
        if (sec) sec.classList.add('verbunden');
    }

    function tabWechseln(name) {
        S.tab = name;
        document.querySelectorAll('#mail .mv-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
        document.querySelectorAll('#mail .mv-panel').forEach(p => p.classList.toggle('active', p.id === 'mv-panel-' + name));
        if (name === 'kontakte' && !S.kontakteGeladen) kontakteLaden();
        if (name === 'schreiben') vonZeichnen();
    }

    // Beim Öffnen der Ansicht (app-init: targetId === 'mail')
    window.mailViewOeffnen = async function () {
        // switchView setzt display:block inline — die Ansicht ist aber eine Flex-Spalte
        const sec = $('mail'); if (sec) sec.style.display = 'flex';
        kontoAnzeigen();
        if (!(window.outlookKonto && window.outlookKonto())) return;
        indexBauen().then(() => { if (S.mails.length) mailListeZeichnen(); });
        if (!S.mails.length) posteingangLaden();
    };

    let letztesPostfach = null;   // Benutzername — Wechsel leert Listen und lädt neu
    document.addEventListener('outlook:status', () => {
        kontoAnzeigen();
        const k = window.outlookKonto && window.outlookKonto();
        const u = k ? (k.username || '').toLowerCase() : null;
        if (u !== letztesPostfach) {
            letztesPostfach = u;
            S.mails = []; S.mailsNext = null; S.mailAktiv = null; S.kontakte = []; S.kontakteGeladen = false; S.kontaktAktiv = null;
            const d = $('mv-mail-detail'); if (d) d.innerHTML = '<div class="mv-platzhalter">Mail auswählen</div>';
            const kd = $('mv-kontakt-detail'); if (kd) kd.innerHTML = '<div class="mv-platzhalter">Kontakt auswählen</div>';
            const kl = $('mv-kontakt-liste'); if (kl) kl.innerHTML = '';
        }
        if (k && window.currentActiveView === 'mail') {
            window.mailViewOeffnen();
            if (S.tab === 'kontakte' && !S.kontakteGeladen) kontakteLaden();
        }
    });

    // ---------- Posteingang ----------
    async function posteingangLaden(weiter) {
        const box = $('mv-mail-liste'); if (!box) return;
        if (!weiter) { box.innerHTML = '<div class="mv-laden">Wird geladen …</div>'; S.mails = []; S.mailsNext = null; }
        try {
            const sortierung = S.ordner === 'inbox' ? 'receivedDateTime' : 'lastModifiedDateTime';
            const pfad = weiter && S.mailsNext ? S.mailsNext : ('/me/mailFolders/' + S.ordner + '/messages?$top=40&$orderby=' + sortierung + ' desc&' + MAILFELDER + ',sentDateTime,lastModifiedDateTime');
            const d = await window.graphFetch(pfad);
            S.mails = S.mails.concat(d.value || []);
            S.mailsNext = d['@odata.nextLink'] || null;
            await indexBauen();
            mailListeZeichnen();
        } catch (e) { box.innerHTML = '<div class="mv-platzhalter">' + esc(e.message) + '</div>'; }
    }

    function mailListeZeichnen() {
        const box = $('mv-mail-liste'); if (!box) return;
        const q = ($('mv-mail-suche').value || '').toLowerCase().trim();
        const liste = S.mails.filter(m => !q || [m.subject, m.bodyPreview, m.from && m.from.emailAddress && (m.from.emailAddress.name + ' ' + m.from.emailAddress.address)]
            .join(' ').toLowerCase().includes(q));
        box.innerHTML = liste.length ? liste.map(m => mailZeile(m, false)).join('') : '<div class="mv-platzhalter">' + (S.mails.length ? 'Kein Treffer.' : 'Dieser Ordner ist leer.') + '</div>';
        $('mv-mail-mehr').style.display = S.mailsNext && !q ? '' : 'none';
    }

    function mailZeile(m, imKontakt) {
        const von = (m.from && m.from.emailAddress) || {};
        const ausgehend = (von.address || '').toLowerCase() === eigeneAdresse() || (!imKontakt && S.ordner !== 'inbox');
        const gegenAdr = ausgehend ? ((m.toRecipients || [])[0] || {}).emailAddress || {} : von;
        const gegenName = ausgehend
            ? ((m.toRecipients || []).map(r => r.emailAddress.name || r.emailAddress.address).join(', ') || '—')
            : (von.name || von.address || '—');
        const treffer = kundeZuAdresse(gegenAdr.address);
        const kopf = imKontakt
            ? '<span class="mv-richtung ' + (ausgehend ? 'aus' : 'ein') + '">' + (ausgehend ? 'Gesendet' : 'Erhalten') + '</span>' + esc(m.subject || '(kein Betreff)')
            : esc(gegenName) + (treffer ? '<span class="mv-kunde-punkt" title="Im Adressbuch: ' + esc(treffer.kunde.name) + '"></span>' : '');
        return '<div class="mv-mail' + (m.isRead ? '' : ' ungelesen') + (S.mailAktiv === m.id ? ' active' : '') + '" data-id="' + esc(m.id) + '">'
            + (imKontakt ? '' : '<div class="mv-avatar">' + esc(initialen(gegenName)) + '</div>')
            + '<div><div class="mv-wer">' + kopf + '</div>'
            + (imKontakt ? '' : '<div class="mv-betreff">' + esc(m.subject || '(kein Betreff)') + '</div>')
            + '<div class="mv-vorschau">' + esc((m.bodyPreview || '').replace(/\s+/g, ' ')) + '</div></div>'
            + '<div class="mv-rechts">' + esc(datumKurz(m.receivedDateTime || m.sentDateTime || m.lastModifiedDateTime)) + (m.hasAttachments ? '<div>📎</div>' : '') + '</div>'
            + '</div>';
    }

    async function mailOeffnen(id, ziel, kasten) {
        S.mailAktiv = id;
        kasten.querySelectorAll('.mv-mail').forEach(x => x.classList.toggle('active', x.dataset.id === id));
        kasten.classList.add('zeigt-detail');
        ziel.innerHTML = '<div class="mv-laden">Wird geladen …</div>';
        try {
            const m = await window.graphFetch('/me/messages/' + encodeURIComponent(id) + '?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,hasAttachments,webLink');
            let anhaenge = [];
            if (m.hasAttachments) {
                try { anhaenge = (await window.graphFetch('/me/messages/' + encodeURIComponent(id) + '/attachments?$select=name,size,contentType')).value || []; } catch (e) { /* egal */ }
            }
            const von = (m.from && m.from.emailAddress) || {};
            const an = (m.toRecipients || []).map(r => r.emailAddress.name || r.emailAddress.address).join(', ');
            const cc = (m.ccRecipients || []).map(r => r.emailAddress.name || r.emailAddress.address).join(', ');
            ziel.innerHTML = '<button class="btn-secondary mv-zurueck">← Zurück</button>'
                + '<h2 class="mv-mail-titel">' + esc(m.subject || '(kein Betreff)') + '</h2>'
                + '<div class="mv-mail-meta"><div class="mv-avatar">' + esc(initialen(von.name || von.address)) + '</div>'
                + '<div><div class="mv-name">' + esc(von.name || von.address) + '</div><div class="mv-adr">' + esc(von.address || '') + '</div>'
                + '<div class="mv-an">An: ' + esc(an) + (cc ? ' · Cc: ' + esc(cc) : '') + '</div></div>'
                + '<div class="mv-datum">' + esc(datumLang(m.receivedDateTime)) + '</div></div>'
                + '<div id="mv-kunde-box"></div>'
                + '<div class="mv-mail-aktionen">'
                + '<button class="btn-secondary" id="mv-antworten">Antworten</button>'
                + '<button class="btn-secondary mv-ki-btn" id="mv-ki-antwort" title="Die KI schreibt einen Antwortentwurf mit Kundenkontext — gesendet wird nichts ohne Klick">✨ Antwort entwerfen</button>'
                + '<button class="btn-secondary mv-ki-btn" id="mv-ki-vorgang" title="Aus dieser Mail einen Vorgang machen — die KI füllt Titel, Art, Maschine, Zusammenfassung und Schritte vor">✨ Vorgang aus Mail</button>'
                + '<a class="btn-secondary" href="' + esc(m.webLink || '#') + '" target="_blank" rel="noopener">In Outlook öffnen</a>'
                + '</div>'
                + (anhaenge.length ? '<div>' + anhaenge.map(a => '<span class="mv-anhang">📎 ' + esc(a.name) + ' <span class="text-muted-sm">' + Math.round((a.size || 0) / 1024) + ' KB</span></span>').join('') + '</div>' : '')
                + '<div class="mv-body" id="mv-body"></div>';
            ziel.querySelector('.mv-zurueck').onclick = () => kasten.classList.remove('zeigt-detail');
            $('mv-antworten').onclick = () => schreibenVorbelegen(von.address || '', antwortBetreff(m), zitatVon(m, von));
            $('mv-ki-vorgang').onclick = () => mailZuVorgang(m, von, an);
            $('mv-ki-antwort').onclick = () => antwortEntwerfen(m, von, an);
            kundeBoxZeichnen(von.address, von.name);
            const body = $('mv-body');
            if (m.body && m.body.contentType === 'html') {
                const f = document.createElement('iframe');
                f.setAttribute('sandbox', ''); // kein Skript aus der Mail
                f.srcdoc = m.body.content;
                body.appendChild(f);
            } else {
                body.innerHTML = '<pre>' + esc(m.body ? m.body.content : '') + '</pre>';
            }
            const zeile = kasten.querySelector('.mv-mail[data-id="' + id.replace(/"/g, '\\"') + '"]');
            if (zeile) zeile.classList.remove('ungelesen');
            const inListe = S.mails.find(x => x.id === id);
            if (inListe && !inListe.isRead) {
                inListe.isRead = true;
                // An Outlook zurückmelden (Mail.ReadWrite) — sonst ist beim nächsten Laden alles wieder ungelesen
                window.graphFetch('/me/messages/' + encodeURIComponent(id), 'PATCH', { isRead: true }).catch(() => { /* z. B. fehlende Berechtigung — nur Anzeige */ });
            }
        } catch (e) { ziel.innerHTML = '<div class="mv-platzhalter">' + esc(e.message) + '</div>'; }
    }

    // ---------- Mail als Text, Zitat, KI-Aktionen ----------
    // Reiner Text der Mail: bei HTML ohne Layout, Skripte und Styles
    function mailText(m) {
        const roh = m.body ? m.body.content : '';
        if (!(m.body && m.body.contentType === 'html')) return String(roh || '').replace(/\r/g, '');
        const tmp = document.implementation.createHTMLDocument('');
        tmp.body.innerHTML = roh;
        tmp.querySelectorAll('style, script, head').forEach(x => x.remove());
        return (tmp.body.innerText || tmp.body.textContent || '').replace(/\r/g, '');
    }
    function antwortBetreff(m) { return /^(AW|RE):/i.test(m.subject || '') ? m.subject : 'AW: ' + (m.subject || ''); }
    // Zitat der Ursprungsmail: nur der Text, sonst schleppt die Antwort das Layout der Fremdmail mit
    function zitatVon(m, von) {
        const zeilen = mailText(m).split('\n').map(z => z.trim()).filter((z, i, a) => z || (a[i - 1] && a[i - 1] !== ''));
        return {
            kopf: 'Am ' + datumLang(m.receivedDateTime) + ' schrieb ' + (von.name || von.address || '') + (von.name && von.address ? ' <' + von.address + '>' : '') + ':',
            html: zeilen.slice(0, 200).map(z => '<p>' + (esc(z) || '<br>') + '</p>').join('')
        };
    }
    // Zitierte ältere Mails und Signatur-Trenner abschneiden — die KI soll nur das Neue lesen
    function mailKern(text) {
        const t = String(text || '');
        const marken = [/^\s*-{2,}\s*Ursprüngliche Nachricht/im, /^\s*Von:\s.+\n\s*Gesendet:/im, /^\s*Am .+ schrieb .+:\s*$/im, /^\s*On .+ wrote:\s*$/im, /^\s*From:\s.+\n\s*Sent:/im, /^\s*-{2,}\s*Original Message/im];
        let ende = t.length;
        marken.forEach(re => { const x = re.exec(t); if (x && x.index > 40 && x.index < ende) ende = x.index; });
        return signaturWeg(t.slice(0, ende)).trim();
    }
    // Alles nach der letzten Grußformel weg (Name, Position, Firma, HRB, IBAN …) —
    // für die KI wertlos, für den Datenschutz das Heikelste. Die Grußzeile bleibt.
    function signaturWeg(text) {
        const re = /^[ \t]*(?:Mit freundlichen Grüßen|Freundliche Grüße|Viele Grüße|Beste Grüße|Liebe Grüße|Schöne Grüße|Herzliche Grüße|Gruß|Grüße|MfG|Best regards|Kind regards|Regards|Met vriendelijke groet)[^\n]{0,20}$/gim;
        let letzte = null, m;
        while ((m = re.exec(text))) letzte = m;
        if (!letzte || letzte.index < 20) return text;
        return text.slice(0, letzte.index + letzte[0].length) + '\n[Signatur entfernt]';
    }
    // Namen für die Pseudonymisierung: Outlook-Kontakte (einmal laden, bleibt im
    // Browser), Ansprechpartner des Adressbuchs, Firma aus der Absender-Domain.
    // Nichts davon geht an die KI — es sind nur die Suchbegriffe fürs Ersetzen.
    let kiNamenCache = null;
    async function kiNamen(absender) {
        if (!kiNamenCache) {
            const kontakte = [], firmen = [];
            try {
                if (!S.kontakteGeladen && window.graphAlle) {
                    S.kontakte = await window.graphAlle('/me/contacts?$top=500&$select=id,displayName,givenName,surname,companyName,emailAddresses', 10000);
                    S.kontakteGeladen = true;
                }
                (S.kontakte || []).forEach(k => {
                    const n = k.displayName || [k.givenName, k.surname].filter(Boolean).join(' ');
                    if (n && !/@/.test(n)) kontakte.push(n);
                    if (k.companyName) firmen.push(k.companyName);
                });
            } catch (e) { console.warn('KI: Outlook-Kontakte nicht ladbar', e); }
            try {
                const { data } = await window.supabaseClient.from('customer_contacts').select('name');
                (data || []).forEach(c => { if (c.name) kontakte.push(c.name); });
            } catch (e) { /* egal */ }
            kiNamenCache = { kontakte, firmen };
        }
        const firmen = kiNamenCache.firmen.slice();
        const dom = domainVon(absender || '');
        if (dom && !FREEMAIL.test(dom)) {
            const kern = dom.replace(/\.[a-z]{2,}$/i, '').split('.').pop();
            if (kern && kern.length >= 5) { firmen.push(kern); if (/-/.test(kern)) firmen.push(kern.replace(/-/g, ' ')); }
        }
        return { kontakte: kiNamenCache.kontakte, firmen };
    }
    window.mailKiNamen = kiNamen;
    // Kundenkontext für die KI: Kunde, dessen Maschinen, offene Vorgänge — knapp
    async function kundenKontext(adr) {
        const t = kundeZuAdresse(adr);
        if (!t) return { kunde: null, text: '' };
        const k = t.kunde;
        const zeilen = ['Kunde: ' + k.name + (k.city ? ' (' + k.city + ')' : '') + (t.kontakt && t.kontakt.name ? ' · Ansprechpartner ' + t.kontakt.name : '')];
        const maschinen = (window.machineList || []).filter(m => String(m.customer_id) === String(k.id)).slice(0, 15);
        if (maschinen.length) zeilen.push('Maschinen des Kunden: ' + maschinen.map(m => (typeof window.machineLabel === 'function' ? window.machineLabel(m) : m.name) + (m.next_maintenance ? ' (nächste Wartung ' + new Date(m.next_maintenance).toLocaleDateString('de-DE') + ')' : '')).join('; '));
        try {
            const { data } = await window.supabaseClient.from('internal_processes').select('title, process_type, process_date, created_at, steps').eq('customer_id', k.id).neq('status', 'erledigt').order('created_at', { ascending: false }).limit(10);
            if (data && data.length) zeilen.push('Offene Vorgänge: ' + data.map(p => (p.title || '') + (Array.isArray(p.steps) && p.steps.some(s => !s.done) ? ' [offen: ' + p.steps.filter(s => !s.done).slice(0, 3).map(s => s.text).join(', ') + ']' : '')).join('; '));
        } catch (e) { /* egal */ }
        return { kunde: k, kontakt: t.kontakt, text: zeilen.join('\n') };
    }
    // ✨ Vorgang aus Mail: an die KI-Schnellerfassung übergeben (js/ai-quick-capture.js)
    async function mailZuVorgang(m, von, an) {
        if (typeof window.openAiCaptureFromMail !== 'function') { toast('KI-Erfassung nicht geladen.', 'error'); return; }
        const t = kundeZuAdresse(von.address);
        window.openAiCaptureFromMail({
            subject: m.subject || '',
            fromName: von.name || '', fromAddress: von.address || '',
            to: an || '',
            receivedAt: m.receivedDateTime || '',
            body: mailKern(mailText(m)),
            customerId: t ? t.kunde.id : null,
            customerName: t ? t.kunde.name : '',
            contactName: t && t.kontakt ? (t.kontakt.name || '') : (von.name || '')
        });
    }
    // ✨ Antwort entwerfen: KI schreibt einen Entwurf, der im Editor landet — nichts wird gesendet
    async function antwortEntwerfen(m, von, an) {
        const btn = $('mv-ki-antwort');
        if (!window.groqFetch) { toast('KI nicht verfügbar.', 'error'); return; }
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Entwurf wird geschrieben …'; }
        try {
            const kk = await kundenKontext(von.address);
            const text = mailKern(mailText(m)).slice(0, 8000);
            const ich = (window.activeUser && window.activeUser.name) || '';
            const du = /\b(du|dir|dich|dein[e]?)\b/i.test(text) && !/\bSie\b/.test(text);
            const system = 'Du schreibst für einen Mitarbeiter einer Firma für Recycling-Maschinen (Service, Vermietung, Verkauf) die Antwort auf eine Kunden-E-Mail. Heute ist ' + new Date().toLocaleDateString('de-DE') + '.\n'
                + 'Regeln:\n- Deutsch, ' + (du ? 'per Du (der Absender duzt)' : 'höflich per Sie') + ', freundlich, knapp, sachlich — kein Blabla.\n'
                + '- Gehe auf JEDEN Punkt der Mail ein, in der Reihenfolge der Mail.\n'
                + '- Nichts erfinden: keine Preise, Termine, Lieferzeiten oder Zusagen, die nicht im Kontext stehen. Wo eine Angabe fehlt, setze einen Platzhalter in eckigen Klammern, z. B. [Termin], [Preis], [Lieferzeit].\n'
                + '- Nutze den Kundenkontext (Maschinen, offene Vorgänge), wenn er zur Mail passt.\n'
                + '- Anrede mit dem Namen des Absenders, wenn bekannt. Grußformel am Ende, dann der Name des Mitarbeiters' + (ich ? ' („' + ich + '")' : '') + '. Keine Signatur-Zusätze (die App hängt die Signatur an).\n'
                + '- Antworte NUR mit dem Mailtext, ohne Betreff, ohne Erklärungen, ohne Markdown.';
            const user = 'EINGEGANGENE MAIL\nVon: ' + (von.name || '') + ' <' + (von.address || '') + '>\nBetreff: ' + (m.subject || '') + '\n\n' + text + (kk.text ? '\n\nKUNDENKONTEXT\n' + kk.text : '');
            const resp = await (window.kiPseudonym ? window.kiPseudonym.fetchMaskiert : window.groqFetch)({
                messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
                temperature: 0.4, max_tokens: 1200
            }, await (async () => {
                const n = await kiNamen(von.address);
                return { kontakte: [von.name, kk.kontakt && kk.kontakt.name].filter(Boolean).concat(n.kontakte), firmen: (kk.kunde ? [kk.kunde.name] : []).concat(n.firmen) };
            })(), { pruefen: true, titel: 'Antwort entwerfen' });
            if (!resp.ok) { let e = 'HTTP ' + resp.status; try { const j = await resp.json(); e = (j.error && j.error.message) || e; } catch (_) { } throw new Error(e); }
            const d = await resp.json();
            const entwurf = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || '').trim();
            if (!entwurf) throw new Error('Die KI hat keinen Text geliefert.');
            const html = entwurf.split(/\n{2,}/).map(abs => '<p>' + abs.split('\n').map(z => esc(z)).join('<br>') + '</p>').join('');
            schreibenVorbelegen(von.address || '', antwortBetreff(m), zitatVon(m, von), html);
            $('mv-s-status').textContent = '✨ KI-Entwurf — bitte lesen, Platzhalter in [eckigen Klammern] ersetzen, dann senden.' + (window.kiPseudonym && window.kiPseudonym.letztes ? ' 🔒 ' + window.kiPseudonym.letztes.p.anzahl + ' Angaben vor dem Senden an die KI ersetzt.' : '');
        } catch (e) {
            if (e.abgebrochen) { toast('Nicht an die KI gesendet.'); return; }
            toast('Entwurf fehlgeschlagen: ' + e.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '✨ Antwort entwerfen'; }
        }
    }

    function kundeBoxZeichnen(adr, name) {
        const box = $('mv-kunde-box'); if (!box) return;
        const t = kundeZuAdresse(adr);
        if (t) {
            const quelle = t.quelle === 'domain' ? ' <span class="text-muted-sm">(über Firmen-Domain erkannt)</span>' : (t.kontakt ? ' · ' + esc(t.kontakt.name || '') : '');
            box.innerHTML = '<div class="mv-kunde ja"><span>✓</span><span class="mv-kunde-text">Im Adressbuch: <strong>' + esc(t.kunde.name) + '</strong>' + quelle + '</span>'
                + '<button class="btn-secondary" id="mv-kunde-oeffnen">Adresse öffnen</button></div>';
            $('mv-kunde-oeffnen').onclick = () => window.openAddressbookDetail && window.openAddressbookDetail(t.kunde.id);
            return;
        }
        box.innerHTML = '<div class="mv-kunde nein"><span>–</span><span class="mv-kunde-text">Absender nicht im Adressbuch.</span>'
            + '<button class="btn-secondary" id="mv-kunde-zuordnen">Zuordnen …</button></div>';
        $('mv-kunde-zuordnen').onclick = () => {
            box.innerHTML = '<div class="mv-kunde nein"><span>→</span><div class="mv-kunde-suche"><input type="text" id="mv-kunde-input" placeholder="Kunde suchen (Name, Ort, Kundennr.) …" autocomplete="off">'
                + '<div class="menu-panel" id="mv-kunde-menu" style="display:none;position:absolute;left:0;right:0;top:100%;z-index:5;"><ul class="menu-list" id="mv-kunde-liste"></ul></div></div>'
                + '<button class="btn-secondary" id="mv-kunde-abbruch">Abbrechen</button></div>';
            const inp = $('mv-kunde-input'), menu = $('mv-kunde-menu'), ul = $('mv-kunde-liste');
            $('mv-kunde-abbruch').onclick = () => kundeBoxZeichnen(adr, name);
            inp.focus();
            inp.oninput = async () => {
                const q = inp.value.trim();
                const treffer = typeof window.customerCacheSearch === 'function' ? await window.customerCacheSearch(q, 8) : [];
                ul.innerHTML = treffer.map(k => '<li data-id="' + esc(k.id) + '"><strong>' + esc(k.name) + '</strong> <span class="text-muted-sm">' + esc([k.zip_code, k.city].filter(Boolean).join(' ')) + '</span></li>').join('');
                menu.style.display = treffer.length ? '' : 'none';
            };
            ul.onclick = async e => {
                const li = e.target.closest('li[data-id]'); if (!li) return;
                await zuordnungSpeichern(adr, li.dataset.id);
                toast('Zuordnung gespeichert — ' + adr + ' gehört jetzt zu dieser Adresse.');
                kundeBoxZeichnen(adr, name);
                mailListeZeichnen();
            };
            inp.oninput();
        };
    }

    // ---------- Outlook-Kontakte ----------
    async function kontakteLaden() {
        const box = $('mv-kontakt-liste'), info = $('mv-kontakt-info');
        box.innerHTML = '<div class="mv-laden">Kontakte werden geladen … bei vielen Kontakten dauert das ein paar Sekunden.</div>';
        try {
            const alle = await window.graphAlle('/me/contacts?$top=500&$select=id,displayName,givenName,surname,companyName,jobTitle,department,emailAddresses,businessPhones,mobilePhone,businessAddress,businessHomePage,personalNotes', 10000);
            S.kontakte = alle.sort((a, b) => kName(a).localeCompare(kName(b), 'de'));
            S.kontakteGeladen = true;
            await indexBauen();
            info.textContent = S.kontakte.length + ' Kontakte in Outlook';
            kontakteZeichnen();
        } catch (e) { box.innerHTML = '<div class="mv-platzhalter">' + esc(e.message) + '</div>'; }
    }

    function kontaktStatus(k) {
        const t = kAdressen(k).map(a => kundeZuAdresse(a)).find(Boolean);
        return t && t.quelle !== 'domain' ? t : null;
    }

    function kontakteZeichnen() {
        const box = $('mv-kontakt-liste'); if (!box) return;
        const q = ($('mv-kontakt-suche').value || '').toLowerCase().trim();
        const tokens = q.split(/\s+/).filter(Boolean);
        const liste = S.kontakte.filter(k => {
            if (!tokens.length) return true;
            const text = (kName(k) + ' ' + (k.companyName || '') + ' ' + kAdressen(k).join(' ') + ' ' + ((k.businessAddress || {}).city || '')).toLowerCase();
            return tokens.every(t => text.includes(t));
        });
        if (!liste.length) { box.innerHTML = '<div class="mv-platzhalter">' + (S.kontakte.length ? 'Kein Treffer.' : 'Keine Kontakte in diesem Outlook-Konto.') + '</div>'; return; }
        let html = '', letzter = '';
        liste.slice(0, 400).forEach(k => {
            const b = kName(k)[0].toUpperCase();
            if (b !== letzter && !q) { html += '<div class="mv-buchstabe">' + esc(b) + '</div>'; letzter = b; }
            const st = kontaktStatus(k);
            html += '<div class="mv-kontakt' + (S.kontaktAktiv === k.id ? ' active' : '') + '" data-id="' + esc(k.id) + '">'
                + '<div class="mv-avatar gruen">' + esc(initialen(kName(k))) + '</div>'
                + '<div><div class="mv-n">' + esc(kName(k)) + '</div><div class="mv-f">' + esc(k.companyName || kAdressen(k)[0] || '') + '</div></div>'
                + '<span class="mv-status ' + (st ? 'da' : 'neu') + '">' + (st ? 'in Webapp' : 'nur Outlook') + '</span>'
                + '</div>';
        });
        if (liste.length > 400) html += '<div class="mv-platzhalter">… ' + (liste.length - 400) + ' weitere — Suche eingrenzen.</div>';
        box.innerHTML = html;
    }

    function kontaktOeffnen(id) {
        const k = S.kontakte.find(x => x.id === id); if (!k) return;
        S.kontaktAktiv = id;
        const kasten = $('mv-panel-kontakte'), ziel = $('mv-kontakt-detail');
        kasten.querySelectorAll('.mv-kontakt').forEach(x => x.classList.toggle('active', x.dataset.id === id));
        kasten.classList.add('zeigt-detail');
        const adr = k.businessAddress || {};
        const adrText = [adr.street, [adr.postalCode, adr.city].filter(Boolean).join(' '), adr.countryOrRegion].filter(Boolean).join(', ');
        const feld = (l, w) => w ? '<div class="mv-feld"><div class="mv-l">' + l + '</div><div class="mv-w">' + w + '</div></div>' : '';
        const st = kontaktStatus(k);
        ziel.innerHTML = '<button class="btn-secondary mv-zurueck">← Zurück</button>'
            + '<div class="mv-k-kopf"><div class="mv-avatar gruen">' + esc(initialen(kName(k))) + '</div>'
            + '<div><h2>' + esc(kName(k)) + '</h2><div class="mv-firma">' + esc([k.jobTitle, k.companyName].filter(Boolean).join(' · ')) + '</div></div></div>'
            + (st
                ? '<div class="mv-kunde ja"><span>✓</span><span class="mv-kunde-text">Schon im Adressbuch: <strong>' + esc(st.kunde.name) + '</strong></span><button class="btn-secondary" id="mv-k-oeffnen">Adresse öffnen</button></div>'
                : '<div class="mv-kunde nein"><span>–</span><span class="mv-kunde-text">Noch nicht im Adressbuch der Webapp.</span><button class="btn-primary" id="mv-k-uebernehmen">In Webapp übernehmen</button></div>')
            + '<div class="mv-k-aktionen">'
            + (kAdressen(k)[0] ? '<button class="btn-secondary" id="mv-k-mail">Mail schreiben</button>' : '')
            + (st ? '<button class="btn-secondary" id="mv-k-uebernehmen2">Trotzdem als neu übernehmen …</button>' : '')
            + '</div>'
            + '<div class="mv-felder">'
            + feld('E-Mail', kAdressen(k).map(a => '<a href="mailto:' + esc(a) + '">' + esc(a) + '</a>').join('<br>'))
            + feld('Telefon', (k.businessPhones || []).map(esc).join('<br>'))
            + feld('Mobil', esc(k.mobilePhone))
            + feld('Firma', esc(k.companyName))
            + feld('Abteilung', esc(k.department))
            + feld('Adresse', esc(adrText))
            + feld('Webseite', esc(k.businessHomePage))
            + feld('Notizen', esc(k.personalNotes))
            + '</div>'
            + '<div class="mv-k-mails"><h3>Mailverkehr <span class="mv-tab-zahl" id="mv-k-mail-zahl">…</span></h3><div id="mv-k-mails"><div class="mv-laden">Wird gesucht …</div></div></div>';
        ziel.querySelector('.mv-zurueck').onclick = () => kasten.classList.remove('zeigt-detail');
        const oeffnen = $('mv-k-oeffnen'); if (oeffnen) oeffnen.onclick = () => window.openAddressbookDetail && window.openAddressbookDetail(st.kunde.id);
        const ueb = $('mv-k-uebernehmen') || $('mv-k-uebernehmen2'); if (ueb) ueb.onclick = () => kontaktUebernehmen(k);
        const mail = $('mv-k-mail'); if (mail) mail.onclick = () => schreibenVorbelegen(kAdressen(k)[0], '');
        kontaktMailsLaden(k);
    }

    async function kontaktMailsLaden(k) {
        const box = $('mv-k-mails'), zahl = $('mv-k-mail-zahl');
        const adressen = kAdressen(k);
        if (!adressen.length) { box.innerHTML = '<div class="mv-platzhalter">Kontakt hat keine E-Mail-Adresse.</div>'; zahl.textContent = '0'; return; }
        try {
            const suche = adressen.map(a => 'from:' + a + ' OR to:' + a).join(' OR ');
            const d = await window.graphFetch('/me/messages?$search=' + encodeURIComponent('"' + suche + '"') + '&$top=50&' + MAILFELDER);
            const liste = (d.value || []).sort((a, b) => (b.receivedDateTime || '').localeCompare(a.receivedDateTime || ''));
            if (!box.isConnected) return;
            zahl.textContent = liste.length + (d['@odata.nextLink'] ? '+' : '');
            box.innerHTML = liste.length ? liste.map(m => mailZeile(m, true)).join('') : '<div class="mv-platzhalter">Noch kein Mailverkehr mit diesem Kontakt.</div>';
        } catch (e) { box.innerHTML = '<div class="mv-platzhalter">' + esc(e.message) + '</div>'; zahl.textContent = '!'; }
    }

    // Übergabe an die vorhandene Import-Vorschau des Adressbuchs (Dublettenprüfung,
    // editierbare Felder, „Übernehmen"/„Ergänzen").
    function kontaktUebernehmen(k) {
        if (typeof window.showOutlookContactImport !== 'function') { toast('Adressbuch-Import nicht verfügbar.'); return; }
        const adr = k.businessAddress || {};
        window.showOutlookContactImport({
            name: [k.givenName, k.surname].filter(Boolean).join(' ') || (k.companyName ? '' : k.displayName) || '',
            org: k.companyName || '',
            title: k.jobTitle || '',
            department: k.department || '',
            website: k.businessHomePage || '',
            email: kAdressen(k)[0] || '',
            phone: (k.businessPhones || [])[0] || '',
            mobile: k.mobilePhone || '',
            street: adr.street || '',
            zip: adr.postalCode || '',
            city: adr.city || '',
            country: adr.countryOrRegion || '',
            note: k.personalNotes || ''
        });
    }
    // Nach einer Übernahme den Index frisch bauen, damit der Kontakt als „in Webapp" erscheint.
    document.addEventListener('addressbook:changed', () => { if (S.kontakteGeladen) setTimeout(() => indexBauen().then(kontakteZeichnen), 300); });

    // ---------- Reiter „Mails" im Adressbuch ----------
    // Aufruf aus js/addressbook.js (renderMailsTab): alle Mails von/an die
    // Adressen des Kunden, live aus Outlook. Klick öffnet die Mail in der Mail-Ansicht.
    window.addressMailsRender = async function (el, adressen, kundeName) {
        if (!el) return;
        const k = window.outlookKonto && window.outlookKonto();
        if (!k) {
            el.innerHTML = '<div class="ab-empty"><div class="ab-empty-title">Outlook ist nicht verbunden</div>'
                + '<div class="ab-empty-text">Mails zu dieser Adresse erscheinen hier, sobald du unter „Mail" mit deinem Microsoft-Konto angemeldet bist.</div>'
                + '<button class="ab-btn ab-btn-ghost" data-target="mail" style="margin-top:12px;">Zur Mail-Ansicht</button></div>';
            return;
        }
        if (!adressen.length) {
            el.innerHTML = '<div class="ab-empty"><div class="ab-empty-title">Keine E-Mail-Adresse hinterlegt</div>'
                + '<div class="ab-empty-text">Trag bei der Adresse oder einem Ansprechpartner eine E-Mail ein — danach werden die Mails hier gefunden.</div></div>';
            return;
        }
        el.innerHTML = '<div class="mv-laden">Mails werden gesucht …</div>';
        try {
            await indexBauen();
            const suche = adressen.map(a => 'from:' + a + ' OR to:' + a).join(' OR ');
            const d = await window.graphFetch('/me/messages?$search=' + encodeURIComponent('"' + suche + '"') + '&$top=50&' + MAILFELDER);
            const liste = (d.value || []).sort((a, b) => (b.receivedDateTime || '').localeCompare(a.receivedDateTime || ''));
            if (!el.isConnected) return;
            el.innerHTML = '<div class="ab-mails-kopf">'
                + '<span class="text-muted-sm">' + liste.length + (d['@odata.nextLink'] ? '+' : '') + ' Mails mit ' + esc(adressen.join(', ')) + '</span>'
                + '<button class="ab-btn ab-btn-ghost" id="ab-mails-schreiben">Mail schreiben</button></div>'
                + (liste.length ? '<div class="ab-mails-liste k-mails">' + liste.map(m => mailZeile(m, true)).join('') + '</div>'
                    : '<div class="ab-empty"><div class="ab-empty-title">Noch kein Mailverkehr</div></div>');
            $('ab-mails-schreiben').onclick = () => { schliesseAdressDetail(); window.mailSchreiben(adressen[0], ''); };
            el.querySelector('.ab-mails-liste') && el.querySelector('.ab-mails-liste').addEventListener('click', e => {
                const z = e.target.closest('.mv-mail[data-id]'); if (!z) return;
                schliesseAdressDetail();
                if (typeof window.switchView === 'function') window.switchView('mail');
                tabWechseln('posteingang');
                mailOeffnen(z.dataset.id, $('mv-mail-detail'), $('mv-panel-posteingang'));
            });
        } catch (e) { el.innerHTML = '<div class="ab-empty"><div class="ab-empty-title">Fehler</div><div class="ab-empty-text">' + esc(e.message) + '</div></div>'; }
    };
    function schliesseAdressDetail() {
        if (typeof window.closeModal === 'function') { try { window.closeModal('addressbook-detail-modal'); } catch (e) { /* egal */ } }
    }

    // ---------- Schreiben ----------
    // Editor: Quill (lib/quill.min.js). Schriftarten/-größen als Inline-Stile, damit
    // Outlook sie beim Empfänger genauso zeigt. Anhänge: js-seitig gesammelt, beim
    // Senden als Entwurf + Anhang + Senden (Graph), ohne Anhang direkt per sendMail.
    let editor = null;
    let anhaenge = [];                  // { name, size, type, base64 }
    const MAX_DIREKT = 3 * 1024 * 1024; // bis hier als fileAttachment in einem Rutsch, darüber Upload-Session
    const FONTS = {
        calibri: "Calibri, Carlito, 'Segoe UI', sans-serif", arial: 'Arial, Helvetica, sans-serif',
        verdana: 'Verdana, Geneva, sans-serif', segoe: "'Segoe UI', sans-serif",
        times: "'Times New Roman', Times, serif", georgia: 'Georgia, serif', courier: "'Courier New', monospace"
    };

    function editorBauen() {
        if (editor || typeof window.Quill === 'undefined' || !$('mv-s-text')) return;
        const Font = Quill.import('attributors/style/font');
        Font.whitelist = Object.keys(FONTS);
        Quill.register(Font, true);
        const Size = Quill.import('attributors/style/size');
        Size.whitelist = ['8pt', '9pt', '10pt', '11pt', '12pt', '14pt', '16pt', '18pt', '20pt', '24pt', '28pt', '36pt'];
        Quill.register(Size, true);
        editor = new Quill('#mv-s-text', {
            theme: 'snow',
            placeholder: 'Nachricht schreiben …',
            modules: { toolbar: '#mv-s-toolbar', clipboard: { matchVisual: false } }
        });
        editor.root.setAttribute('spellcheck', 'true');
    }

    // „Von": Auswahl unter allen angemeldeten Konten wie in Outlook; Vorgabe = aktives Postfach.
    // Gesendet wird mit dem Ticket des gewählten Kontos (graphFetch(…, vonKonto())).
    function vonZeichnen() {
        const box = $('mv-s-von'); if (!box) return;
        const k = window.outlookKonto && window.outlookKonto();
        if (!k) { box.innerHTML = '<span class="text-muted-sm">nicht angemeldet</span>'; return; }
        const konten = window.outlookKonten ? window.outlookKonten() : [k];
        const bisher = $('mv-s-von-wahl') ? $('mv-s-von-wahl').value : null;
        const gewaehlt = konten.some(x => x.username === bisher) ? bisher : k.username;
        const aktiv = konten.find(x => x.username === gewaehlt) || k;
        box.innerHTML = '<div class="mv-avatar rot">' + esc(initialen(aktiv.name || aktiv.username)) + '</div>'
            + '<select id="mv-s-von-wahl" class="mv-s-von-wahl" data-no-enhance>'
            + konten.map(x => '<option value="' + esc(x.username) + '"' + (x.username === gewaehlt ? ' selected' : '') + '>'
                + esc(x.name || '') + ' <' + esc(x.username) + '>' + '</option>').join('')
            + '</select>';
        $('mv-s-von-wahl').onchange = () => {
            const x = konten.find(y => y.username === $('mv-s-von-wahl').value) || k;
            box.querySelector('.mv-avatar').textContent = initialen(x.name || x.username);
        };
    }
    function vonKonto() {
        const w = $('mv-s-von-wahl');
        const k = window.outlookKonto && window.outlookKonto();
        return (w && w.value) || (k && k.username) || null;
    }
    function ccBccZeigen(art, an) {
        $('mv-s-' + art + '-zeile').hidden = !an;
        $('mv-s-' + art + '-an').hidden = an;
        if (an) $('mv-s-' + art).focus();
    }
    function schreibenLeeren() {
        ['an', 'cc', 'bcc', 'betreff'].forEach(f => { $('mv-s-' + f).value = ''; });
        // „Von" zurück auf das aktive Postfach
        const w = $('mv-s-von-wahl'), k = window.outlookKonto && window.outlookKonto();
        if (w && k) { w.value = k.username; w.onchange && w.onchange(); }
        if (editor) editor.setContents([]);
        anhaenge = []; anhaengeZeichnen();
        ccBccZeigen('cc', false); ccBccZeigen('bcc', false);
        $('mv-s-status').textContent = '';
    }
    // zitat: { kopf, html } der Ursprungsmail (Antworten) — kommt unter die Signatur
    // entwurfHtml: vorformulierter Text (KI-Entwurf) statt der leeren Zeile oben
    function schreibenVorbelegen(an, betreff, zitat, entwurfHtml) {
        editorBauen();
        schreibenLeeren();
        $('mv-s-an').value = an || '';
        $('mv-s-betreff').value = betreff || '';
        vonZeichnen();
        tabWechseln('schreiben');
        if (editor) {
            let html = entwurfHtml || '<p><br></p>';
            const sig = window.outlookSignatur ? window.outlookSignatur() : '';
            if (sig) html += '<p><br></p>' + sig;
            if (zitat) html += '<p><br></p><p>' + esc(zitat.kopf) + '</p><blockquote>' + zitat.html + '</blockquote>';
            editor.clipboard.dangerouslyPasteHTML(html);
            editor.setSelection(0, 0);
        }
        if (an) { if (editor) editor.focus(); } else $('mv-s-an').focus();
    }
    function empfaenger(id) {
        return $(id).value.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean).map(a => ({ emailAddress: { address: a } }));
    }
    window.mailSchreiben = function (an, betreff) {
        if (typeof window.switchView === 'function') window.switchView('mail');
        schreibenVorbelegen(an, betreff);
    };

    // Editor-HTML für den Versand: Kurznamen der Schriften in echte Schriftstapel, Grundschrift Calibri 12.
    function textHtml() {
        if (!editor || (editor.getLength() <= 1 && !editor.root.querySelector('img'))) return '';
        let html = editor.root.innerHTML;
        Object.keys(FONTS).forEach(k => { html = html.split('font-family: ' + k + ';').join('font-family: ' + FONTS[k] + ';'); });
        html = html.replace(/<p><br><\/p>/g, '<p>&nbsp;</p>')
            .replace(/<blockquote>/g, '<blockquote style="border-left:3px solid #ccc;margin:0;padding-left:12px;color:#555;">');
        return '<div style="font-family: Calibri, Carlito, \'Segoe UI\', sans-serif; font-size: 12pt; line-height: 1.4;">' + html + '</div>';
    }
    function nachrichtObjekt() {
        return {
            subject: $('mv-s-betreff').value.trim(),
            body: { contentType: 'HTML', content: textHtml() },
            toRecipients: empfaenger('mv-s-an'),
            ccRecipients: empfaenger('mv-s-cc'),
            bccRecipients: empfaenger('mv-s-bcc')
        };
    }

    // ---- Anhänge ----
    function groesse(b) { return b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1024 / 1024).toFixed(1) + ' MB'; }
    function anhaengeZeichnen() {
        const box = $('mv-s-anhaenge'); if (!box) return;
        box.hidden = !anhaenge.length;
        box.innerHTML = anhaenge.map((a, i) => '<span class="mv-anhang">📎 ' + esc(a.name) + ' <span class="text-muted-sm">' + groesse(a.size) + '</span>'
            + '<button type="button" data-i="' + i + '" title="Entfernen">×</button></span>').join('');
    }
    function dateienHinzufuegen(files) {
        Array.from(files || []).forEach(f => {
            if (f.size > 25 * 1024 * 1024) { toast(f.name + ' ist größer als 25 MB — das nimmt Outlook nicht an.', 'warn'); return; }
            const r = new FileReader();
            r.onload = () => {
                anhaenge.push({ name: f.name, size: f.size, type: f.type || 'application/octet-stream', base64: String(r.result).split(',')[1] });
                anhaengeZeichnen();
            };
            r.readAsDataURL(f);
        });
    }
    async function anhaengeAnEntwurf(entwurfId, von) {
        for (const a of anhaenge) {
            const basis = '/me/messages/' + encodeURIComponent(entwurfId);
            if (a.size <= MAX_DIREKT) {
                await window.graphFetch(basis + '/attachments', 'POST', {
                    '@odata.type': '#microsoft.graph.fileAttachment', name: a.name, contentType: a.type, contentBytes: a.base64
                }, von);
                continue;
            }
            // Große Datei: Upload-Session in Stücken (Graph verlangt Vielfache von 320 KiB)
            const session = await window.graphFetch(basis + '/attachments/createUploadSession', 'POST', {
                AttachmentItem: { attachmentType: 'file', name: a.name, size: a.size, contentType: a.type }
            }, von);
            const bytes = Uint8Array.from(atob(a.base64), c => c.charCodeAt(0));
            const STUECK = 320 * 1024 * 10;
            for (let start = 0; start < bytes.length; start += STUECK) {
                const ende = Math.min(start + STUECK, bytes.length);
                const res = await fetch(session.uploadUrl, {
                    method: 'PUT',
                    headers: { 'Content-Range': 'bytes ' + start + '-' + (ende - 1) + '/' + bytes.length, 'Content-Type': 'application/octet-stream' },
                    body: bytes.slice(start, ende)
                });
                if (!res.ok) throw new Error('Anhang „' + a.name + '" konnte nicht hochgeladen werden (HTTP ' + res.status + ').');
            }
        }
    }

    // Entwurf in Outlook anlegen (Mail.ReadWrite) und dort öffnen — mit Empfängern,
    // Betreff, formatiertem Text und Anhängen. „Von" ist das angemeldete Postfach.
    async function inOutlookOeffnen() {
        const st = $('mv-s-status'), btn = $('mv-s-outlook');
        const n = nachrichtObjekt(), von = vonKonto();
        if (!n.subject && !n.body.content && !n.toRecipients.length) { st.textContent = 'Nichts zum Öffnen — erst etwas schreiben.'; return; }
        btn.disabled = true; st.textContent = 'Entwurf wird in Outlook angelegt …';
        try {
            const entwurf = await window.graphFetch('/me/messages', 'POST', n, von);
            if (anhaenge.length) { st.textContent = 'Anhänge werden übertragen …'; await anhaengeAnEntwurf(entwurf.id, von); }
            const fenster = window.open(entwurf.webLink, '_blank', 'noopener');
            schreibenLeeren();
            st.textContent = fenster
                ? 'In Outlook geöffnet — der Entwurf liegt auch im Ordner „Entwürfe" deines Postfachs.'
                : 'Entwurf liegt im Ordner „Entwürfe" in Outlook (Popup wurde blockiert).';
        } catch (e) {
            st.textContent = /403|Forbidden|Access is denied/i.test(e.message)
                ? 'Dafür fehlt noch die Berechtigung „Mail.ReadWrite" — einmal abmelden und neu anmelden, dann bestätigen.'
                : 'Fehler: ' + e.message;
        } finally { btn.disabled = false; }
    }

    async function mailSenden() {
        const st = $('mv-s-status'), btn = $('mv-s-senden');
        const n = nachrichtObjekt(), von = vonKonto();
        if (!n.toRecipients.length && !n.ccRecipients.length && !n.bccRecipients.length) { st.textContent = 'Bitte mindestens einen Empfänger eintragen.'; return; }
        const alle = n.toRecipients.concat(n.ccRecipients, n.bccRecipients).map(r => r.emailAddress.address);
        btn.disabled = true; st.textContent = 'Wird gesendet …';
        try {
            if (!anhaenge.length) {
                await window.graphFetch('/me/sendMail', 'POST', { message: n, saveToSentItems: true }, von);
            } else {
                // Mit Anhängen: Entwurf → Anhänge → Senden (so gehen auch große Dateien)
                const entwurf = await window.graphFetch('/me/messages', 'POST', n, von);
                st.textContent = 'Anhänge werden übertragen …';
                await anhaengeAnEntwurf(entwurf.id, von);
                st.textContent = 'Wird gesendet …';
                await window.graphFetch('/me/messages/' + encodeURIComponent(entwurf.id) + '/send', 'POST', null, von);
            }
            schreibenLeeren();
            st.textContent = 'Gesendet von ' + von + ' an ' + alle.join(', ') + ' — liegt in dessen „Gesendete Elemente".';
            toast('E-Mail versendet an ' + alle.join(', '), 'success');
            if (S.ordner === 'sentitems' && von === eigeneAdresse()) posteingangLaden(false);
        } catch (e) { st.textContent = 'Fehler: ' + e.message; toast('Senden fehlgeschlagen: ' + e.message, 'error'); }
        finally { btn.disabled = false; }
    }

    // ---------- Verdrahtung ----------
    document.addEventListener('DOMContentLoaded', function () {
        const sec = $('mail'); if (!sec) return;
        sec.querySelectorAll('.mv-tab').forEach(b => b.addEventListener('click', () => tabWechseln(b.dataset.tab)));
        $('mv-btn-anmelden').addEventListener('click', async () => {
            try { await window.outlookAnmelden(); }
            catch (e) { toast('Anmeldung fehlgeschlagen: ' + e.message); }
        });
        $('mv-mail-reload').addEventListener('click', () => posteingangLaden(false));
        sec.querySelectorAll('.mv-ordner button[data-ordner]').forEach(b => b.addEventListener('click', () => {
            if (S.ordner === b.dataset.ordner) return;
            S.ordner = b.dataset.ordner;
            sec.querySelectorAll('.mv-ordner button').forEach(x => x.classList.toggle('active', x === b));
            S.mailAktiv = null;
            $('mv-mail-detail').innerHTML = '<div class="mv-platzhalter">Mail auswählen</div>';
            $('mv-panel-posteingang').classList.remove('zeigt-detail');
            posteingangLaden(false);
        }));
        $('mv-mail-mehr-btn').addEventListener('click', () => posteingangLaden(true));
        $('mv-mail-suche').addEventListener('input', mailListeZeichnen);
        $('mv-mail-liste').addEventListener('click', e => {
            const z = e.target.closest('.mv-mail[data-id]'); if (z) mailOeffnen(z.dataset.id, $('mv-mail-detail'), $('mv-panel-posteingang'));
        });
        $('mv-kontakt-reload').addEventListener('click', kontakteLaden);
        $('mv-kontakt-suche').addEventListener('input', kontakteZeichnen);
        $('mv-kontakt-liste').addEventListener('click', e => {
            const z = e.target.closest('.mv-kontakt[data-id]'); if (z) kontaktOeffnen(z.dataset.id);
        });
        $('mv-kontakt-detail').addEventListener('click', e => {
            const z = e.target.closest('.mv-mail[data-id]'); if (!z) return;
            // Mail aus dem Kontakt-Verlauf im Posteingang-Reiter öffnen
            tabWechseln('posteingang');
            mailOeffnen(z.dataset.id, $('mv-mail-detail'), $('mv-panel-posteingang'));
        });
        $('mv-s-senden').addEventListener('click', mailSenden);
        // Knöpfe mit data-target in diesem Modul (Einrichten…, Zur Mail-Ansicht) — app-init
        // verdrahtet nur Sidebar, Einstellungs-Karten und Zurück-Knöpfe.
        document.addEventListener('click', e => {
            const b = e.target.closest('#mail button[data-target], .ab-mails-tab button[data-target]');
            if (!b || typeof window.switchView !== 'function') return;
            if (b.closest('.ab-mails-tab')) schliesseAdressDetail();
            window.switchView(b.dataset.target);
        });
        $('mv-s-leeren').addEventListener('click', schreibenLeeren);
        $('mv-s-outlook').addEventListener('click', inOutlookOeffnen);
        // Editor erst beim ersten Öffnen des Reiters bauen (Quill misst Breiten — im versteckten Panel geht das schief)
        sec.querySelector('.mv-tab[data-tab="schreiben"]').addEventListener('click', () => { editorBauen(); vonZeichnen(); });
        // Anhänge: Knopf, Dateiauswahl, Drag & Drop auf die Schreibfläche, Entfernen
        $('mv-s-anhang-btn').addEventListener('click', () => $('mv-s-anhang-input').click());
        $('mv-s-anhang-input').addEventListener('change', e => { dateienHinzufuegen(e.target.files); e.target.value = ''; });
        // Angebot/Dokument aus der App (js/mail-anhang-app.js) — Kunde aus dem ersten Empfänger
        window.mailDateienHinzufuegen = dateienHinzufuegen;
        const appBtn = $('mv-s-anhang-app-btn');
        if (appBtn) appBtn.addEventListener('click', async () => {
            if (typeof window.mailAnhangAusApp !== 'function') { toast('Modul nicht geladen.', 'error'); return; }
            try { await indexBauen(); } catch (e) { /* ohne Kundenerkennung weiter */ }
            const adr = (($('mv-s-an') || {}).value || '').split(/[,;]/)[0].replace(/.*</, '').replace(/>.*/, '').trim();
            const t = adr ? kundeZuAdresse(adr) : null;
            window.mailAnhangAusApp({ kunde: t && t.kunde ? { id: t.kunde.id, name: t.kunde.name } : null });
        });
        $('mv-s-anhaenge').addEventListener('click', e => {
            const b = e.target.closest('button[data-i]'); if (!b) return;
            anhaenge.splice(Number(b.dataset.i), 1); anhaengeZeichnen();
        });
        const wrap = $('mv-s-editor-wrap');
        ['dragenter', 'dragover'].forEach(ev => wrap.addEventListener(ev, e => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); wrap.classList.add('drop'); } }));
        ['dragleave', 'drop'].forEach(ev => wrap.addEventListener(ev, () => wrap.classList.remove('drop')));
        wrap.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); dateienHinzufuegen(e.dataTransfer.files); } });
        // Signatur an der Cursorposition einfügen
        $('mv-s-signatur-btn').addEventListener('click', () => {
            const sig = window.outlookSignatur ? window.outlookSignatur() : '';
            if (!editor) return;
            if (!sig) { toast('Noch keine Signatur hinterlegt — Einstellungen → Outlook.', 'info'); return; }
            const pos = editor.getSelection(true) ? editor.getSelection(true).index : editor.getLength();
            editor.clipboard.dangerouslyPasteHTML(pos, '<p><br></p>' + sig);
        });
        $('mv-s-cc-an').addEventListener('click', () => ccBccZeigen('cc', true));
        $('mv-s-bcc-an').addEventListener('click', () => ccBccZeigen('bcc', true));
        document.addEventListener('outlook:status', vonZeichnen);
        vonZeichnen();
        // Vollbild wie bei der Timeline: Menü und Kopfleiste weg, Esc beendet
        $('mv-vollbild').addEventListener('click', () => document.body.classList.toggle('mv-vollbild'));
        document.addEventListener('keydown', e => { if (e.key === 'Escape') document.body.classList.remove('mv-vollbild'); });
        // Ansicht verlassen → Vollbild aufheben
        document.addEventListener('click', e => { const a = e.target.closest('[data-target]'); if (a && a.dataset.target !== 'mail') document.body.classList.remove('mv-vollbild'); });
        kontoAnzeigen();
    });
})();
