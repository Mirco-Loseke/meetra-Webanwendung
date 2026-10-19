// ==========================================
// ENTWÜRFE IN ALLEN FENSTERN — NICHTS GEHT VERLOREN
// ==========================================
// Gilt für jedes Fenster (Element mit id „…-modal“ bzw. .modal-new /
// .modal-backdrop): jede Eingabe liegt sofort in localStorage, je Fenster
// und Datensatz (verstecktes Feld „…-id“ im Fenster, sonst „neu“).
// Wird ein Fenster wieder geöffnet und weicht der Inhalt vom Entwurf ab
// (Absturz, Neuladen, Abbrechen, Akku leer), erscheint oben eine Leiste
// „Wiederherstellen / Verwerfen“. Überschrieben wird nie ungefragt.
// Nach Klick auf einen Speichern-Knopf und anschließendem Schließen wird
// der Entwurf gelöscht.
// Datenbank-Live-Speichern bleibt Sache der Module (addressbook-live,
// task-autosave, process-autosave, vorgang-sicher); dies ist die
// Sicherung darunter für alle übrigen Fenster.
(function () {
    'use strict';

    const KEY = 'meetra_entwurf_fenster';
    const MAX_ALTER = 14 * 24 * 3600 * 1000;
    const MODAL_SEL = '[id$="-modal"], .modal-new, .modal-backdrop';
    // Eigene Entwurfslogik / nicht sinnvoll:
    const AUSNAHMEN = ['login-modal', 'globale-suche-modal'];

    function lesen() {
        try {
            const o = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
            const jetzt = Date.now();
            Object.keys(o).forEach(k => { if (!o[k] || jetzt - (o[k].at || 0) > MAX_ALTER) delete o[k]; });
            return o;
        } catch (e) { return {}; }
    }
    function schreiben(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* voll/gesperrt */ } }

    function fensterVon(node) {
        const m = node && node.closest ? node.closest(MODAL_SEL) : null;
        if (!m || !m.id || AUSNAHMEN.indexOf(m.id) !== -1) return null;
        return m;
    }
    function sichtbar(m) {
        return !m.classList.contains('hidden') && getComputedStyle(m).display !== 'none';
    }
    function datensatz(m) {
        const f = Array.from(m.querySelectorAll('input[type="hidden"][id$="-id"]')).find(x => x.value);
        return f ? f.value : 'neu';
    }
    function schluessel(m) { return m.id + '|' + datensatz(m); }

    function feldName(f) { return f.id || f.name || ''; }
    function erfassbar(f) {
        if (!f || !feldName(f) || f.disabled || f.readOnly) return false;
        if (f.closest('[data-no-entwurf], .ql-editor')) return false;
        if (f.tagName === 'TEXTAREA' || f.tagName === 'SELECT') return true;
        if (f.tagName !== 'INPUT') return false;
        return ['password', 'file', 'hidden', 'search', 'button', 'submit'].indexOf((f.type || 'text').toLowerCase()) === -1;
    }
    function wert(f) { return (f.type === 'checkbox' || f.type === 'radio') ? !!f.checked : f.value; }
    function setzen(f, v) {
        if (f.type === 'checkbox' || f.type === 'radio') f.checked = !!v; else f.value = v;
        f.dispatchEvent(new Event('input', { bubbles: true }));
        f.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function feldFinden(m, name) {
        return m.querySelector('#' + CSS.escape(name)) || m.querySelector('[name="' + CSS.escape(name) + '"]');
    }

    // ---------- Merken ----------
    function merken(e) {
        const f = e.target;
        if (!erfassbar(f)) return;
        const m = fensterVon(f);
        if (!m) return;
        const o = lesen();
        const k = schluessel(m);
        const d = o[k] || { felder: {} };
        d.felder[feldName(f)] = wert(f);
        d.at = Date.now();
        o[k] = d;
        schreiben(o);
        gespeichertGeklickt.delete(m.id);
    }

    // ---------- Speichern-Klick → beim Schließen Entwurf löschen ----------
    const gespeichertGeklickt = new Map();
    function speichernKlick(e) {
        const b = e.target.closest && e.target.closest('button, [role="button"]');
        if (!b) return;
        const m = fensterVon(b);
        if (!m) return;
        const t = (b.textContent || '').toLowerCase();
        const istSpeichern = b.type === 'submit' || b.classList.contains('btn-primary')
            || /speicher|anlegen|erstellen|eintragen|übernehmen|senden|fertig/.test(t);
        if (istSpeichern) gespeichertGeklickt.set(m.id, { at: Date.now(), k: schluessel(m) });
    }

    // ---------- Öffnen / Schließen beobachten ----------
    const zustand = new WeakMap();
    function beobachten(m) {
        if (zustand.has(m) || !m.id || AUSNAHMEN.indexOf(m.id) !== -1) return;
        zustand.set(m, sichtbar(m));
        new MutationObserver(() => {
            const jetzt = sichtbar(m);
            if (jetzt === zustand.get(m)) return;
            zustand.set(m, jetzt);
            if (jetzt) setTimeout(() => anbieten(m), 500); // Öffner füllt erst die Felder
            else geschlossen(m);
        }).observe(m, { attributes: true, attributeFilter: ['class', 'style'] });
    }
    function geschlossen(m) {
        const g = gespeichertGeklickt.get(m.id);
        if (g && Date.now() - g.at < 8000) {
            const o = lesen(); delete o[g.k]; delete o[schluessel(m)]; schreiben(o);
        }
        gespeichertGeklickt.delete(m.id);
        const alt = m.querySelector('.entwurf-leiste');
        if (alt) alt.remove();
    }
    function anbieten(m) {
        if (!sichtbar(m)) return;
        const o = lesen();
        const k = schluessel(m);
        const d = o[k];
        if (!d) return;
        const abweichend = Object.keys(d.felder).filter(n => {
            const f = feldFinden(m, n);
            return f && erfassbar(f) && String(wert(f)) !== String(d.felder[n]) && String(d.felder[n]).trim() !== '';
        });
        if (!abweichend.length) { delete o[k]; schreiben(o); return; }
        if (m.querySelector('.entwurf-leiste')) return;

        const zeit = new Date(d.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const leiste = document.createElement('div');
        leiste.className = 'entwurf-leiste';
        leiste.innerHTML = '<span>Ungespeicherte Eingaben vom ' + zeit + ' (' + abweichend.length
            + (abweichend.length === 1 ? ' Feld' : ' Felder') + ')</span>'
            + '<button type="button" class="entwurf-ja">Wiederherstellen</button>'
            + '<button type="button" class="entwurf-nein">Verwerfen</button>';
        leiste.querySelector('.entwurf-ja').addEventListener('click', () => {
            abweichend.forEach(n => { const f = feldFinden(m, n); if (f) setzen(f, d.felder[n]); });
            leiste.remove();
        });
        leiste.querySelector('.entwurf-nein').addEventListener('click', () => {
            const o2 = lesen(); delete o2[k]; schreiben(o2);
            leiste.remove();
        });
        const ziel = m.querySelector('.modal-content, .modal-body, form') || m;
        ziel.insertBefore(leiste, ziel.firstChild);
    }

    // Für den Ungespeichert-Dialog („Verwerfen“): Entwürfe aller gerade offenen Fenster löschen.
    window.entwurfSichtbareVerwerfen = function () {
        const o = lesen();
        document.querySelectorAll(MODAL_SEL).forEach(m => { if (m.id && sichtbar(m)) delete o[schluessel(m)]; });
        schreiben(o);
    };

    document.addEventListener('DOMContentLoaded', function () {
        document.addEventListener('input', merken, true);
        document.addEventListener('change', merken, true);
        document.addEventListener('click', speichernKlick, true);
        document.querySelectorAll(MODAL_SEL).forEach(beobachten);
        // Später eingefügte Fenster (Partials, JS-gebaute) mit erfassen.
        new MutationObserver(list => {
            list.forEach(r => r.addedNodes.forEach(n => {
                if (n.nodeType !== 1) return;
                if (n.matches && n.matches(MODAL_SEL)) beobachten(n);
                if (n.querySelectorAll) n.querySelectorAll(MODAL_SEL).forEach(beobachten);
            }));
        }).observe(document.body, { childList: true, subtree: true });
    });
})();
