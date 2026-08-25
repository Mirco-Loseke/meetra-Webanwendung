// ==========================================================
// MIETVEREINBARUNG — ÜBERSICHT JE MASCHINE
// ----------------------------------------------------------
// Maschine → Aktionen → Ansehen → "Mietvereinbarung": zeigt alle
// gespeicherten Mietvereinbarungen dieser Maschine. Von hier aus
// lässt sich eine öffnen (bearbeiten), das PDF ansehen oder der
// ganze Vorgang löschen (dann verschwinden PDF und Fotos auch aus
// Cloudflare R2 — siehe window.deleteRentalAgreement).
//
// Gespeichert wird in "rental_agreements"
// (Migration: supabase/supabase_add_rental_agreements.sql).
//
// EIGENSTAENDIG: diese Datei gehört zum Mietvereinbarungs-Baustein
// und kann mit ihm zusammen ersatzlos entfernt werden.
// ==========================================================

(function () {
    'use strict';

    let liste = [];
    let maschineId = null;

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    function datum(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return `${d.toLocaleDateString('de-DE')}, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
    }

    // Die Maschine, für die das Aktionsfenster geöffnet wurde. Der Merker
    // ist ein Skript-Global aus js/service-list.js; js/service-picker.js
    // legt ihn zusätzlich auf window ab.
    function aktuelleMaschine() {
        if (typeof currentSelectedMachineForService !== 'undefined' && currentSelectedMachineForService) {
            return currentSelectedMachineForService;
        }
        return window.currentSelectedMachineForService || null;
    }

    window.showMietvereinbarungenForMachine = async function (machineId) {
        if (typeof window.closeServiceActionModal === 'function') window.closeServiceActionModal();

        maschineId = machineId || aktuelleMaschine();
        if (!maschineId) { window.showToast('Keine Maschine ausgewählt.'); return; }
        if (!window.supabaseClient) { window.showToast('Ohne Verbindung gibt es keine Übersicht.'); return; }

        zeichne('lade');

        try {
            const { data, error } = await window.supabaseClient
                .from('rental_agreements')
                .select('*')
                .eq('machine_id', maschineId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            liste = data || [];
            zeichne();
        } catch (e) {
            console.error('Mietvereinbarungen konnten nicht geladen werden:', e);
            liste = [];
            zeichne(/rental_agreements/.test((e && e.message) || '') ? 'migration' : 'fehler');
        }
    };

    window.mietListeSchliessen = function () {
        const ov = document.getElementById('miet-liste-overlay');
        if (ov) ov.remove();
    };

    window.mietListeBearbeiten = function (id) {
        window.mietListeSchliessen();
        window.openMietvereinbarung(maschineId, id);
    };

    window.mietListeLoeschen = async function (id) {
        const eintrag = liste.find(x => String(x.id) === String(id));
        if (!eintrag) return;
        if (typeof window.canDelete === 'function' && !window.canDelete('Mietvereinbarungen')) return;
        if (!confirm('Diese Mietvereinbarung endgültig löschen?\n\nPDF und Fotos werden auch aus der Cloud entfernt.')) return;

        try {
            await window.deleteRentalAgreement(id);
            window.showToast('Mietvereinbarung gelöscht.');
            window.showMietvereinbarungenForMachine(maschineId);
        } catch (e) {
            console.error('Löschen fehlgeschlagen:', e);
            window.showToast('Löschen fehlgeschlagen: ' + ((e && e.message) || 'unbekannter Fehler'));
        }
    };

    window.mietListePdf = function (url) {
        if (!url) return;
        if (typeof window.previewDocument === 'function') {
            window.previewDocument(url, 'Mietvereinbarung', 'application/pdf');
        } else {
            window.open(url, '_blank');
        }
    };

    function zeile(v) {
        const d = v.data || {};
        const mieter = (d.mieter && d.mieter.name) || 'ohne Mieter';
        const ort = (d.mieter && d.mieter.einsatzort) || '';
        const von = (d.miete && d.miete.beginn) || '';
        const bis = (d.miete && d.miete.ende) || '';
        const zeitraum = von || bis
            ? `${von ? von.split('-').reverse().join('.') : '—'} bis ${bis ? bis.split('-').reverse().join('.') : 'offen'}`
            : '';
        const bilder = Array.isArray(v.photos) ? v.photos.length : 0;

        return `
        <div class="miet-liste-zeile">
            <div class="miet-liste-text">
                <strong>${esc(mieter)}</strong>
                <span>${esc(zeitraum)}${ort ? ' · ' + esc(ort) : ''}</span>
                <small>Gespeichert ${esc(datum(v.updated_at || v.created_at))}${bilder ? ` · ${bilder} Foto${bilder === 1 ? '' : 's'}` : ''}</small>
            </div>
            <div class="miet-liste-knoepfe">
                ${v.pdf_url ? `<button type="button" class="btn-secondary" onclick="window.mietListePdf('${esc(v.pdf_url)}')" title="PDF ansehen">PDF</button>` : ''}
                <button type="button" class="btn-primary" onclick="window.mietListeBearbeiten('${esc(v.id)}')">Bearbeiten</button>
                <button type="button" class="btn-secondary delete-permission-required miet-liste-weg" onclick="window.mietListeLoeschen('${esc(v.id)}')" title="Löschen">&times;</button>
            </div>
        </div>`;
    }

    function zeichne(zustand) {
        window.mietListeSchliessen();

        const maschine = (window.machineList || []).find(m => String(m.id) === String(maschineId));
        const name = maschine
            ? [maschine.manufacturer, maschine.name, maschine.serial ? '#' + maschine.serial : ''].filter(Boolean).join(' ')
            : 'Maschine';

        let inhalt;
        if (zustand === 'lade') {
            inhalt = `<p class="miet-liste-leer">Wird geladen …</p>`;
        } else if (zustand === 'migration') {
            inhalt = `<p class="miet-liste-leer">Die Tabelle „rental_agreements" fehlt noch.<br>
                      Bitte <code>supabase/supabase_add_rental_agreements.sql</code> in Supabase ausführen.</p>`;
        } else if (zustand === 'fehler') {
            inhalt = `<p class="miet-liste-leer">Die Übersicht konnte nicht geladen werden.</p>`;
        } else if (!liste.length) {
            inhalt = `<p class="miet-liste-leer">Für diese Maschine ist noch keine Mietvereinbarung gespeichert.</p>`;
        } else {
            inhalt = liste.map(zeile).join('');
        }

        const ov = document.createElement('div');
        ov.id = 'miet-liste-overlay';
        ov.className = 'miet-liste-overlay';
        ov.onclick = (e) => { if (e.target === ov) window.mietListeSchliessen(); };
        ov.innerHTML = `
            <div class="miet-liste-fenster">
                <div class="miet-liste-kopf">
                    <div>
                        <h2>Mietvereinbarungen</h2>
                        <span>${esc(name)}</span>
                    </div>
                    <button type="button" class="miet-close" onclick="window.mietListeSchliessen()" title="Schließen">&times;</button>
                </div>
                <div class="miet-liste-inhalt">${inhalt}</div>
                <div class="miet-liste-fuss">
                    <button type="button" class="btn-secondary" onclick="window.mietListeSchliessen()">Schließen</button>
                    <button type="button" class="btn-primary" onclick="window.mietListeSchliessen(); window.openMietvereinbarung('${esc(maschineId)}')">Neue anlegen</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
    }

    console.log('Mietvereinbarungs-Übersicht geladen.');
})();
