// ==========================================
// NICHTS VERLIEREN — Sicherheitsnetz über alle Fenster und Ansichten
// ==========================================
// Ergänzt entwurf-sicher.js (lokale Entwürfe), autosave.js (Datenbank) und die
// Rückfragen der einzelnen Fenster um das, was dort fehlte:
//   1) Vor jedem Ansichtswechsel (Menü, Link zu Angebot/Maschine, Zurück-Taste,
//      Tabwechsel, Neuladen) wird das aktive Feld verlassen (damit seine
//      Speicher-beim-Verlassen-Logik läuft) und jedes Auto-Speichern weggeschrieben.
//   2) Frei bearbeitbare Textstellen (contenteditable) sind „ungespeichert“,
//      solange darin getippt und das Feld noch nicht verlassen wurde.
//   3) Fotos, Dateien und Unterschriften in einem Fenster (die nicht in den
//      lokalen Entwurf passen) zählen als ungespeichert, bis gespeichert wird.
//   4) Zurück-Taste und Ansichtswechsel bei ungespeichertem Fensterinhalt:
//      Rückfrage Speichern / Entwurf / Verwerfen. Reine Auto-Speicher-Fenster
//      (Adresse, Vorgang, Aufgabe) werden ohne Rückfrage einfach gespeichert.
// Keine eigenen Datenbankabfragen — nur das, was die Module ohnehin schreiben.
// RÜCKGÄNGIG: Zeile in index.html und sw.js entfernen.
(function () {
    'use strict';

    const MODAL_SEL = '[id$="-modal"], .modal-new, .modal-backdrop';
    const dialogDa = () => !!document.getElementById('nichts-verlieren-dialog');

    function sichtbar(m) {
        return !!m && !m.classList.contains('hidden') && getComputedStyle(m).display !== 'none'
            && (!m.classList.contains('modal-backdrop') || m.classList.contains('show') || m.classList.contains('active') || getComputedStyle(m).opacity > 0.5);
    }
    function fensterVon(n) { const m = n && n.closest ? n.closest(MODAL_SEL) : null; return m && m.id ? m : null; }
    function offeneFenster() { return Array.from(document.querySelectorAll(MODAL_SEL)).filter(m => m.id && sichtbar(m)); }

    // ---------- 1) Wegschreiben ----------
    function wegschreiben() {
        try {
            const a = document.activeElement;
            if (a && a !== document.body && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) a.blur();
        } catch (e) { /* egal */ }
        (window._autosaves || []).forEach(h => { try { if (h.id) h.flush(); } catch (e) { /* egal */ } });
    }
    window.nichtsVerlierenWegschreiben = wegschreiben;

    // ---------- Änderungserkennung: Vorher/Nachher ----------
    // Als „geändert“ gilt nur, was sich gegenüber dem Stand beim ERSTEN echten
    // Bedienen des Fensters (Klick/Taste/Fokus durch den Nutzer) unterscheidet.
    // Was die App selbst einträgt (Daten laden, Entwurf wiederherstellen), bevor
    // man etwas anfasst, zählt nie — und wer nur klickt oder etwas ändert und
    // zurücksetzt, wird nicht gefragt.
    const zustand = new WeakMap();   // Fenster -> { basis: Map }
    function feldSchluessel(f) { return f.id || f.name || ''; }
    function erfassbar(f) {
        if (!f || !feldSchluessel(f) || f.disabled) return false;
        if (f.closest('.ql-editor, [data-no-entwurf]')) return false;
        if (f.tagName === 'TEXTAREA' || f.tagName === 'SELECT') return true;
        return f.tagName === 'INPUT' && ['password', 'file', 'hidden', 'search', 'button', 'submit'].indexOf((f.type || 'text').toLowerCase()) === -1;
    }
    function wertVon(f) { return (f.type === 'checkbox' || f.type === 'radio') ? (f.checked ? '1' : '0') : String(f.value); }
    function aufnahme(m) {
        const k = new Map();
        m.querySelectorAll('input, textarea, select').forEach(f => { if (erfassbar(f)) k.set(feldSchluessel(f), wertVon(f)); });
        // Bilder und Listeneinträge, die nicht in einem Feld stehen (Fotos, Zeilen, Anhänge)
        k.set('#bilder', Array.from(m.querySelectorAll('img[src]')).map(i => (i.getAttribute('src') || '').slice(0, 80)).join('|'));
        k.set('#eintraege', String(m.querySelectorAll('[class*="photo"], [class*="foto"], [class*="attach"], [class*="anhang"], [class*="file-item"], [class*="step-row"], [class*="schritt"]').length));
        return k;
    }
    function geaendert(m) {
        const z = zustand.get(m);
        if (!z || !z.basis) return false;
        const jetzt = aufnahme(m);
        for (const [k, v] of jetzt) { if (z.basis.has(k) ? z.basis.get(k) !== v : (v !== '' && v !== '0')) return true; }
        return false;
    }
    function ersteBedienung(e) {
        if (!e.isTrusted) return;
        const m = fensterVon(e.target);
        if (!m || !sichtbar(m)) return;
        let z = zustand.get(m);
        if (!z) { z = { basis: null }; zustand.set(m, z); }
        if (!z.basis) z.basis = aufnahme(m);
    }
    ['pointerdown', 'keydown', 'focusin'].forEach(t => document.addEventListener(t, ersteBedienung, true));
    // Trägt die App selbst etwas ein, ist das der neue Ausgangsstand
    ['input', 'change'].forEach(t => document.addEventListener(t, e => {
        if (e.isTrusted) return;
        const f = e.target, m = fensterVon(f), z = m && zustand.get(m);
        if (z && z.basis && erfassbar(f)) z.basis.set(feldSchluessel(f), wertVon(f));
    }, true));

    // contenteditable: nur wenn der Text wirklich anders ist als beim Fokussieren
    let ceEl = null, ceVorher = '';
    document.addEventListener('focusin', e => {
        const t = e.target;
        if (t && t.isContentEditable && !(t.closest && t.closest('.ql-editor'))) { ceEl = t; ceVorher = t.innerText; }
    }, true);
    document.addEventListener('focusout', e => { if (e.target === ceEl) setTimeout(() => { ceEl = null; }, 400); }, true);
    const ceGeaendert = () => !!(ceEl && ceEl.isConnected && ceEl.innerText !== ceVorher);

    // ---------- 3) Fotos / Dateien / Unterschriften (nur echte Handlungen) ----------
    const extras = new Set();          // IDs von Fenstern mit Foto/Datei/Unterschrift seit dem letzten Speichern
    document.addEventListener('change', e => {
        const t = e.target;
        if (e.isTrusted && t && t.tagName === 'INPUT' && t.type === 'file' && t.files && t.files.length) { const m = fensterVon(t); if (m) extras.add(m.id); }
    }, true);
    document.addEventListener('pointerup', e => {
        const c = e.target && e.target.tagName === 'CANVAS' ? e.target : null;
        if (e.isTrusted && c && /sign|unterschr/i.test((c.id || '') + (c.className || ''))) { const m = fensterVon(c); if (m) extras.add(m.id); }
    }, true);
    document.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('button, [role="button"]');
        if (!b) return;
        const m = fensterVon(b);
        if (!m) return;
        const t = (b.textContent || '').toLowerCase();
        if (b.type === 'submit' || /speicher|anlegen|erstellen|eintragen|übernehmen|senden|fertig/.test(t)) {
            setTimeout(() => { extras.delete(m.id); const z = zustand.get(m); if (z && sichtbar(m)) z.basis = aufnahme(m); }, 1500);
        }
    }, true);
    // Fenster zu → Zustand vergessen
    new MutationObserver(() => {
        extras.forEach(id => { const m = document.getElementById(id); if (!m || !sichtbar(m)) extras.delete(id); });
        document.querySelectorAll(MODAL_SEL).forEach(m => { if (zustand.has(m) && !sichtbar(m)) zustand.delete(m); });
    }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class', 'style'] });

    function extrasOffen() { return Array.from(extras).some(id => sichtbar(document.getElementById(id))); }
    // Wirklich etwas Neues im Spiel? (Felder verändert, Foto/Datei/Unterschrift, Text getippt)
    function wirklichGeaendert() {
        return ceGeaendert() || extrasOffen() || offeneFenster().some(geaendert);
    }
    window.nichtsVerlierenGeaendert = wirklichGeaendert;
    if (typeof window.registerUnsavedCheck === 'function') window.registerUnsavedCheck(wirklichGeaendert);

    // ---------- 4) Rückfrage ----------
    function speichernVersuchen() {
        wegschreiben();
        const m = offeneFenster().pop();
        if (!m) return;
        const knopf = Array.from(m.querySelectorAll('button')).find(b => !b.disabled && b.offsetParent && (b.type === 'submit' || /speicher/i.test(b.textContent || '')));
        if (knopf) knopf.click();
    }
    function fragen(weiter) {
        if (dialogDa() || typeof window.showUnsavedDialog !== 'function') { weiter(); return; }
        const fertig = fn => () => fn();
        window.showUnsavedDialog({
            overlayId: 'nichts-verlieren-dialog',
            onDiscard: fertig(weiter),
            onSave: fertig(() => { speichernVersuchen(); setTimeout(weiter, 400); })
        });
    }
    function brauchtRueckfrage() {
        return typeof window.hasUnsavedChanges === 'function' && window.hasUnsavedChanges();
    }

    // Ansichtswechsel aus der App heraus (Menü, „Angebot öffnen“, …)
    function switchViewUmhuellen() {
        const o = window.switchView;
        if (typeof o !== 'function' || o._nv) return;
        const w = function (id) {
            const args = arguments, self = this;
            wegschreiben();
            if (dialogDa()) return;
            const ziel = String(id || '');
            const aktuell = (location.hash || '#home').slice(1);
            if (ziel && ziel !== aktuell && brauchtRueckfrage()) {
                fragen(() => o.apply(self, args));
                return;
            }
            return o.apply(self, args);
        };
        w._nv = true;
        window.switchView = w;
    }

    // Zurück-/Vorwärts-Taste des Browsers
    let zurueckBis = 0;   // bis wann ein von uns ausgelöstes popstate durchgelassen wird
    window.addEventListener('popstate', () => {
        if (Date.now() < zurueckBis) { zurueckBis = 0; return; }
        wegschreiben();
        if (!brauchtRueckfrage() || dialogDa()) return;
        zurueckBis = Date.now() + 600;
        history.go(1);   // an Ort und Stelle bleiben, bis entschieden ist
        setTimeout(() => {
            fragen(() => { zurueckBis = Date.now() + 600; history.go(-1); });
        }, 80);
    });

    // Tab im Hintergrund / Seite wird verlassen
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') wegschreiben(); });
    window.addEventListener('pagehide', wegschreiben);
    // Links in der Menüleiste: erst wegschreiben, dann navigieren
    document.addEventListener('click', e => {
        if (e.target.closest && e.target.closest('.nav-link, a[href^="#"]')) wegschreiben();
    }, true);

    // Die Rückfragen der einzelnen Fenster (und die Browser-Warnung) kommen nur noch,
    // wenn wirklich etwas geändert wurde. Nur Klicken oder Ändern-und-Zurücksetzen: keine Frage.
    function rueckfragenEntschaerfen() {
        if (typeof window.showUnsavedDialog === 'function' && !window.showUnsavedDialog._nv) {
            const o = window.showUnsavedDialog;
            const w = function (cfg) {
                if (offeneFenster().length && cfg && cfg.overlayId !== 'nichts-verlieren-dialog' && !wirklichGeaendert()) {
                    if (typeof cfg.onDiscard === 'function') cfg.onDiscard();
                    return;
                }
                return o.apply(this, arguments);
            };
            w._nv = true;
            window.showUnsavedDialog = w;
        }
        if (typeof window.hasUnsavedChanges === 'function' && !window.hasUnsavedChanges._nv) {
            const o = window.hasUnsavedChanges;
            const w = function () {
                const r = o.apply(this, arguments);
                if (!r) return false;
                // Ein Fenster ist offen: dann zählt nur der echte Vorher/Nachher-Vergleich
                if (offeneFenster().length) return wirklichGeaendert();
                return r;
            };
            w._nv = true;
            window.hasUnsavedChanges = w;
        }
    }
    rueckfragenEntschaerfen();

    document.addEventListener('DOMContentLoaded', () => { rueckfragenEntschaerfen(); switchViewUmhuellen(); setTimeout(switchViewUmhuellen, 1500); });
    switchViewUmhuellen();
})();
