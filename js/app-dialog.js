/* app-dialog.js — eigene Rückfrage- und Eingabefenster statt confirm()/prompt() (UX-04, 2026-10-17)
 *
 *   await window.appFrage('Wirklich löschen?')                     → true | false
 *   await window.appFrage('Text', { titel, ja, nein, gefahr })     → true | false
 *   await window.appEingabe('Name der Maschine:', 'Vorgabe')       → Text | null (Abbrechen)
 *
 * Löschen-Fragen werden an Wörtern wie „löschen/entfernen/endgültig" erkannt und
 * bekommen einen roten Knopf. Esc = Abbrechen, Enter = Bestätigen.
 * Die Funktionen laufen NIE blockierend — wer sie aufruft, muss `await` benutzen.
 */
(function () {
    'use strict';
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const GEFAHR = /l(ö|oe)sch|entfern|endg(ü|ue)ltig|verwerf|unwiderruf|nicht (mehr )?r(ü|ue)ckg(ä|ae)ngig|zur(ü|ue)cksetz/i;
    let offen = null;

    function dialog(text, o) {
        o = o || {};
        return new Promise(resolve => {
            if (offen) offen.zu(null);
            const frage = String(text == null ? '' : text);
            const gefahr = o.gefahr != null ? o.gefahr : GEFAHR.test(frage);
            const el = document.createElement('div');
            el.id = 'app-dialog';
            el.className = 'app-dialog-hg';
            el.innerHTML = '<div class="app-dialog" role="alertdialog" aria-modal="true" aria-labelledby="app-dialog-titel">' +
                '<h3 id="app-dialog-titel">' + esc(o.titel || (o.eingabe ? 'Eingabe' : (gefahr ? 'Bitte bestätigen' : 'Rückfrage'))) + '</h3>' +
                '<p>' + esc(frage).replace(/\n/g, '<br>') + '</p>' +
                (o.eingabe ? '<input type="text" class="glass-form-input app-dialog-feld" value="' + esc(o.vorgabe || '') + '" autocomplete="off">' : '') +
                '<div class="app-dialog-fuss">' +
                '<button type="button" class="knopf knopf--sekundaer" data-ad="nein">' + esc(o.nein || 'Abbrechen') + '</button>' +
                '<button type="button" class="knopf ' + (gefahr ? 'knopf--gefahr' : 'knopf--primaer') + '" data-ad="ja">' + esc(o.ja || (o.eingabe ? 'OK' : (gefahr ? 'Ja, löschen' : 'OK'))) + '</button>' +
                '</div></div>';
            const feld = el.querySelector('.app-dialog-feld');
            const zu = (wert) => {
                document.removeEventListener('keydown', taste, true);
                el.remove();
                offen = null;
                resolve(wert);
            };
            const ok = () => zu(o.eingabe ? (feld.value) : true);
            const nein = () => zu(o.eingabe ? null : false);
            function taste(e) {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); nein(); }
                else if (e.key === 'Enter' && !(e.target && e.target.tagName === 'BUTTON')) { e.preventDefault(); e.stopPropagation(); ok(); }
            }
            el.addEventListener('click', e => {
                const b = e.target.closest('[data-ad]');
                if (b) { b.dataset.ad === 'ja' ? ok() : nein(); }
                else if (e.target === el) nein();
            });
            document.addEventListener('keydown', taste, true);
            document.body.appendChild(el);
            offen = { zu };
            (feld || el.querySelector('[data-ad="ja"]')).focus();
            if (feld) feld.select();
        });
    }

    window.appFrage = (text, opt) => dialog(text, opt);
    window.appEingabe = (text, vorgabe, opt) => dialog(text, Object.assign({}, opt, { eingabe: true, vorgabe }));
})();
