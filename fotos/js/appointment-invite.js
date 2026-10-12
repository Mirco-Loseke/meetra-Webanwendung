// ==========================================
// TERMIN-EINLADUNG FÜR OUTLOOK (.ics)
// ==========================================
// Erzeugt aus einem Termin eine Kalenderdatei nach iCalendar (RFC 5545).
// Ein Doppelklick darauf öffnet in Outlook den Termin — Betreff, Datum,
// Uhrzeit, Ort, Notiz und die Eingeladenen stehen schon drin.
//
// WICHTIG — METHOD:PUBLISH, nicht REQUEST:
// Mit METHOD:REQUEST hält Outlook die Datei für eine Einladung, die der
// Organisator BEREITS VERSCHICKT hat. Es öffnet sie dann nur zum Lesen
// („Als Besprechungsorganisator brauchen Sie keine Antwort zu senden"),
// die Antwortknöpfe sind ausgegraut und einen Senden-Knopf gibt es nicht —
// man kommt also gar nicht dazu, die Einladung abzuschicken.
// Mit PUBLISH öffnet Outlook den Termin BEARBEITBAR. Sind Teilnehmer
// hinterlegt, steht dort „Senden"; sonst führt „Teilnehmer einladen" zum
// selben Ziel.
//
// Warum eine Datei und kein mailto:
// mailto kann keine Anhänge mitgeben und kennt keine Termin-Felder. Ein
// reiner mailto-Link erzeugt deshalb eine gewöhnliche E-Mail, keinen
// Termin, den der Empfänger annehmen kann. Die .ics ist der einzige Weg,
// der ohne Serveranbindung eine echte Einladung ergibt.
// Als Rückfallebene gibt es window.oeffneEinladungsMail() für alle, die
// kein Outlook auf dem Rechner haben.
//
// Hinweis zur Zeitzone: Start und Ende werden in UTC geschrieben (…Z).
// Das ist die Form, die jedes Programm versteht; die Umrechnung aus der
// lokalen Zeit macht der Browser.
// ==========================================
(function () {
    'use strict';

    // Sonderzeichen nach RFC 5545 maskieren. Reihenfolge wichtig: der
    // Backslash zuerst, sonst werden die eigenen Maskierungen erneut maskiert.
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/\\/g, '\\\\')
            .replace(/;/g, '\\;')
            .replace(/,/g, '\\,')
            .replace(/\r?\n/g, '\\n');
    }

    // Zeilen dürfen laut Norm höchstens 75 Zeichen lang sein; längere werden
    // umgebrochen und mit einem Leerzeichen fortgesetzt. Outlook ist da
    // gutmütig, andere Programme sind es nicht.
    function falte(zeile) {
        if (zeile.length <= 75) return zeile;
        const teile = [zeile.slice(0, 75)];
        let rest = zeile.slice(75);
        while (rest.length > 74) {
            teile.push(' ' + rest.slice(0, 74));
            rest = rest.slice(74);
        }
        if (rest) teile.push(' ' + rest);
        return teile.join('\r\n');
    }

    function utcStempel(d) {
        const p = n => String(n).padStart(2, '0');
        return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate())
            + 'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
    }

    function datumStempel(iso) {
        return String(iso || '').replace(/-/g, '');
    }

    // Ein Tag weiter — bei ganztägigen Terminen ist DTEND laut Norm der
    // FOLGETAG, sonst zeigt Outlook den Termin einen Tag zu kurz an.
    function tagDanach(iso) {
        const d = new Date(iso + 'T12:00:00');
        d.setDate(d.getDate() + 1);
        const p = n => String(n).padStart(2, '0');
        return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    }

    /**
     * @param {object} o
     *   titel, datum ('YYYY-MM-DD'), zeitVon ('HH:MM' oder leer),
     *   zeitBis ('HH:MM' oder leer), notiz, ort,
     *   organisatorName, organisatorMail,
     *   teilnehmer: [{ name, email }]
     */
    window.buildAppointmentIcs = function (o) {
        const opt = o || {};
        const jetzt = new Date();
        const uid = 'meetra-' + jetzt.getTime() + '-' + Math.random().toString(36).slice(2, 10) + '@meetra';

        const zeilen = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//meetra Webapp//Termin//DE',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            'UID:' + uid,
            'DTSTAMP:' + utcStempel(jetzt),
            'SEQUENCE:0',
            'STATUS:CONFIRMED',
            'TRANSP:OPAQUE'
        ];

        if (opt.zeitVon) {
            const start = new Date(opt.datum + 'T' + opt.zeitVon + ':00');
            // Ohne Endzeit eine Stunde annehmen — ein Termin ohne Dauer wird
            // in Outlook sonst als Ganztagstermin dargestellt.
            const ende = opt.zeitBis
                ? new Date(opt.datum + 'T' + opt.zeitBis + ':00')
                : new Date(start.getTime() + 60 * 60 * 1000);
            zeilen.push('DTSTART:' + utcStempel(start));
            zeilen.push('DTEND:' + utcStempel(ende.getTime() > start.getTime() ? ende : new Date(start.getTime() + 60 * 60 * 1000)));
        } else {
            zeilen.push('DTSTART;VALUE=DATE:' + datumStempel(opt.datum));
            zeilen.push('DTEND;VALUE=DATE:' + tagDanach(opt.datum));
        }

        zeilen.push('SUMMARY:' + esc(opt.titel || 'Termin'));
        if (opt.notiz) zeilen.push('DESCRIPTION:' + esc(opt.notiz));
        if (opt.ort) zeilen.push('LOCATION:' + esc(opt.ort));

        if (opt.organisatorMail) {
            zeilen.push('ORGANIZER;CN=' + esc(opt.organisatorName || opt.organisatorMail) + ':mailto:' + opt.organisatorMail);
        }
        (opt.teilnehmer || []).forEach(t => {
            if (!t || !t.email) return;
            zeilen.push('ATTENDEE;CN=' + esc(t.name || t.email)
                + ';ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:' + t.email);
        });

        // Erinnerung 30 Minuten vorher
        zeilen.push('BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY',
            'DESCRIPTION:' + esc(opt.titel || 'Termin'), 'END:VALARM');

        zeilen.push('END:VEVENT', 'END:VCALENDAR');
        return zeilen.map(falte).join('\r\n');
    };

    // Datei zum Download anbieten. Dateiname aus dem Titel, damit im
    // Downloads-Ordner erkennbar ist, worum es geht.
    window.downloadAppointmentIcs = function (o) {
        const text = window.buildAppointmentIcs(o);
        const name = (String((o && o.titel) || 'Termin')
            .replace(/[^\wäöüÄÖÜß \-]/g, '').trim().slice(0, 60) || 'Termin') + '.ics';
        const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        return name;
    };

    // Rückfallebene ohne Outlook: normale E-Mail mit allen Angaben im Text.
    window.oeffneEinladungsMail = function (o) {
        const opt = o || {};
        const empfaenger = (opt.teilnehmer || []).map(t => t && t.email).filter(Boolean).join(',');
        const datumLesbar = opt.datum
            ? new Date(opt.datum + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
            : '';
        const zeit = opt.zeitVon ? (opt.zeitVon + (opt.zeitBis ? ' – ' + opt.zeitBis : '') + ' Uhr') : 'ganztägig';
        const text = [
            'Terminvorschlag:',
            '',
            opt.titel || 'Termin',
            datumLesbar + ', ' + zeit,
            opt.ort ? 'Ort: ' + opt.ort : '',
            '',
            opt.notiz || '',
            '',
            'Die Termindatei (.ics) liegt im Download-Ordner und kann dieser E-Mail angehängt werden.'
        ].filter(z => z !== null).join('\r\n');

        const url = 'mailto:' + encodeURIComponent(empfaenger)
            + '?subject=' + encodeURIComponent(opt.titel || 'Termin')
            + '&body=' + encodeURIComponent(text);
        window.location.href = url;
    };
})();
