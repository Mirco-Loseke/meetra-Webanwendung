// ==========================================================
// PROTOKOLLE ANSEHEN — Übersicht je Maschine
// ----------------------------------------------------------
// Maschine → Aktionen → Ansehen → Servicebericht / Eingangs-
// protokoll / Abnahmeprotokoll: öffnet ein Fenster mit ALLEN
// gespeicherten Belegen dieser Art zu genau dieser Maschine.
// Von dort aus lässt sich einer öffnen (bearbeiten) oder das
// PDF ansehen.
//
// Vorher sprangen diese drei Knöpfe nur in die große Listen-
// ansicht und trugen den Maschinennamen ins Suchfeld ein —
// gesucht wurde also quer über alle Maschinen.
//
// Mietvereinbarung und UVV- & Wartungsprotokoll haben ihre
// eigenen Fenster (js/mietvereinbarung-liste.js,
// js/uvv-protokoll.js) und werden von hier nur weitergereicht.
//
// Stile: css/views/uvv-protokoll.css (.uvvp-*).
// ==========================================================

(function () {
    'use strict';

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    function sb() { return window.supabaseClient; }

    function uvvTitel() { return window.UVV_PROTOKOLL_TITEL || 'UVV- & Wartungsprotokoll'; }

    // Titel, die in service_entries liegen, aber KEIN Servicebericht sind.
    function keineBerichte() {
        return ['Werkstattaufenthalt Beginn', 'Werkstattaufenthalt Ende', uvvTitel()];
    }

    const ARTEN = {
        servicebericht: {
            label: 'Serviceberichte',
            neu: () => window.startReportCreation && window.startReportCreation('servicebericht')
        },
        eingangsprotokoll: {
            label: 'Eingangsprotokolle',
            neu: () => window.startReportCreation && window.startReportCreation('eingangsprotokoll')
        },
        abnahmeprotokoll: {
            label: 'Abnahmeprotokolle',
            neu: () => window.startReportCreation && window.startReportCreation('abnahmeprotokoll')
        }
    };

    let art = 'servicebericht';
    let maschinenId = null;
    let liste = [];

    function aktuelleMaschinenId() {
        if (typeof currentSelectedMachineForService !== 'undefined' && currentSelectedMachineForService) {
            return currentSelectedMachineForService;
        }
        return window.currentSelectedMachineForService || null;
    }

    function datum(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleDateString('de-DE');
    }

    // ------------------------------------------------------
    // Öffnen
    // ------------------------------------------------------
    window.showMachineDocuments = async function (artKey, machineId) {
        // Die beiden eigenständigen Bausteine haben ihre eigene Übersicht.
        if (artKey === 'mietvereinbarung' && typeof window.showMietvereinbarungenForMachine === 'function') {
            window.showMietvereinbarungenForMachine(machineId);
            return;
        }
        if (artKey === 'uvv' && typeof window.showUvvProtokolleForMachine === 'function') {
            window.showUvvProtokolleForMachine(machineId);
            return;
        }

        if (typeof window.closeServiceActionModal === 'function') window.closeServiceActionModal();

        art = ARTEN[artKey] ? artKey : 'servicebericht';
        maschinenId = machineId || aktuelleMaschinenId();
        if (!maschinenId) { window.showToast('Keine Maschine ausgewählt.'); return; }
        if (!sb()) { window.showToast('Ohne Verbindung gibt es keine Übersicht.'); return; }

        zeichne('lade');
        try {
            liste = await lade();
            zeichne();
        } catch (e) {
            console.error('Belege konnten nicht geladen werden:', e);
            liste = [];
            zeichne('fehler');
        }
    };

    async function lade() {
        if (art === 'servicebericht') {
            const { data, error } = await sb()
                .from('service_entries')
                .select('id, title, date, created_at, description, pdf_url, technicians, operating_hours, is_finalized')
                .eq('machine_id', maschinenId)
                .order('date', { ascending: false });
            if (error) throw error;
            const aus = keineBerichte();
            return (data || []).filter(z => !aus.includes(z.title));
        }

        const tabelle = art === 'eingangsprotokoll' ? 'intake_protocols' : 'acceptance_protocols';
        const { data, error } = await sb()
            .from(tabelle)
            .select('*')
            .eq('machine_id', maschinenId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    }

    window.protokollListeSchliessen = function () {
        const ov = document.getElementById('protokoll-liste-overlay');
        if (ov) ov.remove();
    };

    window.protokollListeOeffnen = function (id) {
        const mid = maschinenId;
        const a = art;
        window.protokollListeSchliessen();
        if (a === 'servicebericht') {
            if (typeof window.openEditServicebericht === 'function') window.openEditServicebericht(id);
        } else if (a === 'eingangsprotokoll') {
            if (typeof window.openIntakeProtocol === 'function') window.openIntakeProtocol(mid, id);
        } else if (typeof window.openAcceptanceProtocol === 'function') {
            window.openAcceptanceProtocol(mid, id);
        }
    };

    window.protokollListePdf = function (id, url) {
        if (art === 'servicebericht') {
            if (!url) return;
            if (typeof window.previewDocument === 'function') window.previewDocument(url, 'Servicebericht', 'application/pdf');
            else window.open(url, '_blank');
            return;
        }
        const typ = art === 'eingangsprotokoll' ? 'intake' : 'acceptance';
        if (typeof window.openProtocolPDF === 'function') window.openProtocolPDF(maschinenId, id, typ);
    };

    window.protokollListeNeu = function () {
        const a = art;
        window.protokollListeSchliessen();
        if (ARTEN[a]) ARTEN[a].neu();
    };

    // ------------------------------------------------------
    // Darstellung
    // ------------------------------------------------------
    function zeile(v) {
        const istBericht = art === 'servicebericht';
        const kopf = istBericht
            ? `${datum(v.date || v.created_at)} · ${v.title || 'Servicebericht'}`
            : `${datum(v.created_at)}${v.status === 'completed' ? ' · abgeschlossen' : ' · in Arbeit'}`;

        const namen = istBericht
            ? (v.technicians || [])
                .map(id => (window.userList || []).find(u => String(u.id) === String(id)))
                .filter(Boolean).map(u => u.name).join(', ')
            : (v.customer_name || v.company || '');

        const zusatz = istBericht && v.operating_hours ? ` · ${v.operating_hours} Bh` : '';
        const hatPdf = istBericht ? !!v.pdf_url : v.status === 'completed';

        return `
        <div class="uvvp-liste-zeile">
            <div class="uvvp-liste-text">
                <strong>${esc(kopf)}</strong>
                <span>${esc(namen || '—')}${esc(zusatz)}</span>
                ${istBericht && v.description ? `<small>${esc(String(v.description).slice(0, 120))}</small>` : ''}
            </div>
            <div class="uvvp-liste-actions">
                <button type="button" class="btn-secondary" onclick="window.protokollListeOeffnen('${esc(String(v.id))}')">Öffnen</button>
                ${hatPdf ? `<button type="button" class="btn-secondary" onclick="window.protokollListePdf('${esc(String(v.id))}', ${v.pdf_url ? `'${esc(v.pdf_url)}'` : 'null'})">PDF</button>` : ''}
            </div>
        </div>`;
    }

    function zeichne(zustand) {
        let ov = document.getElementById('protokoll-liste-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'protokoll-liste-overlay';
            ov.className = 'uvvp-backdrop show';
            document.body.appendChild(ov);
            ov.addEventListener('click', (e) => { if (e.target === ov) window.protokollListeSchliessen(); });
        }

        const titel = ARTEN[art] ? ARTEN[art].label : 'Belege';
        let inhalt;
        if (zustand === 'lade') inhalt = '<div class="uvvp-hint">Wird geladen …</div>';
        else if (zustand === 'fehler') inhalt = '<div class="uvvp-hint">Die Belege konnten nicht geladen werden.</div>';
        else if (!liste.length) inhalt = `<div class="uvvp-hint">Für diese Maschine ist noch nichts gespeichert.</div>`;
        else inhalt = liste.map(zeile).join('');

        const maschine = (window.machineList || []).find(m => String(m.id) === String(maschinenId));
        const untertitel = maschine
            ? [maschine.manufacturer, maschine.name].filter(Boolean).join(' ') +
              (maschine.serial ? ` · #${maschine.serial}` : '')
            : '';

        ov.innerHTML = `
            <div class="uvvp-window uvvp-window-sm">
                <div class="uvvp-head">
                    <div>
                        <h2>${esc(titel)}</h2>
                        <span class="uvvp-sub">${esc(untertitel)}</span>
                    </div>
                    <button type="button" class="btn-close-modal" onclick="window.protokollListeSchliessen()">&times;</button>
                </div>
                <div class="uvvp-body">${inhalt}</div>
                <div class="uvvp-foot">
                    <button type="button" class="btn-secondary" onclick="window.protokollListeSchliessen()">Schließen</button>
                    <button type="button" class="btn-primary" onclick="window.protokollListeNeu()">Neu anlegen</button>
                </div>
            </div>`;
    }
})();
