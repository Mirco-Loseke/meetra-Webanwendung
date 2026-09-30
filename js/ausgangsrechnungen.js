// ==========================================================
// Buchhaltung → Ausgangsrechnungen (aus Sage)
// ==========================================================
// Quelle ist die Tabelle `rechnungen`, die der Sage-Abgleich befüllt
// (tools/sage-sync.ps1): Belegdaten + Zahlungsbedingung + faellig_am.
// In der App gepflegt werden nur bezahlt_am, mahnstufe, mahnung_am,
// mahn_verlauf und notiz (Migration supabase_rechnungen_zahlung.sql).
// Mahnwesen: 0 → Zahlungserinnerung → 1. Mahnung → 2. Mahnung. Jede Stufe
// öffnet eine vorformulierte Mail in der Mail-Ansicht (gesendet wird dort
// von Hand) und wird dabei vermerkt.
// ==========================================================
(function () {
    'use strict';

    const ARTEN = ['Rechnung', 'Direktrechnung'];
    const SPALTEN = 'id,belegart,belegnummer,belegjahr,belegdatum,customer_id,kundenmatchcode,netto,brutto,'
        + 'zahlungsbedingung,zahlungsziel_tage,faellig_am,bezahlt_am,mahnstufe,mahnung_am,mahn_verlauf,notiz';
    const FRISCH_MS = 90 * 1000;
    const STUFEN = [
        null,
        { name: 'Zahlungserinnerung', frist: 7 },
        { name: '1. Mahnung', frist: 7 },
        { name: '2. Mahnung', frist: 5 }
    ];

    let liste = [];
    let geladenUm = 0;
    let ladeFehler = null;
    let filter = 'offen';
    let suche = '';
    let migrationFehlt = false;

    const esc = s => (s == null ? '' : String(s)).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const eur = v => (parseFloat(v) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
    const datum = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE') : '–';
    const heuteIso = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const tageBis = iso => Math.round((new Date(iso + 'T00:00:00') - new Date(heuteIso() + 'T00:00:00')) / 86400000);
    const plusTage = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('de-DE'); };

    function kunde(r) {
        const alle = window.customerCacheSync ? window.customerCacheSync() : [];
        return (r.customer_id && alle.find(k => String(k.id) === String(r.customer_id))) || null;
    }
    function kundenName(r) {
        const k = kunde(r);
        return (k && k.name) || r.kundenmatchcode || 'Unbekannter Kunde';
    }

    // Zustand einer Rechnung für Farbe, Filter und Text.
    function zustand(r) {
        if (r.bezahlt_am) return { art: 'bezahlt', text: 'Bezahlt am ' + datum(r.bezahlt_am) };
        if (!r.faellig_am) return { art: 'offen', text: 'Fälligkeit unbekannt' };
        const t = tageBis(r.faellig_am);
        if (t < 0) return { art: 'ueberfaellig', text: `seit ${-t} ${-t === 1 ? 'Tag' : 'Tagen'} überfällig` };
        if (t === 0) return { art: 'bald', text: 'heute fällig' };
        if (t <= 7) return { art: 'bald', text: `fällig in ${t} ${t === 1 ? 'Tag' : 'Tagen'}` };
        return { art: 'offen', text: `fällig in ${t} Tagen` };
    }

    async function laden(erzwingen) {
        if (!erzwingen && liste.length && Date.now() - geladenUm < FRISCH_MS) return;
        ladeFehler = null;
        if (window.customerCacheGet) await window.customerCacheGet();
        const { data, error } = await window.supabaseClient
            .from('rechnungen').select(SPALTEN)
            .in('belegart', ARTEN)
            .order('belegdatum', { ascending: false });
        if (error) {
            migrationFehlt = /faellig_am|bezahlt_am|mahnstufe|column/i.test(error.message || '');
            ladeFehler = error;
            liste = [];
            return;
        }
        migrationFehlt = false;
        liste = data || [];
        geladenUm = Date.now();
    }

    function kpis() {
        const heute = heuteIso();
        const monat = heute.slice(0, 7);
        const offen = liste.filter(r => !r.bezahlt_am);
        const ueber = offen.filter(r => r.faellig_am && r.faellig_am < heute);
        const bald = offen.filter(r => r.faellig_am && r.faellig_am >= heute && tageBis(r.faellig_am) <= 7);
        const bezahlt = liste.filter(r => r.bezahlt_am && r.bezahlt_am.slice(0, 7) === monat);
        const summe = a => a.reduce((s, r) => s + (parseFloat(r.brutto) || 0), 0);
        const kachel = (key, wert, label, farbe) => `
            <button type="button" class="ar-kpi ar-kpi-${farbe}${filter === key ? ' aktiv' : ''}" onclick="window.arFilter('${key}')">
                <span class="ar-kpi-wert">${wert}</span>
                <span class="ar-kpi-label">${label}</span>
            </button>`;
        return `<div class="ar-kpis">
            ${kachel('offen', eur(summe(offen)), `Offen (${offen.length})`, 'gruen')}
            ${kachel('ueberfaellig', eur(summe(ueber)), `Überfällig (${ueber.length})`, 'rot')}
            ${kachel('bald', eur(summe(bald)), `Fällig in 7 Tagen (${bald.length})`, 'gelb')}
            ${kachel('bezahlt', eur(summe(bezahlt)), `Diesen Monat bezahlt (${bezahlt.length})`, 'blau')}
        </div>`;
    }

    function gefiltert() {
        const heute = heuteIso();
        const q = suche.trim().toLowerCase();
        let a = liste.filter(r => {
            switch (filter) {
                case 'offen': return !r.bezahlt_am;
                case 'ueberfaellig': return !r.bezahlt_am && r.faellig_am && r.faellig_am < heute;
                case 'bald': return !r.bezahlt_am && r.faellig_am && r.faellig_am >= heute && tageBis(r.faellig_am) <= 7;
                case 'gemahnt': return !r.bezahlt_am && (r.mahnstufe || 0) > 0;
                case 'bezahlt': return !!r.bezahlt_am;
                default: return true;
            }
        });
        if (q) a = a.filter(r => [kundenName(r), r.kundenmatchcode, r.belegnummer, r.brutto]
            .map(v => String(v == null ? '' : v).toLowerCase()).join(' ').includes(q));
        // Offene nach Fälligkeit (älteste zuerst), sonst neueste zuerst.
        if (filter !== 'bezahlt' && filter !== 'alle') {
            a = a.slice().sort((x, y) => String(x.faellig_am || '9999').localeCompare(String(y.faellig_am || '9999')));
        }
        return a;
    }

    function zeile(r) {
        const z = zustand(r);
        const stufe = r.mahnstufe || 0;
        const naechste = STUFEN[stufe + 1];
        const mahnKnopf = !r.bezahlt_am && naechste
            ? `<button type="button" class="ar-btn ar-btn-mahn${z.art === 'ueberfaellig' ? ' dringend' : ''}" onclick="window.arMahnen(${r.id})" title="Vorformulierte Mail öffnen">✉ ${naechste.name}</button>`
            : '';
        const stufeBadge = stufe > 0
            ? `<span class="ar-badge ar-badge-stufe${stufe} clickable" onclick="window.arStufeZurueck(${r.id})" title="Klicken, um diese Stufe zurückzunehmen">${esc(STUFEN[stufe].name)} · ${datum(r.mahnung_am)}</span>`
            : '';
        return `
        <div class="ar-zeile ar-${z.art}">
            <div class="ar-haupt">
                <div class="ar-kunde">
                    <a class="clickable" onclick="window.arKundeOeffnen(${r.id})">${esc(kundenName(r))}</a>
                    ${stufeBadge}
                </div>
                <div class="ar-meta">
                    ${esc(r.belegart)} ${esc(r.belegnummer)} · ${datum(r.belegdatum)}
                    ${r.zahlungsbedingung ? ' · ' + esc(r.zahlungsbedingung) : ''}
                </div>
            </div>
            <div class="ar-faellig">
                <div class="ar-faellig-datum">${r.bezahlt_am ? '' : 'bis ' + datum(r.faellig_am)}</div>
                <div class="ar-faellig-text">${esc(z.text)}</div>
            </div>
            <div class="ar-betrag">${eur(r.brutto)}</div>
            <div class="ar-aktionen">
                ${mahnKnopf}
                <button type="button" class="ar-btn ar-btn-bezahlt${r.bezahlt_am ? ' an' : ''}" onclick="window.arBezahlt(${r.id})"
                    title="${r.bezahlt_am ? 'Wieder als offen markieren' : 'Als bezahlt markieren'}">${r.bezahlt_am ? '✓ Bezahlt' : 'Bezahlt ✓'}</button>
            </div>
        </div>`;
    }

    function zeichnen() {
        const box = document.getElementById('accounting-table-container');
        const kpiBox = document.getElementById('accounting-kpi-container');
        if (!box) return;
        if (migrationFehlt) {
            if (kpiBox) kpiBox.innerHTML = '';
            box.innerHTML = `<div class="ar-leer">Migration fehlt: <code>supabase/supabase_rechnungen_zahlung.sql</code> im Supabase SQL-Editor ausführen.</div>`;
            return;
        }
        if (ladeFehler) {
            box.innerHTML = `<div class="ar-leer">Rechnungen konnten nicht geladen werden: ${esc(ladeFehler.message)}</div>`;
            return;
        }
        if (kpiBox) kpiBox.innerHTML = kpis();
        const chips = [['offen', 'Offen'], ['ueberfaellig', 'Überfällig'], ['bald', 'Bald fällig'], ['gemahnt', 'Gemahnt'], ['bezahlt', 'Bezahlt'], ['alle', 'Alle']]
            .map(([k, l]) => `<button type="button" class="ar-chip${filter === k ? ' aktiv' : ''}" onclick="window.arFilter('${k}')">${l}</button>`).join('');
        const a = gefiltert();
        box.innerHTML = `
            <div class="ar-kopf">
                <div class="ar-chips">${chips}</div>
                <input type="search" class="glass-form-input ar-suche" placeholder="Kunde, Rechnungsnr., Betrag …"
                    value="${esc(suche)}" oninput="window.arSuche(this.value)">
            </div>
            <div class="ar-liste">${a.length ? a.map(zeile).join('') : '<div class="ar-leer">Keine Rechnungen in dieser Auswahl.</div>'}</div>
            <div class="ar-fuss">Quelle: Sage (Abgleich alle 30 min) · „Bezahlt" und Mahnungen werden nur hier gepflegt.</div>`;
    }

    window.renderAusgangsrechnungen = async function (erzwingen) {
        const box = document.getElementById('accounting-table-container');
        if (box && !liste.length) box.innerHTML = '<div class="ar-leer">Rechnungen werden geladen …</div>';
        await laden(erzwingen);
        zeichnen();
    };

    window.arFilter = function (k) { filter = k; zeichnen(); };
    let sucheUhr = null;
    window.arSuche = function (v) {
        suche = v;
        clearTimeout(sucheUhr);
        sucheUhr = setTimeout(() => {
            const pos = v.length;
            zeichnen();
            const feld = document.querySelector('#accounting-table-container .ar-suche');
            if (feld) { feld.focus(); feld.setSelectionRange(pos, pos); }
        }, 200);
    };

    async function speichern(r, felder) {
        const vorher = Object.assign({}, r);
        Object.assign(r, felder);
        zeichnen();
        const { error } = await window.supabaseClient.from('rechnungen').update(felder).eq('id', r.id);
        if (error) {
            Object.assign(r, vorher);
            zeichnen();
            window.showToast && window.showToast('Speichern fehlgeschlagen: ' + error.message);
            return false;
        }
        return true;
    }

    window.arBezahlt = async function (id) {
        const r = liste.find(x => x.id === id);
        if (!r) return;
        const ok = await speichern(r, { bezahlt_am: r.bezahlt_am ? null : heuteIso() });
        if (ok && window.showToast) window.showToast(r.bezahlt_am
            ? `Rechnung ${r.belegnummer} als bezahlt markiert.` : `Rechnung ${r.belegnummer} wieder offen.`);
    };

    window.arKundeOeffnen = function (id) {
        const r = liste.find(x => x.id === id);
        if (!r || !r.customer_id) { window.showToast && window.showToast('Diese Rechnung ist keiner Adresse zugeordnet.'); return; }
        if (typeof window.switchView === 'function') window.switchView('addressbook');
        let versuche = 0;
        const oeffnen = () => {
            if (typeof window.openAddressDetail === 'function') window.openAddressDetail(r.customer_id, 'belege');
            if (++versuche < 10 && !document.querySelector('#addressbook .ab-detail, #addressbook [data-detail-id]')) setTimeout(oeffnen, 300);
        };
        setTimeout(oeffnen, 200);
    };

    // Versehentlich vermerkt / Mail doch nicht gesendet: eine Stufe zurück.
    window.arStufeZurueck = async function (id) {
        const r = liste.find(x => x.id === id);
        if (!r || !(r.mahnstufe > 0)) return;
        if (!confirm(`„${STUFEN[r.mahnstufe].name}" für Rechnung ${r.belegnummer} zurücknehmen?`)) return;
        const verlauf = (Array.isArray(r.mahn_verlauf) ? r.mahn_verlauf : []).slice(0, -1);
        const vorige = verlauf[verlauf.length - 1];
        await speichern(r, { mahnstufe: r.mahnstufe - 1, mahnung_am: vorige ? vorige.am : null, mahn_verlauf: verlauf });
    };

    // ---- Mahnwesen ----
    function mailText(r, stufe) {
        const k = kunde(r);
        const absender = (window.activeUser && window.activeUser.name) || '';
        const nr = r.belegnummer;
        const rd = datum(r.belegdatum);
        const betrag = eur(r.brutto);
        const faellig = datum(r.faellig_am);
        const frist = plusTage(STUFEN[stufe].frist);
        const anrede = 'Sehr geehrte Damen und Herren,';
        const gruss = `<p>Mit freundlichen Grüßen<br>${esc(absender)}<br>meetra</p>`;
        const kopf = `<p>${anrede}</p>`;
        let betreff, rumpf;
        if (stufe === 1) {
            betreff = `Zahlungserinnerung – Rechnung ${nr} vom ${rd}`;
            rumpf = `<p>sicher ist es Ihrer Aufmerksamkeit entgangen: Für unsere Rechnung Nr. ${esc(nr)} vom ${rd} über <b>${betrag}</b>
                (fällig am ${faellig}) konnten wir bisher keinen Zahlungseingang feststellen.</p>
                <p>Wir bitten Sie, den offenen Betrag bis zum <b>${frist}</b> zu überweisen. Sollte sich Ihre Zahlung mit diesem
                Schreiben überschnitten haben, betrachten Sie es bitte als gegenstandslos.</p>`;
        } else if (stufe === 2) {
            betreff = `1. Mahnung – Rechnung ${nr} vom ${rd}`;
            rumpf = `<p>leider ist unsere Rechnung Nr. ${esc(nr)} vom ${rd} über <b>${betrag}</b> trotz unserer Zahlungserinnerung
                ${r.mahnung_am ? 'vom ' + datum(r.mahnung_am) + ' ' : ''}noch nicht beglichen. Die Zahlung war am ${faellig} fällig.</p>
                <p>Bitte überweisen Sie den Betrag bis spätestens <b>${frist}</b>. Falls es Unklarheiten zur Rechnung gibt,
                melden Sie sich gern direkt bei uns.</p>`;
        } else {
            betreff = `2. Mahnung – Rechnung ${nr} vom ${rd}`;
            rumpf = `<p>trotz Zahlungserinnerung und 1. Mahnung${r.mahnung_am ? ' vom ' + datum(r.mahnung_am) : ''} ist unsere Rechnung
                Nr. ${esc(nr)} vom ${rd} über <b>${betrag}</b> (fällig am ${faellig}) weiterhin offen.</p>
                <p>Wir fordern Sie hiermit letztmalig auf, den Betrag bis zum <b>${frist}</b> zu begleichen. Sollte bis dahin kein
                Zahlungseingang erfolgen, sehen wir uns leider gezwungen, weitere Schritte einzuleiten, die mit zusätzlichen
                Kosten für Sie verbunden sind.</p>`;
        }
        return { an: (k && k.email) || '', betreff, html: kopf + rumpf + gruss };
    }

    window.arMahnen = async function (id) {
        const r = liste.find(x => x.id === id);
        if (!r) return;
        const stufe = (r.mahnstufe || 0) + 1;
        if (!STUFEN[stufe]) return;
        const m = mailText(r, stufe);
        const heute = heuteIso();
        const verlauf = (Array.isArray(r.mahn_verlauf) ? r.mahn_verlauf : []).concat([{
            stufe, am: heute, an: m.an || null,
            von: window.activeUser ? String(window.activeUser.name || window.activeUser.id || '') : null
        }]);
        const ok = await speichern(r, { mahnstufe: stufe, mahnung_am: heute, mahn_verlauf: verlauf });
        if (!ok) return;
        if (!m.an && window.showToast) window.showToast('Keine Mail-Adresse an der Adresse hinterlegt — bitte Empfänger eintragen.');
        if (typeof window.mailSchreiben === 'function') {
            window.mailSchreiben(m.an, m.betreff, m.html);
        } else {
            const text = m.html.replace(/<br>/g, '\n').replace(/<\/p>/g, '\n\n').replace(/<[^>]+>/g, '').replace(/\s*\n\s*\n\s*/g, '\n\n').trim();
            window.location.href = `mailto:${encodeURIComponent(m.an)}?subject=${encodeURIComponent(m.betreff)}&body=${encodeURIComponent(text)}`;
        }
        if (window.showToast) window.showToast(`${STUFEN[stufe].name} vermerkt — Mail prüfen und senden.`);
    };
})();
