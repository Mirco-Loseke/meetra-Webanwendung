// ==========================================================
// BENACHRICHTIGUNGEN EINSTELLEN — eigene Seite unter der Glocke
// ==========================================================
// Loest die enge Klappe im Glocken-Panel ab (das Zahnrad oeffnet jetzt dieses
// Fenster). Der Grund fuer eine eigene Seite: die Einstellungen entscheiden
// ueber ZWEI Wege, und der Zusammenhang war in der Klappe nicht zu erkennen —
//
//   Glocke  = die Liste unter dem Symbol in der Kopfzeile.
//   Fenster = die Systemmeldung des Betriebssystems, auch wenn die App
//             gerade nicht im Vordergrund ist.
//
// Beide haengen bewusst zusammen: was in der Glocke ausgeschaltet ist, kann
// auch kein Fenster oeffnen — die Sorte wird in js/notifications.js
// (`collect()`) gar nicht erst geladen. Deshalb wird der Fenster-Schalter hier
// ausgegraut, sobald die Glocke fuer diese Sorte aus ist, statt eine
// Einstellung anzubieten, die nichts bewirkt.
//
// Gespeichert wird ueber savePrefs in js/notifications.js — dieses Modul haelt
// keine eigenen Werte, sondern liest window.notificationPrefs() und schreibt
// ueber window.saveNotificationPrefs().
(function () {
    'use strict';

    const ID = 'notif-settings-modal';

    // Eine Zeile je Sorte. Der Text erklaert, was darunter faellt — genau das
    // fehlte in der alten Klappe, in der nur "Vorgaenge" stand.
    const SORTEN = [
        { key: 'processes',    label: 'Vorgänge',       info: 'Erinnerungen, offene Arbeitsschritte und Vorgänge, die dir zugewiesen wurden.' },
        { key: 'tasks',        label: 'Aufgaben',       info: 'Aufgaben mit Frist, die dir gehören.' },
        { key: 'appointments', label: 'Termine',        info: 'Kundentermine mit Uhrzeit, Einladungen sowie Zu- und Absagen.' },
        { key: 'maintenance',  label: 'Wartung',        info: 'Fällige und überfällige Wartungen an Maschinen.' },
        { key: 'offers',       label: 'Angebote',       info: 'Wiedervorlagen und Fristen an Angeboten.' },
        { key: 'service',      label: 'Serviceberichte', info: 'Deine Berichte, unter denen die Unterschrift des Kunden noch fehlt.' },
        { key: 'addresses',    label: 'Adressen',       info: 'Neue Notizen, Anrufe und Besuche, die Kollegen an einer Adresse eintragen.' }
    ];

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function prefs() {
        return typeof window.notificationPrefs === 'function' ? window.notificationPrefs() : {};
    }

    // Zustand der Systemmeldungen in Klartext. Drei Faelle, die der Nutzer
    // auseinanderhalten muss — vorher stand dort nur "Meldungen aus", auch
    // wenn der Browser sie schlicht gesperrt hatte.
    function pushZustand() {
        if (typeof Notification === 'undefined') {
            return { stufe: 'unmoeglich', titel: 'Dieser Browser kann keine Fenster anzeigen',
                     text: 'Es bleibt bei der Liste unter der Glocke.' };
        }
        if (Notification.permission === 'denied') {
            return { stufe: 'gesperrt', titel: 'Der Browser blockiert Fenster',
                     text: 'Das lässt sich nur in den Browser-Einstellungen für diese Seite wieder freigeben (Schloss-Symbol in der Adressleiste → Benachrichtigungen → Zulassen).' };
        }
        if (Notification.permission !== 'granted') {
            return { stufe: 'ungefragt', titel: 'Fenster sind noch nicht erlaubt',
                     text: 'Einmalige Erlaubnis nötig. Bis dahin erscheint alles nur unter der Glocke.' };
        }
        if (localStorage.getItem('meetra_push_enabled') === 'off') {
            return { stufe: 'aus', titel: 'Fenster sind ausgeschaltet',
                     text: 'Der Browser würde sie erlauben — hier sind sie abgeschaltet.' };
        }
        return { stufe: 'an', titel: 'Fenster sind eingeschaltet',
                 text: 'Dringendes meldet sich auch, wenn die App nicht im Vordergrund ist.' };
    }

    function html() {
        const P = prefs();
        const z = pushZustand();
        const pushMoeglich = z.stufe === 'an';

        return `
        <div class="notifset-card">
            <div class="notifset-head">
                <div>
                    <h2>Benachrichtigungen</h2>
                    <p>Was dich erreichen soll — und auf welchem Weg.</p>
                </div>
                <button type="button" class="notifset-close" onclick="window.closeNotificationSettings()" title="Schließen">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>

            <div class="notifset-body">
                <!-- 1) Systemmeldungen: Zustand + Schalter -->
                <section class="notifset-block notifset-push notifset-push-${z.stufe}">
                    <div class="notifset-push-text">
                        <strong>${esc(z.titel)}</strong>
                        <span>${esc(z.text)}</span>
                    </div>
                    ${z.stufe === 'unmoeglich' || z.stufe === 'gesperrt' ? '' : `
                        <button type="button" class="notifset-btn ${pushMoeglich ? 'is-off' : 'is-on'}"
                            onclick="window.notifSettingsTogglePush(event)">
                            ${pushMoeglich ? 'Fenster ausschalten' : 'Fenster erlauben'}
                        </button>`}
                </section>

                <!-- 2) Sorten: Glocke und Fenster nebeneinander -->
                <section class="notifset-block">
                    <h3>Wovon willst du wissen?</h3>
                    <div class="notifset-table">
                        <div class="notifset-row notifset-row-head">
                            <span></span>
                            <span title="Erscheint in der Liste unter der Glocke">Glocke</span>
                            <span title="Zusätzlich eine Meldung des Betriebssystems">Fenster</span>
                            <span title="Nach wie vielen Stunden darf sich derselbe Eintrag erneut melden? 0 = nur einmal">Erneut</span>
                        </div>
                        ${SORTEN.map(s => {
                            const an = P[s.key] !== false;
                            const pushAn = P['push_' + s.key] !== false;
                            const wieder = P['repeat_' + s.key];
                            return `
                            <div class="notifset-row${an ? '' : ' is-off'}">
                                <div class="notifset-label">
                                    <strong>${esc(s.label)}</strong>
                                    <span>${esc(s.info)}</span>
                                </div>
                                <label class="notifset-switch" title="In der Glocke anzeigen" data-mobil="Glocke">
                                    <input type="checkbox" data-notif-pref="${s.key}" ${an ? 'checked' : ''}>
                                    <span></span>
                                </label>
                                <label class="notifset-switch" data-mobil="Fenster" title="${pushMoeglich ? 'Zusätzlich als Fenster melden' : 'Erst möglich, wenn Fenster oben erlaubt sind'}">
                                    <input type="checkbox" data-notif-pref="push_${s.key}"
                                        ${pushAn ? 'checked' : ''} ${an && pushMoeglich ? '' : 'disabled'}>
                                    <span></span>
                                </label>
                                <label class="notifset-repeat" title="Erinnert alle x Stunden erneut. 0 = nur einmal melden.">
                                    <input type="number" min="0" max="720" step="1"
                                        data-notif-pref-hours="repeat_${s.key}"
                                        value="${wieder == null ? 0 : wieder}"
                                        ${an && pushMoeglich && pushAn ? '' : 'disabled'}>
                                    <em>Std.</em>
                                </label>
                            </div>`;
                        }).join('')}
                    </div>
                    <p class="notifset-note">Ist die Glocke für eine Sorte aus, wird sie gar nicht erst geladen — dann kann sie auch kein Fenster öffnen. <strong>Erneut</strong> steuert, wie hartnäckig etwas ist: <em>0</em> meldet jeden Eintrag genau einmal, <em>24</em> erinnert einmal am Tag, solange er offen bleibt.</p>
                </section>

                <!-- 3) Ab welcher Dringlichkeit ein Fenster aufgeht -->
                <section class="notifset-block">
                    <h3>Wann darf ein Fenster aufgehen?</h3>
                    <label class="notifset-select">
                        <select data-notif-pref-sel="pushLevel" ${pushMoeglich ? '' : 'disabled'}>
                            <option value="overdue" ${P.pushLevel === 'overdue' ? 'selected' : ''}>Nur bei Überfälligem</option>
                            <option value="today" ${P.pushLevel === 'today' ? 'selected' : ''}>Bei Überfälligem und heute Fälligem</option>
                            <option value="all" ${P.pushLevel === 'all' ? 'selected' : ''}>Bei jeder Meldung</option>
                        </select>
                    </label>
                    <p class="notifset-note">Termine melden sich unabhängig davon sofort — eine Einladung oder Absage will man nicht erst am Fälligkeitstag sehen. Was du unter der Glocke schon gelesen hast, meldet sich nicht noch einmal.</p>
                </section>

                <!-- 4) Zeitraeume -->
                <section class="notifset-block">
                    <h3>Zeiträume</h3>
                    <div class="notifset-nums">
                        <label>
                            <span>Vorlauf</span>
                            <input type="number" min="0" max="365" data-notif-pref-num="before" value="${P.before}">
                            <em>Tage vorher melden</em>
                        </label>
                        <label>
                            <span>Wartung</span>
                            <input type="number" min="0" max="365" data-notif-pref-num="maintBefore" value="${P.maintBefore}">
                            <em>eigener Vorlauf, Wartungen kündigen sich länger an</em>
                        </label>
                        <label>
                            <span>Rückblick</span>
                            <input type="number" min="0" max="365" data-notif-pref-num="after" value="${P.after}">
                            <em>so lange bleibt Überfälliges stehen</em>
                        </label>
                    </div>
                </section>
            </div>

            <div class="notifset-foot">
                <button type="button" class="notifset-btn is-ghost" onclick="window.notifSettingsTest(event)">Probemeldung</button>
                <button type="button" class="notifset-btn is-ghost" onclick="window.notifSettingsReset(event)">Zurücksetzen</button>
                <button type="button" class="notifset-btn is-on" onclick="window.closeNotificationSettings()">Fertig</button>
            </div>
        </div>`;
    }

    function zeichnen() {
        const overlay = document.getElementById(ID);
        if (overlay) overlay.innerHTML = html();
    }
    // Damit js/notifications.js nach einer Aenderung neu zeichnen kann.
    window.renderNotificationSettingsPage = function () {
        if (document.getElementById(ID)) zeichnen();
    };

    window.openNotificationSettings = function (event) {
        if (event) event.stopPropagation();
        if (typeof window.closeNotificationPanel === 'function') window.closeNotificationPanel();

        let overlay = document.getElementById(ID);
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = ID;
            overlay.className = 'notifset-overlay';
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) window.closeNotificationSettings();
            });
            document.body.appendChild(overlay);
        }
        zeichnen();
        overlay.style.display = 'flex';
        requestAnimationFrame(() => overlay.classList.add('is-open'));
    };

    window.closeNotificationSettings = function () {
        const overlay = document.getElementById(ID);
        if (!overlay) return;
        overlay.classList.remove('is-open');
        setTimeout(() => { overlay.remove(); }, 200);
    };

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById(ID)) window.closeNotificationSettings();
    });

    // Erlauben / Ausschalten laeuft ueber die vorhandene Logik in
    // js/notifications.js; danach neu zeichnen, damit der Zustandstext oben
    // und die ausgegrauten Fenster-Schalter zusammenpassen.
    window.notifSettingsTogglePush = async function (event) {
        if (event) event.stopPropagation();
        if (typeof window.toggleNotificationPush === 'function') {
            await window.toggleNotificationPush(event);
        }
        zeichnen();
    };

    // Probemeldung: zeigt genau den Weg, der gerade eingestellt ist.
    window.notifSettingsTest = function (event) {
        if (event) event.stopPropagation();
        const an = typeof window.notificationsPushEnabled === 'function' && window.notificationsPushEnabled();
        if (an) {
            try {
                new Notification('meetra — Probemeldung', {
                    body: 'So sieht eine Meldung aus, wenn etwas fällig ist.',
                    tag: 'meetra-test',
                    icon: 'assets/icons/meetra_arrows_icon.png'
                });
                return;
            } catch (e) { /* faellt unten auf den Hinweis zurueck */ }
        }
        if (window.showToast) {
            window.showToast('Fenster sind aus — so würde die Meldung nur unter der Glocke stehen.');
        }
    };

    window.notifSettingsReset = function (event) {
        if (event) event.stopPropagation();
        if (typeof window.resetNotificationPrefs === 'function') window.resetNotificationPrefs();
        zeichnen();
    };
})();
