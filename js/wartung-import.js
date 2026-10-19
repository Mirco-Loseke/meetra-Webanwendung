/* Wartungshistorie nachtragen: mehrere alte Wartungen (mit Originalbericht) für eine Maschine
   auf einmal anlegen, danach direkt die nächste Maschine. Speichert wie der Schnelleintrag
   „Wartung“ in manual_history_entries (type 'wartung', files = Nachweise). */
(function () {
    const ARTEN = ['Motorwartung', 'SBA-Wartung', 'Hydraulikwartung', 'AdBlue-Wartung', 'UVV-Wartung'];
    let zeilen = [];
    let maschinen = {};
    let zaehler = 0;

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function maschinenLabel(m) {
        const serie = m.serial || m.serial_number || '';
        return [m.manufacturer, m.name].filter(Boolean).join(' ') + (serie ? ' · ' + serie : '') + ' · #' + m.id;
    }

    // Datum aus dem Dateinamen raten: 2021-05-03, 20210503, 03.05.2021, 03-05-21
    function datumAusName(name) {
        const n = String(name || '');
        let m = n.match(/(20\d{2}|19\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])/);
        if (m) return `${m[1]}-${m[2]}-${m[3]}`;
        m = n.match(/(0[1-9]|[12]\d|3[01])[-_.](0[1-9]|1[0-2])[-_.](20\d{2}|\d{2})(?!\d)/);
        if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2]}-${m[1]}`;
        return '';
    }

    function modal() {
        let el = document.getElementById('wartung-import-modal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'wartung-import-modal';
        el.className = 'modal-backdrop';
        el.innerHTML = `
            <div class="modal-content wi-fenster">
                <div class="fenster-kopf">
                    <h2>Wartungshistorie nachtragen</h2>
                    <button type="button" class="knopf-x" aria-label="Schließen" id="wi-zu">&times;</button>
                </div>
                <label class="form-label-caps" for="wi-maschine">Maschine</label>
                <input type="text" id="wi-maschine" class="glass-input" list="wi-maschinen-liste" placeholder="Maschine suchen (Hersteller, Name, Serien-Nr.)" autocomplete="off">
                <datalist id="wi-maschinen-liste"></datalist>
                <div id="wi-drop" class="wi-drop">
                    <input type="file" id="wi-dateien" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" hidden>
                    <label for="wi-dateien">Originalberichte hierher ziehen oder klicken — pro Datei entsteht eine Wartung (Datum wird aus dem Dateinamen erkannt)</label>
                </div>
                <div id="wi-zeilen" class="wi-zeilen"></div>
                <div class="fenster-fuss">
                    <button type="button" class="knopf knopf--sekundaer" id="wi-leer">+ Wartung ohne Datei</button>
                    <span class="wi-fuss-platz"></span>
                    <button type="button" class="knopf knopf--sekundaer" id="wi-abbrechen">Abbrechen</button>
                    <button type="button" class="knopf knopf--primaer" id="wi-speichern">Alle speichern</button>
                </div>
            </div>`;
        document.body.appendChild(el);
        el.querySelector('#wi-zu').onclick = el.querySelector('#wi-abbrechen').onclick = schliessen;
        el.querySelector('#wi-leer').onclick = () => { neueZeile(null); zeichnen(); };
        el.querySelector('#wi-speichern').onclick = speichern;
        const input = el.querySelector('#wi-dateien');
        input.onchange = () => { Array.from(input.files).forEach(f => neueZeile(f)); input.value = ''; zeichnen(); };
        const drop = el.querySelector('#wi-drop');
        ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('aktiv'); }));
        drop.addEventListener('dragleave', e => { if (!drop.contains(e.relatedTarget)) drop.classList.remove('aktiv'); });
        drop.addEventListener('drop', e => {
            e.preventDefault(); drop.classList.remove('aktiv');
            Array.from(e.dataTransfer.files || []).forEach(f => neueZeile(f));
            zeichnen();
        });
        const liste = el.querySelector('#wi-zeilen');
        liste.addEventListener('input', e => {
            const row = e.target.closest('[data-z]');
            const z = row && zeilen.find(x => x.id == row.dataset.z);
            if (!z) return;
            if (e.target.dataset.f === 'datum') z.datum = e.target.value;
            else if (e.target.dataset.f === 'notiz') z.notiz = e.target.value;
            else if (e.target.dataset.art) {
                z.arten = e.target.checked ? z.arten.concat(e.target.dataset.art) : z.arten.filter(a => a !== e.target.dataset.art);
            }
        });
        liste.addEventListener('click', e => {
            const b = e.target.closest('[data-weg]');
            if (!b) return;
            zeilen = zeilen.filter(x => x.id != b.dataset.weg);
            zeichnen();
        });
        return el;
    }

    function neueZeile(file) {
        zeilen.push({ id: ++zaehler, file, datum: file ? datumAusName(file.name) : '', arten: [], notiz: '' });
    }

    function zeichnen() {
        const liste = document.getElementById('wi-zeilen');
        if (!liste) return;
        liste.innerHTML = zeilen.map(z => `
            <div class="wi-zeile" data-z="${z.id}">
                <div class="wi-zeile-kopf">
                    <span class="wi-datei">${z.file ? '📄 ' + esc(z.file.name) : 'Ohne Datei'}</span>
                    <button type="button" class="knopf-x" data-weg="${z.id}" aria-label="Entfernen" title="Entfernen">&times;</button>
                </div>
                <div class="wi-felder">
                    <input type="date" class="glass-input" data-f="datum" value="${esc(z.datum)}" aria-label="Datum der Wartung">
                    <input type="text" class="glass-input" data-f="notiz" value="${esc(z.notiz)}" placeholder="Firma / Notiz (optional)">
                </div>
                <div class="wi-arten">${ARTEN.map(a => `<label class="wi-art"><input type="checkbox" data-art="${a}"${z.arten.includes(a) ? ' checked' : ''}> ${a}</label>`).join('')}</div>
            </div>`).join('');
    }

    function schliessen() {
        const el = document.getElementById('wartung-import-modal');
        if (el) el.classList.remove('active', 'show');
    }

    async function speichern() {
        const el = document.getElementById('wartung-import-modal');
        const toast = (t, typ) => window.showToast && window.showToast(t, typ);
        const label = el.querySelector('#wi-maschine').value.trim();
        const m = maschinen[label];
        if (!m) { toast('Bitte eine Maschine aus der Liste wählen.'); return; }
        if (!zeilen.length) { toast('Keine Wartungen zum Speichern.'); return; }
        if (zeilen.some(z => !z.datum)) { toast('Bei jeder Wartung fehlt noch das Datum.'); return; }
        const btn = el.querySelector('#wi-speichern');
        btn.disabled = true; btn.textContent = 'Speichert…';
        try {
            const mFolder = window.getMachineFolderName(m.id, m.manufacturer, m.name, m.serial || m.serial_number, m.year);
            const rows = [];
            for (const z of zeilen) {
                let files = [];
                if (z.file) {
                    const res = await window.FileUploadService.uploadFiles([z.file],
                        f => `${mFolder}/Wartung/${Date.now()}-${z.id}-${f.name.replace(/[^\w.\-]+/g, '_')}`,
                        { bucket: 'dateien', compress: true, concurrency: 1, provider: 'cloudflare-r2' });
                    files = res.map(r => ({ url: r.url, type: r.type, name: r.name, original: true }));
                }
                rows.push({
                    machine_id: m.id, type: 'wartung', title: 'Wartung',
                    content: z.arten.length ? z.arten.join(', ') : 'Wartung',
                    remark: z.notiz.trim() || null, files,
                    created_at: new Date(z.datum + 'T12:00:00').toISOString(),
                    created_by: window.activeUser?.id
                });
            }
            const { error } = await window.supabaseClient.from('manual_history_entries').insert(rows);
            if (error) throw error;
            await window.recalculateMachineMaintenanceFromHistory(m.id);
            toast(rows.length + ' Wartung(en) für ' + label.split(' · #')[0] + ' gespeichert', 'success');
            if (window.maschinenZentraleNeuLaden) window.maschinenZentraleNeuLaden(m.id);
            zeilen = [];
            el.querySelector('#wi-maschine').value = '';
            zeichnen();
        } catch (err) {
            console.error('Wartungs-Import:', err);
            toast('Fehler beim Speichern: ' + (err.message || err), 'error');
        } finally {
            btn.disabled = false; btn.textContent = 'Alle speichern';
        }
    }

    window.openWartungImport = function (machineId) {
        const el = modal();
        maschinen = {};
        const dl = el.querySelector('#wi-maschinen-liste');
        const liste = (window.machineList || []).slice();
        dl.innerHTML = liste.map(m => { const l = maschinenLabel(m); maschinen[l] = m; return `<option value="${esc(l)}"></option>`; }).join('');
        const vor = liste.find(m => String(m.id) === String(machineId));
        el.querySelector('#wi-maschine').value = vor ? maschinenLabel(vor) : '';
        zeilen = [];
        zeichnen();
        el.classList.add('active');
    };
})();
