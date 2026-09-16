// ==========================================
// LISTEN MODULE
// ==========================================
// "Listen"-Übersicht mit mehreren Unterlisten (Tabs). Aktuell: Angebote (CSV/Excel-Import aus
// Sage 100, analog zum Adressimport in customers.js) und Maschinen (folgt später).

(function () {
    'use strict';

    // Global state for Angebote import
    let angeboteHeaders = [];
    let angeboteRows = [];
    let angeboteList = [];
    let editingAngebotMachineId = null;
    let editingAngebotMachineMode = 'search'; // 'search' (Dropdown) oder 'freitext' (reines Textfeld)
    let zuletztBearbeiteteMaschineZelle = null; // Angebot-ID, deren Maschinen-Zelle gerade als Eingabe gezeichnet ist
    let pendingFreitextValue = '';

    // Vollständiges deutsches Währungsformat: 1.234.567 € — keine Abkürzungen
    function fmtEurFull(v) {
        return Math.round(v).toLocaleString('de-DE') + ' €';
    }

    document.addEventListener('DOMContentLoaded', () => {
        setupAngeboteImportListeners();
    });

    // Schliesst die Maschinen-Such-Dropdown/-Eingabe, wenn irgendwo ausserhalb geklickt wird.
    document.addEventListener('click', (e) => {
        if (editingAngebotMachineId !== null &&
            !e.target.closest('.angebot-machine-search') &&
            !e.target.closest('#angebot-machine-dropdown-portal') &&
            !e.target.closest('.angebot-machine-edit-btn')) {
            const zelle = zuletztBearbeiteteMaschineZelle != null ? zuletztBearbeiteteMaschineZelle : editingAngebotMachineId;
            editingAngebotMachineId = null;
            const dropdown = document.getElementById('angebot-machine-dropdown-portal');
            if (dropdown) dropdown.style.display = 'none';
            window.rerenderAngebotMachineCell(zelle);
        }
    });

    // ==========================================
    // TAB NAVIGATION
    // ==========================================
    window.switchListenTab = function (tab) {
        const isAngebote = tab === 'angebote';
        document.getElementById('listen-tab-content-angebote').classList.toggle('hidden', !isAngebote);
        document.getElementById('listen-tab-content-maschinen').classList.toggle('hidden', isAngebote);
        document.getElementById('listen-tab-btn-angebote').classList.toggle('active', isAngebote);
        document.getElementById('listen-tab-btn-maschinen').classList.toggle('active', !isAngebote);
        if (scrollBeobachter) setTimeout(scrollBeobachter, 0);
    };

    // ==========================================
    // ANGEBOTE: LISTE LADEN & ANZEIGEN
    // ==========================================
    let autoAssignGelaufen = false;
    window.fetchAngebote = async function () {
        const container = document.getElementById('angebote-list-container');
        if (!window.supabaseClient) return;

        const { data, error } = await window.supabaseClient
            .from('angebote')
            .select('*, customers(name), angebot_notizen(id, content, created_at)')
            .order('belegdatum', { ascending: false });

        if (error) {
            console.error('Error fetching Angebote:', error);
            if (container) container.innerHTML = `<div style="text-align:center; color:rgba(255,200,200,0.8); padding:2rem;">Fehler beim Laden: ${error.message}</div>`;
            return;
        }

        angeboteList = data || [];

        // Einmal je Sitzung: Angebote ohne Adresse noch einmal gegen das
        // Adressbuch halten (Matchcode, Name, Namensanfang) — dann neu laden.
        if (!autoAssignGelaufen && angeboteList.some(a => !a.customer_id && a.kundenmatchcode)) {
            autoAssignGelaufen = true;
            await window.autoAssignAngeboteMachines();
            const { data: neu } = await window.supabaseClient
                .from('angebote')
                .select('*, customers(name), angebot_notizen(id, content, created_at)')
                .order('belegdatum', { ascending: false });
            if (neu) angeboteList = neu;
        }
        // Neueste Belegnummer zuerst (numerisch, damit 30154 vor 9999 steht).
        angeboteList.sort((x, y) => {
            const nx = parseInt(String(x.belegnummer || '').replace(/\D/g, ''), 10), ny = parseInt(String(y.belegnummer || '').replace(/\D/g, ''), 10);
            if (!isNaN(nx) && !isNaN(ny) && nx !== ny) return ny - nx;
            return String(y.belegnummer || '').localeCompare(String(x.belegnummer || ''), 'de', { numeric: true });
        });
        await ladeLetztenImport();
        await ladeAngebotVorgaenge();
        populateAngeboteFilterOptions();
        window.renderAngeboteList();
        window.renderAngebotReminderBadge();
        // Angebote ohne Vorgang bekommen jetzt einen — im Hintergrund, die
        // Liste steht schon.
        angebotVorgaengeAnlegen();
    };

    // ------------------------------------------------------------------
    // Letzter Belegimport — steht klein über „Belegdatum" in der Tabelle.
    // Liegt in app_settings (key 'angebote_last_import'), damit alle
    // Nutzer denselben Stand sehen. { at: ISO-Zeit, by: Name }
    // ------------------------------------------------------------------
    let letzterImport = null;
    async function ladeLetztenImport() {
        try {
            const { data } = await window.supabaseClient
                .from('app_settings').select('value').eq('key', 'angebote_last_import').limit(1);
            letzterImport = (data && data[0] && data[0].value) || null;
        } catch (e) { letzterImport = null; }
    }
    async function merkeLetztenImport() {
        letzterImport = { at: new Date().toISOString(), by: (window.activeUser && window.activeUser.name) || '' };
        try {
            const { error } = await window.supabaseClient
                .from('app_settings').upsert({ key: 'angebote_last_import', value: letzterImport });
            if (error) console.warn('Importzeitpunkt nicht gespeichert:', error.message);
        } catch (e) { console.warn('Importzeitpunkt nicht gespeichert:', e); }
    }
    function letzterImportText() {
        if (!letzterImport || !letzterImport.at) return '';
        const d = new Date(letzterImport.at);
        if (isNaN(d)) return '';
        const datum = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const zeit = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        return `${datum}, ${zeit} Uhr${letzterImport.by ? ' · ' + escapeHtml(letzterImport.by) : ''}`;
    }

    // Werktage (Mo–Fr) seit dem letzten Import. Ohne Import: unendlich.
    function werktageSeitImport() {
        if (!letzterImport || !letzterImport.at) return Infinity;
        const von = new Date(letzterImport.at);
        if (isNaN(von)) return Infinity;
        const start = new Date(von.getFullYear(), von.getMonth(), von.getDate());
        const heute = new Date(); const ende = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate());
        let n = 0;
        for (let d = new Date(start); d < ende; d.setDate(d.getDate() + 1)) {
            const w = d.getDay();
            if (w !== 0 && w !== 6) n++;
        }
        return n;
    }
    // Zeile über der Tabelle: nach mehr als 3 Werktagen rot mit Ausrufezeichen —
    // dann sollte mal wieder ein Belegimport gemacht werden.
    function letzterImportZeile() {
        const text = letzterImportText() || '—';
        const tage = werktageSeitImport();
        const alt = tage > 3;
        const hinweis = alt
            ? (isFinite(tage) ? `seit ${tage} Werktagen kein Belegimport — bitte aktualisieren` : 'noch nie importiert — bitte Belege importieren')
            : 'Wann zuletzt ein Belegimport aus Sage 100 stattgefunden hat';
        return `<span title="${escapeHtml(hinweis)}" style="display:inline-flex; align-items:center; gap:6px; font-size:0.72rem; ${alt
            ? 'color:#f87171; font-weight:800; padding:3px 10px; border-radius:999px; background:rgba(248,113,113,0.12); border:1px solid rgba(248,113,113,0.5);'
            : 'color:rgba(255,255,255,0.5);'}">${alt ? '<span style="display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; border-radius:50%; background:#f87171; color:#fff; font-size:0.7rem; font-weight:900;">!</span>' : ''}zuletzt aktualisiert: ${text}${alt && isFinite(tage) ? ` (${tage} Werktage)` : ''}</span>`;
    }

    // ------------------------------------------------------------------
    // JEDES ANGEBOT IST EIN VORGANG
    // ------------------------------------------------------------------
    // angebote.process_id (Migration supabase_add_angebot_vorgang.sql) zeigt
    // auf den Vorgang in internal_processes. Dort — und NUR dort — liegen
    // Zuständiger (assigned_users), Stand (status_updates), Adresse und
    // Maschine. Die Liste hier liest und schreibt diese Werte über den
    // Vorgang; Status/VK/EK/Realisierbar bleiben in angebote und werden
    // vom Vorgang aus angezeigt (js/processes.js, js/processes-ui.js).
    // ------------------------------------------------------------------
    let vorgaengeByAngebot = {};      // angebot.id -> Vorgangszeile
    let vorgangSpalteFehlt = false;   // process_id noch nicht in der Datenbank
    let vorgangAnlegenLaeuft = false;
    let vorgangSpalteGemeldet = false;

    function vorgangZu(a) { return a ? (vorgaengeByAngebot[a.id] || null) : null; }

    async function ladeAngebotVorgaenge() {
        vorgaengeByAngebot = {};
        vorgangSpalteFehlt = angeboteList.length > 0 && !('process_id' in angeboteList[0]);
        if (vorgangSpalteFehlt) {
            if (!vorgangSpalteGemeldet) {
                vorgangSpalteGemeldet = true;
                window.showToast('Angebote ohne Vorgangs-Verknüpfung — supabase/supabase_add_angebot_vorgang.sql in Supabase ausführen.');
            }
            return;
        }
        const ids = [...new Set(angeboteList.map(a => a.process_id).filter(Boolean))];
        const byId = {};
        for (let i = 0; i < ids.length; i += 200) {
            const { data, error } = await window.supabaseClient
                .from('internal_processes').select('*').in('id', ids.slice(i, i + 200));
            if (error) { console.warn('Vorgänge zu Angeboten nicht geladen:', error.message); break; }
            (data || []).forEach(p => { byId[p.id] = p; });
        }
        angeboteList.forEach(a => { if (a.process_id && byId[a.process_id]) vorgaengeByAngebot[a.id] = byId[a.process_id]; });
        await abgeschlosseneVorgaengeErledigen();
    }

    // Nachziehen beim Laden: Angebote mit „Auftrag erhalten/verloren", deren
    // Vorgang noch nicht erledigt ist (z. B. Status früher gesetzt, als die
    // Automatik den Namen nicht erkannte) — die Vorgänge werden gesammelt auf
    // „erledigt" gesetzt, damit sie aus den offenen Vorgängen verschwinden.
    async function abgeschlosseneVorgaengeErledigen() {
        const ids = [];
        angeboteList.forEach(a => {
            const p = vorgaengeByAngebot[a.id];
            if (p && p.status !== 'erledigt' && angebotAbgeschlossen(a)) ids.push(p.id);
        });
        if (!ids.length) return;
        const { error } = await window.supabaseClient
            .from('internal_processes').update({ status: 'erledigt' }).in('id', ids);
        if (error) { console.warn('Vorgänge zu abgeschlossenen Angeboten nicht erledigt:', error.message); return; }
        const set = new Set(ids.map(String));
        Object.values(vorgaengeByAngebot).forEach(p => { if (set.has(String(p.id))) p.status = 'erledigt'; });
        if (window.eventsState && Array.isArray(window.eventsState.processes)) {
            let treffer = false;
            window.eventsState.processes.forEach(p => { if (set.has(String(p.id))) { p.status = 'erledigt'; treffer = true; } });
            if (treffer && typeof window.renderProcesses === 'function') window.renderProcesses();
        }
    }

    // Für jedes Angebot ohne Vorgang einen anlegen. Läuft nach dem Laden
    // der Liste; bei Gleichzeitigkeit gewinnt, wer process_id zuerst setzt
    // (`.is('process_id', null)`), der andere räumt seinen Vorgang wieder weg.
    async function angebotVorgaengeAnlegen() {
        if (vorgangSpalteFehlt || vorgangAnlegenLaeuft || typeof window.insertMitErsteller !== 'function') return;
        const ohne = angeboteList.filter(a => !a.process_id);
        if (!ohne.length) return;
        vorgangAnlegenLaeuft = true;
        let n = 0;
        try {
            for (const a of ohne) {
                const proc = await vorgangFuerAngebotAnlegen(a);
                if (proc) { a.process_id = proc.id; vorgaengeByAngebot[a.id] = proc; n++; }
            }
        } finally { vorgangAnlegenLaeuft = false; }
        if (n) {
            window.showToast(`${n} Angebot${n === 1 ? '' : 'e'} als Vorgang angelegt.`);
            window.renderAngeboteList();
            if (typeof window.fetchProcesses === 'function') window.fetchProcesses();
        }
    }

    async function vorgangFuerAngebotAnlegen(a) {
        const jetzt = new Date().toISOString();
        const payload = {
            // „Angebot 30154 – HIPPO 400": Belegnummer plus Maschine, sobald bekannt.
            title: (() => { const m = getAngebotMachineLabel(a) || ''; return ('Angebot ' + (a.belegnummer || '') + (m ? ' – ' + m : '')).trim(); })(),
            process_type: 'offer',
            process_date: a.belegdatum ? new Date(a.belegdatum + 'T08:00:00').toISOString() : jetzt,
            machine_id: a.machine_id || null,
            customer_id: a.customer_id || null,
            // Auftrag erhalten/verloren = abgeschlossen -> Vorgang gleich erledigt.
            status: angebotAbgeschlossen(a) ? 'erledigt' : 'offen',
            assigned_users: [],
            steps: [],
            // Alte Bemerkung aus der Liste wird zum ersten Stand-Eintrag.
            status_updates: (a.bemerkung || '').trim() ? [{
                text: a.bemerkung.trim(),
                by: 'Angebotsliste',
                by_id: null,
                at: a.updated_at || jetzt
            }] : []
        };
        try {
            const { data, error } = await window.insertMitErsteller('internal_processes', payload);
            if (error) throw error;
            const proc = data && data[0];
            if (!proc) return null;
            const { data: upd, error: e2 } = await window.supabaseClient
                .from('angebote').update({ process_id: proc.id })
                .eq('id', a.id).is('process_id', null).select('id');
            if (e2 || !upd || !upd.length) {
                await window.supabaseClient.from('internal_processes').delete().eq('id', proc.id);
                return null;
            }
            return proc;
        } catch (err) {
            console.error('Vorgang zum Angebot anlegen fehlgeschlagen:', a.belegnummer, err);
            return null;
        }
    }

    // Änderungen am Vorgang aus der Liste heraus (Zuständiger, Maschine,
    // Adresse). Aktualisiert die lokale Kopie und die Vorgangsansicht.
    async function vorgangAktualisieren(a, felder) {
        const proc = vorgangZu(a);
        if (!proc) return false;
        const { data, error } = await window.supabaseClient
            .from('internal_processes').update(felder).eq('id', proc.id).select('*');
        if (error) { window.showToast('Vorgang speichern fehlgeschlagen: ' + error.message); return false; }
        if (data && data[0]) vorgaengeByAngebot[a.id] = data[0];
        populateAngeboteFilterOptions();   // Zuständigen-Filter kennt den neuen Namen, zeichnet die Liste neu
        if (window.eventsState && Array.isArray(window.eventsState.processes)) {
            const i = window.eventsState.processes.findIndex(p => String(p.id) === String(proc.id));
            if (i !== -1 && data && data[0]) {
                window.eventsState.processes[i] = Object.assign({}, window.eventsState.processes[i], data[0]);
                if (typeof window.renderProcesses === 'function') window.renderProcesses();
            }
        }
        return true;
    }

    // Maschine/Adresse des Angebots geändert -> in den Vorgang spiegeln.
    async function vorgangMitAngebotAbgleichen(a) {
        const proc = vorgangZu(a);
        if (!proc) return;
        const felder = {};
        if (String(proc.machine_id || '') !== String(a.machine_id || '')) felder.machine_id = a.machine_id || null;
        if (String(proc.customer_id || '') !== String(a.customer_id || '')) felder.customer_id = a.customer_id || null;
        // Automatischer Titel „Angebot <Nr> – <Maschine>" folgt der Maschine —
        // ein von Hand ergänzter Titel (mit weiterem „ – …"-Teil) bleibt stehen.
        const nr = String(a.belegnummer || '').trim();
        const m = getAngebotMachineLabel(a) || '';
        const soll = ('Angebot ' + nr + (m ? ' – ' + m : '')).trim();
        const autoMuster = new RegExp('^Angebot\\s+' + nr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s+–\\s+[^–]*)?$');
        if (nr && proc.title !== soll && autoMuster.test(String(proc.title || '').trim())) felder.title = soll;
        if (Object.keys(felder).length) await vorgangAktualisieren(a, felder);
    }

    // Von js/processes-ui.js aufgerufen, wenn sich ein Vorgang geändert hat
    // (Stand, Zuständiger …) — dann die Liste nachziehen, falls sie offen ist.
    window.angeboteNachVorgangAktualisieren = function (procs) {
        const liste = Array.isArray(procs) ? procs : (procs ? [procs] : []);
        if (!liste.length || !angeboteList.length) return;
        const byId = {};
        liste.forEach(p => { byId[String(p.id)] = p; });
        let treffer = false;
        angeboteList.forEach(a => {
            const p = a.process_id && byId[String(a.process_id)];
            if (p) { vorgaengeByAngebot[a.id] = p; treffer = true; }
        });
        if (treffer && document.getElementById('listen')?.classList.contains('active')) window.renderAngeboteList();
    };

    // Angebotsfelder (Status, VK, EK, Realisierbar) von der Vorgangsansicht
    // aus speichern — derselbe Datensatz wie in der Liste, deshalb danach
    // beide Stellen nachziehen.
    window.angebotFeldSpeichern = async function (angebotId, felder) {
        const { data, error } = await window.supabaseClient
            .from('angebote').update(felder).eq('id', angebotId)
            .select('*, customers(name), angebot_notizen(id, content, created_at)').single();
        if (error) { window.showToast('Angebot speichern fehlgeschlagen: ' + error.message); return null; }
        const idx = angeboteList.findIndex(x => String(x.id) === String(angebotId));
        if (idx !== -1) {
            angeboteList[idx] = data;
            if (document.getElementById('listen')?.classList.contains('active')) window.renderAngeboteList();
        }
        if (window.angeboteByProcess && data.process_id) window.angeboteByProcess[String(data.process_id)] = data;
        if ('status' in felder) await window.vorgangStatusNachAngebot(data);
        return data;
    };

    // Erinnerung des Vorgangs (remind_at) → Erinnerung des Angebots (Datum).
    // Wird von processes.js/processes-ui.js gerufen, sobald sich remind_at
    // ändert oder die Vorgänge neu geladen wurden.
    window.angebotErinnerungNachVorgang = async function (proc) {
        if (!proc) return;
        const a = (window.angeboteByProcess && window.angeboteByProcess[String(proc.id)])
            || angeboteList.find(x => String(x.process_id) === String(proc.id));
        if (!a) return;
        let datum = null;
        if (proc.remind_at) {
            const d = new Date(proc.remind_at);
            if (!isNaN(d)) datum = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
        if ((a.erinnerung || null) === datum) return;
        const felder = { erinnerung: datum };
        if (!datum) { felder.erinnerung_by = null; felder.erinnerung_by_name = null; }
        else if (window.activeUser) felder.erinnerung_by_name = window.activeUser.name || null;
        let neu = await window.angebotFeldSpeichern(a.id, felder);
        if (!neu && Object.keys(felder).length > 1) neu = await window.angebotFeldSpeichern(a.id, { erinnerung: datum });
        if (neu && typeof window.renderAngebotReminderBadge === 'function') window.renderAngebotReminderBadge();
    };

    // Angebots-Status → Vorgangs-Status: „Auftrag erhalten" und „Auftrag
    // verloren" schließen den Vorgang (erledigt); geht der Status zurück auf
    // etwas Offenes, wird ein erledigter Vorgang wieder geöffnet.
    window.vorgangStatusNachAngebot = async function (a) {
        if (!a || !a.process_id) return;
        // Abgeschlossen = gewonnen ODER verloren, nach derselben Einstufung wie das
        // Dashboard (classifyAngebotStatus) — Statusnamen sind frei gepflegt, ein
        // exakter Textvergleich („Auftrag erhalten") hat z. B. „Auftrag gewonnen" verpasst.
        const fertig = angebotAbgeschlossen(a);
        const proc = vorgaengeByAngebot[a.id]
            || (window.eventsState && (window.eventsState.processes || []).find(p => String(p.id) === String(a.process_id)))
            || null;
        const bisher = proc ? proc.status : null;
        const neu = fertig ? 'erledigt' : (bisher === 'erledigt' ? 'offen' : null);
        if (!neu || neu === bisher) return;
        const { data, error } = await window.supabaseClient
            .from('internal_processes').update({ status: neu }).eq('id', a.process_id).select('*');
        if (error) { console.warn('Vorgangsstatus nicht gesetzt:', error.message); return; }
        const zeile = data && data[0];
        if (!zeile) return;
        if (vorgaengeByAngebot[a.id]) vorgaengeByAngebot[a.id] = Object.assign(vorgaengeByAngebot[a.id], zeile);
        if (window.eventsState && Array.isArray(window.eventsState.processes)) {
            const i = window.eventsState.processes.findIndex(p => String(p.id) === String(a.process_id));
            if (i !== -1) { Object.assign(window.eventsState.processes[i], zeile); if (typeof window.renderProcesses === 'function') window.renderProcesses(); }
        }
    };

    // ---- Zuständiger: assigned_users des Vorgangs ----
    function zustaendigName(wert) {
        if (!wert) return '';
        const u = (window.userList || []).find(x => String(x.id) === String(wert));
        return u ? u.name : String(wert);
    }
    function zustaendigVon(a) {
        const proc = vorgangZu(a);
        return proc && Array.isArray(proc.assigned_users) ? proc.assigned_users : [];
    }
    function renderAngebotZustaendigCell(a) {
        const proc = vorgangZu(a);
        if (!proc) {
            return `<span style="color:rgba(255,255,255,0.35); font-size:0.8rem; font-style:italic;" title="${vorgangSpalteFehlt ? 'Migration supabase_add_angebot_vorgang.sql fehlt' : 'Vorgang wird angelegt …'}">${vorgangSpalteFehlt ? 'kein Vorgang' : '…'}</span>`;
        }
        const nutzer = (window.userList || []).slice().sort((x, y) => String(x.name || '').localeCompare(String(y.name || ''), 'de'));
        const gewaehlt = zustaendigVon(a).map(String);
        const aktuell = gewaehlt[0] || '';
        const bekannt = nutzer.some(u => String(u.id) === aktuell);
        return `
            <select class="glass-form-input angebot-zustaendig-select" style="height:34px; font-size:0.9rem; width:100%; min-width:140px;"
                title="Zuständig — gilt zugleich für den Vorgang"
                onchange="window.updateAngebotZustaendig('${a.id}', this.value)">
                <option value="">-- niemand --</option>
                ${(!bekannt && aktuell) ? `<option value="${escapeHtml(aktuell)}" selected>${escapeHtml(zustaendigName(aktuell))}</option>` : ''}
                ${nutzer.map(u => `<option value="${escapeHtml(String(u.id))}" ${String(u.id) === aktuell ? 'selected' : ''}>${escapeHtml(u.name || '')}</option>`).join('')}
            </select>${gewaehlt.length > 1 ? `<div style="font-size:0.72rem; color:rgba(255,255,255,0.45); margin-top:2px;">+ ${gewaehlt.slice(1).map(zustaendigName).map(escapeHtml).join(', ')}</div>` : ''}`;
    }
    window.updateAngebotZustaendig = async function (id, wert) {
        const a = angeboteList.find(x => String(x.id) === String(id));
        if (!a) return;
        // Ein Zuständiger aus der Liste; weitere im Vorgang eingetragene bleiben.
        const rest = zustaendigVon(a).slice(1);
        const typisiert = (window.userList || []).find(u => String(u.id) === String(wert));
        const neu = wert ? [typisiert ? typisiert.id : wert].concat(rest) : rest;
        const ok = await vorgangAktualisieren(a, { assigned_users: neu });
        if (!ok) window.renderAngeboteList();
    };

    // ---- Stand: status_updates des Vorgangs, Fenster aus processes-ui ----
    function standText(a) {
        const proc = vorgangZu(a);
        const liste = proc && Array.isArray(proc.status_updates) ? proc.status_updates : [];
        return liste[0] ? String(liste[0].text || '') : (a.bemerkung || '');
    }
    function renderAngebotStandCell(a) {
        const proc = vorgangZu(a);
        if (!proc) return `<span style="color:rgba(255,255,255,0.35); font-size:0.8rem; font-style:italic;">${escapeHtml(a.bemerkung || '')}</span>`;
        const liste = Array.isArray(proc.status_updates) ? proc.status_updates : [];
        const letzte = liste[0] || null;
        const stamp = letzte && typeof window.formatProcessStatusStamp === 'function' ? window.formatProcessStatusStamp(letzte.at) : '';
        const plus = `
            <button type="button" onclick="event.stopPropagation(); window.openAngebotStand('${a.id}', event)" title="Stand hinzufügen"
                style="flex-shrink:0; width:28px; height:28px; padding:0; border-radius:999px; font-size:1rem; font-weight:800; cursor:pointer; display:flex; align-items:center; justify-content:center;
                       background:rgba(96,165,250,0.15); border:1px solid rgba(96,165,250,0.5); color:#60a5fa;">+</button>`;
        return `
            <div style="display:flex; align-items:center; gap:6px; min-width:200px; max-width:300px;">
                <div onclick="event.stopPropagation(); window.openAngebotStand('${a.id}', event)" title="Stand ansehen / ändern — derselbe Stand wie im Vorgang"
                     style="flex:1; min-width:0; cursor:pointer; padding:6px 9px; border-radius:9px; background:${letzte ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.04)'}; border:1px solid ${letzte ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.1)'};">
                    ${letzte
                        ? `<div style="color:#fff; font-size:0.88rem; line-height:1.3; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; word-break:break-word;">${escapeHtml(letzte.text || '')}</div>
                           <div style="font-size:0.7rem; color:rgba(255,255,255,0.45); margin-top:2px;">${escapeHtml(letzte.by || '')}${stamp ? ' · ' + escapeHtml(stamp) : ''}${liste.length > 1 ? ` · ${liste.length} Einträge` : ''}</div>`
                        : `<div style="color:rgba(255,255,255,0.35); font-style:italic; font-size:0.82rem;">Kein Stand</div>`}
                </div>
                ${plus}
            </div>`;
    }

    // ---- Dokumente: attachments des Vorgangs (js/process-attachments.js) ----
    // Dieselbe Liste wie im Vorgang unter „Dokumente" — hochgeladen wird über
    // dasselbe Fenster. Jede Datei: öffnen, herunterladen, per Mail senden.
    function angebotDokumente(a) {
        const proc = vorgangZu(a);
        const liste = proc && Array.isArray(proc.attachments) ? proc.attachments : [];
        return liste.filter(f => !f.step_id);
    }
    function renderAngebotDokumenteCell(a) {
        const proc = vorgangZu(a);
        if (!proc) return '';
        const docs = angebotDokumente(a);
        const zeilen = docs.slice(0, 3).map(f => `
            <div style="display:flex; align-items:center; gap:5px; min-width:0;">
                <a href="${escapeHtml(f.url || '#')}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="${escapeHtml(f.name || '')} öffnen"
                   style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#34d399; font-size:0.82rem; font-weight:600; text-decoration:none;">${escapeHtml(f.name || 'Datei')}</a>
                <a href="${escapeHtml(f.url || '#')}" download="${escapeHtml(f.name || '')}" onclick="event.stopPropagation()" title="Herunterladen"
                   style="flex-shrink:0; color:rgba(255,255,255,0.55); display:flex;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></a>
                <span onclick="event.stopPropagation(); window.angebotDokumentMailen('${a.id}', '${escapeHtml(String(f.id))}')" title="Per E-Mail senden"
                      style="flex-shrink:0; cursor:pointer; color:rgba(255,255,255,0.55); display:flex;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg></span>
            </div>`).join('');
        return `
            <div style="display:flex; flex-direction:column; gap:4px; min-width:170px;">
                ${zeilen}
                ${docs.length > 3 ? `<div style="font-size:0.72rem; color:rgba(255,255,255,0.45);">+ ${docs.length - 3} weitere</div>` : ''}
                <button type="button" onclick="event.stopPropagation(); window.openAngebotDokumente('${a.id}')" title="Dokument hinzufügen / verwalten — dieselben Dokumente wie im Vorgang"
                    style="align-self:flex-start; height:26px; padding:0 10px; border-radius:999px; font-size:0.75rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:5px;
                           background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.4); color:#34d399;">📎 ${docs.length ? docs.length + ' · verwalten' : 'Dokument hinzufügen'}</button>
            </div>`;
    }

    // Öffnet das Dokumente-Fenster des Vorgangs. Das Fenster kennt nur
    // Vorgänge aus window.eventsState.processes — deshalb ggf. erst laden.
    // ---- Dateien direkt auf die Zelle „Dokumente" ziehen ----
    // Beim Ziehen einer Datei über die Zelle erscheint „Hier ablegen",
    // Loslassen lädt sofort zum Vorgang des Angebots hoch (dasselbe wie im
    // Dokumente-Fenster, js/process-attachments.js). Fortschritt steht in
    // der Zelle, danach wird die Zeile neu gezeichnet.
    function vorgangInEventsState(proc) {
        if (!proc || !window.eventsState) return;
        if (!Array.isArray(window.eventsState.processes)) window.eventsState.processes = [];
        const i = window.eventsState.processes.findIndex(p => String(p.id) === String(proc.id));
        if (i === -1) window.eventsState.processes.push(proc); else window.eventsState.processes[i] = proc;
    }
    let dokDropZelle = null;
    function dokDropMarkieren(td, an) {
        if (!td) return;
        let hinweis = td.querySelector('.angebot-dok-drop-hinweis');
        if (an) {
            td.style.background = 'rgba(16,185,129,0.18)';
            td.style.boxShadow = 'inset 0 0 0 2px #34d399';
            if (!hinweis) {
                hinweis = document.createElement('div');
                hinweis.className = 'angebot-dok-drop-hinweis';
                hinweis.style.cssText = 'position:absolute; inset:4px; display:flex; align-items:center; justify-content:center; gap:8px; border-radius:8px; background:rgba(15,23,42,0.85); color:#34d399; font-weight:800; font-size:0.9rem; pointer-events:none; z-index:2;';
                hinweis.innerHTML = '📎 Hier ablegen — wird zum Angebot hochgeladen';
                td.appendChild(hinweis);
            }
        } else {
            td.style.background = '';
            td.style.boxShadow = '';
            if (hinweis) hinweis.remove();
        }
    }
    function hatDateien(e) {
        const t = e.dataTransfer && e.dataTransfer.types;
        return !!t && Array.prototype.indexOf.call(t, 'Files') !== -1;
    }
    document.addEventListener('dragover', (e) => {
        if (!hatDateien(e)) return;
        const td = e.target.closest && e.target.closest('#angebote-list-container .angebot-dok-drop');
        if (dokDropZelle && dokDropZelle !== td) { dokDropMarkieren(dokDropZelle, false); dokDropZelle = null; }
        if (!td) {
            // Daneben losgelassen darf die App nicht durch die Datei ersetzen.
            if (e.target.closest && e.target.closest('#listen')) { e.preventDefault(); e.dataTransfer.dropEffect = 'none'; }
            return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (dokDropZelle !== td) { dokDropZelle = td; dokDropMarkieren(td, true); }
    });
    document.addEventListener('dragleave', (e) => {
        if (!dokDropZelle) return;
        // Wirklich verlassen (nicht nur in ein Kind-Element gewechselt)?
        if (e.relatedTarget && dokDropZelle.contains(e.relatedTarget)) return;
        if (!e.relatedTarget && e.clientX > 0) return;
        dokDropMarkieren(dokDropZelle, false); dokDropZelle = null;
    });
    document.addEventListener('dragend', () => { if (dokDropZelle) { dokDropMarkieren(dokDropZelle, false); dokDropZelle = null; } });
    document.addEventListener('drop', async (e) => {
        if (!hatDateien(e)) return;
        const td = e.target.closest && e.target.closest('#angebote-list-container .angebot-dok-drop');
        if (!td) { if (e.target.closest && e.target.closest('#listen')) e.preventDefault(); return; }
        e.preventDefault();
        e.stopPropagation();
        dokDropMarkieren(td, false); dokDropZelle = null;
        const dateien = Array.from(e.dataTransfer.files || []);
        if (!dateien.length) return;
        // Hängt schon ein Dokument am Angebot? Dann fragen: ersetzen (das alte
        // wird endgültig gelöscht) oder zusätzlich anhängen. Spart den Umweg
        // „Fenster öffnen, entfernen, neu ziehen".
        const vorhandene = angebotDokumente(angeboteList.find(x => String(x.id) === String(td.dataset.angebotId)));
        let ersetzen = false;
        if (vorhandene.length) {
            const wahl = await angebotDropFrage(vorhandene, dateien);
            if (!wahl) return;
            ersetzen = wahl === 'ersetzen';
        }
        await window.angebotDateienHochladen(td.dataset.angebotId, dateien, td, ersetzen);
    }, true);

    // Kleine Rückfrage beim Ablegen: Ersetzen / Zusätzlich anhängen / Abbrechen.
    function angebotDropFrage(vorhandene, dateien) {
        return new Promise(resolve => {
            const alt = document.getElementById('angebot-drop-frage');
            if (alt) alt.remove();
            const ov = document.createElement('div');
            ov.id = 'angebot-drop-frage';
            ov.style.cssText = 'position:fixed; inset:0; z-index:999999; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.55); padding:16px;';
            const alteNamen = vorhandene.map(f => escapeHtml(f.name || 'Datei')).join('<br>');
            const neueNamen = dateien.map(f => escapeHtml(f.name)).join('<br>');
            ov.innerHTML = `
                <div style="width:min(460px, 100%); padding:22px; border-radius:16px; background:rgba(15,23,42,0.97); border:1px solid rgba(255,255,255,0.14); box-shadow:0 20px 60px rgba(0,0,0,0.6); color:#fff;">
                    <h3 style="margin:0 0 10px; font-size:1.05rem;">Dokument ersetzen?</h3>
                    <div style="font-size:0.85rem; color:rgba(255,255,255,0.75); line-height:1.5; word-break:break-word;">
                        Am Angebot hängt bereits:<br><strong style="color:#34d399;">${alteNamen}</strong><br><br>
                        Neu:<br><strong>${neueNamen}</strong>
                    </div>
                    <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; margin-top:18px;">
                        <button type="button" class="btn-secondary" data-wahl="">Abbrechen</button>
                        <button type="button" class="btn-secondary" data-wahl="hinzu">Zusätzlich anhängen</button>
                        <button type="button" class="btn-primary" data-wahl="ersetzen" style="background:#ef4444; border-color:#ef4444;">Ersetzen — alte endgültig löschen</button>
                    </div>
                </div>`;
            ov.addEventListener('click', ev => {
                const b = ev.target.closest('button[data-wahl]');
                if (b) { ov.remove(); resolve(b.dataset.wahl || null); return; }
                if (ev.target === ov) { ov.remove(); resolve(null); }
            });
            document.body.appendChild(ov);
        });
    }

    window.angebotDateienHochladen = async function (angebotId, dateien, td, ersetzen) {
        const a = angeboteList.find(x => String(x.id) === String(angebotId));
        const proc = vorgangZu(a);
        if (!proc) { window.showToast('Zu diesem Angebot gibt es noch keinen Vorgang — bitte die Liste einmal neu laden.'); return; }
        if (typeof window.uploadFilesToProcess !== 'function') { window.showToast('Dokumente-Modul nicht geladen.'); return; }
        vorgangInEventsState(proc);
        const anzeige = td ? td.querySelector('button') : null;
        const alt = anzeige ? anzeige.textContent : '';
        try {
            // Ersetzen: erst neu hochladen, dann die alten Dokumente endgültig
            // löschen (js/process-attachments.js, replaceProcessAttachments).
            const lauf = (ersetzen && typeof window.replaceProcessAttachments === 'function')
                ? window.replaceProcessAttachments : window.uploadFilesToProcess;
            const { fehler, zuGross, ersetzt } = await lauf(proc.id, dateien, (i, n, name) => {
                if (anzeige) anzeige.textContent = `⏳ ${i} von ${n} …`;
            });
            const teile = [];
            if (zuGross) teile.push(`${zuGross} Datei(en) über 8 MB übersprungen`);
            if (fehler) teile.push(`${fehler} Datei(en) fehlgeschlagen`);
            window.showToast(teile.length ? teile.join(' · ')
                : `${dateien.length} Dokument${dateien.length === 1 ? '' : 'e'} zum Angebot ${a.belegnummer || ''} ${ersetzt ? `hochgeladen — ${ersetzt} altes Dokument${ersetzt === 1 ? '' : 'e'} gelöscht` : 'hochgeladen'}.`);
        } catch (err) {
            if (anzeige) anzeige.textContent = alt;
            window.showToast('Hochladen fehlgeschlagen: ' + (err.message || 'unbekannter Fehler'));
        }
        // Vorgang hat jetzt die neue Dokumentliste (uploadDateien setzt p.attachments).
        vorgaengeByAngebot[a.id] = proc;
        window.renderAngeboteList();
        if (typeof window.renderProcesses === 'function') window.renderProcesses();
    };

    // Kleines lila Vorgangs-Symbol vor der Belegnummer: öffnet den Vorgang
    // zum Angebot (Bearbeiten-Fenster des Vorgänge-Moduls).
    function renderAngebotVorgangIcon(a) {
        const proc = vorgangZu(a);
        if (!proc) return '';
        return `<span onclick="event.stopPropagation(); window.openAngebotVorgang('${a.id}')" title="Vorgang öffnen"
                      style="flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:999px; background:rgba(167,139,250,0.14); border:1px solid rgba(167,139,250,0.45); color:#a78bfa; cursor:pointer;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                </span>`;
    }
    window.openAngebotVorgang = function (angebotId) {
        const a = angeboteList.find(x => String(x.id) === String(angebotId));
        const proc = vorgangZu(a);
        if (!proc) { window.showToast('Zu diesem Angebot gibt es noch keinen Vorgang.'); return; }
        vorgangInEventsState(proc);
        if (typeof window.openEditProcessModal === 'function') window.openEditProcessModal(proc.id);
    };

    // Stand-Fenster des Vorgangs aus der Liste heraus öffnen — den schon
    // geladenen Vorgang einhängen statt alle Vorgänge nachzuladen (langsam).
    window.openAngebotStand = function (angebotId, event) {
        if (event) event.stopPropagation();
        const a = angeboteList.find(x => String(x.id) === String(angebotId));
        const proc = vorgangZu(a);
        if (!proc) { window.showToast('Zu diesem Angebot gibt es noch keinen Vorgang — bitte die Liste einmal neu laden.'); return; }
        vorgangInEventsState(proc);
        if (typeof window.openProcessStatusUpdateModal === 'function') window.openProcessStatusUpdateModal(proc.id, null);
    };

    window.openAngebotDokumente = async function (angebotId) {
        const a = angeboteList.find(x => String(x.id) === String(angebotId));
        const proc = vorgangZu(a);
        if (!proc) { window.showToast('Zu diesem Angebot gibt es noch keinen Vorgang.'); return; }
        if (typeof window.openProcessAttachments !== 'function') { window.showToast('Dokumente-Modul nicht geladen.'); return; }
        // Das Dokumente-Fenster sucht den Vorgang in eventsState.processes.
        // Statt dafür ALLE Vorgänge zu laden (langsam), den einen, den wir
        // schon haben, dort einhängen.
        if (window.eventsState) {
            if (!Array.isArray(window.eventsState.processes)) window.eventsState.processes = [];
            const i = window.eventsState.processes.findIndex(p => String(p.id) === String(proc.id));
            if (i === -1) window.eventsState.processes.push(proc); else window.eventsState.processes[i] = proc;
        }
        window.openProcessAttachments(proc.id, null);
    };

    // Betreff und Text der Angebots-Mail — EINE Vorlage für Liste, Vorgang und
    // Adress-Historie. „bezüglich" nennt die Maschine des Angebots, sonst die
    // Anfrage. Der Link kommt nur dazu, wenn die Datei nicht angehängt werden kann.
    window.angebotMailVorlage = function (a, url) {
        // Angebotsnummer in der Mail als „2026-30154": Jahr des Belegdatums
        // (sonst aktuelles Jahr) vor der Belegnummer — nur in Betreff/Text,
        // in der Liste bleibt die Sage-Nummer wie sie ist.
        const roh = String((a && a.belegnummer) || '').trim();
        const jahr = (a && a.belegdatum && /^\d{4}/.test(String(a.belegdatum))) ? String(a.belegdatum).slice(0, 4) : String(new Date().getFullYear());
        const nr = roh && !/^\d{4}-/.test(roh) ? jahr + '-' + roh : roh;
        const maschine = a ? (getAngebotMachineLabel(a) || '') : '';
        const betreff = ('Angebot ' + nr + (maschine ? ' – ' + maschine : '')).trim();
        let text = 'Sehr geehrte Damen und Herren,\n\n'
            + 'anbei im Anhang befindet sich unser Angebot ' + nr + ' bezüglich ' + (maschine || 'Ihrer Anfrage') + '.';
        if (url) text += '\n\nDas Angebot können Sie hier abrufen:\n' + url;
        text += '\n\nMit freundlichen Grüßen';
        return { betreff: betreff, text: text };
    };

    // Datei per Mail: Browser können kein Mailprogramm mit Anhang öffnen.
    // Deshalb: wo möglich (Handy, Edge/Windows) der Teilen-Dialog mit der
    // Datei — sonst Mailprogramm mit Betreff und Link zur Datei.
    // E-Mail-Entwurf MIT Anhang: Ein Browser darf Outlook keine Datei mitgeben
    // (mailto: kennt keine Anhänge). Der Weg, der funktioniert: eine .eml-Datei
    // mit der Kopfzeile „X-Unsent: 1" — die öffnet Outlook als NEUEN ENTWURF
    // (Betreff, Text und PDF im Anhang), nicht als empfangene Mail. Die Datei
    // landet im Download-Ordner; Doppelklick öffnet den Entwurf.
    async function emlEntwurf(betreff, text, datei) {
        const antwort = await fetch(datei.url);
        if (!antwort.ok) throw new Error('Datei nicht abrufbar (' + antwort.status + ')');
        const blob = await antwort.blob();
        const b64 = await new Promise((ok, nein) => {
            const r = new FileReader();
            r.onload = () => ok(String(r.result).split(',')[1] || '');
            r.onerror = () => nein(r.error);
            r.readAsDataURL(blob);
        });
        const zeilen = (s) => s.replace(/(.{76})/g, '$1\r\n');
        const utf8b64 = (s) => btoa(unescape(encodeURIComponent(s)));
        const name = datei.name || 'Angebot.pdf';
        const typ = blob.type || datei.type || 'application/pdf';
        const grenze = 'meetra-' + Date.now().toString(36);
        const eml = [
            'X-Unsent: 1',
            'To: ',
            'Subject: =?UTF-8?B?' + utf8b64(betreff) + '?=',
            'MIME-Version: 1.0',
            'Content-Type: multipart/mixed; boundary="' + grenze + '"',
            '',
            '--' + grenze,
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            zeilen(utf8b64(text)),
            '',
            '--' + grenze,
            'Content-Type: ' + typ + '; name="=?UTF-8?B?' + utf8b64(name) + '?="',
            'Content-Transfer-Encoding: base64',
            'Content-Disposition: attachment; filename="=?UTF-8?B?' + utf8b64(name) + '?="',
            '',
            zeilen(b64),
            '',
            '--' + grenze + '--',
            ''
        ].join('\r\n');
        const out = new Blob([eml], { type: 'message/rfc822' });
        const url = URL.createObjectURL(out);
        const a = document.createElement('a');
        a.href = url;
        a.download = betreff.replace(/[\/:*?"<>|]+/g, ' ').trim() + '.eml';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
    window.angebotMailEntwurfMitAnhang = async function (angebotLike, datei) {
        const v = window.angebotMailVorlage(angebotLike, null);
        try {
            await emlEntwurf(v.betreff, v.text, datei);
            window.showToast('E-Mail-Entwurf „' + v.betreff + '.eml" heruntergeladen — Datei öffnen, dann steht der Entwurf in Outlook mit dem Angebot im Anhang.');
        } catch (e) {
            console.warn('EML-Entwurf nicht möglich, Mailprogramm mit Link:', e);
            const v2 = window.angebotMailVorlage(angebotLike, datei.url);
            window.location.href = `mailto:?subject=${encodeURIComponent(v2.betreff)}&body=${encodeURIComponent(v2.text)}`;
        }
    };

    window.angebotDokumentMailen = function (angebotId, attId) {
        const a = angeboteList.find(x => String(x.id) === String(angebotId));
        const f = angebotDokumente(a).find(x => String(x.id) === String(attId));
        if (!a || !f) return;
        window.angebotMailEntwurfMitAnhang(a, f);
    };

    // ------------------------------------------------------------------
    // ADRESSE JE ANGEBOT VON HAND ZUORDNEN
    // ------------------------------------------------------------------
    // Der Import löst den Kundenmatchcode nur bei EINDEUTIGEM Treffer auf.
    // Passt der Matchcode nicht zum Adressbuch (anders geschrieben, Sage-
    // Dopplung nicht importiert …), bleibt customer_id leer — dann hängt weder
    // der Vorgang noch die Historie an der Adresse. Hier: Klick auf die Firma
    // → Adresse suchen → zuordnen. Vorgang und Historie ziehen mit.
    let editingAngebotKundeId = null;
    let kundenCache = null;

    // Gelernte Zuordnungen Matchcode → Adresse (app_settings
    // 'angebot_matchcode_zuordnung', { "<matchcode normalisiert>": customerId }).
    // Von Hand zugeordnete Firmen gelten damit bei jedem weiteren Import.
    const normMatchcode = (s) => (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
    async function matchcodeZuordnungLaden() {
        try {
            const { data } = await window.supabaseClient
                .from('app_settings').select('value').eq('key', 'angebot_matchcode_zuordnung').limit(1);
            const v = data && data[0] && data[0].value;
            return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
        } catch (e) { return {}; }
    }
    async function matchcodeZuordnungMerken(mc, customerId) {
        const alle = await matchcodeZuordnungLaden();
        alle[mc] = customerId;
        try {
            const { error } = await window.supabaseClient
                .from('app_settings').upsert({ key: 'angebot_matchcode_zuordnung', value: alle });
            if (error) console.warn('Matchcode-Zuordnung nicht gespeichert:', error.message);
        } catch (e) { console.warn('Matchcode-Zuordnung nicht gespeichert:', e); }
    }

    // Nur Angebote ohne Adresse zeigen (Chip über der Tabelle).
    let nurOhneAdresse = false;
    window.toggleAngeboteOhneAdresse = function () {
        nurOhneAdresse = !nurOhneAdresse;
        window.renderAngeboteList();
    };
    async function kundenLaden() {
        if (kundenCache) return kundenCache;
        const { data, error } = await window.supabaseClient
            .from('customers').select('id, name, matchcode, zip_code, city, address_number').order('name').limit(5000);
        if (error) { console.warn('Adressen für Zuordnung:', error.message); return []; }
        kundenCache = data || [];
        return kundenCache;
    }
    function renderAngebotFirmaCell(a, firmaDisplay) {
        if (editingAngebotKundeId === a.id) {
            return `
                <input type="text" class="glass-form-input angebot-kunde-search" data-angebot-id="${a.id}"
                    placeholder="Adresse suchen…" value="${escapeHtml(a.kundenmatchcode || '')}"
                    style="height:34px; font-size:0.85rem; width:100%;"
                    oninput="window.filterAngebotKundeDropdown(this.value, '${a.id}')"
                    onfocus="window.filterAngebotKundeDropdown(this.value, '${a.id}')"
                    onkeydown="if(event.key==='Escape'){ window.cancelAngebotKundeEdit(); }">`;
        }
        const zugeordnet = !!a.customer_id;
        // Kleines Kontakt-Symbol: öffnet die Adresse im Adressbuch (nicht die
        // Zuordnung). Klick auf den Namen ändert weiterhin die Zuordnung.
        const kontakt = zugeordnet ? `
                <span onclick="event.stopPropagation(); window.openAddressbookDetail && window.openAddressbookDetail('${escapeHtml(String(a.customer_id))}')"
                      title="Adresse öffnen (Kontakt, Ansprechpartner, Historie)"
                      style="flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:999px; background:rgba(56,189,248,0.12); border:1px solid rgba(56,189,248,0.4); color:#38bdf8; cursor:pointer;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                </span>` : '';
        return `
            <div style="display:flex; align-items:center; gap:6px;">
                <div class="angebot-kunde-btn" onclick="event.stopPropagation(); window.startAngebotKundeEdit('${a.id}')"
                     title="${zugeordnet ? 'Adresse ändern' : 'Keine Adresse aus dem Adressbuch zugeordnet — klicken zum Zuordnen'}"
                     style="flex:1; min-width:0; cursor:pointer; display:flex; align-items:center; gap:6px; color:${zugeordnet ? '#fff' : '#f59e0b'};">
                    <span style="min-width:0; overflow-wrap:anywhere;">${escapeHtml(firmaDisplay || '—')}</span>
                    ${zugeordnet ? '' : '<span title="Nicht zugeordnet" style="flex-shrink:0;">⚠</span>'}
                </div>
                ${kontakt}
            </div>`;
    }
    window.startAngebotKundeEdit = function (angebotId) {
        editingAngebotKundeId = angebotId;
        window.renderAngeboteList();
        requestAnimationFrame(() => {
            const input = document.querySelector(`.angebot-kunde-search[data-angebot-id="${angebotId}"]`);
            if (input) { input.focus(); input.select(); window.filterAngebotKundeDropdown(input.value, angebotId); }
        });
    };
    window.cancelAngebotKundeEdit = function () {
        editingAngebotKundeId = null;
        const d = document.getElementById('angebot-kunde-dropdown-portal');
        if (d) d.style.display = 'none';
        window.renderAngeboteList();
    };
    document.addEventListener('click', (e) => {
        if (editingAngebotKundeId !== null && !e.target.closest('.angebot-kunde-search')
            && !e.target.closest('#angebot-kunde-dropdown-portal') && !e.target.closest('.angebot-kunde-btn')) {
            window.cancelAngebotKundeEdit();
        }
    });
    window.filterAngebotKundeDropdown = async function (query, angebotId) {
        const kunden = await kundenLaden();
        if (editingAngebotKundeId !== angebotId) return;
        const tokens = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
        const treffer = kunden.filter(c => {
            const s = [c.name, c.matchcode, c.zip_code, c.city, c.address_number].map(x => x == null ? '' : String(x)).join(' ').toLowerCase();
            return tokens.every(t => s.includes(t));
        }).slice(0, 30);
        let dropdown = document.getElementById('angebot-kunde-dropdown-portal');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.id = 'angebot-kunde-dropdown-portal';
            dropdown.style.cssText = 'position:fixed;z-index:999999;background:rgba(15,23,42,0.98);border:1px solid rgba(255,255,255,0.15);border-radius:12px;max-height:320px;overflow-y:auto;box-shadow:0 16px 48px rgba(0,0,0,0.7);display:none;min-width:260px;';
            document.body.appendChild(dropdown);
        }
        const input = document.querySelector(`.angebot-kunde-search[data-angebot-id="${angebotId}"]`);
        if (input) {
            const r = input.getBoundingClientRect(), margin = 8, width = Math.max(r.width, 320);
            dropdown.style.top = (r.bottom + 4) + 'px';
            dropdown.style.maxHeight = Math.max(120, Math.min(320, window.innerHeight - r.bottom - margin)) + 'px';
            dropdown.style.width = width + 'px';
            dropdown.style.left = Math.max(margin, Math.min(r.left, window.innerWidth - width - margin)) + 'px';
        }
        const zeile = (text, sub, wahl) => {
            const el = document.createElement('div');
            el.style.cssText = 'padding:9px 14px;cursor:pointer;color:#fff;font-size:0.88rem;border-bottom:1px solid rgba(255,255,255,0.05);';
            el.innerHTML = `<div style="font-weight:600;">${escapeHtml(text)}</div>${sub ? `<div style="font-size:0.75rem;color:rgba(255,255,255,0.5);">${escapeHtml(sub)}</div>` : ''}`;
            el.onmousedown = (e) => { e.preventDefault(); wahl(); };
            el.onmouseover = () => { el.style.background = 'rgba(255,255,255,0.08)'; };
            el.onmouseout = () => { el.style.background = ''; };
            return el;
        };
        dropdown.innerHTML = '';
        dropdown.appendChild(zeile('Keine Adresse', 'Zuordnung entfernen', () => window.selectAngebotKunde(angebotId, null)));
        if (!treffer.length) dropdown.appendChild(zeile('Keine Adresse gefunden', 'Anders suchen — z. B. nur ein Wort des Namens', () => {}));
        treffer.forEach(c => dropdown.appendChild(zeile(c.name || '(ohne Namen)',
            [c.zip_code, c.city].filter(Boolean).join(' ') + (c.matchcode ? ` · ${c.matchcode}` : '') + (c.address_number ? ` · Nr. ${c.address_number}` : ''),
            () => window.selectAngebotKunde(angebotId, c.id))));
        dropdown.style.display = 'block';
    };
    window.selectAngebotKunde = async function (angebotId, customerId) {
        editingAngebotKundeId = null;
        const d = document.getElementById('angebot-kunde-dropdown-portal');
        if (d) d.style.display = 'none';
        try {
            const { data, error } = await window.supabaseClient
                .from('angebote').update({ customer_id: customerId || null }).eq('id', angebotId)
                .select('*, customers(name), angebot_notizen(id, content, created_at)').single();
            if (error) throw error;
            const idx = angeboteList.findIndex(x => String(x.id) === String(angebotId));
            if (idx !== -1) angeboteList[idx] = data;
            await window.syncAngebotMachineHistory(data);
            await vorgangMitAngebotAbgleichen(data);

            // Die Zuordnung MERKEN: derselbe Sage-Matchcode landet künftig bei
            // Importen automatisch bei dieser Adresse — und alle anderen
            // Angebote mit diesem Matchcode, die noch ohne Adresse sind,
            // bekommen sie gleich mit.
            let weitere = 0;
            const mc = normMatchcode(data.kundenmatchcode);
            if (customerId && mc) {
                await matchcodeZuordnungMerken(mc, customerId);
                for (const b of angeboteList) {
                    if (String(b.id) === String(angebotId) || b.customer_id || normMatchcode(b.kundenmatchcode) !== mc) continue;
                    const { data: bNeu, error: bErr } = await window.supabaseClient
                        .from('angebote').update({ customer_id: customerId }).eq('id', b.id)
                        .select('*, customers(name), angebot_notizen(id, content, created_at)').single();
                    if (bErr || !bNeu) continue;
                    const bi = angeboteList.findIndex(x => String(x.id) === String(b.id));
                    if (bi !== -1) angeboteList[bi] = bNeu;
                    await window.syncAngebotMachineHistory(bNeu);
                    await vorgangMitAngebotAbgleichen(bNeu);
                    weitere++;
                }
            }
            window.renderAngeboteList();
            window.showToast(customerId
                ? `Adresse zugeordnet${weitere ? ` — ${weitere} weitere Angebote mit demselben Matchcode gleich mit` : ''}. Vorgang und Historie hängen jetzt daran; künftige Importe merken sich das.`
                : 'Adress-Zuordnung entfernt.');
        } catch (err) {
            window.showToast('Adresse zuordnen fehlgeschlagen: ' + (err.message || 'unbekannter Fehler'));
            window.renderAngeboteList();
        }
    };

    // Liefert für eine Angebot-Zeile die anzuzeigende Maschinen-Bezeichnung — egal ob echte
    // Maschine oder selbsterstellte Freitext-Bezeichnung, damit Filter/Anzeige beides gleich behandeln.
    function getAngebotMachineLabel(a) {
        if (a.machine_id) {
            return (typeof window.getMachineName === 'function') ? window.getMachineName(a.machine_id) : null;
        }
        return a.machine_label || null;
    }

    // Status-Kategorien (Einstellungen → Kategorien → Status), die in der
    // Angebotsliste NICHT zur Auswahl stehen sollen — auf Wunsch 2026-09-15.
    // Ein Angebot, das den Status bereits trägt, zeigt ihn weiterhin an.
    const ANGEBOT_STATUS_AUSGEBLENDET = ['tafelmiete'];
    function angebotStatusOptionen(aktuell) {
        return (window.categoryList || []).filter(c => c.type === 'status'
            && (!ANGEBOT_STATUS_AUSGEBLENDET.includes(String(c.name || '').trim().toLowerCase())
                || (aktuell && c.name === aktuell)));
    }
    window.angebotStatusOptionen = angebotStatusOptionen;

    // Ordnet einen Angebots-Status grob als gewonnen/verloren/offen ein — rein über den Namen
    // der Status-Kategorie (die Namen werden unter Einstellungen -> Kategorien frei gepflegt,
    // deshalb hier eine Wortliste statt fester IDs).
    function classifyAngebotStatus(a) {
        const s = (a.status || '').toLowerCase();
        // WICHTIG: "lost" zuerst prüfen, damit "Auftrag verloren" nicht fälschlich als 'won' gilt
        if (/verloren|abgelehnt|absage|abgesagt|storniert|kein interesse/.test(s)) return 'lost';
        if (/gewonnen|auftrag|bestellt|verkauft|angenommen|zusage/.test(s)) return 'won';
        return 'open';
    }

    // Auftrag erhalten oder verloren -> der zugehörige Vorgang gilt als erledigt.
    function angebotAbgeschlossen(a) { return classifyAngebotStatus(a) !== 'open'; }
    window.angebotAbgeschlossen = angebotAbgeschlossen;

    // Jüngste Aktivität eines Angebots: Belegdatum oder die neueste Notiz — Basis für den
    // "Nachfassen"-Block (Angebote, bei denen lange nichts passiert ist).
    function getAngebotLastActivityDate(a) {
        let latest = a.belegdatum ? new Date(a.belegdatum + 'T00:00:00') : null;
        (a.angebot_notizen || []).forEach(n => {
            const d = new Date(n.created_at);
            if (!latest || d > latest) latest = d;
        });
        return latest;
    }

    function getAngebotStilleDays(a) {
        const last = getAngebotLastActivityDate(a);
        if (!last) return null;
        return Math.round((new Date() - last) / 86400000);
    }

    // Setzt den Status-Filter (Dropdown oben) programmatisch, z.B. per Klick auf einen
    // Pipeline-Balken. dispatchEvent aktualisiert auch das Glass-Dropdown-Label.
    window.setAngeboteStatusFilter = function (name) {
        const sel = document.getElementById('angebote-filter-status');
        if (!sel) return;
        sel.value = (sel.value === name) ? '' : name;
        sel.dispatchEvent(new Event('change'));
    };

    // Liefert die Angebote nach Anwendung aller aktiven Filter (Jahr/Status/Maschine/Suche) —
    // gemeinsame Basis für Liste, Dashboard und CSV-Export.
    function getFilteredAngebote() {
        const searchInput = document.getElementById('angebote-search-input');
        const term = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const jahrFilter = document.getElementById('angebote-filter-jahr')?.value || '';
        const statusFilter = document.getElementById('angebote-filter-status')?.value || '';
        const machineFilter = document.getElementById('angebote-filter-maschine')?.value || '';

        let entries = angeboteList;

        if (jahrFilter) {
            entries = entries.filter(a => a.belegdatum && String(new Date(a.belegdatum).getFullYear()) === jahrFilter);
        }
        if (statusFilter) {
            entries = entries.filter(a => a.status === statusFilter);
        }
        if (machineFilter) {
            entries = entries.filter(a => getAngebotMachineLabel(a) === machineFilter);
        }
        if (nurOhneAdresse) entries = entries.filter(a => !a.customer_id);
        const zustFilter = document.getElementById('angebote-filter-zustaendig')?.value || '';
        if (zustFilter) {
            entries = entries.filter(a => zustFilter === '__niemand__'
                ? !zustaendigVon(a).length
                : zustaendigVon(a).some(u => String(u) === zustFilter));
        }

        if (term) {
            // Alle Wörter müssen vorkommen, Reihenfolge egal — „arjes impaktor"
            // findet „ARJES Impaktor 250 evo". Durchsucht werden Belegnummer,
            // Firma, Maschine (verknüpft oder Freitext), Bemerkung, Status, Notizen.
            const tokens = term.split(/\s+/).filter(Boolean);
            entries = entries.filter(a => {
                const firma = a.customers?.name || a.kundenmatchcode || '';
                const notizen = (a.angebot_notizen || []).map(n => n.content || '').join(' ');
                const heu = [a.belegnummer, firma, getAngebotMachineLabel(a), a.bemerkung, a.status, notizen]
                    .map(v => String(v || '')).join(' ').toLowerCase();
                return tokens.every(t => heu.includes(t));
            });
        }

        return entries;
    }

    // ==========================================
    // EXCEL-EXPORT (.xlsx mit Formatierung + Diagrammen)
    // ==========================================
    // ExcelJS (~1 MB) wird erst beim ersten Export nachgeladen, damit der App-Start schnell bleibt.
    function loadExcelJs() {
        return new Promise((resolve, reject) => {
            if (window.ExcelJS) return resolve();
            const s = document.createElement('script');
            s.src = 'lib/exceljs.min.js';
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('lib/exceljs.min.js konnte nicht geladen werden'));
            document.head.appendChild(s);
        });
    }

    function parseNumDe(v) {
        if (v === null || v === undefined || v === '') return null;
        const n = parseFloat(String(v).replace(',', '.'));
        return isNaN(n) ? null : n;
    }

    // Excel kann aus dem Browser keine "echten" nativen Diagramme bekommen — deshalb werden die
    // Grafen hier auf ein Canvas gezeichnet und als PNG-Bild ins Dashboard-Blatt eingebettet.
    function drawMonthlyChartPng(buckets) {
        const W = 900, H = 420, padL = 70, padR = 20, padT = 60, padB = 60;
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#111827'; ctx.font = 'bold 20px Arial';
        ctx.fillText('Angebotsvolumen pro Monat (VK)', padL, 32);
        const max = Math.max(...buckets.map(b => b.sum), 1);
        const innerW = W - padL - padR, innerH = H - padT - padB;
        const barW = Math.min(48, innerW / buckets.length * 0.6);
        ctx.strokeStyle = '#d1d5db'; ctx.beginPath();
        ctx.moveTo(padL, H - padB); ctx.lineTo(W - padR, H - padB); ctx.stroke();
        buckets.forEach((b, i) => {
            const cx = padL + innerW / buckets.length * (i + 0.5);
            const h = Math.round(b.sum / max * innerH);
            ctx.fillStyle = '#3b82f6';
            ctx.fillRect(cx - barW / 2, H - padB - h, barW, h);
            ctx.fillStyle = '#374151'; ctx.font = '13px Arial'; ctx.textAlign = 'center';
            ctx.fillText(b.label, cx, H - padB + 20);
            if (b.sum > 0) {
                ctx.font = 'bold 12px Arial';
                ctx.fillText(b.sum >= 1000 ? Math.round(b.sum / 1000).toLocaleString('de-DE') + ' T€' : Math.round(b.sum) + ' €', cx, H - padB - h - 8);
            }
        });
        ctx.textAlign = 'left';
        return c.toDataURL('image/png');
    }

    function drawPipelineChartPng(pipeline) {
        const rowH = 44, padL = 230, padR = 110, padT = 60;
        const W = 900, H = padT + pipeline.length * rowH + 20;
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#111827'; ctx.font = 'bold 20px Arial';
        ctx.fillText('Pipeline nach Status (Summe VK)', 20, 32);
        const max = Math.max(...pipeline.map(g => g.sum), 1);
        const innerW = W - padL - padR;
        pipeline.forEach((g, i) => {
            const y = padT + i * rowH;
            ctx.fillStyle = '#374151'; ctx.font = '14px Arial'; ctx.textAlign = 'left';
            let label = `${g.name} (${g.count})`;
            if (label.length > 26) label = label.slice(0, 25) + '…';
            ctx.fillText(label, 20, y + rowH / 2 + 5);
            ctx.fillStyle = '#e5e7eb';
            ctx.fillRect(padL, y + 10, innerW, rowH - 20);
            ctx.fillStyle = g.color || '#94a3b8';
            ctx.fillRect(padL, y + 10, Math.max(3, Math.round(g.sum / max * innerW)), rowH - 20);
            ctx.fillStyle = '#111827'; ctx.font = 'bold 13px Arial';
            ctx.fillText(g.sum >= 1000 ? Math.round(g.sum / 1000).toLocaleString('de-DE') + ' T€' : Math.round(g.sum) + ' €', padL + innerW + 10, y + rowH / 2 + 5);
        });
        return c.toDataURL('image/png');
    }

    // Gleiches Balken-Layout wie drawPipelineChartPng, nur für die Top-Kunden nach Angebotsvolumen.
    function drawTopCustomersChartPng(customers) {
        const rowH = 44, padL = 260, padR = 110, padT = 60;
        const W = 900, H = padT + customers.length * rowH + 20;
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#111827'; ctx.font = 'bold 20px Arial';
        ctx.fillText('Top-Kunden nach Angebotsvolumen (Summe VK)', 20, 32);
        const max = Math.max(...customers.map(c2 => c2.sum), 1);
        const innerW = W - padL - padR;
        customers.forEach((cust, i) => {
            const y = padT + i * rowH;
            ctx.fillStyle = '#374151'; ctx.font = '14px Arial'; ctx.textAlign = 'left';
            let label = `${cust.firma} (${cust.count})`;
            if (label.length > 30) label = label.slice(0, 29) + '…';
            ctx.fillText(label, 20, y + rowH / 2 + 5);
            ctx.fillStyle = '#e5e7eb';
            ctx.fillRect(padL, y + 10, innerW, rowH - 20);
            ctx.fillStyle = '#10b981';
            ctx.fillRect(padL, y + 10, Math.max(3, Math.round(cust.sum / max * innerW)), rowH - 20);
            ctx.fillStyle = '#111827'; ctx.font = 'bold 13px Arial';
            ctx.fillText(cust.sum >= 1000 ? Math.round(cust.sum / 1000).toLocaleString('de-DE') + ' T€' : Math.round(cust.sum) + ' €', padL + innerW + 10, y + rowH / 2 + 5);
        });
        return c.toDataURL('image/png');
    }

    window.exportAngeboteXlsx = async function () {
        try {
            await loadExcelJs();
        } catch (err) {
            window.showToast('Excel-Bibliothek konnte nicht geladen werden: ' + err.message);
            return;
        }
        const entries = getFilteredAngebote();
        if (entries.length === 0) {
            window.showToast('Keine Angebote in der aktuellen Ansicht.');
            return;
        }

        const wb = new ExcelJS.Workbook();
        wb.creator = 'meetra Webapp';
        wb.created = new Date();

        const GREEN = 'FF15803D';
        const BORDER_COLOR = 'FFB0B7C3';
        const thinBorder = {
            top: { style: 'thin', color: { argb: BORDER_COLOR } },
            left: { style: 'thin', color: { argb: BORDER_COLOR } },
            bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
            right: { style: 'thin', color: { argb: BORDER_COLOR } }
        };

        // ---- Blatt 1: Angebote (formatierte Tabelle) ----
        const ws = wb.addWorksheet('Angebote', { views: [{ state: 'frozen', ySplit: 1 }] });
        ws.columns = [
            { header: 'Belegdatum', key: 'datum', width: 13 },
            { header: 'Belegnummer', key: 'nr', width: 16 },
            { header: 'Firma', key: 'firma', width: 34 },
            { header: 'VK (€)', key: 'vk', width: 14 },
            { header: 'EK (€)', key: 'ek', width: 14 },
            { header: 'Spanne (€)', key: 'spanne', width: 14 },
            { header: 'Spanne (%)', key: 'spannePct', width: 12 },
            { header: 'Realisierbar (%)', key: 'real', width: 15 },
            { header: 'Status', key: 'status', width: 20 },
            { header: 'Zuständig', key: 'zustaendig', width: 18 },
            { header: 'Stand', key: 'bem', width: 40 },
            { header: 'Maschine', key: 'maschine', width: 30 },
            { header: 'Erinnerung', key: 'erinnerung', width: 13 }
        ];

        const headerRow = ws.getRow(1);
        headerRow.height = 22;
        headerRow.eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = thinBorder;
        });

        entries.forEach((a, idx) => {
            const vk = parseNumDe(a.nettobetrag);
            const ek = parseNumDe(a.ek_betrag);
            const spanne = (vk !== null && ek !== null) ? vk - ek : null;
            const spannePct = (spanne !== null && vk > 0) ? spanne / vk : null;
            const real = parseNumDe(a.realisierbar);
            const row = ws.addRow({
                datum: a.belegdatum ? new Date(a.belegdatum + 'T00:00:00') : null,
                nr: a.belegnummer || '',
                firma: (a.customers?.name || a.kundenmatchcode || ''),
                vk: vk, ek: ek, spanne: spanne, spannePct: spannePct,
                real: real !== null ? real / 100 : null,
                status: a.status || '',
                zustaendig: zustaendigVon(a).map(zustaendigName).join(', '),
                bem: standText(a),
                maschine: getAngebotMachineLabel(a) || '',
                erinnerung: a.erinnerung ? new Date(a.erinnerung + 'T00:00:00') : null
            });
            row.getCell('datum').numFmt = 'DD.MM.YYYY';
            row.getCell('erinnerung').numFmt = 'DD.MM.YYYY';
            ['vk', 'ek', 'spanne'].forEach(k => row.getCell(k).numFmt = '#,##0.00 "€"');
            row.getCell('spannePct').numFmt = '0.0 %';
            row.getCell('real').numFmt = '0 %';
            if (spannePct !== null) {
                row.getCell('spannePct').font = { bold: true, color: { argb: spannePct < 0.10 ? 'FFB91C1C' : 'FF15803D' } };
            }
            row.eachCell({ includeEmpty: true }, cell => {
                cell.border = thinBorder;
                if (idx % 2 === 1 && !cell.fill) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
                }
            });
        });

        // Summenzeile
        const sumRow = ws.addRow({
            firma: `Summe (${entries.length} Angebote)`,
            vk: entries.reduce((s, a) => s + (parseNumDe(a.nettobetrag) || 0), 0),
            ek: entries.reduce((s, a) => s + (parseNumDe(a.ek_betrag) || 0), 0),
            spanne: entries.reduce((s, a) => {
                const vk = parseNumDe(a.nettobetrag), ek = parseNumDe(a.ek_betrag);
                return s + ((vk !== null && ek !== null) ? vk - ek : 0);
            }, 0)
        });
        sumRow.eachCell({ includeEmpty: true }, cell => {
            cell.font = { bold: true };
            cell.border = { ...thinBorder, top: { style: 'double', color: { argb: 'FF111827' } } };
        });
        ['vk', 'ek', 'spanne'].forEach(k => sumRow.getCell(k).numFmt = '#,##0.00 "€"');

        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 12 } };

        // ---- Blatt 2: Dashboard (KPIs, Tabellen + Diagramme als Bilder) ----
        const wsDash = wb.addWorksheet('Dashboard');
        wsDash.getColumn(1).width = 30;
        wsDash.getColumn(2).width = 20;
        wsDash.getColumn(3).width = 14;
        wsDash.getColumn(4).width = 14;

        const titleCell = wsDash.getCell('A1');
        titleCell.value = 'Angebote – Übersicht (' + new Date().toLocaleDateString('de-DE') + ')';
        titleCell.font = { bold: true, size: 16 };

        const openEntries = entries.filter(a => classifyAngebotStatus(a) === 'open');
        const wonEntries = entries.filter(a => classifyAngebotStatus(a) === 'won');
        const lostEntries = entries.filter(a => classifyAngebotStatus(a) === 'lost');
        const decided = wonEntries.length + lostEntries.length;

        // Durchschnittliche Marge über alle Angebote mit VK & EK (gleiche Logik wie in der Web-Ansicht)
        const marginPcts = entries
            .map(a => {
                const vk = parseNumDe(a.nettobetrag), ek = parseNumDe(a.ek_betrag);
                return (vk && vk > 0 && ek !== null) ? (vk - ek) / vk : null;
            })
            .filter(v => v !== null);
        const avgMargin = marginPcts.length > 0 ? marginPcts.reduce((s, v) => s + v, 0) / marginPcts.length : null;

        // Offene Angebote ohne Aktivität seit 14+ Tagen (gleiche Definition wie "Nachfassen" auf der Seite)
        const todayForStale = new Date();
        const staleCount = openEntries.filter(a => {
            const last = getAngebotLastActivityDate(a);
            if (!last) return false;
            const days = Math.floor((todayForStale - last) / 86400000);
            return days >= 14;
        }).length;

        // Vormonatsvergleich (gleiche Logik wie die Trend-Pfeile in der Web-Ansicht)
        const mCurrentStart = new Date(todayForStale.getFullYear(), todayForStale.getMonth(), 1);
        const mLastStart = new Date(todayForStale.getFullYear(), todayForStale.getMonth() - 1, 1);
        const mLastEnd = new Date(todayForStale.getFullYear(), todayForStale.getMonth(), 0);
        const curMonthEntries = entries.filter(a => a.belegdatum && new Date(a.belegdatum) >= mCurrentStart);
        const lastMonthEntries = entries.filter(a => a.belegdatum && new Date(a.belegdatum) >= mLastStart && new Date(a.belegdatum) <= mLastEnd);
        const sumVkOf = arr => arr.reduce((s, a) => s + (parseNumDe(a.nettobetrag) || 0), 0);
        const curOpenVol = sumVkOf(curMonthEntries.filter(a => classifyAngebotStatus(a) === 'open'));
        const prevOpenVol = sumVkOf(lastMonthEntries.filter(a => classifyAngebotStatus(a) === 'open'));

        const kpis = [
            ['Anzahl Angebote (gefiltert)', entries.length, '#,##0'],
            ['Offenes Volumen (€)', openEntries.reduce((s, a) => s + (parseNumDe(a.nettobetrag) || 0), 0), '#,##0.00 "€"'],
            ['Erwarteter Umsatz (€)', openEntries.reduce((s, a) => {
                const vk = parseNumDe(a.nettobetrag) || 0;
                const real = parseNumDe(a.realisierbar);
                return s + (real !== null ? vk * real / 100 : 0);
            }, 0), '#,##0.00 "€"'],
            ['Trefferquote', decided > 0 ? wonEntries.length / decided : null, '0 %'],
            ['Gewonnen / Verloren', `${wonEntries.length} / ${lostEntries.length}`, null],
            ['Durchschnittliche Marge', avgMargin, '0.0 %'],
            ['Offene Angebote ohne Aktivität (14+ Tage)', staleCount, '#,##0'],
            ['Offenes Volumen vs. Vormonat (€)', curOpenVol - prevOpenVol, '+#,##0.00 "€";-#,##0.00 "€";0']
        ];
        kpis.forEach((kpi, i) => {
            const labelCell = wsDash.getCell(3 + i, 1);
            const valueCell = wsDash.getCell(3 + i, 2);
            labelCell.value = kpi[0];
            labelCell.font = { bold: true };
            valueCell.value = kpi[1];
            if (kpi[2]) valueCell.numFmt = kpi[2];
            labelCell.border = thinBorder;
            valueCell.border = thinBorder;
        });

        // Diagramm-Daten (identisch zur Web-Ansicht berechnet)
        const statusGroups = {};
        entries.forEach(a => {
            const name = a.status || 'Ohne Status';
            if (!statusGroups[name]) {
                const statusCat = (window.categoryList || []).find(c => c.type === 'status' && c.name === a.status);
                statusGroups[name] = { name, sum: 0, count: 0, color: statusCat?.color || '#94a3b8' };
            }
            statusGroups[name].sum += parseNumDe(a.nettobetrag) || 0;
            statusGroups[name].count++;
        });
        const pipeline = Object.values(statusGroups).sort((a, b) => b.sum - a.sum).slice(0, 8);
        const pipelineTotal = pipeline.reduce((s, g) => s + g.sum, 0) || 1;

        const now = new Date();
        const monthBuckets = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            monthBuckets.push({
                label: d.toLocaleDateString('de-DE', { month: 'short' }) + ' ' + String(d.getFullYear()).slice(2),
                year: d.getFullYear(), month: d.getMonth(), sum: 0
            });
        }
        entries.forEach(a => {
            if (!a.belegdatum) return;
            const d = new Date(a.belegdatum);
            const bucket = monthBuckets.find(b => b.year === d.getFullYear() && b.month === d.getMonth());
            if (bucket) bucket.sum += parseNumDe(a.nettobetrag) || 0;
        });

        // Top-Kunden nach Angebotsvolumen (mehr Kunden als in der kompakten Web-Ansicht, da hier mehr Platz ist)
        const customerGroups = {};
        entries.forEach(a => {
            const firma = (a.customers?.name || a.kundenmatchcode || 'Unbekannt').split(',')[0].trim();
            if (!customerGroups[firma]) customerGroups[firma] = { firma, sum: 0, count: 0 };
            customerGroups[firma].sum += parseNumDe(a.nettobetrag) || 0;
            customerGroups[firma].count++;
        });
        const topCustomers = Object.values(customerGroups).sort((a, b) => b.sum - a.sum).slice(0, 8);

        let nextRow = 3 + kpis.length + 2;

        // Tabelle: Pipeline nach Status
        const pipelineHeaderRow = wsDash.getRow(nextRow);
        ['Status', 'Anzahl', 'Summe VK (€)', 'Anteil'].forEach((h, i) => {
            const cell = pipelineHeaderRow.getCell(1 + i);
            cell.value = h;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
            cell.border = thinBorder;
        });
        nextRow++;
        pipeline.forEach(g => {
            const row = wsDash.getRow(nextRow);
            row.getCell(1).value = g.name;
            row.getCell(2).value = g.count;
            row.getCell(3).value = g.sum;
            row.getCell(3).numFmt = '#,##0.00 "€"';
            row.getCell(4).value = g.sum / pipelineTotal;
            row.getCell(4).numFmt = '0.0 %';
            row.eachCell({ includeEmpty: true }, cell => cell.border = thinBorder);
            nextRow++;
        });
        nextRow += 1;

        if (pipeline.length > 0) {
            const pipelineImg = wb.addImage({ base64: drawPipelineChartPng(pipeline), extension: 'png' });
            wsDash.addImage(pipelineImg, { tl: { col: 0, row: nextRow }, ext: { width: 675, height: Math.round((60 + pipeline.length * 44 + 20) * 0.75) } });
            nextRow += Math.ceil((60 + pipeline.length * 44 + 20) * 0.75 / 20) + 2;
        }

        const monthImg = wb.addImage({ base64: drawMonthlyChartPng(monthBuckets), extension: 'png' });
        wsDash.addImage(monthImg, { tl: { col: 0, row: nextRow }, ext: { width: 675, height: 315 } });
        nextRow += Math.ceil(315 / 20) + 2;

        // Tabelle: Top-Kunden
        const custHeaderRow = wsDash.getRow(nextRow);
        ['Kunde', 'Anzahl Angebote', 'Summe VK (€)'].forEach((h, i) => {
            const cell = custHeaderRow.getCell(1 + i);
            cell.value = h;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
            cell.border = thinBorder;
        });
        nextRow++;
        topCustomers.forEach(cust => {
            const row = wsDash.getRow(nextRow);
            row.getCell(1).value = cust.firma;
            row.getCell(2).value = cust.count;
            row.getCell(3).value = cust.sum;
            row.getCell(3).numFmt = '#,##0.00 "€"';
            row.eachCell({ includeEmpty: true }, cell => cell.border = thinBorder);
            nextRow++;
        });
        nextRow += 1;

        if (topCustomers.length > 0) {
            const custImg = wb.addImage({ base64: drawTopCustomersChartPng(topCustomers), extension: 'png' });
            wsDash.addImage(custImg, { tl: { col: 0, row: nextRow }, ext: { width: 675, height: Math.round((60 + topCustomers.length * 44 + 20) * 0.75) } });
        }

        // ---- Datei erzeugen und herunterladen ----
        const buf = await wb.xlsx.writeBuffer();
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'Angebote_' + new Date().toISOString().split('T')[0] + '.xlsx';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    // Füllt die Status- und Maschinen-Filter-Dropdowns (links vom Suchfeld) mit den aktuell
    // vorkommenden Werten. Vorherige Auswahl wird beibehalten, falls sie noch existiert.
    // Auch global verfügbar: muss erneut laufen, sobald die Maschinenliste fertig geladen ist,
    // sonst fehlen im Maschinen-Filter alle echten (per machine_id verknüpften) Maschinen,
    // wenn die Angebote schneller da waren als die Maschinen (Race beim App-Start).
    window.populateAngeboteFilterOptions = populateAngeboteFilterOptions;
    function populateAngeboteFilterOptions() {
        const jahrSelect = document.getElementById('angebote-filter-jahr');
        if (jahrSelect) {
            const prevValue = jahrSelect.value;
            const years = new Set();
            angeboteList.forEach(a => {
                if (a.belegdatum) years.add(new Date(a.belegdatum).getFullYear());
            });
            const sortedYears = [...years].sort((a, b) => b - a); // neuestes Jahr zuerst
            jahrSelect.innerHTML = '<option value="">Alle Jahre</option>' +
                sortedYears.map(y => `<option value="${y}">${y}</option>`).join('');
            if (sortedYears.some(y => String(y) === prevValue)) jahrSelect.value = prevValue;
            jahrSelect.dispatchEvent(new Event('change'));
        }

        const statusSelect = document.getElementById('angebote-filter-status');
        if (statusSelect) {
            const prevValue = statusSelect.value;
            const statusOptions = angebotStatusOptionen(null);
            statusSelect.innerHTML = '<option value="">Alle Status</option>' +
                statusOptions.map(cat => `<option value="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</option>`).join('');
            if (statusOptions.some(c => c.name === prevValue)) statusSelect.value = prevValue;
            statusSelect.dispatchEvent(new Event('change'));
        }

        const zustSelect = document.getElementById('angebote-filter-zustaendig');
        if (zustSelect) {
            const prevValue = zustSelect.value;
            // Nur Benutzer, die bei irgendeinem Angebot eingetragen sind.
            const ids = new Set();
            angeboteList.forEach(a => zustaendigVon(a).forEach(u => ids.add(String(u))));
            const nutzer = (window.userList || []).filter(u => ids.has(String(u.id)))
                .sort((x, y) => String(x.name || '').localeCompare(String(y.name || ''), 'de'));
            zustSelect.innerHTML = '<option value="">Alle Zuständigen</option><option value="__niemand__">Ohne Zuständigen</option>' +
                nutzer.map(u => `<option value="${escapeHtml(String(u.id))}">${escapeHtml(u.name || '')}</option>`).join('');
            if (prevValue === '__niemand__' || nutzer.some(u => String(u.id) === prevValue)) zustSelect.value = prevValue;
            zustSelect.dispatchEvent(new Event('change'));
        }

        const machineSelect = document.getElementById('angebote-filter-maschine');
        if (machineSelect) {
            const prevValue = machineSelect.value;
            // Zwei Gruppen: echte Maschinen (per machine_id verknüpft) grün, selbsterstellte
            // Freitext-Bezeichnungen orange — Farbe kommt per data-color im gestylten Dropdown an.
            const realLabels = new Set();
            const freitextLabels = new Set();
            angeboteList.forEach(a => {
                if (a.machine_id) {
                    const label = getAngebotMachineLabel(a);
                    if (label) realLabels.add(label);
                } else if (a.machine_label) {
                    freitextLabels.add(a.machine_label);
                }
            });
            const sortedReal = [...realLabels].sort((a, b) => a.localeCompare(b, 'de'));
            const sortedFrei = [...freitextLabels].filter(l => !realLabels.has(l)).sort((a, b) => a.localeCompare(b, 'de'));
            machineSelect.innerHTML = '<option value="">Alle Maschinen</option>' +
                sortedReal.map(label => `<option value="${escapeHtml(label)}" data-color="#34d399">${escapeHtml(label)}</option>`).join('') +
                sortedFrei.map(label => `<option value="${escapeHtml(label)}" data-color="#f59e0b">${escapeHtml(label)}</option>`).join('');
            if (sortedReal.includes(prevValue) || sortedFrei.includes(prevValue)) machineSelect.value = prevValue;
            machineSelect.dispatchEvent(new Event('change'));
        }
    }
    // ------------------------------------------------------------------
    // Seitliches Blättern: ein fest verankertes Paar Pfeile ‹ › unten rechts
    // im Bildschirm (wie ein Schwebeknopf), solange die Angebotsliste offen
    // ist — egal wo man gerade steht. Klick = eine Spalte, Doppelklick = ganz
    // an den Rand. Gescrollt wird, was tatsächlich überläuft: der Tabellen-
    // rahmen, sonst der Inhaltsbereich, sonst die Seite selbst.
    // ------------------------------------------------------------------
    let scrollBeobachter = null;
    function scrollZiel() {
        const wrap = document.querySelector('#angebote-list-container .angebote-table-wrap');
        if (wrap && wrap.scrollWidth > wrap.clientWidth + 4) return wrap;
        const mc = document.getElementById('main-content');
        if (mc && mc.scrollWidth > mc.clientWidth + 4) return mc;
        const de = document.scrollingElement || document.documentElement;
        if (de.scrollWidth > de.clientWidth + 4) return de;
        return wrap || null;
    }
    function scrollPfeileEinrichten(container) {
        let box = document.getElementById('angebote-scroll-pfeile');
        if (!box) {
            box = document.createElement('div');
            box.id = 'angebote-scroll-pfeile';
            box.style.cssText = 'position:fixed; right:18px; bottom:22px; z-index:9000; display:none; gap:8px; padding:6px; border-radius:999px;'
                + ' background:rgba(15,23,42,0.96); border:2px solid rgba(16,185,129,0.7); box-shadow:0 10px 30px rgba(0,0,0,0.6);';
            box.innerHTML = ['links', 'rechts'].map(r => `
                <button type="button" data-richtung="${r}" title="${r === 'links' ? 'Eine Spalte nach links (Doppelklick: ganz nach links)' : 'Eine Spalte nach rechts (Doppelklick: ganz nach rechts)'}"
                    style="width:48px; height:48px; border-radius:50%; border:0; background:transparent; color:#34d399; cursor:pointer;
                           display:flex; align-items:center; justify-content:center; font-size:2rem; font-weight:800; line-height:1; transition:background .15s, opacity .15s;"
                    onmouseover="this.style.background='rgba(16,185,129,0.3)'" onmouseout="this.style.background='transparent'">${r === 'links' ? '‹' : '›'}</button>`).join('');
            document.body.appendChild(box);
            box.querySelectorAll('button').forEach(b => {
                b.addEventListener('click', (e) => { e.stopPropagation(); window.angeboteSpalteScrollen(b.dataset.richtung === 'links' ? -1 : 1); });
                b.addEventListener('dblclick', (e) => { e.stopPropagation(); window.angeboteSpalteScrollen(b.dataset.richtung === 'links' ? -Infinity : Infinity); });
            });
        }
        const zeigen = () => {
            const listeOffen = document.getElementById('listen')?.classList.contains('active')
                && !document.getElementById('listen-tab-content-angebote')?.classList.contains('hidden')
                && !!container.querySelector('.angebote-table-wrap');
            box.style.display = listeOffen ? 'flex' : 'none';
            if (!listeOffen) return;
            const z = scrollZiel();
            const l = box.querySelector('[data-richtung="links"]'), re = box.querySelector('[data-richtung="rechts"]');
            const kann = z && z.scrollWidth > z.clientWidth + 4;
            l.style.opacity = kann && z.scrollLeft > 2 ? '1' : '0.35';
            re.style.opacity = kann && z.scrollLeft + z.clientWidth < z.scrollWidth - 2 ? '1' : '0.35';
        };
        if (scrollBeobachter) { window.removeEventListener('scroll', scrollBeobachter, true); window.removeEventListener('resize', scrollBeobachter); }
        scrollBeobachter = zeigen;
        window.addEventListener('scroll', zeigen, true);
        window.addEventListener('resize', zeigen);
        zeigen();
        // Ansicht gewechselt (Klasse "active" an #listen) -> Pfeile ein-/ausblenden.
        if (!window._angeboteViewObs) {
            const l = document.getElementById('listen');
            if (l && typeof MutationObserver !== 'undefined') {
                window._angeboteViewObs = new MutationObserver(() => { if (scrollBeobachter) scrollBeobachter(); });
                window._angeboteViewObs.observe(l, { attributes: true, attributeFilter: ['class'] });
            }
        }
    }
    window.angeboteSpalteScrollen = function (richtung) {
        const z = scrollZiel();
        if (!z) return;
        if (!isFinite(richtung)) { z.scrollLeft = richtung < 0 ? 0 : z.scrollWidth; if (scrollBeobachter) scrollBeobachter(); return; }
        // Spaltenkanten der Kopfzeile (relativ zum Scroll-Element): zur
        // nächsten Kante in Richtung springen; ohne Tabelle in festen Schritten.
        const wrap = document.querySelector('#angebote-list-container .angebote-table-wrap');
        const ths = wrap ? [...wrap.querySelectorAll('thead th')] : [];
        const basis = z.getBoundingClientRect().left - z.scrollLeft;
        const kanten = ths.map(th => Math.round(th.getBoundingClientRect().left - basis));
        const jetzt = z.scrollLeft;
        let ziel;
        if (kanten.length) {
            if (richtung > 0) ziel = kanten.find(k => k > jetzt + 4);
            else ziel = [...kanten].reverse().find(k => k < jetzt - 4);
        }
        if (ziel === undefined) ziel = Math.max(0, Math.min(z.scrollWidth, jetzt + richtung * Math.round(z.clientWidth * 0.6)));
        z.scrollLeft = ziel;   // sofort, nicht animiert — zuverlässig in jedem Browser
        if (scrollBeobachter) scrollBeobachter();
    };

    const ANGEBOTE_SEITE = 40;
    let angeboteSichtbar = ANGEBOTE_SEITE;
    let angeboteFilterKey = null;
    window.angeboteMehrLaden = function () {
        angeboteSichtbar += ANGEBOTE_SEITE;
        window.renderAngeboteList();
    };

    window.renderAngeboteList = function () {
        const container = document.getElementById('angebote-list-container');
        if (!container) return;

        const entries = getFilteredAngebote();

        // Nur ein Teil der Zeilen wird gezeichnet; der Rest kommt beim Scrollen
        // nach (js/auto-nachladen.js). Ändert sich ein Filter, geht es von vorn los.
        const filterKey = [
            document.getElementById('angebote-search-input')?.value || '',
            document.getElementById('angebote-filter-jahr')?.value || '',
            document.getElementById('angebote-filter-status')?.value || '',
            document.getElementById('angebote-filter-zustaendig')?.value || '',
            document.getElementById('angebote-filter-maschine')?.value || '',
            nurOhneAdresse ? '1' : ''
        ].join('|');
        if (filterKey !== angeboteFilterKey) { angeboteFilterKey = filterKey; angeboteSichtbar = ANGEBOTE_SEITE; }
        const sichtbar = entries.slice(0, angeboteSichtbar);
        const rest = entries.length - sichtbar.length;
        const mehrKnopf = rest > 0
            ? `<button type="button" class="btn-secondary angebote-mehr-btn" onclick="window.angeboteMehrLaden()" style="padding:8px 18px;">Weitere ${Math.min(rest, ANGEBOTE_SEITE)} von ${rest} laden</button>`
            : '';

        if (entries.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align:center; padding:3rem 2rem; background: rgba(255,255,255,0.02); border-radius: 16px; border: 1px dashed rgba(255,255,255,0.1);">
                    <p style="color:#fff; font-size: 1rem;">${nurOhneAdresse ? 'Alle Angebote haben eine Adresse.' : 'Keine Angebote vorhanden. Oben importieren.'}</p>
                    ${nurOhneAdresse ? '<button type="button" class="btn-secondary" onclick="window.toggleAngeboteOhneAdresse()">Filter „ohne Adresse" aus</button>' : ''}
                </div>`;
            return;
        }

        const fmtDate = (d) => {
            if (!d) return '';
            const p = String(d).split('-');
            return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d;
        };
        const fmtNumberInput = (v) => (v === null || v === undefined || v === '') ? '' : Number(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const fmtPercentInput = (v) => (v === null || v === undefined || v === '') ? '' : String(v).replace('.', ',');
        const fmtEur = (v) => Math.round(v).toLocaleString('de-DE') + ' €';
        const parseNum = (v) => {
            if (v === null || v === undefined || v === '') return null;
            const n = parseFloat(String(v).replace(',', '.'));
            return isNaN(n) ? null : n;
        };

        // ==========================================
        // DASHBOARD: KPIs, Pipeline, Monats-Graf, Top-Kunden, Nachfassen
        // (alles bezogen auf die aktuell gefilterten Angebote)
        // ==========================================
        const openEntries = entries.filter(a => classifyAngebotStatus(a) === 'open');
        const wonEntries = entries.filter(a => classifyAngebotStatus(a) === 'won');
        const lostEntries = entries.filter(a => classifyAngebotStatus(a) === 'lost');
        const sumVK = arr => arr.reduce((s, a) => s + (parseNum(a.nettobetrag) || 0), 0);

        const openVolume = sumVK(openEntries);
        const weighted = openEntries.reduce((s, a) => {
            const vk = parseNum(a.nettobetrag) || 0;
            const real = parseNum(a.realisierbar);
            return s + (real !== null ? vk * real / 100 : 0);
        }, 0);
        const decided = wonEntries.length + lostEntries.length;
        const quoteStr = decided > 0 ? Math.round(wonEntries.length / decided * 100) + ' %' : '–';

        const marginPcts = entries
            .map(a => {
                const vk = parseNum(a.nettobetrag);
                const ek = parseNum(a.ek_betrag);
                return (vk && vk > 0 && ek !== null) ? (vk - ek) / vk * 100 : null;
            })
            .filter(v => v !== null);
        const avgMarginStr = marginPcts.length > 0
            ? (marginPcts.reduce((s, v) => s + v, 0) / marginPcts.length).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %'
            : '–';
        // Absolute Spanne (€) zu den Angeboten, die in avgMarginStr einfliessen (gleicher Filter:
        // VK > 0 und EK gepflegt) — wird zusaetzlich klein unter dem %-Wert angezeigt.
        const totalSpanneForAvg = entries.reduce((s, a) => {
            const vk = parseNum(a.nettobetrag), ek = parseNum(a.ek_betrag);
            return s + ((vk && vk > 0 && ek !== null) ? (vk - ek) : 0);
        }, 0);

        // --- MoM Trend Calculations ---
        // Einheitliches 3-Zeilen-Layout fuer alle Vormonat-Vergleiche: "Akt. M." (aktueller Wert),
        // "Vm." (Vormonatswert), darunter die prozentuale Veraenderung.
        const renderTrendBox = (curVal, prevVal, diffPct, fmtFn) => `
            <div style="display:flex; flex-direction:column; align-items:flex-end; line-height:1.3; text-align:right;">
                <span style="font-size:0.68rem; color:#fff; font-weight:700; white-space:nowrap;">Akt. M. ${fmtFn(curVal)}</span>
                <span style="font-size:0.68rem; color:#fff; font-weight:700; white-space:nowrap; margin-top:1px;">Vm. ${fmtFn(prevVal)}</span>
                <span style="font-size:0.72rem; color:${diffPct >= 0 ? '#10b981' : '#f87171'}; font-weight:800; white-space:nowrap; margin-top:2px;">${diffPct >= 0 ? '+' : ''}${Math.round(diffPct)}%</span>
            </div>
        `;

        const today = new Date();
        const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

        const currentMonthEntries = entries.filter(a => {
            if (!a.belegdatum) return false;
            const d = new Date(a.belegdatum);
            return d >= currentMonthStart;
        });

        const lastMonthEntries = entries.filter(a => {
            if (!a.belegdatum) return false;
            const d = new Date(a.belegdatum);
            return d >= lastMonthStart && d <= lastMonthEnd;
        });

        // 1. Open volume trend
        const curOpenVol = sumVK(currentMonthEntries.filter(a => classifyAngebotStatus(a) === 'open'));
        const prevOpenVol = sumVK(lastMonthEntries.filter(a => classifyAngebotStatus(a) === 'open'));
        let openVolTrendHtml = '';
        if (prevOpenVol > 0) {
            const diffPct = ((curOpenVol - prevOpenVol) / prevOpenVol) * 100;
            openVolTrendHtml = renderTrendBox(curOpenVol, prevOpenVol, diffPct, fmtEur);
        }

        // 2. Expected revenue trend
        const curWeighted = currentMonthEntries.filter(a => classifyAngebotStatus(a) === 'open').reduce((s, a) => s + ((parseNum(a.nettobetrag) || 0) * (parseNum(a.realisierbar) || 0) / 100), 0);
        const prevWeighted = lastMonthEntries.filter(a => classifyAngebotStatus(a) === 'open').reduce((s, a) => s + ((parseNum(a.nettobetrag) || 0) * (parseNum(a.realisierbar) || 0) / 100), 0);
        let weightedTrendHtml = '';
        if (prevWeighted > 0) {
            const diffPct = ((curWeighted - prevWeighted) / prevWeighted) * 100;
            weightedTrendHtml = renderTrendBox(curWeighted, prevWeighted, diffPct, fmtEur);
        }

        // 3. Hit rate trend
        const curWon = currentMonthEntries.filter(a => classifyAngebotStatus(a) === 'won').length;
        const curDecided = currentMonthEntries.filter(a => classifyAngebotStatus(a) === 'won' || classifyAngebotStatus(a) === 'lost').length;
        const curQuote = curDecided > 0 ? (curWon / curDecided) : null;

        const prevWon = lastMonthEntries.filter(a => classifyAngebotStatus(a) === 'won').length;
        const prevDecided = lastMonthEntries.filter(a => classifyAngebotStatus(a) === 'won' || classifyAngebotStatus(a) === 'lost').length;
        const prevQuote = prevDecided > 0 ? (prevWon / prevDecided) : null;

        let quoteTrendHtml = '';
        if (curQuote !== null && prevQuote !== null && prevQuote > 0) {
            const diffPct = (curQuote - prevQuote) * 100;
            quoteTrendHtml = renderTrendBox(curQuote, prevQuote, diffPct, v => Math.round(v * 100) + ' %');
        }

        // 4. Margin trend
        const getMarginPctForSet = (set) => {
            const pcts = set.map(a => {
                const vk = parseNum(a.nettobetrag);
                const ek = parseNum(a.ek_betrag);
                return (vk && vk > 0 && ek !== null) ? (vk - ek) / vk * 100 : null;
            }).filter(v => v !== null);
            return pcts.length > 0 ? pcts.reduce((s, v) => s + v, 0) / pcts.length : null;
        };
        const curMargin = getMarginPctForSet(currentMonthEntries);
        const prevMargin = getMarginPctForSet(lastMonthEntries);
        let marginTrendHtml = '';
        if (curMargin !== null && prevMargin !== null && prevMargin > 0) {
            const diffPct = curMargin - prevMargin;
            marginTrendHtml = renderTrendBox(curMargin, prevMargin, diffPct, v => v.toFixed(1) + ' %');
        }

        let html = `
            <div class="maint-kpi-grid" style="margin-top: 0.75rem; grid-template-columns: repeat(3, 1fr);">
                <div class="maint-kpi-tile" style="cursor: default;" title="Summe VK aller offenen (nicht gewonnenen/verlorenen) Angebote">
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                        <div class="maint-kpi-value" style="color: #60a5fa;">${fmtEur(openVolume)}</div>
                        ${openVolTrendHtml}
                    </div>
                    <div class="maint-kpi-label">Offenes Volumen (${openEntries.length})</div>
                </div>
                <div class="maint-kpi-tile" style="cursor: default;" title="Summe VK × Realisierbar-% der offenen Angebote">
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                        <div class="maint-kpi-value" style="color: #a78bfa;">${fmtEur(weighted)}</div>
                        ${weightedTrendHtml}
                    </div>
                    <div class="maint-kpi-label">Erwarteter Umsatz</div>
                </div>
                <div class="maint-kpi-tile" style="cursor: default;" title="Durchschnittliche Spanne in % über alle Angebote mit gepflegtem EK">
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                        <div>
                            <div class="maint-kpi-value" style="color: #fff;">${avgMarginStr}</div>
                            ${marginPcts.length > 0 ? `<div style="font-size:0.7rem; font-weight:700; color:#fff;">${fmtEur(totalSpanneForAvg)}</div>` : ''}
                        </div>
                        ${marginTrendHtml}
                    </div>
                    <div class="maint-kpi-label">Ø Spanne (${marginPcts.length} mit EK)</div>
                </div>
            </div>
        `;

        // --- Pipeline nach Status (Summe VK, Balkenfarbe = Status-Kategorie-Farbe) ---
        const statusGroups = {};
        entries.forEach(a => {
            const name = a.status || 'Ohne Status';
            if (!statusGroups[name]) statusGroups[name] = { name, sum: 0, count: 0 };
            statusGroups[name].sum += parseNum(a.nettobetrag) || 0;
            statusGroups[name].count++;
        });
        const pipeline = Object.values(statusGroups).sort((a, b) => b.sum - a.sum).slice(0, 8);
        const maxPipeline = Math.max(...pipeline.map(g => g.sum), 1);
        window.__angebotePipelineNames = pipeline.map(g => g.name);
        const pipelineHtml = pipeline.map((g, i) => {
            const statusCat = (window.categoryList || []).find(c => c.type === 'status' && c.name === g.name);
            const color = statusCat?.color || 'rgba(255,255,255,0.45)';
            const clickable = g.name !== 'Ohne Status';
            const sumLabel = fmtEurFull(g.sum);
            const pct = Math.round((g.sum / maxPipeline) * 100);
            return `
                <div style="display:flex; flex-direction:column; gap:3px; ${clickable ? 'cursor:pointer;' : ''}" 
                     ${clickable ? `onclick="window.setAngeboteStatusFilter(window.__angebotePipelineNames[${i}])" title="Klick: nach diesem Status filtern"` : ''}>
                    <div style="display:flex; justify-content:space-between; align-items:baseline;">
                        <span style="font-size:0.78rem; font-weight:700; color:${color}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:70%;">${escapeHtml(g.name)}</span>
                        <span style="font-size:0.72rem; font-weight:700; color:#fff; white-space:nowrap;"><strong style="color:#fff; font-weight:800;">${g.count} Stk.</strong> &middot; ${sumLabel}</span>
                    </div>
                    <div style="width:100%; height:10px; background:rgba(255,255,255,0.06); border-radius:4px; overflow:hidden;">
                        <div style="width:${pct}%; height:100%; background:${color}; border-radius:4px; transition: width 0.4s ease;"></div>
                    </div>
                </div>
            `;
        }).join('') || '<div style="color:#fff; font-size: 0.85rem; padding: 1rem 0;">Keine Daten</div>';

        // --- Angebotsvolumen pro Monat (letzte 6 Monate, Summe VK) ---
        const now = new Date();
        const monthBuckets = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            monthBuckets.push({
                label: d.toLocaleDateString('de-DE', { month: 'short' }) + (d.getMonth() === 0 || i === 5 ? ' \'' + String(d.getFullYear()).slice(2) : ''),
                year: d.getFullYear(),
                month: d.getMonth(),
                sum: 0
            });
        }
        entries.forEach(a => {
            if (!a.belegdatum) return;
            const d = new Date(a.belegdatum);
            const bucket = monthBuckets.find(b => b.year === d.getFullYear() && b.month === d.getMonth());
            if (bucket) bucket.sum += parseNum(a.nettobetrag) || 0;
        });
        const maxMonth = Math.max(...monthBuckets.map(b => b.sum), 1);
        const monthBarsHtml = monthBuckets.map(b => {
            const pct = Math.round((b.sum / maxMonth) * 100);
            const hasVal = b.sum > 0;
            return `
                <div style="flex: 1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:0; height:100%;">
                    ${hasVal ? `<div style="font-size:0.58rem; font-weight:800; color:#60a5fa; margin-bottom:3px; white-space:nowrap; writing-mode:horizontal-tb; text-align:center; max-width:100%; overflow:hidden; text-overflow:ellipsis; letter-spacing:-0.3px;">${fmtEurFull(b.sum)}</div>` : ''}
                    <div style="width:80%; background:${hasVal ? 'linear-gradient(0deg,#3b82f6,#60a5fa)' : 'rgba(255,255,255,0.04)'}; border-radius:4px 4px 0 0; height:${pct}%; min-height:${hasVal ? '3px' : '0'}; transition:height 0.4s ease;"></div>
                    <div style="font-size:0.7rem; font-weight:700; color:#fff; margin-top:5px; white-space:nowrap;">${b.label}</div>
                </div>
            `;
        }).join('');

        // --- Top 4 Kunden nach Angebotsvolumen ---
        const customerGroups = {};
        entries.forEach(a => {
            const firma = (a.customers?.name || a.kundenmatchcode || 'Unbekannt').split(',')[0].trim();
            if (!customerGroups[firma]) customerGroups[firma] = { firma, sum: 0, count: 0 };
            customerGroups[firma].sum += parseNum(a.nettobetrag) || 0;
            customerGroups[firma].count++;
        });
        const topCustomers = Object.values(customerGroups).sort((a, b) => b.sum - a.sum).slice(0, 4);
        const maxCustomer = Math.max(...topCustomers.map(c => c.sum), 1);
        const topCustomersHtml = topCustomers.map(c => {
            const pct = Math.round((c.sum / maxCustomer) * 100);
            return `
                <div style="display:flex; flex-direction:column; gap:3px;">
                    <div style="display:flex; justify-content:space-between; align-items:baseline;">
                        <span style="font-size:0.78rem; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:65%;" title="${escapeHtml(c.firma)}">${escapeHtml(c.firma)}</span>
                        <span style="font-size:0.72rem; font-weight:700; color:#fff; white-space:nowrap;"><strong style="color:#fff; font-weight:800;">${c.count} Stk.</strong> &middot; ${fmtEurFull(c.sum)}</span>
                    </div>
                    <div style="width:100%; height:10px; background:rgba(255,255,255,0.06); border-radius:4px; overflow:hidden;">
                        <div style="width:${pct}%; height:100%; background:linear-gradient(90deg, #22c55e, #4ade80); border-radius:4px; transition: width 0.4s ease;"></div>
                    </div>
                </div>
            `;
        }).join('') || '<div style="color:#fff; font-size: 0.85rem; padding: 1rem 0;">Keine Daten</div>';

        const wonPct  = entries.length > 0 ? Math.round(wonEntries.length  / entries.length * 100) : 0;
        const lostPct = entries.length > 0 ? Math.round(lostEntries.length / entries.length * 100) : 0;
        const openPct = entries.length > 0 ? Math.round(openEntries.length  / entries.length * 100) : 0;

        const funnelHtml = `
                <div class="maint-chart-card" style="margin-bottom: 0;">
                    <p class="maint-chart-title">Anzahl Angebote</p>
                    <div style="display:flex; flex-direction:column; gap:0.6rem; padding-top:4px;">

                        <!-- Step 1: Gesamt -->
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:700; color:#fff;">
                                <span>1. Angebote gesamt</span>
                                <span>${entries.length}</span>
                            </div>
                            <div style="width:100%; height:14px; background:rgba(255,255,255,0.06); border-radius:4px; overflow:hidden; position:relative;">
                                <div style="width:100%; height:100%; background:linear-gradient(90deg, #60a5fa, #3b82f6); border-radius:4px;"></div>
                                <span style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:0.68rem; font-weight:900; color:#fff;">100%</span>
                            </div>
                        </div>

                        <!-- Step 2: Offen -->
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:700; color:#fff;">
                                <span>2. Offen / In Verhandlung</span>
                                <span>${openEntries.length}</span>
                            </div>
                            <div style="width:100%; height:14px; background:rgba(255,255,255,0.06); border-radius:4px; overflow:hidden; position:relative;">
                                <div style="width:${openPct}%; height:100%; background:linear-gradient(90deg, #fbbf24, #f59e0b); border-radius:4px;"></div>
                                <span style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:0.68rem; font-weight:900; color:#fff;">${openPct}%</span>
                            </div>
                        </div>

                        <!-- Step 3: Gewonnen -->
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:700; color:#fff;">
                                <span style="display:flex; align-items:center; gap:5px;">
                                    <span style="width:7px; height:7px; background:#10b981; border-radius:50%; display:inline-block;"></span>
                                    3. Aufträge / Gewonnen
                                </span>
                                <span style="color:#34d399;">${wonEntries.length}</span>
                            </div>
                            <div style="width:100%; height:14px; background:rgba(255,255,255,0.06); border-radius:4px; overflow:hidden; position:relative;">
                                <div style="width:${wonPct}%; height:100%; background:linear-gradient(90deg, #34d399, #10b981); border-radius:4px;"></div>
                                <span style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:0.68rem; font-weight:900; color:#fff;">${wonPct}%</span>
                            </div>
                        </div>

                        <!-- Step 4: Verloren -->
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:700; color:#fff;">
                                <span style="display:flex; align-items:center; gap:5px;">
                                    <span style="width:7px; height:7px; background:#ef4444; border-radius:50%; display:inline-block;"></span>
                                    4. Aufträge Verloren
                                </span>
                                <span style="color:#f87171;">${lostEntries.length}</span>
                            </div>
                            <div style="width:100%; height:14px; background:rgba(255,255,255,0.06); border-radius:4px; overflow:hidden; position:relative;">
                                <div style="width:${lostPct}%; height:100%; background:linear-gradient(90deg, #f87171, #ef4444); border-radius:4px;"></div>
                                <span style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:0.68rem; font-weight:900; color:#fff;">${lostPct}%</span>
                            </div>
                        </div>

                    </div>
                </div>`;

        html += `
            <div class="ang-charts-row">
                <div class="maint-chart-card" style="margin-bottom: 0;">
                    <p class="maint-chart-title">nach Status (Summe VK)</p>
                    <div style="display:flex; flex-direction:column; gap:10px; padding-top:4px;">
                        ${pipelineHtml}
                    </div>
                </div>
                <div class="maint-chart-card" style="margin-bottom: 0; display:flex; flex-direction:column;">
                    <p class="maint-chart-title" style="margin-bottom:0;">Angebotsvolumen pro Monat</p>
                    <div style="display:flex; align-items:flex-end; gap:6px; flex:1; padding-top:8px; min-height:160px;">
                        ${monthBarsHtml}
                    </div>
                </div>
                <div class="maint-chart-card" style="margin-bottom: 0;">
                    <p class="maint-chart-title">Top 4 Kunden nach Volumen</p>
                    <div style="display:flex; flex-direction:column; gap:10px; padding-top:4px;">
                        ${topCustomersHtml}
                    </div>
                </div>
            </div>
        `;

        // --- Nachfassen: offene Angebote ohne Aktivität (Notiz/Beleg) seit 14+ Tagen ---
        const allStille = openEntries
            .map(a => ({ a, stille: getAngebotStilleDays(a) }))
            .filter(x => x.stille !== null && x.stille >= 14);

        const rote = allStille
            .filter(x => x.stille >= 21)
            .sort((x, y) => (parseNum(y.a.nettobetrag) || 0) - (parseNum(x.a.nettobetrag) || 0))
            .slice(0, 3);

        const orangene = allStille
            .filter(x => x.stille >= 14 && x.stille < 21)
            .sort((x, y) => (parseNum(y.a.nettobetrag) || 0) - (parseNum(x.a.nettobetrag) || 0))
            .slice(0, 3);

        if (rote.length > 0 || orangene.length > 0) {
            html += `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-bottom: 1.5rem;">
                    <!-- Rote (21+ Tage) -->
                    <div class="maint-chart-card" style="margin-bottom: 0;">
                        <p class="maint-chart-title" style="color: #F87171; display:flex; align-items:center; gap:6px;">
                            <span style="width:8px; height:8px; background:#F87171; border-radius:50%; display:inline-block;"></span>
                            Nachfassen rot (stille &ge; 21 Tage)
                        </p>
                        <div style="display:flex; flex-direction:column; gap:8px; padding-top:4px;">
                            ${rote.length > 0 ? rote.map(x => {
                                const firma = (x.a.customers?.name || x.a.kundenmatchcode || '').split(',')[0].trim();
                                const vk = parseNum(x.a.nettobetrag);
                                return `
                                    <div onclick="window.jumpToAngebotFromReminder('${x.a.id}')" class="ang-nachfass-row" style="background: rgba(248,113,113,0.1); display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
                                        <span style="color: #F87171; font-weight: 700; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(x.a.belegnummer)}${firma ? ' · ' + escapeHtml(firma) : ''}${vk ? ' · ' + fmtEur(vk) : ''}</span>
                                        <span style="color: #F87171; font-weight: 800; white-space: nowrap; font-size: 0.78rem;">${x.stille} Tage still</span>
                                    </div>
                                `;
                            }).join('') : '<div style="color:#fff; font-size: 0.85rem; padding: 0.5rem 0;">Keine roten Angebote</div>'}
                        </div>
                    </div>

                    <!-- Orangene (14-20 Tage) -->
                    <div class="maint-chart-card" style="margin-bottom: 0;">
                        <p class="maint-chart-title" style="color: #FFA000; display:flex; align-items:center; gap:6px;">
                            <span style="width:8px; height:8px; background:#FFA000; border-radius:50%; display:inline-block;"></span>
                            Nachfassen orange (stille 14-20 Tage)
                        </p>
                        <div style="display:flex; flex-direction:column; gap:8px; padding-top:4px;">
                            ${orangene.length > 0 ? orangene.map(x => {
                                const firma = (x.a.customers?.name || x.a.kundenmatchcode || '').split(',')[0].trim();
                                const vk = parseNum(x.a.nettobetrag);
                                return `
                                    <div onclick="window.jumpToAngebotFromReminder('${x.a.id}')" class="ang-nachfass-row" style="background: rgba(255,160,0,0.08); display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
                                        <span style="color: #FFA000; font-weight: 700; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(x.a.belegnummer)}${firma ? ' · ' + escapeHtml(firma) : ''}${vk ? ' · ' + fmtEur(vk) : ''}</span>
                                        <span style="color: #FFA000; font-weight: 800; white-space: nowrap; font-size: 0.78rem;">${x.stille} Tage still</span>
                                    </div>
                                `;
                            }).join('') : '<div style="color:#fff; font-size: 0.85rem; padding: 0.5rem 0;">Keine orangenen Angebote</div>'}
                        </div>
                    </div>
                </div>
            `;
        }

        // ==========================================
        // SUMMEN (gefilterte Auswahl) für die Fußzeile
        // ==========================================
        const totalVK = sumVK(entries);
        const totalEK = entries.reduce((s, a) => s + (parseNum(a.ek_betrag) || 0), 0);
        const entriesWithEk = entries.filter(a => parseNum(a.ek_betrag) !== null && parseNum(a.nettobetrag) !== null);
        const totalSpanne = entriesWithEk.reduce((s, a) => s + (parseNum(a.nettobetrag) - parseNum(a.ek_betrag)), 0);
        const spanneVkBasis = entriesWithEk.reduce((s, a) => s + parseNum(a.nettobetrag), 0);
        const totalSpannePct = spanneVkBasis > 0 ? (totalSpanne / spanneVkBasis * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %' : '';

        const todayMs = new Date().setHours(0, 0, 0, 0);

        // ==========================================
        // DESKTOP-TABELLE
        // ==========================================
        html += `
            <div style="display:flex; justify-content:flex-start; align-items:center; gap:14px; margin:0 0 4px; flex-wrap:wrap;">
                ${letzterImportZeile()}
                ${(() => { const n = angeboteList.filter(a => !a.customer_id).length; return n ? `<button type="button" onclick="window.toggleAngeboteOhneAdresse()" title="Angebote, die noch keiner Adresse aus dem Adressbuch zugeordnet sind — Klick auf die Firma ordnet zu"
                    style="height:28px; padding:0 12px; border-radius:999px; font-size:0.78rem; font-weight:700; cursor:pointer; background:${nurOhneAdresse ? 'rgba(245,158,11,0.35)' : 'rgba(245,158,11,0.12)'}; border:1px solid rgba(245,158,11,0.6); color:#f59e0b;">⚠ ${n} ohne Adresse${nurOhneAdresse ? ' · Filter aktiv' : ''}</button>` : ''; })()}
            </div>
            <div class="angebote-table-wrap" style="overflow-x:auto;">
                <table style="width:100%; min-width:1650px; border-collapse:collapse;">
                    <thead>
                        <tr style="border-bottom:2px solid rgba(255,255,255,0.15);">
                            <th style="padding:10px; text-align:left; font-size:0.85rem; color:#fff; font-weight:700; white-space:nowrap;">Belegdatum</th>
                            <th style="padding:10px; text-align:left; font-size:0.85rem; color:#fff; font-weight:700; white-space:nowrap;">Belegnummer</th>
                            <th style="padding:10px; text-align:left; font-size:0.85rem; color:#fff; font-weight:700;">Firma</th>
                            <th style="padding:10px; text-align:right; font-size:0.85rem; color:#fff; font-weight:700;">VK</th>
                            <th style="padding:10px; text-align:right; font-size:0.85rem; color:#fff; font-weight:700;">EK</th>
                            <th style="padding:10px; text-align:right; font-size:0.85rem; color:#fff; font-weight:700;">Spanne</th>
                            <th style="padding:10px; text-align:left; font-size:0.85rem; color:#fff; font-weight:700; white-space:nowrap;">Realisierbar</th>
                            <th style="padding:10px; text-align:left; font-size:0.85rem; color:#fff; font-weight:700;">Status</th>
                            <th style="padding:10px; text-align:left; font-size:0.85rem; color:#fff; font-weight:700;">Zuständig</th>
                            <th style="padding:10px; text-align:left; font-size:0.85rem; color:#fff; font-weight:700;">Maschine</th>
                            <th style="padding:10px; text-align:left; font-size:0.85rem; color:#fff; font-weight:700;">Stand</th>
                            <th style="padding:10px; text-align:left; font-size:0.85rem; color:#fff; font-weight:700;">Dokumente</th>
                            <th style="padding:10px; text-align:left; font-size:0.85rem; color:#fff; font-weight:700;">Erinnerung</th>
                            <th class="delete-permission-required" style="padding:10px; text-align:center; font-size:0.85rem; color:#fff; font-weight:700; width:36px;"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sichtbar.map(a => {
                            const firma = a.customers?.name || a.kundenmatchcode || '';
                            const firmaDisplay = firma.split(',')[0].trim();
                            const vk = parseNum(a.nettobetrag);
                            const ek = parseNum(a.ek_betrag);
                            const spanne = (vk !== null && ek !== null) ? vk - ek : null;
                            const spannePct = (spanne !== null && vk > 0) ? spanne / vk * 100 : null;
                            const spannePctHtml = spannePct !== null
                                ? `<div style="font-size:0.75rem; font-weight:700; color:${spannePct < 10 ? '#F87171' : '#22c55e'};">${spannePct.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %</div>`
                                : '';
                            // Alters-Hinweis nur bei offenen Angeboten älter als 30 Tage
                            const isOpen = classifyAngebotStatus(a) === 'open';
                            const ageDays = a.belegdatum ? Math.round((todayMs - new Date(a.belegdatum + 'T00:00:00')) / 86400000) : null;
                            const ageHtml = (isOpen && ageDays !== null && ageDays > 30)
                                ? `<div style="font-size:0.72rem; color:${ageDays > 60 ? '#F87171' : 'rgba(255,255,255,0.35)'};">vor ${ageDays} Tg.</div>`
                                : '';
                            // Farbiger Akzent links an der Zeile, analog zur Buchhaltung — Farbe kommt
                            // direkt von der Status-Kategorie (Einstellungen -> Kategorien -> Angebots-Status),
                            // nicht hart im Code verdrahtet.
                            const statusCat = (window.categoryList || []).find(c => c.type === 'status' && c.name === a.status);
                            const accentStyle = statusCat?.color ? `box-shadow: inset 4px 0 0 0 ${statusCat.color};` : '';
                            return `
                            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                                <td style="padding:12px 10px; color:#fff; font-size:0.95rem; white-space:nowrap; ${accentStyle}">${fmtDate(a.belegdatum)}${ageHtml}</td>
                                <td style="padding:12px 10px; color:white; font-weight:700; font-size:0.95rem; white-space:nowrap;">
                                    <span style="display:inline-flex; align-items:center; gap:7px;">
                                        ${renderAngebotVorgangIcon(a)}
                                        <span>${escapeHtml(a.belegnummer)}</span>
                                    </span>
                                </td>
                                <td style="padding:12px 10px; color:white; font-size:0.95rem; min-width:170px;">${renderAngebotFirmaCell(a, firmaDisplay)}</td>
                                <td style="padding:12px 10px; text-align:right; color:#fff; font-size:0.95rem; white-space:nowrap;">${fmtNumberInput(a.nettobetrag)}</td>
                                <td style="padding:12px 10px; font-size:0.95rem; min-width:110px;">
                                    <input type="text" class="glass-form-input" value="${escapeHtml(fmtNumberInput(a.ek_betrag))}"
                                        placeholder="EK..." style="height:34px; font-size:0.85rem; text-align:right; width:100px;"
                                        onblur="window.updateAngebotEk('${a.id}', this.value)"
                                        onkeydown="if(event.key==='Enter'){ this.blur(); }">
                                </td>
                                <td style="padding:12px 10px; text-align:right; color:white; font-weight:600; font-size:0.95rem; white-space:nowrap;">${spanne !== null ? fmtNumberInput(spanne) : ''}${spannePctHtml}</td>
                                <td style="padding:12px 10px; font-size:0.95rem;">
                                    <div style="display:flex; align-items:center; gap:4px;">
                                        <input type="text" class="glass-form-input angebot-realisierbar-input" value="${escapeHtml(fmtPercentInput(a.realisierbar))}"
                                            placeholder="..." style="height:34px; font-size:0.85rem; width:64px;"
                                            onblur="window.updateAngebotRealisierbar('${a.id}', this.value)"
                                            onkeydown="if(event.key==='Enter'){ this.blur(); }">
                                        <span style="color:#fff; font-size:0.85rem;">%</span>
                                    </div>
                                </td>
                                <td style="padding:12px 10px; font-size:0.95rem; min-width:190px;">${renderAngebotStatusCell(a)}</td>
                                <td style="padding:12px 10px; font-size:0.95rem; min-width:160px;">${renderAngebotZustaendigCell(a)}</td>
                                <td style="padding:12px 10px; font-size:0.95rem; min-width:250px;">${renderAngebotMachineCell(a)}</td>
                                <td style="padding:12px 10px; font-size:0.95rem; min-width:200px;">${renderAngebotStandCell(a)}</td>
                                <td class="angebot-dok-drop" data-angebot-id="${a.id}" style="padding:12px 10px; font-size:0.95rem; min-width:170px; position:relative; border-radius:10px; transition:background .15s, box-shadow .15s;">${renderAngebotDokumenteCell(a)}</td>
                                <td style="padding:12px 10px; font-size:0.95rem; min-width:220px;">${renderAngebotErinnerungCell(a)}</td>
                                <td class="delete-permission-required" style="padding:10px; text-align:center;">
                                    <button onclick="window.deleteAngebot('${a.id}')" title="Angebot endgültig löschen"
                                        style="width:22px; height:22px; padding:0; border-radius:999px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:#f87171; cursor:pointer; display:inline-flex; align-items:center; justify-content:center;">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </button>
                                </td>
                            </tr>
                        `;
                        }).join('')}
                        ${mehrKnopf ? `<tr><td colspan="14" style="text-align:center; padding:12px;">${mehrKnopf}</td></tr>` : ''}
                    </tbody>
                    <tfoot>
                        <tr style="border-top:2px solid rgba(255,255,255,0.15);">
                            <td colspan="3" style="padding:12px 10px; color:#fff; font-size:0.8rem; font-weight:700; text-transform:uppercase;">Summe (${entries.length} Angebote)</td>
                            <td style="padding:12px 10px; text-align:right; color:white; font-weight:800; font-size:0.9rem; white-space:nowrap;">${fmtNumberInput(totalVK)}</td>
                            <td style="padding:12px 10px; text-align:right; color:white; font-weight:800; font-size:0.9rem; white-space:nowrap;">${fmtNumberInput(totalEK)}</td>
                            <td style="padding:12px 10px; text-align:right; color:#22c55e; font-weight:800; font-size:0.9rem; white-space:nowrap;">${fmtNumberInput(totalSpanne)}${totalSpannePct ? `<div style="font-size:0.75rem;">${totalSpannePct}</div>` : ''}</td>
                            <td colspan="8"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;

        // ==========================================
        // MOBILE KARTEN (gleiche Daten & Eingabefelder, gestapelt)
        // ==========================================
        html += `
            <div class="angebote-cards">
                ${sichtbar.map(a => {
                    const firma = (a.customers?.name || a.kundenmatchcode || '').split(',')[0].trim();
                    const vk = parseNum(a.nettobetrag);
                    const ek = parseNum(a.ek_betrag);
                    const spanne = (vk !== null && ek !== null) ? vk - ek : null;
                    const spannePct = (spanne !== null && vk > 0) ? spanne / vk * 100 : null;
                    const statusCat = (window.categoryList || []).find(c => c.type === 'status' && c.name === a.status);
                    const accentColor = statusCat?.color || 'rgba(255,255,255,0.15)';
                    return `
                    <div class="ang-card" style="border-left-color: ${accentColor};">
                        <div class="ang-card-top">
                            <div style="min-width:0; flex:1 1 auto;">
                                <div style="color:#fff; font-weight:800; font-size:0.95rem;">${escapeHtml(a.belegnummer)}</div>
                                <div style="color:#fff; font-size:0.78rem; font-weight:600; white-space:normal; word-break:break-word;">${fmtDate(a.belegdatum)}${firma ? ' · ' + escapeHtml(firma) : ''}</div>
                            </div>
                            <div style="text-align:right; flex-shrink:0;">
                                <div style="color:#fff; font-weight:800; font-size:0.95rem;">${vk !== null ? fmtNumberInput(vk) + ' €' : '–'}</div>
                                ${spanne !== null ? `<div style="font-size:0.75rem; font-weight:700; color:${spannePct !== null && spannePct < 10 ? '#F87171' : '#22c55e'};">Spanne ${fmtNumberInput(spanne)}${spannePct !== null ? ' (' + spannePct.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %)' : ''}</div>` : ''}
                            </div>
                        </div>
                        <div class="ang-card-fields">
                            <div><label>EK</label>
                                <input type="text" class="glass-form-input" value="${escapeHtml(fmtNumberInput(a.ek_betrag))}" placeholder="EK..."
                                    style="height:36px; font-size:0.85rem; text-align:right; width:100%;"
                                    onblur="window.updateAngebotEk('${a.id}', this.value)" onkeydown="if(event.key==='Enter'){ this.blur(); }">
                            </div>
                            <div><label>Realisierbar %</label>
                                <input type="text" class="glass-form-input angebot-realisierbar-input" value="${escapeHtml(fmtPercentInput(a.realisierbar))}" placeholder="..."
                                    style="height:36px; font-size:0.85rem; width:100%;"
                                    onblur="window.updateAngebotRealisierbar('${a.id}', this.value)" onkeydown="if(event.key==='Enter'){ this.blur(); }">
                            </div>
                            <div style="grid-column: 1 / -1;"><label>Status</label>${renderAngebotStatusCell(a)}</div>
                            <div style="grid-column: 1 / -1;"><label>Zuständig</label>${renderAngebotZustaendigCell(a)}</div>
                            <div style="grid-column: 1 / -1;"><label>Stand</label>${renderAngebotStandCell(a)}</div>
                            <div style="grid-column: 1 / -1;"><label>Dokumente</label>${renderAngebotDokumenteCell(a)}</div>
                            <div style="grid-column: 1 / -1;"><label>Maschine</label>${renderAngebotMachineCell(a)}</div>
                            <div style="grid-column: 1 / -1;"><label>Erinnerung</label>${renderAngebotErinnerungCell(a)}</div>
                        </div>
                    </div>
                `;
                }).join('')}
                ${mehrKnopf ? `<div style="text-align:center; padding:10px;">${mehrKnopf}</div>` : ''}
                <div style="padding:12px 4px; color:#fff; font-size:0.82rem; font-weight:700;">
                    Summe (${entries.length}): VK ${fmtEur(totalVK)} · EK ${fmtEur(totalEK)} · Spanne ${fmtEur(totalSpanne)}${totalSpannePct ? ' (' + totalSpannePct + ')' : ''}
                </div>
            </div>
        `;

        container.innerHTML = html;
        scrollPfeileEinrichten(container);
        if (typeof window.autoNachladen === 'function') {
            container.querySelectorAll('.angebote-mehr-btn').forEach(b => window.autoNachladen(b, () => window.angeboteMehrLaden()));
        }

        // Natives Dropdown durch das im Rest der App genutzte gestylte Dropdown ersetzen
        // (siehe accounting.js) — sonst rendert der Browser die Optionsliste schwarz.
        if (typeof window.initGlassSelect === 'function') {
            container.querySelectorAll('.angebot-status-select, .angebot-zustaendig-select')
                .forEach(sel => window.initGlassSelect(sel));
        }
    };


    function renderAngebotBemerkungCell(a) {
        return `
            <input type="text" class="glass-form-input" value="${escapeHtml(a.bemerkung || '')}"
                placeholder="Bemerkung..." onblur="window.updateAngebotBemerkung('${a.id}', this.value)"
                onkeydown="if(event.key==='Enter'){ this.blur(); }"
                style="height:34px; font-size:0.85rem; min-width:160px;">
        `;
    }

    // Status-Optionen werden unter Einstellungen -> Kategorien (Typ "status") gepflegt, genau wie
    // z.B. Maschinenserien oder Zusatzausrüstung. Gespeichert wird der Name (Text), nicht die ID.
    function renderAngebotStatusCell(a) {
        const options = angebotStatusOptionen(a.status);
        return `
            <div style="display:flex; align-items:center; gap:6px;">
                <select class="glass-form-input angebot-status-select" style="height:34px; font-size:0.85rem; flex:1;"
                    onchange="window.updateAngebotStatus('${a.id}', this.value, this)">
                    <option value="">-- kein Status --</option>
                    ${options.map(cat => `<option value="${escapeHtml(cat.name)}" ${a.status === cat.name ? 'selected' : ''}>${escapeHtml(cat.name)}</option>`).join('')}
                </select>
            </div>
        `;
    }

    // Zeitgestempelte Notizen pro Angebot (z.B. fürs Nachhaken) — immer neben Status verfügbar,
    // unabhängig vom gewählten Status-Wert. "+" wenn noch keine Notiz existiert, sonst die Anzahl.
    function renderAngebotNotizButton(a) {
        const notes = a.angebot_notizen || [];
        const hasNotes = notes.length > 0;
        return `
            <button type="button" class="angebot-notiz-btn" onclick="event.stopPropagation(); window.toggleAngebotNotizPanel('${a.id}', this)"
                title="${hasNotes ? notes.length + ' Notiz(en)' : 'Notiz hinzufügen'}"
                style="flex-shrink:0; width:26px; height:26px; padding:0; border-radius:999px; font-size:0.78rem; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center;
                    background:${hasNotes ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)'};
                    border:1px solid ${hasNotes ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.15)'};
                    color:${hasNotes ? 'var(--color-primary-green)' : 'rgba(255,255,255,0.6)'};">${hasNotes ? notes.length : '+'}</button>
        `;
    }

    window.toggleAngebotNotizPanel = function (angebotId, anchorEl) {
        let panel = document.getElementById('angebot-notiz-panel');
        editingNotizId = null;
        if (panel && panel.dataset.angebotId === angebotId && panel.style.display === 'block') {
            panel.style.display = 'none';
            return;
        }
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'angebot-notiz-panel';
            panel.style.cssText = 'position:fixed; z-index:999999; background:rgba(15,23,42,0.98); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,0.15); border-radius:14px; box-shadow:0 16px 48px rgba(0,0,0,0.6); overflow-y:auto; overflow-x:hidden; padding:1.25rem; display:none;';
            document.body.appendChild(panel);
        }
        panel.dataset.angebotId = angebotId;

        // Auf dem Rechner deutlich breiter (mehr Platz zum Lesen/Schreiben), auf kleinen
        // Bildschirmen an die verfügbare Breite begrenzt.
        const panelWidth = Math.min(520, window.innerWidth - 32);
        panel.style.width = panelWidth + 'px';

        if (anchorEl) {
            const rect = anchorEl.getBoundingClientRect();
            const margin = 16;
            const spaceBelow = window.innerHeight - rect.bottom - margin;
            const spaceAbove = rect.top - margin;
            const desiredHeight = 600;

            if (spaceBelow >= 320 || spaceBelow >= spaceAbove) {
                // Unterhalb des Buttons öffnen, Höhe an den verfügbaren Platz anpassen statt
                // über den unteren Bildschirmrand hinauszuragen — der Rest scrollt innerhalb
                // des Panels selbst (overflow-y:auto), keine horizontale Verschiebung nötig.
                panel.style.top = (rect.bottom + 8) + 'px';
                panel.style.bottom = 'auto';
                panel.style.maxHeight = Math.max(200, Math.min(desiredHeight, spaceBelow)) + 'px';
            } else {
                // Zu wenig Platz unterhalb (Button nah am unteren Bildschirmrand) — Panel
                // stattdessen nach oben aufklappen, damit nichts abgeschnitten wird.
                panel.style.top = 'auto';
                panel.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
                panel.style.maxHeight = Math.max(200, Math.min(desiredHeight, spaceAbove)) + 'px';
            }

            const left = Math.min(rect.left, window.innerWidth - panelWidth - 16);
            panel.style.left = Math.max(8, left) + 'px';
        }

        renderAngebotNotizPanelContent(angebotId);
        panel.style.display = 'block';
    };

    let editingNotizId = null;

    function renderAngebotNotizPanelContent(angebotId) {
        const panel = document.getElementById('angebot-notiz-panel');
        if (!panel) return;

        const angebot = angeboteList.find(a => a.id === angebotId);
        const notes = (angebot?.angebot_notizen || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const fmtTimestamp = (iso) => {
            const d = new Date(iso);
            return d.toLocaleDateString('de-DE') + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        };

        const notesHtml = notes.length ? notes.map(n => {
            if (editingNotizId === n.id) {
                return `
                    <div style="padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
                        <div style="color:#fff; font-size:0.72rem; margin-bottom:3px;">${fmtTimestamp(n.created_at)}</div>
                        <textarea id="angebot-notiz-edit-${n.id}" class="glass-form-input" rows="5" style="width:100%; font-size:0.9rem; resize:vertical;">${escapeHtml(n.content)}</textarea>
                        <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:6px;">
                            <button type="button" onclick="event.stopPropagation(); window.deleteAngebotNotiz('${angebotId}', '${n.id}')" class="delete-permission-required" style="padding:4px 10px; font-size:0.75rem; border-radius:8px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:#f87171; cursor:pointer; margin-right:auto;">Löschen</button>
                            <button type="button" onclick="event.stopPropagation(); window.cancelEditAngebotNotiz('${angebotId}')" class="btn-secondary" style="padding:4px 10px; font-size:0.75rem;">Abbrechen</button>
                            <button type="button" onclick="event.stopPropagation(); window.saveEditAngebotNotiz('${angebotId}', '${n.id}')" class="btn-primary" style="padding:4px 10px; font-size:0.75rem;">Speichern</button>
                        </div>
                    </div>
                `;
            }
            return `
                <div onclick="event.stopPropagation(); window.startEditAngebotNotiz('${angebotId}', '${n.id}')" title="Klicken zum Bearbeiten" style="padding:8px; margin:0 -8px; border-radius:8px; border-bottom:1px solid rgba(255,255,255,0.06); cursor:pointer; transition:background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                    <div style="color:#fff; font-size:0.72rem; margin-bottom:3px;">${fmtTimestamp(n.created_at)}</div>
                    <div style="color:#fff; font-size:0.85rem; white-space:pre-wrap;">${escapeHtml(n.content)}</div>
                </div>
            `;
        }).join('') : '<div style="color:#fff; font-size:0.82rem; padding:6px 0 12px;">Noch keine Notizen.</div>';

        panel.innerHTML = `
            <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#fff; margin-bottom:0.6rem;">Notizen</div>
            <div style="margin-bottom:0.6rem; max-height:260px; overflow-y:auto; overflow-x:hidden;">${notesHtml}</div>
            <div style="border-top:1px solid rgba(255,255,255,0.1); padding-top:0.85rem;">
                <div style="color:#fff; font-size:0.75rem; margin-bottom:5px;">Neue Notiz · ${fmtTimestamp(new Date().toISOString())}</div>
                <textarea id="angebot-notiz-input" class="glass-form-input" rows="5" placeholder="Notiz eingeben..." style="width:100%; font-size:0.9rem; resize:vertical;"></textarea>
                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
                    <button type="button" onclick="window.toggleAngebotNotizPanel('${angebotId}')" class="btn-secondary" style="padding:6px 14px; font-size:0.8rem;">Schließen</button>
                    <button type="button" onclick="window.saveAngebotNotiz('${angebotId}')" class="btn-primary" style="padding:6px 14px; font-size:0.8rem;">Speichern</button>
                </div>
            </div>
        `;
    }

    window.saveAngebotNotiz = async function (angebotId) {
        const input = document.getElementById('angebot-notiz-input');
        const text = input ? input.value.trim() : '';
        if (!text || !window.supabaseClient) return;

        try {
            const { data, error } = await window.supabaseClient
                .from('angebot_notizen')
                .insert([{ angebot_id: angebotId, content: text }])
                .select()
                .single();
            if (error) throw error;

            const idx = angeboteList.findIndex(x => x.id === angebotId);
            if (idx !== -1) {
                if (!angeboteList[idx].angebot_notizen) angeboteList[idx].angebot_notizen = [];
                angeboteList[idx].angebot_notizen.push(data);
            }

            renderAngebotNotizPanelContent(angebotId);
            window.renderAngeboteList();
        } catch (err) {
            console.error('Error saving Notiz:', err);
            window.showToast('Fehler beim Speichern der Notiz: ' + err.message);
        }
    };

    window.startEditAngebotNotiz = function (angebotId, notizId) {
        editingNotizId = notizId;
        renderAngebotNotizPanelContent(angebotId);
        requestAnimationFrame(() => {
            const ta = document.getElementById(`angebot-notiz-edit-${notizId}`);
            // Bewusst kein ta.select() -- Cursor soll an die Stelle springen, wo man hinklickt,
            // statt beim Öffnen automatisch den ganzen Text zu markieren.
            if (ta) ta.focus();
        });
    };

    window.cancelEditAngebotNotiz = function (angebotId) {
        editingNotizId = null;
        renderAngebotNotizPanelContent(angebotId);
    };

    window.saveEditAngebotNotiz = async function (angebotId, notizId) {
        const ta = document.getElementById(`angebot-notiz-edit-${notizId}`);
        const text = ta ? ta.value.trim() : '';
        if (!text || !window.supabaseClient) return;

        try {
            const { data, error } = await window.supabaseClient
                .from('angebot_notizen')
                .update({ content: text })
                .eq('id', notizId)
                .select()
                .single();
            if (error) throw error;

            const idx = angeboteList.findIndex(x => x.id === angebotId);
            if (idx !== -1 && angeboteList[idx].angebot_notizen) {
                const noteIdx = angeboteList[idx].angebot_notizen.findIndex(n => n.id === notizId);
                if (noteIdx !== -1) angeboteList[idx].angebot_notizen[noteIdx] = data;
            }

            editingNotizId = null;
            renderAngebotNotizPanelContent(angebotId);
        } catch (err) {
            console.error('Error updating Notiz:', err);
            window.showToast('Fehler beim Speichern der Notiz: ' + err.message);
        }
    };

    window.deleteAngebotNotiz = async function (angebotId, notizId) {
        if (typeof window.canDelete === 'function' && !window.canDelete('Notizen')) return;
        if (!window.supabaseClient) return;
        if (!confirm('Notiz wirklich löschen?')) return;

        try {
            const { error } = await window.supabaseClient
                .from('angebot_notizen')
                .delete()
                .eq('id', notizId);
            if (error) throw error;

            const idx = angeboteList.findIndex(x => x.id === angebotId);
            if (idx !== -1 && angeboteList[idx].angebot_notizen) {
                angeboteList[idx].angebot_notizen = angeboteList[idx].angebot_notizen.filter(n => n.id !== notizId);
            }

            editingNotizId = null;
            renderAngebotNotizPanelContent(angebotId);
            window.renderAngeboteList(); // Notiz-Zaehler-Button (+ / Anzahl) in der Zeile aktualisieren
        } catch (err) {
            console.error('Error deleting Notiz:', err);
            window.showToast('Fehler beim Löschen der Notiz: ' + err.message);
        }
    };

    document.addEventListener('click', (e) => {
        const panel = document.getElementById('angebot-notiz-panel');
        if (panel && panel.style.display === 'block' &&
            !e.target.closest('#angebot-notiz-panel') &&
            !e.target.closest('.angebot-notiz-btn')) {
            panel.style.display = 'none';
        }
    });

    // EK, Spanne (berechnet, nicht gespeichert), Realisierbar (%) und Status sind reine manuelle
    // Kalkulationsfelder in der App — kommen nicht aus dem Sage-Import.
    window.updateAngebotEk = async function (angebotId, value) {
        if (!window.supabaseClient) return;
        const ek = parseGermanNumber(value);
        try {
            const { data, error } = await window.supabaseClient
                .from('angebote')
                .update({ ek_betrag: ek })
                .eq('id', angebotId)
                .select('*, customers(name), angebot_notizen(id, content, created_at)')
                .single();
            if (error) throw error;
            const idx = angeboteList.findIndex(x => x.id === angebotId);
            if (idx !== -1) angeboteList[idx] = data;
            window.renderAngeboteList(); // Spanne hängt von EK ab -> neu rendern
        } catch (err) {
            console.error('Error updating EK:', err);
            window.showToast('Fehler beim Speichern des Einkaufspreises: ' + err.message);
        }
    };

    // Loescht ein Angebot endgueltig aus der Datenbank. Der Loesch-Button ist ueber die Klasse
    // "delete-permission-required" an dasselbe Berechtigungssystem gekoppelt wie ueberall sonst
    // in der App (body.disable-delete blendet ihn aus, siehe applyUserPermissions in index.html).
    window.deleteAngebot = async function (angebotId) {
        if (typeof window.canDelete === 'function' && !window.canDelete('Angeboten')) return;
        if (!window.supabaseClient) return;
        const entry = angeboteList.find(x => x.id === angebotId);
        const label = entry ? entry.belegnummer : angebotId;
        if (!confirm(`Angebot "${label}" wirklich endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) return;
        try {
            // Der zugehörige Vorgang ist das Angebot selbst — er geht mit.
            const proc = vorgangZu(entry);
            const { error } = await window.supabaseClient
                .from('angebote')
                .delete()
                .eq('id', angebotId);
            if (error) throw error;
            if (proc) await window.supabaseClient.from('internal_processes').delete().eq('id', proc.id);
            delete vorgaengeByAngebot[angebotId];
            angeboteList = angeboteList.filter(x => x.id !== angebotId);
            window.renderAngeboteList();
        } catch (err) {
            console.error('Error deleting Angebot:', err);
            window.showToast('Fehler beim Löschen: ' + err.message);
        }
    };

    window.updateAngebotRealisierbar = async function (angebotId, value) {
        if (!window.supabaseClient) return;
        const val = parseGermanNumber(value);
        try {
            const { data, error } = await window.supabaseClient
                .from('angebote')
                .update({ realisierbar: val })
                .eq('id', angebotId)
                .select('*, customers(name), angebot_notizen(id, content, created_at)')
                .single();
            if (error) throw error;
            const idx = angeboteList.findIndex(x => x.id === angebotId);
            if (idx !== -1) angeboteList[idx] = data;
            window.renderAngeboteList();
        } catch (err) {
            console.error('Error updating Realisierbar:', err);
            window.showToast('Fehler beim Speichern: ' + err.message);
        }
    };

    window.updateAngebotStatus = async function (angebotId, value, selectEl) {
        if (!window.supabaseClient) return;
        const text = (value || '').trim() || null;
        try {
            const updatePayload = { status: text };
            // Bei eindeutigem Ausgang automatisch die Realisierbar-Quote nachziehen, damit die
            // gewichteten Auswertungen (erwarteter Umsatz etc.) sofort stimmen, ohne dass man es
            // manuell nachtragen muss. Bei allen anderen Status bleibt Realisierbar unangetastet.
            // Case-insensitiv/getrimmt vergleichen statt exaktem "===", da Statusnamen frei unter
            // Einstellungen -> Kategorien gepflegt werden und z.B. Gross-/Kleinschreibung abweichen kann.
            const normalizedText = (text || '').trim().toLowerCase();
            let autoRealisierbar = null;
            if (normalizedText === 'auftrag erhalten') {
                autoRealisierbar = 100;
            } else if (normalizedText === 'auftrag verloren') {
                autoRealisierbar = 0;
            } else if (normalizedText === 'warten auf reaktion') {
                autoRealisierbar = 5;
            }
            if (autoRealisierbar !== null) {
                updatePayload.realisierbar = autoRealisierbar;
                // Sofort im DOM anzeigen statt auf die Server-Antwort/renderAngeboteList zu warten —
                // gleiche Zeile (Desktop-Tabelle: <tr>, Mobile-Karte: .ang-card).
                const row = selectEl && (selectEl.closest('tr') || selectEl.closest('.ang-card'));
                const realisierbarInput = row && row.querySelector('.angebot-realisierbar-input');
                if (realisierbarInput) realisierbarInput.value = String(autoRealisierbar);
            }

            const { data, error } = await window.supabaseClient
                .from('angebote')
                .update(updatePayload)
                .eq('id', angebotId)
                .select('*, customers(name), angebot_notizen(id, content, created_at)')
                .single();
            if (error) throw error;
            const idx = angeboteList.findIndex(x => x.id === angebotId);
            if (idx !== -1) angeboteList[idx] = data;
            await window.vorgangStatusNachAngebot(data);   // erhalten/verloren -> Vorgang erledigt
            window.renderAngeboteList(); // Farbakzent links an der Zeile richtet sich nach dem Status
        } catch (err) {
            console.error('Error updating status:', err);
            window.showToast('Fehler beim Speichern des Status: ' + err.message);
        }
    };

    function renderAngebotErinnerungCell(a) {
        return `
            <input type="date" class="glass-form-input" value="${a.erinnerung || ''}"
                style="height:34px; font-size:0.85rem; color-scheme: dark;"
                onchange="window.updateAngebotErinnerung('${a.id}', this.value)">
        `;
    }

    window.updateAngebotErinnerung = async function (angebotId, value) {
        if (!window.supabaseClient) return;
        const date = value || null;
        try {
            // Wer die Erinnerung setzt, bekommt sie auch — und nur der.
            // Ohne diesen Vermerk landete sie bei jedem in der Glocke.
            // Migration: supabase/supabase_add_erinnerung_owner.sql
            const feld = { erinnerung: date };
            if (date && window.activeUser) {
                feld.erinnerung_by = window.activeUser.id || null;
                feld.erinnerung_by_name = window.activeUser.name || null;
            } else if (!date) {
                feld.erinnerung_by = null;
                feld.erinnerung_by_name = null;
            }

            const schreibe = (nutzlast) => window.supabaseClient
                .from('angebote')
                .update(nutzlast)
                .eq('id', angebotId)
                .select('*, customers(name), angebot_notizen(id, content, created_at)')
                .single();

            let { data, error } = await schreibe(feld);
            // erinnerung_by ist in der Datenbank uuid, die App-Nutzer haben aber
            // bigint-IDs („invalid input syntax for type uuid: "1"") — dann nur
            // den Namen mitschreiben. Fehlt die Spalte ganz (Migration nicht
            // gelaufen), ohne beide Felder speichern.
            if (error && /uuid|erinnerung_by/i.test(error.message || '')) {
                const ohneId = { erinnerung: date, erinnerung_by_name: feld.erinnerung_by_name === undefined ? null : feld.erinnerung_by_name };
                ({ data, error } = await schreibe(ohneId));
                if (error && /erinnerung_by/i.test(error.message || '')) ({ data, error } = await schreibe({ erinnerung: date }));
            }
            if (error) throw error;
            const idx = angeboteList.findIndex(x => x.id === angebotId);
            if (idx !== -1) angeboteList[idx] = data;
            window.renderAngebotReminderBadge();
            // Dieselbe Erinnerung am Vorgang (remind_at, 08:00 Uhr) — der Vorgang
            // zeigt sie dann ebenfalls, und die Glocke der Vorgänge weiß Bescheid.
            const proc = vorgangZu(data);
            if (proc) {
                const remindAt = date ? new Date(date + 'T08:00:00').toISOString() : null;
                const bisher = proc.remind_at ? String(proc.remind_at).slice(0, 10) : null;
                if ((date || null) !== bisher) await vorgangAktualisieren(data, { remind_at: remindAt });
            }
        } catch (err) {
            console.error('Error updating Erinnerung:', err);
            window.showToast('Fehler beim Speichern der Erinnerung: ' + err.message);
        }
    };

    // ==========================================
    // ANGEBOTE: ERINNERUNGEN (Glocke im Seiten-Header)
    // ==========================================
    // Ueberfaellig: Erinnerungsdatum liegt in der Vergangenheit. Zeitnah: heute bis in 5 Tagen.
    function getAngeboteReminders() {
        const todayStr = new Date().toISOString().split('T')[0];
        const today = new Date(todayStr + 'T00:00:00');
        const in5Days = new Date(today);
        in5Days.setDate(in5Days.getDate() + 5);

        const ueberfaellig = [];
        const zeitnah = [];

        angeboteList.forEach(a => {
            if (!a.erinnerung) return;
            const d = new Date(a.erinnerung + 'T00:00:00');
            if (d < today) {
                ueberfaellig.push(a);
            } else if (d <= in5Days) {
                zeitnah.push(a);
            }
        });

        const byDate = (x, y) => new Date(x.erinnerung) - new Date(y.erinnerung);
        ueberfaellig.sort(byDate);
        zeitnah.sort(byDate);

        return { ueberfaellig, zeitnah };
    }

    window.renderAngebotReminderBadge = function () {
        const badge = document.getElementById('angebote-reminder-badge');
        const bell = document.getElementById('angebote-reminder-bell');
        const bellIcon = document.getElementById('angebote-reminder-bell-icon');
        if (!badge) return;
        const { ueberfaellig, zeitnah } = getAngeboteReminders();
        const total = ueberfaellig.length + zeitnah.length;
        const hasUrgent = ueberfaellig.length > 0;

        if (total > 0) {
            badge.textContent = total;
            badge.classList.remove('hidden');

            if (bell) {
                if (hasUrgent) {
                    // Overdue: bright pulsing red glow
                    bell.classList.add('reminder-bell-urgent');
                    bell.classList.remove('reminder-bell-soon');
                } else {
                    // Upcoming: softer amber glow
                    bell.classList.add('reminder-bell-soon');
                    bell.classList.remove('reminder-bell-urgent');
                }
            }
            if (bellIcon) {
                bellIcon.style.stroke = hasUrgent ? '#ef4444' : '#fbbf24';
            }
        } else {
            badge.classList.add('hidden');
            if (bell) {
                bell.classList.remove('reminder-bell-urgent', 'reminder-bell-soon');
            }
            if (bellIcon) {
                bellIcon.style.stroke = '';
            }
        }
    };

    window.toggleAngeboteReminderPanel = function (e) {
        if (e) e.stopPropagation();

        let panel = document.getElementById('angebote-reminder-panel');
        if (panel && panel.style.display === 'block') {
            panel.style.display = 'none';
            return;
        }
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'angebote-reminder-panel';
            panel.style.cssText = 'position:fixed; z-index:999999; background:rgba(15,23,42,0.98); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,0.15); border-radius:14px; box-shadow:0 16px 48px rgba(0,0,0,0.6); max-height:420px; overflow-y:auto; min-width:300px; max-width:380px; padding:0.85rem; display:none;';
            document.body.appendChild(panel);
        }

        const btn = document.getElementById('angebote-reminder-bell');
        if (btn) {
            const rect = btn.getBoundingClientRect();
            panel.style.top = (rect.bottom + 8) + 'px';
            panel.style.left = '';
            panel.style.right = (window.innerWidth - rect.right) + 'px';
        }

        const { ueberfaellig, zeitnah } = getAngeboteReminders();

        const renderItem = (a) => {
            const firma = (a.customers?.name || a.kundenmatchcode || '').split(',')[0].trim();
            const label = firma || a.belegnummer;
            const dateStr = new Date(a.erinnerung + 'T00:00:00').toLocaleDateString('de-DE');
            return `
                <div onclick="window.jumpToAngebotFromReminder('${a.id}')" style="padding:8px 10px; border-radius:8px; cursor:pointer; transition:background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='transparent'">
                    <div style="color:#fff; font-weight:600; font-size:0.88rem;">${escapeHtml(label)}</div>
                    <div style="color:#fff; font-size:0.78rem;">${escapeHtml(a.belegnummer)} · ${dateStr}</div>
                </div>
            `;
        };

        const renderGroup = (title, color, items) => {
            if (items.length === 0) return '';
            return `
                <div style="margin-bottom:0.6rem;">
                    <div style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:${color}; padding:4px 10px 6px;">${title} (${items.length})</div>
                    ${items.map(renderItem).join('')}
                </div>
            `;
        };

        const html = renderGroup('Überfällig', '#ef4444', ueberfaellig) + renderGroup('Zeitnah', '#f59e0b', zeitnah);
        panel.innerHTML = html || '<div style="padding:1rem; text-align:center; color:#fff; font-size:0.85rem;">Keine anstehenden Erinnerungen</div>';
        panel.style.display = 'block';
    };

    window.jumpToAngebotFromReminder = function (angebotId) {
        const panel = document.getElementById('angebote-reminder-panel');
        if (panel) panel.style.display = 'none';

        const angebot = angeboteList.find(a => a.id === angebotId);
        if (typeof window.switchListenTab === 'function') window.switchListenTab('angebote');
        const searchInput = document.getElementById('angebote-search-input');
        if (searchInput && angebot) {
            searchInput.value = angebot.belegnummer;
            window.renderAngeboteList();
        }
    };

    document.addEventListener('click', (e) => {
        const panel = document.getElementById('angebote-reminder-panel');
        if (panel && panel.style.display === 'block' &&
            !e.target.closest('#angebote-reminder-panel') &&
            !e.target.closest('#angebote-reminder-bell')) {
            panel.style.display = 'none';
        }
    });

    // ==========================================
    // ANGEBOTE: MASCHINEN-ZUORDNUNG (automatisch + manuell)
    // ==========================================
    // Aeussere Huelle mit data-aid, damit rerenderAngebotMachineCell nur diese Zelle
    // austauschen kann statt die ganze Liste (Dashboard + 40 Zeilen) neu zu zeichnen.
    function renderAngebotMachineCell(a) {
        return `<div class="angebot-machine-cell" data-aid="${escapeHtml(String(a.id))}">${renderAngebotMachineCellInhalt(a)}</div>`;
    }

    window.rerenderAngebotMachineCell = function (angebotId) {
        if (angebotId == null) return;
        const a = angeboteList.find(x => String(x.id) === String(angebotId));
        if (!a) { window.renderAngeboteList(); return; }
        const zellen = document.querySelectorAll(`.angebot-machine-cell[data-aid="${CSS.escape(String(angebotId))}"]`);
        if (!zellen.length) { window.renderAngeboteList(); return; }
        zellen.forEach(z => { z.innerHTML = renderAngebotMachineCellInhalt(a); });
        zuletztBearbeiteteMaschineZelle = (editingAngebotMachineId === a.id) ? a.id : null;
    };

    function renderAngebotMachineCellInhalt(a) {
        if (editingAngebotMachineId === a.id) {
            if (editingAngebotMachineMode === 'freitext') {
                return `
                    <input type="text" class="glass-form-input angebot-machine-search" data-angebot-id="${a.id}"
                        value="${escapeHtml(pendingFreitextValue)}" placeholder="Eigene Bezeichnung..."
                        style="height:34px; font-size:0.85rem; width:100%;"
                        onblur="window.commitAngebotMachineFreitext('${a.id}', this.value)"
                        onkeydown="if(event.key==='Enter'){ this.blur(); }">
                `;
            }
            return `
                <input type="text" class="glass-form-input angebot-machine-search" data-angebot-id="${a.id}"
                    placeholder="Maschine suchen..."
                    style="height:34px; font-size:0.85rem; width:100%;"
                    oninput="window.filterAngebotMachineDropdown(this.value, '${a.id}')"
                    onfocus="window.filterAngebotMachineDropdown(this.value, '${a.id}')"
                    onkeydown="if(event.key==='Enter'){ window.commitAngebotMachineFreitext('${a.id}', this.value); }">
            `;
        }

        const hasMachine = !!(a.machine_id || a.machine_label);
        // Eigene Bezeichnung (Freitext): direkt im Feld anklicken und
        // weiterschreiben — gespeichert wird beim Verlassen des Feldes oder mit
        // Enter. Ohne Maschine: Klick auf den Platzhalter öffnet die Suche.
        const nameHtml = a.machine_id
            ? `<span style="color:var(--color-primary-green); font-weight:600;">${escapeHtml((typeof window.getMachineName === 'function') ? window.getMachineName(a.machine_id) : a.machine_id)}</span>`
            : a.machine_label
                ? `<div contenteditable="true" spellcheck="false" class="glass-form-input angebot-machine-label-inline" data-alt="${escapeHtml(a.machine_label)}"
                        title="Eigene Bezeichnung — hier direkt ändern oder ergänzen"
                        style="min-height:34px; height:auto; width:100%; padding:7px 10px; font-size:0.85rem; line-height:1.35; white-space:pre-wrap; overflow-wrap:anywhere; color:#f59e0b !important; font-weight:600; border-color:rgba(245,158,11,0.45) !important; cursor:text;"
                        onclick="event.stopPropagation()"
                        onkeydown="if(event.key==='Enter'){ event.preventDefault(); this.blur(); } if(event.key==='Escape'){ this.textContent=this.dataset.alt; this.blur(); }"
                        onblur="if(this.textContent.trim() !== this.dataset.alt.trim()) window.commitAngebotMachineFreitext('${a.id}', this.textContent)">${escapeHtml(a.machine_label)}</div>`
                : `<span onclick="event.stopPropagation(); window.startEditAngebotMachine('${a.id}')" style="color:rgba(255,255,255,0.35); font-style:italic; cursor:pointer;">Maschine …</span>`;

        return `
            <div style="display:flex; align-items:flex-start; gap:8px;">
                <button type="button" class="angebot-machine-edit-btn" onclick="event.stopPropagation(); window.startEditAngebotMachine('${a.id}')"
                    title="${hasMachine ? 'Maschine bearbeiten' : 'Maschine hinzufügen'}"
                    style="flex-shrink:0; width:26px; height:26px; padding:0; border-radius:999px; font-size:0.78rem; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center;
                        background:${hasMachine ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)'};
                        border:1px solid ${hasMachine ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.15)'};
                        color:${hasMachine ? 'var(--color-primary-green)' : 'rgba(255,255,255,0.6)'};">${hasMachine ? '✎' : '+'}</button>
                <span style="flex:1; min-width:0; white-space:normal; word-break:break-word; line-height:1.3; padding-top:3px;">${nameHtml}</span>
            </div>
        `;
    }

    window.startEditAngebotMachine = function (angebotId) {
        const vorher = zuletztBearbeiteteMaschineZelle;
        editingAngebotMachineId = angebotId;
        editingAngebotMachineMode = 'search';
        // War gerade eine andere Zeile im Bearbeiten-Modus, deren Eingabefeld wieder zurueckbauen
        if (vorher != null && String(vorher) !== String(angebotId)) window.rerenderAngebotMachineCell(vorher);
        window.rerenderAngebotMachineCell(angebotId);
        requestAnimationFrame(() => {
            const input = document.querySelector(`.angebot-machine-search[data-angebot-id="${angebotId}"]`);
            if (input) {
                input.focus();
                input.select();
                window.filterAngebotMachineDropdown(input.value, angebotId);
            }
        });
    };

    // Wechselt das Suchfeld in ein reines Textfeld zum Eintippen einer eigenen Bezeichnung
    // (kein Dropdown mehr) — ausgelöst über den "Eigene Bezeichnung"-Eintrag im Dropdown.
    window.switchAngebotMachineToFreitext = function (angebotId, prefillText) {
        const dropdown = document.getElementById('angebot-machine-dropdown-portal');
        if (dropdown) dropdown.style.display = 'none';
        editingAngebotMachineMode = 'freitext';
        pendingFreitextValue = (prefillText || '').trim();
        window.rerenderAngebotMachineCell(angebotId);
        requestAnimationFrame(() => {
            const input = document.querySelector(`.angebot-machine-search[data-angebot-id="${angebotId}"]`);
            if (input) { input.focus(); input.select(); }
        });
    };

    // Bereits verwendete Freitext-Maschinenbezeichnungen (nur fürs Angebote-Dropdown, gelten an
    // keiner anderen Stelle der App) — werden direkt aus der schon geladenen Angebote-Liste
    // ermittelt, keine eigene Tabelle/Abfrage dafür nötig. Gecacht je Listenstand, damit
    // nicht bei jedem Tastendruck neu gesammelt und sortiert wird.
    let labelCacheQuelle = null, labelCacheLaenge = -1, labelCache = [];
    function getDistinctMachineLabels() {
        if (angeboteList === labelCacheQuelle && angeboteList.length === labelCacheLaenge) return labelCache;
        const set = new Set();
        angeboteList.forEach(a => { if (a.machine_label) set.add(a.machine_label); });
        labelCache = [...set].sort((a, b) => a.localeCompare(b, 'de'));
        labelCacheQuelle = angeboteList; labelCacheLaenge = angeboteList.length;
        return labelCache;
    }

    // Suchtext je Maschine einmal vorberechnen (neu, sobald sich machineList ändert)
    let maschSuchQuelle = null, maschSuchLaenge = -1, maschSuch = [];
    function angebotMaschinenIndex() {
        const liste = window.machineList || [];
        if (liste !== maschSuchQuelle || liste.length !== maschSuchLaenge) {
            maschSuchQuelle = liste; maschSuchLaenge = liste.length;
            maschSuch = liste.map(m => ({
                m,
                text: [m.manufacturer || '', m.name || '', m.serial_number || m.serial || '', m.year ? String(m.year) : ''].join(' ').toLowerCase()
            }));
        }
        return maschSuch;
    }

    // Beim schnellen Tippen nur den letzten Stand zeichnen (gebündelt per setTimeout)
    let angebotDdTimer = 0, angebotDdArgs = null;
    window.filterAngebotMachineDropdown = function (query, angebotId) {
        angebotDdArgs = [query, angebotId];
        if (angebotDdTimer) return;
        angebotDdTimer = setTimeout(() => {
            angebotDdTimer = 0;
            filterAngebotMachineDropdownJetzt(angebotDdArgs[0], angebotDdArgs[1]);
        }, 16);
    };

    function filterAngebotMachineDropdownJetzt(query, angebotId) {
        const tokens = (query || '').toLowerCase().split(/\s+/).filter(t => t.length > 0);
        const index = angebotMaschinenIndex();
        const filtered = [];
        for (let i = 0; i < index.length && filtered.length < 50; i++) {
            const e = index[i];
            let ok = true;
            for (let t = 0; t < tokens.length; t++) {
                if (e.text.indexOf(tokens[t]) === -1) { ok = false; break; }
            }
            if (ok) filtered.push(e.m);
        }
        const filteredLabels = [];
        const alleLabels = getDistinctMachineLabels();
        for (let i = 0; i < alleLabels.length && filteredLabels.length < 30; i++) {
            const l = alleLabels[i].toLowerCase();
            if (tokens.every(t => l.includes(t))) filteredLabels.push(alleLabels[i]);
        }

        let dropdown = document.getElementById('angebot-machine-dropdown-portal');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.id = 'angebot-machine-dropdown-portal';
            dropdown.style.cssText = 'position:fixed;z-index:999999;background:rgba(15,23,42,0.98);border:1px solid rgba(255,255,255,0.15);border-radius:12px;max-height:320px;overflow-y:auto;box-shadow:0 16px 48px rgba(0,0,0,0.7);display:none;min-width:200px;';
            // Ein Handler für alle Einträge (Delegation). mousedown + preventDefault, damit das
            // Suchfeld den Fokus behält; der Freitext-Eintrag wechselt nur den Modus und
            // stoppt den Klick, damit der Außerhalb-Klick-Listener die Bearbeitung nicht beendet.
            dropdown.addEventListener('mousedown', (e) => {
                const item = e.target.closest('.pm-item');
                if (!item || item.hasAttribute('data-freitext')) return;
                e.preventDefault();
                const aid = dropdown.dataset.angebotId;
                if (item.hasAttribute('data-none')) { window.selectAngebotMachine(aid, null); return; }
                if (item.hasAttribute('data-mid')) { window.selectAngebotMachine(aid, item.getAttribute('data-mid')); return; }
                if (item.hasAttribute('data-label')) { window.commitAngebotMachineFreitext(aid, item.getAttribute('data-label')); }
            });
            dropdown.addEventListener('click', (e) => {
                const item = e.target.closest('.pm-item[data-freitext]');
                if (!item) return;
                e.stopPropagation();
                window.switchAngebotMachineToFreitext(dropdown.dataset.angebotId, dropdown.dataset.query || '');
            });
            document.body.appendChild(dropdown);
        }
        dropdown.dataset.angebotId = angebotId;
        dropdown.dataset.query = query || '';

        const searchInput = document.querySelector(`.angebot-machine-search[data-angebot-id="${angebotId}"]`);
        if (searchInput) {
            const rect = searchInput.getBoundingClientRect();
            const margin = 8;
            const width = Math.max(rect.width, 220);
            // Immer unter dem Feld aufklappen, aber Breite/Höhe an den Viewport anpassen, damit
            // das Dropdown nicht rechts oder unten abgeschnitten aus dem sichtbaren Bereich ragt.
            const spaceBelow = window.innerHeight - rect.bottom - margin;
            dropdown.style.top = (rect.bottom + 4) + 'px';
            dropdown.style.bottom = 'auto';
            dropdown.style.maxHeight = Math.max(120, Math.min(320, spaceBelow)) + 'px';
            dropdown.style.width = width + 'px';
            const left = Math.min(rect.left, window.innerWidth - width - margin);
            dropdown.style.left = Math.max(margin, left) + 'px';
        }

        const ITEM = 'padding:10px 14px;cursor:pointer;font-size:0.9rem;border-top:1px solid rgba(255,255,255,0.05);';
        const html = [];
        html.push(`<div class="pm-item" data-none style="padding:10px 14px;cursor:pointer;color:#fff;font-size:0.9rem;">Keine Maschine</div>`);

        // Direkt unter "Keine Maschine": eigene Bezeichnung eintippen, grau hinterlegt. Übernimmt
        // einfach den aktuell eingetippten Text als Freitext-Maschine (genau wie Enter im Feld).
        const trimmedQuery = (query || '').trim();
        html.push(`<div class="pm-item" data-freitext style="padding:10px 14px;cursor:pointer;font-size:0.9rem;color:#fff;background:rgba(255,255,255,0.05);border-top:1px solid rgba(255,255,255,0.05);">${trimmedQuery ? `✎ Eigene Bezeichnung „${escapeHtml(trimmedQuery)}“ übernehmen` : '✎ Eigene Bezeichnung eintippen...'}</div>`);

        if (filtered.length === 0 && filteredLabels.length === 0) {
            html.push(`<div style="padding:10px 14px;color:#fff;font-size:0.85rem;font-style:italic;">Keine Maschine gefunden</div>`);
        }

        filtered.forEach(m => {
            const label = (typeof window.getMachineName === 'function') ? window.getMachineName(m.id) : (m.name || '');
            html.push(`<div class="pm-item" data-mid="${escapeHtml(String(m.id))}" style="${ITEM}"><span style="color:var(--color-primary-green);font-weight:600;">${escapeHtml(label)}</span></div>`);
        });

        // Bereits anderswo verwendete Freitext-Bezeichnungen — rot, damit klar erkennbar ist:
        // das ist keine echte Maschine aus der Maschinenübersicht.
        filteredLabels.forEach(label => {
            html.push(`<div class="pm-item" data-label="${escapeHtml(label)}" style="${ITEM}"><span style="color:#ef4444;font-weight:600;">${escapeHtml(label)}</span></div>`);
        });

        dropdown.innerHTML = html.join('');
        dropdown.style.display = 'block';
    }

    window.selectAngebotMachine = async function (angebotId, machineId) {
        const dropdown = document.getElementById('angebot-machine-dropdown-portal');
        if (dropdown) dropdown.style.display = 'none';
        editingAngebotMachineId = null;
        await window.assignAngebotMachine(angebotId, machineId || null);
    };

    window.assignAngebotMachine = async function (angebotId, machineId) {
        if (!window.supabaseClient) return;
        try {
            // Echte Maschine zugeordnet (oder bewusst per Dropdown auf "Keine Maschine" geleert) ->
            // ein zuvor eingetragenes Freitext-Label ist damit hinfällig.
            const updatePayload = { machine_id: machineId, machine_label: null };
            if (machineId) {
                // Maschine ist bekannt -> der zugehörige Kunde steht damit auch fest, selbst wenn
                // der Kundenmatchcode zuvor nicht eindeutig aufgelöst werden konnte.
                const machine = (window.machineList || []).find(m => String(m.id) === String(machineId));
                if (machine && machine.customer_id) updatePayload.customer_id = machine.customer_id;
            }

            const { data, error } = await window.supabaseClient
                .from('angebote')
                .update(updatePayload)
                .eq('id', angebotId)
                .select('*, customers(name), angebot_notizen(id, content, created_at)')
                .single();

            if (error) throw error;

            const idx = angeboteList.findIndex(x => x.id === angebotId);
            if (idx !== -1) angeboteList[idx] = data;

            // Erst zeichnen, dann Historie und Vorgang im Hintergrund nachziehen —
            // beides braucht je einen Netzaufruf und muss nicht im Weg stehen.
            window.renderAngeboteList();
            Promise.all([window.syncAngebotMachineHistory(data), vorgangMitAngebotAbgleichen(data)])
                .then(() => window.renderAngeboteList())
                .catch(e => console.warn('Nachziehen von Historie/Vorgang:', e));
        } catch (err) {
            console.error('Error assigning machine to Angebot:', err);
            window.showToast('Fehler beim Zuordnen der Maschine: ' + err.message);
        }
    };

    // Freitext-Bezeichnung für Maschinen, die (noch) keinen echten Datensatz in "machines"
    // haben — z.B. weil sich eine volle Anlage nicht lohnt. Schließt sich mit machine_id aus.
    window.commitAngebotMachineFreitext = async function (angebotId, value) {
        const dropdown = document.getElementById('angebot-machine-dropdown-portal');
        if (dropdown) dropdown.style.display = 'none';
        editingAngebotMachineId = null;
        editingAngebotMachineMode = 'search';
        pendingFreitextValue = '';

        if (!window.supabaseClient) return;
        const text = (value || '').trim() || null;
        try {
            const { data, error } = await window.supabaseClient
                .from('angebote')
                .update({ machine_label: text, machine_id: null })
                .eq('id', angebotId)
                .select('*, customers(name), angebot_notizen(id, content, created_at)')
                .single();

            if (error) throw error;

            const idx = angeboteList.findIndex(x => x.id === angebotId);
            if (idx !== -1) angeboteList[idx] = data;

            // Erst zeichnen, dann Historie und Vorgang im Hintergrund nachziehen —
            // beides braucht je einen Netzaufruf und muss nicht im Weg stehen.
            window.renderAngeboteList();
            Promise.all([window.syncAngebotMachineHistory(data), vorgangMitAngebotAbgleichen(data)])
                .then(() => window.renderAngeboteList())
                .catch(e => console.warn('Nachziehen von Historie/Vorgang:', e));
        } catch (err) {
            console.error('Error saving machine label for Angebot:', err);
            window.showToast('Fehler beim Speichern der Maschinenbezeichnung: ' + err.message);
        }
    };

    // Manuelles Bemerkungsfeld pro Beleg (kommt nicht aus dem Sage-Import) — direkt in der
    // Angebote-Liste editierbar. Aktualisiert bei Bedarf auch den zugehörigen Historie-Eintrag.
    window.updateAngebotBemerkung = async function (angebotId, value) {
        if (!window.supabaseClient) return;
        const text = (value || '').trim() || null;
        try {
            const { data, error } = await window.supabaseClient
                .from('angebote')
                .update({ bemerkung: text })
                .eq('id', angebotId)
                .select('*, customers(name), angebot_notizen(id, content, created_at)')
                .single();

            if (error) throw error;

            const idx = angeboteList.findIndex(x => x.id === angebotId);
            if (idx !== -1) angeboteList[idx] = data;

            if (data.machine_id || data.customer_id) await window.syncAngebotMachineHistory(data);
        } catch (err) {
            console.error('Error updating Bemerkung:', err);
            window.showToast('Fehler beim Speichern der Bemerkung: ' + err.message);
        }
    };

    // Pflegt den passenden Historie-Eintrag synchron zur Zuordnung im Angebot:
    // anlegen/aktualisieren, sobald Kunde ODER Maschine bekannt ist, sonst
    // löschen. Der Eintrag haengt bevorzugt an der Maschine (dort ist er auch
    // in der Maschinen-Historie sichtbar) — ist keine eindeutige Maschine
    // bekannt, haengt er direkt am Kunden (customer_id), damit er trotzdem in
    // der Adress-Historie auftaucht (supabase_add_manual_history_customer_id.sql).
    window.syncAngebotMachineHistory = async function (angebot) {
        if (!window.supabaseClient || !angebot) return;

        if (!angebot.machine_id && !angebot.customer_id) {
            await window.supabaseClient.from('manual_history_entries').delete().eq('angebot_id', angebot.id);
            return;
        }

        const fmtMoney = (v) => (v === null || v === undefined || v === '') ? null : Number(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
        const parts = [];
        if (angebot.kundenmatchcode) parts.push(angebot.kundenmatchcode);
        const netto = fmtMoney(angebot.nettobetrag);
        if (netto) parts.push(`Netto: ${netto}`);
        const brutto = fmtMoney(angebot.bruttobetrag);
        if (brutto) parts.push(`Brutto: ${brutto}`);
        if (angebot.bemerkung) parts.push(angebot.bemerkung);

        const payload = {
            angebot_id: angebot.id,
            machine_id: angebot.machine_id || null,
            customer_id: angebot.customer_id || null,
            type: 'angebot',
            title: `Angebot ${angebot.belegnummer}`,
            content: parts.join(' · '),
            created_by: window.activeUser?.id || null
        };
        if (angebot.belegdatum) payload.created_at = new Date(angebot.belegdatum + 'T12:00:00').toISOString();

        const { error } = await window.supabaseClient
            .from('manual_history_entries')
            .upsert(payload, { onConflict: 'angebot_id' });

        if (error) console.error('Error syncing Angebot history entry:', error);
    };

    // Versucht für alle noch nicht zugeordneten Angebote automatisch erst den Kunden und darauf
    // aufbauend die Maschine zu finden. Phase 1: kundenmatchcode -> customers.matchcode (nur
    // eindeutige Treffer). Phase 2: customer_id -> machines.customer_id (nur wenn der Kunde
    // genau eine Maschine hat). Bei Mehrfach- oder keinen Treffern bleibt die jeweilige
    // Zuordnung der manuellen Auswahl überlassen.
    window.autoAssignAngeboteMachines = async function () {
        if (!window.supabaseClient) return;
        try {
            // --- Phase 1: Kunde anhand des Kundenmatchcodes ermitteln ---
            // Die zusaetzlichen Felder werden nur gebraucht, um direkt im Anschluss den
            // Historie-Eintrag anzulegen (syncAngebotMachineHistory) — sonst haette ein
            // Angebot ohne (spaeter noch aufloesbare) Maschine bis dahin keinen Eintrag.
            const { data: unresolvedCustomers, error: custFetchError } = await window.supabaseClient
                .from('angebote')
                .select('id, kundenmatchcode, belegnummer, belegdatum, machine_id, nettobetrag, bruttobetrag, bemerkung, process_id')
                .is('customer_id', null)
                .not('kundenmatchcode', 'is', null);

            if (custFetchError) throw custFetchError;

            if (unresolvedCustomers && unresolvedCustomers.length > 0) {
                const matchcodes = [...new Set(unresolvedCustomers.map(a => (a.kundenmatchcode || '').trim()).filter(Boolean))];

                if (matchcodes.length > 0) {
                    // Alle Kunden mit Matchcode laden (nicht per .in() exakt filtern) und in JS
                    // case-insensitiv vergleichen — Sage liefert Groß-/Kleinschreibung zwischen
                    // Beleg- und Adressexport nicht immer identisch, ein exakter DB-Vergleich
                    // würde solche Belege sonst dauerhaft unaufgelöst lassen.
                    const { data: customers, error: custError } = await window.supabaseClient
                        .from('customers')
                        .select('id, matchcode, name');

                    if (custError) throw custError;

                    if (customers && customers.length > 0) {
                        const normalizeMatchcode = (s) => (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
                        const customerIdsByMatchcode = {};
                        // Zweiter Weg: der Matchcode aus Sage ist oft einfach der Firmenname
                        // (oder sein Anfang). Deshalb zusätzlich nach Name suchen — exakt, sonst
                        // „Name beginnt mit Matchcode" — jeweils nur bei EINEM Treffer.
                        const customerIdsByName = {};
                        customers.forEach(c => {
                            const key = normalizeMatchcode(c.matchcode);
                            if (key) (customerIdsByMatchcode[key] = customerIdsByMatchcode[key] || []).push(c.id);
                            const nkey = normalizeMatchcode(c.name);
                            if (nkey) (customerIdsByName[nkey] = customerIdsByName[nkey] || []).push(c.id);
                        });
                        const kundeZuSchluessel = (key) => {
                            if (!key) return null;
                            const a = customerIdsByMatchcode[key] || [];
                            if (a.length === 1) return a[0];
                            if (a.length > 1) return null;
                            const b = customerIdsByName[key] || [];
                            if (b.length === 1) return b[0];
                            if (b.length > 1) return null;
                            if (key.length < 4) return null;
                            // Kunde beginnt mit dem Schlüssel ODER der Schlüssel beginnt mit dem
                            // Kundennamen (Sage hängt gern „, Ort" an: „Joh. Beeken GmbH & Co. KG, Bösel").
                            const c = customers.filter(x => {
                                const n = normalizeMatchcode(x.name), m = normalizeMatchcode(x.matchcode);
                                return (n && n.startsWith(key)) || (m && m.startsWith(key))
                                    || (n.length >= 6 && key.startsWith(n)) || (m.length >= 6 && key.startsWith(m));
                            });
                            return c.length === 1 ? c[0].id : null;
                        };
                        // Von Hand gemerkte Zuordnungen gehen vor (siehe selectAngebotKunde).
                        const gelernt = await matchcodeZuordnungLaden();
                        const bekannteIds = new Set(customers.map(c => String(c.id)));
                        const kundeZuMatchcode = (key) => {
                            if (!key) return null;
                            if (gelernt[key] && bekannteIds.has(String(gelernt[key]))) return gelernt[key];
                            let id = kundeZuSchluessel(key);
                            if (id) return id;
                            // Ohne angehängten Ort („…, Bösel") noch einmal
                            const ohneOrt = key.replace(/\s*,\s*[^,]+$/, '').trim();
                            if (ohneOrt && ohneOrt !== key) id = kundeZuSchluessel(ohneOrt);
                            return id || null;
                        };

                        for (const angebot of unresolvedCustomers) {
                            const kundeId = kundeZuMatchcode(normalizeMatchcode(angebot.kundenmatchcode));
                            if (!kundeId) continue; // nicht eindeutig einem Kunden zuordenbar -> von Hand (Klick auf Firma)
                            const customerIds = [kundeId];

                            const { error: updError } = await window.supabaseClient
                                .from('angebote')
                                .update({ customer_id: customerIds[0] })
                                .eq('id', angebot.id);

                            if (updError) { console.error('Error auto-assigning customer to Angebot:', updError); continue; }
                            // Kunde steht jetzt fest -> Historie-Eintrag sofort anlegen, auch
                            // wenn Phase 2 gleich keine eindeutige Maschine findet.
                            await window.syncAngebotMachineHistory({ ...angebot, customer_id: customerIds[0] });
                            // Der Vorgang zum Angebot hängt jetzt ebenfalls an der Adresse.
                            if (angebot.process_id) {
                                await window.supabaseClient.from('internal_processes')
                                    .update({ customer_id: customerIds[0] }).eq('id', angebot.process_id).is('customer_id', null);
                            }
                        }
                    }
                }
            }

            // Maschine wird NICHT mehr geraten (bis 2026-09-15: bei genau einer
            // Maschine des Kunden automatisch eingetragen). Das Feld „Maschine"
            // wird ausschließlich von Hand gepflegt — der Import lässt es leer
            // und fasst es bei bestehenden Belegen nie an.
        } catch (err) {
            console.error('Error in autoAssignAngeboteMachines:', err);
        }
    };

    // Springt aus der Maschinenhistorie zurück zur Angebote-Liste und filtert direkt auf den
    // jeweiligen Beleg (per Belegnummer), damit der Eintrag dort einfach wiedergefunden wird.
    window.navigateToAngebot = function (angebotId) {
        if (!angebotId) return;
        const angebot = angeboteList.find(a => a.id === angebotId);
        if (typeof window.closeHistoryModal === 'function') window.closeHistoryModal();
        if (typeof window.switchView === 'function') window.switchView('listen');
        if (typeof window.switchListenTab === 'function') window.switchListenTab('angebote');
        setTimeout(() => {
            const searchInput = document.getElementById('angebote-search-input');
            if (searchInput && angebot) {
                searchInput.value = angebot.belegnummer;
                window.renderAngeboteList();
            }
        }, 50);
    };

    function escapeHtml(str) {
        return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // ==========================================
    // ANGEBOTE: DYNAMIC EXCEL/CSV PARSER & SAGE IMPORT
    // (Aufbau analog zum Adressimport in customers.js)
    // ==========================================
    function setupAngeboteImportListeners() {
        const dropzone = document.getElementById('angebote-import-dropzone');
        const fileInput = document.getElementById('angebote-import-input');
        if (!dropzone || !fileInput) return;

        dropzone.addEventListener('click', () => fileInput.click());

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'var(--color-primary-green)';
            dropzone.style.background = 'rgba(0, 150, 64, 0.05)';
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.style.borderColor = 'rgba(255,255,255,0.15)';
            dropzone.style.background = 'rgba(255,255,255,0.02)';
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'rgba(255,255,255,0.15)';
            dropzone.style.background = 'rgba(255,255,255,0.02)';
            if (e.dataTransfer.files.length > 0) {
                handleAngeboteImportFile(e.dataTransfer.files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleAngeboteImportFile(e.target.files[0]);
            }
        });
    }

    async function handleAngeboteImportFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'xlsx' || ext === 'xls') {
            await parseAngeboteExcelFile(file);
        } else if (ext === 'csv') {
            await parseAngeboteCSVFile(file);
        } else {
            window.showToast('Bitte wählen Sie eine gültige Excel- (.xlsx, .xls) oder CSV-Datei (.csv) aus.');
        }
    }

    async function parseAngeboteExcelFile(file) {
        try {
            const dropzone = document.getElementById('angebote-import-dropzone');
            const originalHtml = dropzone.innerHTML;
            dropzone.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; gap:12px;">
                    <div class="loading-spinner" style="border:4px solid rgba(255,255,255,0.1); border-top:4px solid var(--color-primary-green); border-radius:50%; width:32px; height:32px; animation:spin 1s linear infinite;"></div>
                    <span>Lade Excel-Bibliothek und verarbeite Datei...</span>
                </div>
            `;

            // SheetJS wird bereits von customers.js geladen/zwischengespeichert
            if (typeof window.loadXLSXLibrary === 'function') {
                await window.loadXLSXLibrary();
            }

            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    if (jsonData.length === 0) {
                        throw new Error('Die Excel-Datei scheint leer zu sein.');
                    }

                    angeboteHeaders = jsonData[0].map(h => h ? h.toString().trim() : '');
                    angeboteRows = jsonData.slice(1).filter(r => r.length > 0 && r.some(cell => cell !== null && cell !== undefined && cell !== ''));

                    showAngeboteMappingConfig();
                } catch (err) {
                    window.showToast('Fehler beim Lesen der Excel-Datei: ' + err.message);
                    dropzone.innerHTML = originalHtml;
                }
            };
            reader.readAsArrayBuffer(file);
        } catch (err) {
            window.showToast(err.message);
            window.resetAngeboteImportUI();
        }
    }

    async function parseAngeboteCSVFile(file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const buffer = e.target.result;
                let text;
                try {
                    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
                    text = utf8Decoder.decode(buffer);
                } catch (utf8Err) {
                    const ansiDecoder = new TextDecoder('windows-1252');
                    text = ansiDecoder.decode(buffer);
                }

                const lines = text.split(/\r?\n/);
                if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
                    throw new Error('Die CSV-Datei scheint leer zu sein.');
                }

                const firstLine = lines[0];
                const semicolonCount = (firstLine.match(/;/g) || []).length;
                const commaCount = (firstLine.match(/,/g) || []).length;
                const delimiter = semicolonCount >= commaCount ? ';' : ',';

                const parsedData = lines.map(line => {
                    const result = [];
                    let current = '';
                    let inQuotes = false;
                    for (let i = 0; i < line.length; i++) {
                        const char = line[i];
                        if (char === '"') {
                            inQuotes = !inQuotes;
                        } else if (char === delimiter && !inQuotes) {
                            result.push(current.trim().replace(/^"|"$/g, ''));
                            current = '';
                        } else {
                            current += char;
                        }
                    }
                    result.push(current.trim().replace(/^"|"$/g, ''));
                    return result;
                }).filter(row => row.length > 0 && row.some(cell => cell !== ''));

                if (parsedData.length === 0) {
                    throw new Error('Es konnten keine gültigen Zeilen in der CSV gefunden werden.');
                }

                angeboteHeaders = parsedData[0];
                angeboteRows = parsedData.slice(1);

                showAngeboteMappingConfig();
            } catch (err) {
                window.showToast('Fehler beim Parsen der CSV-Datei: ' + err.message);
                window.resetAngeboteImportUI();
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function showAngeboteMappingConfig() {
        const dropzone = document.getElementById('angebote-import-dropzone');
        const configSection = document.getElementById('angebote-import-config-section');
        const statsEl = document.getElementById('angebote-import-stats');

        if (dropzone) dropzone.classList.add('hidden');
        if (configSection) configSection.classList.remove('hidden');
        if (statsEl) statsEl.textContent = `${angeboteRows.length} Angebote zum Import bereit.`;

        const dropdownIds = ['map-angebot-belegnummer', 'map-angebot-belegdatum', 'map-angebot-matchcode', 'map-angebot-netto', 'map-angebot-brutto'];

        dropdownIds.forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;

            select.innerHTML = '<option value="">-- Nicht zugeordnet --</option>';
            angeboteHeaders.forEach((header, index) => {
                const opt = document.createElement('option');
                opt.value = index;
                opt.textContent = `${header} (Spalte ${index + 1})`;
                select.appendChild(opt);
            });

            const defaultIndex = findAngeboteMatchingHeaderIndex(id, angeboteHeaders);
            if (defaultIndex !== -1) select.value = defaultIndex;
        });
    }

    function findAngeboteMatchingHeaderIndex(fieldId, headers) {
        const mappingKeywords = {
            'map-angebot-belegnummer': ['belegnummer', 'beleg-nr', 'belegnr', 'angebotsnummer', 'angebot-nr', 'nummer'],
            'map-angebot-belegdatum': ['belegdatum', 'beleg-datum', 'datum', 'angebotsdatum'],
            'map-angebot-matchcode': ['match', 'matchcode', 'kundenmatchcode', 'suchbegriff', 'kurzname'],
            'map-angebot-netto': ['netto', 'nettobetrag', 'netto-betrag', 'net amount'],
            'map-angebot-brutto': ['brutto', 'bruttobetrag', 'brutto-betrag', 'gross amount']
        };

        const keywords = mappingKeywords[fieldId] || [];
        for (let i = 0; i < headers.length; i++) {
            const h = (headers[i] || '').toLowerCase();
            if (keywords.includes(h)) return i;
            if (keywords.some(kw => h.includes(kw))) return i;
        }
        return -1;
    }

    window.cancelAngeboteImport = function () {
        window.resetAngeboteImportUI();
    };

    window.resetAngeboteImportUI = function () {
        angeboteHeaders = [];
        angeboteRows = [];

        const dropzone = document.getElementById('angebote-import-dropzone');
        const configSection = document.getElementById('angebote-import-config-section');
        const progressSection = document.getElementById('angebote-import-progress-section');
        const resultSection = document.getElementById('angebote-import-result-section');
        const fileInput = document.getElementById('angebote-import-input');

        if (dropzone) {
            dropzone.classList.remove('hidden');
            dropzone.innerHTML = `
                <input type="file" id="angebote-import-input" accept=".csv, .xls, .xlsx" class="hidden-file-input" style="display: none;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 12px;">
                    <span style="font-size: 3rem;">📥</span>
                    <span style="font-weight: 700; color: #fff; font-size: 1.1rem;">Datei auswählen oder hierher ziehen</span>
                    <span style="font-size: 0.85rem; color:#fff;">Unterstützte Formate: Excel (.xlsx, .xls) oder CSV (.csv)</span>
                </div>
            `;
            setupAngeboteImportListeners();
        }
        if (fileInput) fileInput.value = '';
        if (configSection) configSection.classList.add('hidden');
        if (progressSection) progressSection.classList.add('hidden');
        if (resultSection) resultSection.classList.add('hidden');
    };

    // Sage-Datumsformate (z.B. 31.12.2025 oder 2025-12-31) nach ISO (YYYY-MM-DD) wandeln
    function parseGermanDate(str) {
        if (!str) return null;
        const s = str.toString().trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
        if (m) {
            let [, d, mo, y] = m;
            if (y.length === 2) y = '20' + y;
            return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        return null;
    }

    // Deutsche Zahlenformate (1.234,56 oder 1234,56) nach Standard-Dezimalzahl wandeln
    function parseGermanNumber(str) {
        if (str === null || str === undefined || str === '') return null;
        if (typeof str === 'number') return str;
        let s = str.toString().trim().replace(/[€\s]/g, '');
        if (s === '') return null;
        if (s.includes(',')) {
            s = s.replace(/\./g, '').replace(',', '.');
        }
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
    }

    window.executeAngeboteImport = async function () {
        const configSection = document.getElementById('angebote-import-config-section');
        const progressSection = document.getElementById('angebote-import-progress-section');
        const progressBar = document.getElementById('angebote-import-progress-bar');
        const progressDetails = document.getElementById('angebote-import-progress-details');
        const resultSection = document.getElementById('angebote-import-result-section');
        const resultMessage = document.getElementById('angebote-import-result-message');

        const mapBelegnummer = document.getElementById('map-angebot-belegnummer').value;
        const mapBelegdatum = document.getElementById('map-angebot-belegdatum').value;
        const mapMatchcode = document.getElementById('map-angebot-matchcode').value;
        const mapNetto = document.getElementById('map-angebot-netto').value;
        const mapBrutto = document.getElementById('map-angebot-brutto').value;

        if (mapBelegnummer === '') {
            window.showToast('Das Feld "Belegnummer" ist Pflichtfeld und muss zugeordnet werden.');
            return;
        }

        if (configSection) configSection.classList.add('hidden');
        if (progressSection) progressSection.classList.remove('hidden');

        const angeboteToUpsert = [];
        angeboteRows.forEach(row => {
            const belegnummer = row[mapBelegnummer]?.toString().trim();
            if (!belegnummer) return; // Skip invalid rows

            angeboteToUpsert.push({
                belegnummer: belegnummer,
                belegdatum: mapBelegdatum !== '' ? parseGermanDate(row[mapBelegdatum]) : null,
                kundenmatchcode: mapMatchcode !== '' ? (row[mapMatchcode]?.toString().trim() || null) : null,
                nettobetrag: mapNetto !== '' ? parseGermanNumber(row[mapNetto]) : null,
                bruttobetrag: mapBrutto !== '' ? parseGermanNumber(row[mapBrutto]) : null
            });
        });

        if (angeboteToUpsert.length === 0) {
            window.showToast('Keine gültigen Zeilen mit Belegnummer zum Importieren gefunden.');
            window.resetAngeboteImportUI();
            return;
        }

        try {
            if (!window.supabaseClient) throw new Error('Supabase Client nicht initialisiert');

            const chunkSize = 100;
            const total = angeboteToUpsert.length;

            // Vorab ermitteln, welche Belegnummern bereits existieren — nur fuer WIRKLICH NEUE
            // Angebote sollen Realisierbar (5%) und Status ("Warten auf Reaktion") vorbelegt werden.
            // Bestehende Angebote werden dadurch nicht angefasst (siehe Kommentar unten beim Upsert).
            const allBelegnummern = angeboteToUpsert.map(a => a.belegnummer);
            const existingBelegnummern = new Set();
            for (let i = 0; i < allBelegnummern.length; i += 500) {
                const slice = allBelegnummern.slice(i, i + 500);
                const { data: existingRows, error: existingErr } = await window.supabaseClient
                    .from('angebote')
                    .select('belegnummer')
                    .in('belegnummer', slice);
                if (existingErr) throw existingErr;
                (existingRows || []).forEach(r => existingBelegnummern.add(r.belegnummer));
            }

            for (let i = 0; i < total; i += chunkSize) {
                const chunk = angeboteToUpsert.slice(i, i + chunkSize);

                // EK/Realisierbar/Status/Bemerkung/Maschine sind reine manuelle Felder und duerfen
                // beim Re-Import bestehender Angebote nie ueberschrieben werden — daher stehen sie
                // bewusst nicht im Upsert-Payload (siehe angeboteToUpsert oben).
                const { error } = await window.supabaseClient
                    .from('angebote')
                    .upsert(chunk, { onConflict: 'belegnummer' });

                if (error) throw error;

                // Fuer neu angelegte Angebote in diesem Chunk direkt im Anschluss die Standardwerte
                // setzen (separater Update-Call, damit bestehende Angebote garantiert unangetastet bleiben).
                const newBelegnummernInChunk = chunk.map(c => c.belegnummer).filter(bn => !existingBelegnummern.has(bn));
                if (newBelegnummernInChunk.length > 0) {
                    const { error: defaultsErr } = await window.supabaseClient
                        .from('angebote')
                        .update({ realisierbar: 5, status: 'Warten auf Reaktion' })
                        .in('belegnummer', newBelegnummernInChunk);
                    if (defaultsErr) throw defaultsErr;
                }

                const progress = Math.min(100, Math.round(((i + chunk.length) / total) * 100));
                if (progressBar) progressBar.style.width = `${progress}%`;
                if (progressDetails) progressDetails.textContent = `${Math.min(total, i + chunk.length)} von ${total} verarbeitet...`;
            }

            if (progressSection) progressSection.classList.add('hidden');
            if (resultSection) resultSection.classList.remove('hidden');
            if (resultMessage) {
                resultMessage.textContent = `Erfolgreich ${total} Angebote aus Sage 100 importiert und aktualisiert.`;
            }

            await merkeLetztenImport();
            // Neue Belege sofort Adresse und Maschine zuordnen — vorher lief das
            // nur nach einem ADRESS-Import, neue Angebote blieben bis dahin ohne
            // Adresse (und damit ohne Vorgang an der Adresse).
            await window.autoAssignAngeboteMachines();
            autoAssignGelaufen = true;
            await window.fetchAngebote();
            const ohne = angeboteList.filter(a => !a.customer_id).length;
            if (ohne) {
                nurOhneAdresse = true;
                window.renderAngeboteList();
                window.showToast(`${ohne} Angebot${ohne === 1 ? '' : 'e'} ohne passende Adresse — bitte in der Spalte „Firma" zuordnen (die Liste zeigt jetzt nur diese).`);
            }
        } catch (err) {
            window.showToast('Fehler beim Datenbankimport: ' + err.message);
            window.resetAngeboteImportUI();
        }
    };

})();
