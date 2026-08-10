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

        // Einstellungs-Karten (Unterseiten) je nach Berechtigung ein-/ausblenden
        document.querySelectorAll('#settings .settings-card').forEach(card => {
            const target = card.getAttribute('data-target');
            if (!target) return;
            card.style.display = (perms[target] === false) ? 'none' : '';
        });

        // Ist der Nutzer gerade auf einer verbotenen Ansicht (inkl. Startseite oder
        // Einstellungs-Unterseite), zur ersten erlaubten Ansicht wechseln
        const activeViewEl = document.querySelector('.view.active');
        if (activeViewEl && activeViewEl.id !== fallbackView && perms[activeViewEl.id] === false) {
            go(fallbackView);
        }
    };
})();
