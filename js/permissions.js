// ==========================================
// BENUTZER-BERECHTIGUNGEN
// ==========================================
// Ausgelagert aus index.html (erster Schritt beim Aufteilen der Datei).
//
// Zwei Dinge:
//   window.canDelete(was)            -> darf gelöscht werden?
//   window.applyUserPermissions(u)   -> Sidebar/Karten nach Rechten ein-/ausblenden
//
// Beide hängen nur am DOM und am übergebenen Benutzer — keine weiteren
// Abhängigkeiten außer window.switchView.
// ==========================================
(function () {
    'use strict';

    // Wenn für einen Benutzer nichts hinterlegt ist, ist alles erlaubt.
    const DEFAULT_PERMS = {
        home: true, tasks: true, machines: true, history: true,
        accounting: true, settings: true, can_delete: true
    };

    // Berechtigungen eines Benutzers auslesen. Sie liegen je nach Setup als
    // Objekt oder als JSON-String vor.
    function readPerms(user) {
        let perms = user ? user.permissions : null;
        if (typeof perms === 'string') {
            try { perms = JSON.parse(perms); } catch (e) { perms = null; }
        }
        return (typeof perms === 'object' && perms !== null) ? perms : null;
    }

    // =========================================================
    // LÖSCH-BEREICHE (feingranular)
    // =========================================================
    // Jeder Eintrag: Schlüssel, Beschriftung im Benutzer-Modal und die exakten
    // Texte, wie sie an window.canDelete(...) übergeben werden.
    // Der Schlüssel landet als "del_<key>" in user.permissions.
    // Fehlt der Schlüssel, ist Löschen erlaubt — Altbestände bleiben unverändert.
    // Neue Löschstelle gebaut? Hier eintragen, sonst greift nur der Hauptschalter.
    window.DELETE_AREAS = [
        { key: 'adressen', label: 'Adressen', what: ['Adressen'] },
        { key: 'ansprechpartner', label: 'Ansprechpartner', what: ['Ansprechpartnern'] },
        { key: 'verknuepfungen', label: 'Verknüpfungen', what: ['Verknüpfungen'] },
        { key: 'maschinen', label: 'Maschinen', what: ['Maschinen'] },
        // Zwei getrennte Verläufe, die vorher beide „Historien-Einträge" hießen:
        // die Historie einer MASCHINE (js/history-modal.js) und der Verlauf an
        // einer ADRESSE (customer_notes, js/addressbook.js).
        { key: 'historie', label: 'Historie einer Maschine (manuelle Einträge, Serviceberichte, Protokolle)', what: ['Historien-Einträgen'] },
        { key: 'adress_historie', label: 'Historie einer Adresse', what: ['Adress-Einträgen'] },
        { key: 'buchungen', label: 'Buchungen', what: ['Buchungen'] },
        { key: 'kategorien', label: 'Kategorien', what: ['Kategorien'] },
        // Kalendertermine und Termine an einer Adresse liegen beide in
        // maintenance_events — ein Bereich für beides.
        { key: 'termine', label: 'Termine (Kalender + Adresse)', what: ['Terminen'] },
        { key: 'dokumente', label: 'Dokumente', what: ['Dokumenten'] },
        { key: 'ordner', label: 'Ordner', what: ['Ordnern'] },
        { key: 'notizen', label: 'Notizen', what: ['Notizen'] },
        { key: 'angebote', label: 'Angebote', what: ['Angeboten'] },
        { key: 'vorgaenge', label: 'Vorgänge', what: ['Vorgängen'] },
        { key: 'schritte', label: 'Vorgangs-Schritte', what: ['Schritten'] },
        { key: 'stand', label: 'Stand-Einträge', what: ['Stand-Einträgen'] },
        { key: 'erinnerungen', label: 'Erinnerungen', what: ['Erinnerungen'] },
        { key: 'protokolle', label: 'Protokolle (Eingang, Abnahme)', what: ['Protokollen'] },
        { key: 'pruefpunkte', label: 'Prüfpunkte', what: ['Prüfpunkten'] },
        { key: 'fotos', label: 'Fotos', what: ['Fotos'] },
        { key: 'wartungsplaene', label: 'Wartungspläne', what: ['Wartungsplänen'] },
        { key: 'aufgaben', label: 'Aufgaben', what: ['Aufgaben'] },
        { key: 'unteraufgaben', label: 'Unteraufgaben', what: ['Unteraufgaben'] },
        { key: 'werkstatt', label: 'Werkstatt-Einträge', what: ['Werkstatt-Einträgen'] },
        { key: 'rechnungen', label: 'Rechnungsliste', what: ['Rechnungs-Einträgen'] },
        { key: 'mietvereinbarungen', label: 'Mietvereinbarungen', what: ['Mietvereinbarungen'] },
        // Abwesenheiten (Urlaub/Krank) werden in der Timeline gepflegt (js/timeline-view.js).
        { key: 'abwesenheiten', label: 'Abwesenheiten (Timeline)', what: ['Abwesenheiten'] },
        { key: 'benutzer', label: 'Benutzer', what: ['Benutzern'] }
    ];

    // Beschriftung -> Bereich (einmalig aufgebaut)
    const AREA_BY_WHAT = (function () {
        const map = new Map();
        window.DELETE_AREAS.forEach(function (a) {
            a.what.forEach(function (w) { map.set(w, a); });
        });
        return map;
    })();

    // Stille Prüfung ohne Meldung — für das Ein-/Ausblenden von Knöpfen.
    // bereich = Schlüssel aus DELETE_AREAS (z. B. 'historie'), leer = nur der
    // Hauptschalter. Gleiche Regel wie canDelete(), nur ohne Toast.
    window.canDeleteArea = function (bereich) {
        const perms = readPerms(window.activeUser || window.currentUser || null);
        if (perms && perms.can_delete === false) return false;
        if (bereich && perms && perms['del_' + bereich] === false) return false;
        return true;
    };

    // Kontrolle in der Browser-Konsole: window.rechteDiagnose()
    // Zeigt, welcher Nutzer gerade gilt, welche Bereiche gesperrt sind und ob
    // diese (neue) Fassung der Datei überhaupt geladen ist. Ohne die Zeile
    // „Stand 2026-09-22" läuft noch eine alte Fassung aus dem Cache.
    window.rechteDiagnose = function () {
        const u = window.activeUser || window.currentUser || null;
        const perms = readPerms(u) || {};
        const gesperrt = window.DELETE_AREAS.filter(a => perms['del_' + a.key] === false).map(a => a.key);
        const erlaubt = window.DELETE_AREAS.filter(a => perms['del_' + a.key] !== false).map(a => a.key);
        const d = {
            stand: '2026-09-22 (Bereichs-Ausblendung aktiv)',
            benutzer: u ? u.name : '(keiner)',
            hauptschalter_loeschen: perms.can_delete !== false,
            gesperrt, erlaubt,
            body_klassen: [...document.body.classList].filter(c => c === 'disable-delete' || c.startsWith('del-off-')),
            knoepfe_im_dom: document.querySelectorAll('[data-del-area]').length
        };
        console.table({ Stand: d.stand, Benutzer: d.benutzer, 'Hauptschalter Löschen': d.hauptschalter_loeschen, 'gesperrte Bereiche': gesperrt.join(', ') || '–' });
        return d;
    };

    // =========================================================
    // ZENTRALE LÖSCHBERECHTIGUNG
    // =========================================================
    // Jede Löschfunktion in der App ruft das hier am Anfang auf:
    //
    //     if (!window.canDelete('Adressen')) return;
    //
    // Ohne den Haken "Einträge löschen" (permissions.can_delete) wird geblockt
    // und der Benutzer bekommt eine Meldung. Zusätzlich blendet
    // body.disable-delete die Buttons mit der Klasse
    // "delete-permission-required" per CSS aus — das hier ist die Absicherung
    // dahinter, falls ein Button doch erreichbar ist.
    //
    // Hinweis: Das gilt nur im Browser. Eine serverseitige Absicherung
    // (RLS in Supabase) gibt es dafür bewusst nicht.
    window.canDelete = function (what) {
        const user = window.activeUser || window.currentUser || null;
        const perms = readPerms(user);

        const blockedByPerms = !!(perms && perms.can_delete === false);
        // Ausweichprüfung, falls activeUser (noch) nicht gefüllt ist
        const blockedByBody = document.body.classList.contains('disable-delete');

        if (blockedByPerms || blockedByBody) {
            const msg = 'Keine Berechtigung zum Löschen' + (what ? ' von ' + what : '') +
                '.\n\nDer Haken "Einträge löschen" ist für deinen Benutzer nicht gesetzt.';
            if (typeof window.showToast === 'function') window.showToast(msg, 'error');
            else window.alert(msg);
            return false;
        }

        // Feingranular: ein einzelner Bereich kann trotz Hauptschalter gesperrt sein.
        const area = AREA_BY_WHAT.get(what);
        if (area && perms && perms['del_' + area.key] === false) {
            const msg = 'Keine Berechtigung zum Löschen von ' + area.label +
                '.\n\nDieser Bereich ist für deinen Benutzer gesperrt.';
            if (typeof window.showToast === 'function') window.showToast(msg, 'error');
            else window.alert(msg);
            return false;
        }
        return true;
    };

    // =========================================================
    // ANSICHTEN JE NACH BERECHTIGUNG EIN-/AUSBLENDEN
    // =========================================================
    window.applyUserPermissions = function (user) {
        if (!user) return;
        const perms = readPerms(user) || DEFAULT_PERMS;

        // Löschen-Buttons global ein-/ausblenden
        if (perms.can_delete === false) {
            document.body.classList.add('disable-delete');
        } else {
            document.body.classList.remove('disable-delete');
        }

        // Je gesperrtem Bereich eine Klasse am <body> („del-off-historie"). Die
        // zugehörige CSS-Regel blendet alle Knöpfe mit data-del-area="historie"
        // aus — auch die, die erst später gezeichnet werden. Damit gilt überall
        // dieselbe Regel: Haken weg ⇒ Knopf weg, nicht erst eine Meldung beim Klick.
        window.DELETE_AREAS.forEach(function (a) {
            document.body.classList.toggle('del-off-' + a.key, perms['del_' + a.key] === false);
        });

        // Erste erlaubte Sidebar-Ansicht als Ausweichziel, falls "home" verboten ist.
        // Sind ALLE Ansichten verboten, bleibt home als Notanker sichtbar.
        const sidebarTargets = Array.from(document.querySelectorAll('.sidebar-nav li a'))
            .map(a => a.getAttribute('data-target')).filter(Boolean);
        const fallbackView = sidebarTargets.find(t => perms[t] !== false) || 'home';

        const go = (view) => {
            if (typeof window.switchView === 'function') window.switchView(view);
        };

        // Sidebar-Links
        document.querySelectorAll('.sidebar-nav li a').forEach(link => {
            const target = link.getAttribute('data-target');
            if (!target) return;

            if (target !== fallbackView && perms[target] === false) {
                link.parentElement.style.display = 'none';

                // Sind wir gerade auf dieser Ansicht, zur Ausweichansicht wechseln
                const activeView = document.querySelector('.view.active');
                if (activeView && activeView.id === target) go(fallbackView);
            } else {
                link.parentElement.style.display = 'block';
            }
        });

        // Einstellungs-Karten (Unterseiten): Wer „Einstellungen" sehen darf, sieht
        // ALLE Einstellungs-Karten (Kategorien, Textbausteine usw.). Nur wenn
        // „Einstellungen" komplett verboten ist, wird die ganze Ansicht ohnehin
        // über die Sidebar ausgeblendet.
        const settingsAllowed = perms.settings !== false;
        document.querySelectorAll('#settings .settings-card').forEach(card => {
            const target = card.getAttribute('data-target');
            if (!target) return;
            card.style.display = settingsAllowed ? '' : 'none';
        });

        // Ist der Nutzer gerade auf einer verbotenen Ansicht (inkl. Startseite oder
        // Einstellungs-Unterseite), zur ersten erlaubten Ansicht wechseln
        const activeViewEl = document.querySelector('.view.active');
        if (activeViewEl && activeViewEl.id !== fallbackView && perms[activeViewEl.id] === false) {
            go(fallbackView);
        }

        // Rechnungsliste in „Vorgänge" (js/rechnungsliste.js): eigener Haken.
        if (typeof window.rechnungslisteRechtePruefen === 'function') {
            try { window.rechnungslisteRechtePruefen(); } catch (e) {}
        }
    };
    // CSS-Regeln je Bereich einmal erzeugen (Bereiche stehen nur hier).
    (function () {
        const css = window.DELETE_AREAS.map(function (a) {
            return 'body.del-off-' + a.key + ' [data-del-area="' + a.key + '"]';
        }).join(', ') + ' { display: none !important; }';
        const el = document.createElement('style');
        el.id = 'del-area-styles';
        el.textContent = css;
        (document.head || document.documentElement).appendChild(el);
    })();
})();
