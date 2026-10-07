// ==========================================================
// Persönliche To-do-Liste — Knopf unten rechts neben dem KI-Chat
// ==========================================================
// Gefüllt aus dem KI-Briefing („Als To-do übernehmen", js/ai-briefing.js →
// window.todoUebernehmen) oder von Hand. Jeder Eintrag klappt auf und zeigt,
// woran gearbeitet wird: Vorgang (Schritte abhaken, Stand eintragen), Termin,
// Adresse (Telefon, Mail) und eine eigene Notiz — ohne erst zu suchen.
// Ablage: Tabelle todo_listen (eine Zeile je Benutzer, Migration
// supabase_add_todo_listen.sql); fehlt sie, je Browser in localStorage.
// ==========================================================
(function () {
    'use strict';

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, t) => (typeof window.showToast === 'function' ? window.showToast(m, t) : console.log(m));
    const LS = 'meetra_todo_liste';
    const GRUPPEN = ['Heute unbedingt', 'Wichtig', 'Wenn Zeit bleibt', 'Eigene Punkte'];
    const TYP_FARBE = { Vorgang: '#a78bfa', Termin: '#60a5fa', Wartung: '#f59e0b', Service: '#34d399', Angebot: '#f87171', Adresse: '#38bdf8', Notiz: '#94a3b8' };

    let eintraege = [];
    let geladen = false;
    let ohneTabelle = false;
    let offen = new Set();      // aufgeklappte Einträge
    const details = {};         // id → { laedt, proc, ev, kunde, fehler }

    const nutzerId = () => window.activeUser ? String(window.activeUser.id) : '';
    const sb = () => window.supabaseClient;
    const neueId = () => 'td' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    // ---------------------------------------------------------- Speichern
    function lsLesen() { try { return JSON.parse(localStorage.getItem(LS + ':' + nutzerId()) || '[]'); } catch (e) { return []; } }
    function lsSchreiben() { try { localStorage.setItem(LS + ':' + nutzerId(), JSON.stringify(eintraege)); } catch (e) { /* voll/gesperrt */ } }

    async function laden() {
        if (!nutzerId()) return;
        if (!ohneTabelle && sb()) {
            const { data, error } = await sb().from('todo_listen').select('eintraege').eq('user_id', nutzerId()).maybeSingle();
            if (!error) { eintraege = Array.isArray(data && data.eintraege) ? data.eintraege : lsLesen(); geladen = true; return; }
            ohneTabelle = true;
            console.warn('todo_listen fehlt — Migration supabase_add_todo_listen.sql ausführen. Liste läuft vorerst nur in diesem Browser.', error);
        }
        eintraege = lsLesen();
        geladen = true;
    }

    let speicherUhr = null;
    function speichern() {
        lsSchreiben();
        zaehlerSetzen();
        clearTimeout(speicherUhr);
        speicherUhr = setTimeout(async () => {
            if (ohneTabelle || !sb() || !nutzerId()) return;
            const { error } = await sb().from('todo_listen')
                .upsert({ user_id: nutzerId(), eintraege, updated_at: new Date().toISOString() }, { onConflict: 'user_id', returning: 'minimal' });
            if (error) toast('To-do-Liste konnte nicht gespeichert werden: ' + error.message, 'error');
        }, 800);
    }

    function schluessel(e) { return e.targetType && e.targetId ? e.targetType + ':' + e.targetId : (e.typ || '') + ':' + (e.titel || '') + ':' + (e.datumText || ''); }

    // Aus dem Briefing: neue Punkte anhängen, vorhandene (gleiches Ziel) nur auffrischen.
    window.todoUebernehmen = async function (liste, opts) {
        const still = !!(opts && opts.still);
        if (!geladen) await laden();
        const vorhanden = new Map(eintraege.map(e => [schluessel(e), e]));
        let neu = 0, wieder = 0;
        const tagVon = v => v ? String(v).slice(0, 10) : '';
        (liste || []).forEach(x => {
            const e = {
                id: neueId(), typ: x.typLabel || x.typ || 'Notiz', titel: x.title || x.titel || '', subject: x.subject || '',
                datumText: x.datumText || '', ki: x.ki || '', gruppe: x.gruppe || 'Wichtig', auto: !!x.auto, neu: !!x.auto,
                targetType: x.targetType || null, targetId: x.targetId || null, customerId: x.customerId || null,
                day: x.day || '', erledigt: false, notiz: '', am: new Date().toISOString()
            };
            const alt = vorhanden.get(schluessel(e));
            if (alt) {
                if (!alt.erledigt && !alt.archiviert) { Object.assign(alt, { ki: e.ki, gruppe: e.gruppe, datumText: e.datumText, day: e.day }); return; }
                // Schon abgehakt/entfernt: nur wieder aufnehmen, wenn danach ein NEUER Termin
                // gesetzt wurde (z. B. neue Wiedervorlage) — sonst kommt es nicht noch einmal.
                const weg = tagVon(alt.archiviertAm || alt.erledigtAm);
                if (e.day && weg && e.day > weg) {
                    Object.assign(alt, { ki: e.ki, gruppe: e.gruppe, datumText: e.datumText, day: e.day, erledigt: false, erledigtAm: null, archiviert: false, archiviertAm: null });
                    wieder++;
                }
                return;
            }
            eintraege.push(e); neu++;
        });
        speichern();
        aufraeumenAlt();
        if (still) { if (neu || wieder) { speichern(); zeichnen(); } return neu + wieder; }
        toast(neu || wieder ? `${neu} neu${wieder ? `, ${wieder} wieder offen (neuer Termin)` : ''} — in die To-do-Liste übernommen.` : 'Nichts Neues — alles stand schon auf der Liste oder ist abgehakt.', 'success');
        window.openTodoListe();
    };

    // ---------------------------------------------------------- Aufbau
    function aufbauen() {
        if (document.getElementById('todo-fab')) return;
        const fab = document.createElement('button');
        fab.id = 'todo-fab';
        fab.type = 'button';
        fab.title = 'Meine To-do-Liste';
        fab.setAttribute('aria-label', 'To-do-Liste öffnen');
        fab.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg><span class="todo-fab-zahl" hidden></span>`;
        fab.addEventListener('click', () => (document.body.classList.contains('todo-offen') ? schliessen() : window.openTodoListe()));

        const p = document.createElement('div');
        p.id = 'todo-panel';
        p.hidden = true;
        p.innerHTML = `
            <div class="todo-kopf">
                <div class="todo-titel">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    <span>Meine To-dos</span>
                    <span class="todo-stand" id="todo-stand"></span>
                </div>
                <div class="todo-kopf-knoepfe">
                    <button type="button" class="todo-kk" data-todo="briefing" title="KI-Briefing für heute öffnen — von dort „Als To-do übernehmen“">✨ Briefing</button>
                    <button type="button" class="todo-kk" data-todo="auto" id="todo-auto-knopf" title="Neue fällige Wiedervorlagen, Schritte, Termine und Angebots-Erinnerungen automatisch übernehmen">⚡ Auto</button>
                    <button type="button" class="todo-kk" data-todo="drucken" title="Liste drucken — mit Adresse, Telefon, letztem Stand, nächstem Schritt und Platz für Notizen (Suche wirkt mit)">🖨 Drucken</button>
                    <button type="button" class="todo-kk" data-todo="aufraeumen" title="Erledigte Punkte aus der Liste nehmen">Erledigte weg</button>
                    <button type="button" class="todo-x" data-todo="vollbild" id="todo-vollbild-knopf" title="Vollbild" aria-label="Vollbild umschalten">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                    </button>
                    <button type="button" class="todo-x" data-todo="zu" title="Schließen" aria-label="Schließen">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            </div>
            <div class="todo-fortschritt"><div id="todo-balken"></div></div>
            <div class="todo-suche"><input type="search" class="glass-form-input" id="todo-such" placeholder="Suchen: Kunde, Maschine, Vorgang, Notiz …" autocomplete="off"></div>
            <div class="todo-liste" id="todo-liste"></div>
            <form class="todo-neu" id="todo-neu">
                <input type="text" class="glass-form-input" id="todo-neu-text" placeholder="Eigenen Punkt hinzufügen oder diktieren …" autocomplete="off">
                ${window.micButtonHtml ? window.micButtonHtml('todo-neu-text', { label: '' }) : ''}
                <button type="submit" class="todo-kk todo-kk-primaer">+</button>
            </form>`;
        document.body.appendChild(fab);
        document.body.appendChild(p);

        p.addEventListener('click', klick);
        p.querySelector('#todo-such').addEventListener('input', ev => { suche = ev.target.value; zeichnen(); });
        p.querySelector('.todo-kopf').addEventListener('dblclick', e => { if (!e.target.closest('button')) vollbild(!document.body.classList.contains('todo-vollbild')); });
        p.addEventListener('change', aenderung);
        p.addEventListener('input', eingabe);
        p.addEventListener('focusout', textFertig);
        p.addEventListener('keydown', ev => {
            const t = ev.target;
            if (!t.matches || !t.matches('[data-s-text], [data-stand-i]')) return;
            if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); t.blur(); }
            if (ev.key === 'Escape') { ev.stopPropagation(); t.dataset.verwerfen = '1'; t.blur(); }
        });
        p.addEventListener('keydown', e => {
            if (e.key === 'Enter' && e.target.matches('[data-stand-text]')) { e.preventDefault(); standSpeichern(e.target.dataset.standText); }
            if (e.key === 'Enter' && e.target.matches('[data-schritt-text]')) { e.preventDefault(); schrittNeu(e.target.dataset.schrittText); }
            if (e.key === 'Escape' && e.target.isContentEditable) return;   // Bearbeiten verwerfen, nicht schließen
            if (e.key === 'Escape') { if (document.body.classList.contains('todo-vollbild')) vollbild(false); else schliessen(); }
        });
        document.getElementById('todo-neu').addEventListener('submit', e => {
            e.preventDefault();
            const f = document.getElementById('todo-neu-text');
            const t = f.value.trim();
            if (!t) return;
            eintraege.push({ id: neueId(), typ: 'Notiz', titel: t, subject: '', datumText: '', ki: '', gruppe: 'Eigene Punkte', erledigt: false, notiz: '', am: new Date().toISOString() });
            f.value = '';
            speichern(); zeichnen();
        });
        document.body.classList.add('todo-an');
    }

    function vollbild(an) {
        document.body.classList.toggle('todo-vollbild', an);
        const k = document.getElementById('todo-vollbild-knopf');
        if (k) k.title = an ? 'Vollbild verlassen' : 'Vollbild';
        try { localStorage.setItem('meetra_todo_vollbild', an ? '1' : ''); } catch (e) { /* gesperrt */ }
    }

    function schliessen() {
        if (window.stopSpeechInput) window.stopSpeechInput();
        historieSchliessen();
        const p = document.getElementById('todo-panel');
        if (p) p.hidden = true;
        document.body.classList.remove('todo-offen');
    }

    window.openTodoListe = async function () {
        aufbauen();
        const p = document.getElementById('todo-panel');
        if (typeof window.kiChatSchliessen === 'function') window.kiChatSchliessen();
        p.hidden = false;
        document.body.classList.add('todo-offen');
        let vb = false;
        try { vb = localStorage.getItem('meetra_todo_vollbild') === '1'; } catch (e) { /* gesperrt */ }
        vollbild(vb);
        if (!geladen) { document.getElementById('todo-liste').innerHTML = '<div class="todo-leer">Lade …</div>'; await laden(); }
        zeichnen();
    };

    function zaehlerSetzen() {
        const z = document.querySelector('#todo-fab .todo-fab-zahl');
        if (!z) return;
        const n = sichtbar().filter(e => !e.erledigt).length;
        z.hidden = !n;
        z.textContent = n > 99 ? '99+' : String(n);
    }

    // ---------------------------------------------------------- Zeichnen
    // Entfernte Einträge bleiben als „archiviert" stehen (unsichtbar), damit das
    // Briefing sie nicht erneut hereinholt; nach 60 Tagen fliegen sie ganz raus.
    function aufraeumenAlt() {
        const grenze = Date.now() - 60 * 86400000;
        eintraege = eintraege.filter(e => !e.archiviert || new Date(e.archiviertAm || 0).getTime() > grenze);
    }
    const sichtbar = () => eintraege.filter(e => !e.archiviert);
    // Suchfeld oben in der Liste: alle Wörter müssen irgendwo im Eintrag vorkommen.
    let suche = '';
    function passtSuche(e) {
        const w = suche.toLowerCase().trim().split(/s+/).filter(Boolean);
        if (!w.length) return true;
        const d = details[e.id] || {};
        const text = [e.typ, e.titel, e.subject, e.ki, e.notiz, e.datumText, e.gruppe, adresseName(e),
            d.proc && d.proc.description, d.proc && d.proc.contact_name].filter(Boolean).join(' ').toLowerCase();
        return w.every(x => text.includes(x));
    }
    const gefiltert = () => sichtbar().filter(passtSuche);
    function archivieren(liste) {
        const jetzt = new Date().toISOString();
        liste.forEach(e => { e.archiviert = true; e.archiviertAm = jetzt; offen.delete(e.id); });
        aufraeumenAlt();
        speichern(); zeichnen();
    }

    function zeichnen() {
        const box = document.getElementById('todo-liste');
        if (!box) return;
        zaehlerSetzen();
        const alle = gefiltert();
        const fertig = alle.filter(e => e.erledigt).length;
        document.getElementById('todo-stand').textContent = alle.length ? `${fertig} von ${alle.length} erledigt` : '';
        document.getElementById('todo-balken').style.width = alle.length ? (fertig / alle.length * 100) + '%' : '0';
        if (!alle.length && suche.trim() && sichtbar().length) {
            box.innerHTML = '<div class="todo-leer"><p>Nichts gefunden für „' + esc(suche.trim()) + '“.</p></div>';
            return;
        }
        if (!alle.length) {
            box.innerHTML = `<div class="todo-leer">
                <div style="font-size:2rem;">🗒️</div>
                <p>Noch nichts auf der Liste.</p>
                <p class="text-muted-sm">Öffne das <b>✨ Briefing</b> und klicke dort auf <b>„Als To-do übernehmen"</b> — dann stehen hier deine Vorgänge, Termine und Adressen für heute.</p>
                <button type="button" class="todo-kk todo-kk-primaer" data-todo="briefing">✨ Briefing für heute</button>
            </div>${ohneTabelle ? hinweisTabelle() : ''}`;
            return;
        }
        const gruppen = GRUPPEN.concat([...new Set(alle.map(e => e.gruppe).filter(g => g && !GRUPPEN.includes(g)))]);
        let html = '';
        gruppen.forEach(g => {
            const liste = alle.filter(e => (e.gruppe || 'Wichtig') === g);
            if (!liste.length) return;
            // Offene zuerst, erledigte rutschen nach unten
            liste.sort((a, b) => (a.erledigt - b.erledigt));
            html += `<div class="todo-gruppe">${esc(g)} <span>${liste.filter(e => !e.erledigt).length}</span></div>` + liste.map(eintragHtml).join('');
        });
        box.innerHTML = html + (ohneTabelle ? hinweisTabelle() : '');
    }
    function hinweisTabelle() {
        return '<div class="todo-hinweis">Die Liste ist nur in diesem Browser gespeichert. Für alle Geräte: Migration <code>supabase_add_todo_listen.sql</code> ausführen.</div>';
    }

    // Name der hinterlegten Adresse: geladenes Detail, sonst Kunden-Cache
    function adresseName(e) {
        const d = details[e.id];
        if (d && d.kunde && d.kunde.name) return d.kunde.name;
        if (!e.customerId || !window.customerCacheSync) return '';
        const alle = window.customerCacheSync();
        // Cache noch nicht geladen → einmal laden und neu zeichnen
        if (!alle.length && window.customerCacheGet && !adresseName.laedt) {
            adresseName.laedt = true;
            Promise.resolve(window.customerCacheGet()).then(() => zeichnen()).catch(() => {});
        }
        const k = alle.find(x => String(x.id) === String(e.customerId));
        return k ? k.name || '' : '';
    }

    function eintragHtml(e) {
        const auf = offen.has(e.id);
        const farbe = TYP_FARBE[e.typ] || '#94a3b8';
        return `
        <div class="todo-eintrag${e.erledigt ? ' erledigt' : ''}${auf ? ' auf' : ''}" data-id="${esc(e.id)}" style="--todo-farbe:${farbe}">
            <div class="todo-zeile" data-todo="klappen">
                <label class="todo-haken" title="${e.erledigt ? 'Wieder offen' : 'Erledigt'}"><input type="checkbox" data-todo-erledigt ${e.erledigt ? 'checked' : ''}><span></span></label>
                <div class="todo-text">
                    <div class="todo-oben"><span class="todo-typ">${esc(e.typ)}</span>${e.datumText ? `<span class="todo-wann">${esc(e.datumText)}</span>` : ''}${e.neu && !e.erledigt ? '<span class="todo-neu-badge">neu</span>' : (e.auto ? '<span class="todo-auto-badge" title="Automatisch übernommen">⚡</span>' : '')}</div>
                    ${(() => { const n = adresseName(e); return n ? `<div class="todo-adresse" title="Adresse">📍 ${esc(n)}</div>` : ''; })()}
                    <div class="todo-name">${esc(e.titel || '(ohne Titel)')}</div>
                    ${e.subject && e.subject !== adresseName(e) ? `<div class="todo-sub">${esc(e.subject)}</div>` : ''}
                    ${e.ki ? `<div class="todo-ki">✨ ${esc(e.ki)}</div>` : ''}
                </div>
                ${Array.isArray(e.zustaendig) && e.zustaendig.length ? `<div class="todo-karte-av">${avatareHtml(e.zustaendig, 3)}</div>` : ''}
                <svg class="todo-pfeil" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            ${auf ? `<div class="todo-koerper">${koerperHtml(e)}</div>` : ''}
        </div>`;
    }

    function koerperHtml(e) {
        const d = details[e.id] || {};
        let html = '';
        if (d.laedt) html += '<div class="todo-laedt"><span class="ab-ai-spinner"></span> Lade …</div>';
        if (d.fehler) html += `<div class="todo-fehler">${esc(d.fehler)}</div>`;

        // Vorgang: Schritte + Stand direkt hier
        if (d.proc) {
            const p = d.proc;
            const steps = Array.isArray(p.steps) ? p.steps : [];
            html += `<div class="todo-block todo-block-voll"><div class="todo-block-titel">Vorgang · ${esc(p.status || '')}</div>
                <div class="todo-zust"><span class="todo-zust-label">Zuständig</span>${avatareHtml(p.assigned_users)}
                    <button type="button" class="todo-av todo-av-plus" data-todo="zust" title="Zuständige hinzufügen oder entfernen">+</button></div>`;
            if (p.description) html += `<div class="todo-beschr">${esc(String(p.description).slice(0, 400))}</div>`;
            html += `<div class="todo-abschnitt">Schritte — was soll getan werden?${steps.length ? ` <span>${steps.filter(x => x.done).length}/${steps.length} erledigt</span>` : ''}</div>`;
            if (steps.length) html += '<div class="todo-schritte">' + steps.map((st, i) => schrittHtml(e, p, st, i)).join('') + '</div>';
            html += `<div class="todo-stand-neu"><input type="text" class="glass-form-input" id="todo-schritt-${esc(e.id)}" data-schritt-text="${esc(e.id)}" placeholder="Neuer Schritt …">
                ${window.micButtonHtml ? window.micButtonHtml('todo-schritt-' + e.id, { label: '' }) : ''}
                <button type="button" class="todo-kk" data-todo="schritt">+ Schritt</button></div>`;
            const alleSt = Array.isArray(p.status_updates) ? p.status_updates : [];
            const st = e._alleStaende ? alleSt : alleSt.slice(0, 5);
            html += '<div class="todo-abschnitt">Stand — worüber wurde gesprochen, was ist der aktuelle Stand?</div>';
            html += st.length ? st.map((u, i) => `<div class="todo-stand-eintrag"><span>${esc(u.by || '')} · ${u.at ? new Date(u.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                <div class="todo-edit" contenteditable="true" spellcheck="true" data-stand-i="${i}" title="Klicken zum Bearbeiten">${esc(u.text || '')}</div></div>`).join('') : '<div class="text-muted-sm">Noch kein Stand.</div>';
            if (alleSt.length > 5) html += `<button type="button" class="todo-chip" data-todo="staende">${e._alleStaende ? 'Weniger zeigen' : 'Alle ' + alleSt.length + ' Stände zeigen'}</button>`;
            html += `<div class="todo-stand-neu"><input type="text" class="glass-form-input" id="todo-stand-${esc(e.id)}" data-stand-text="${esc(e.id)}" placeholder="Neuer Stand, z. B. „Kunde angerufen, Rückruf Freitag“">
                ${window.micButtonHtml ? window.micButtonHtml('todo-stand-' + e.id, { label: '' }) : ''}
                <button type="button" class="todo-kk todo-kk-primaer" data-todo="stand">Eintragen</button></div>`;
            html += '</div>';
        }

        // Angebote (am Eintrag selbst oder am Vorgang): Status, Alter, Betrag, PDF
        (d.angebote || []).forEach(x => { html += angebotBlockHtml(x.a, x.proc || d.proc); });

        // Termin
        if (d.ev) {
            const ev = d.ev;
            const wann = ev.event_date || ev.start_date;
            html += `<div class="todo-block"><div class="todo-block-titel">Termin</div>
                <div>${wann ? new Date(wann).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}${ev.end_date ? ' – ' + new Date(ev.end_date).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                ${ev.description ? `<div class="todo-beschr">${esc(String(ev.description).slice(0, 400))}</div>` : ''}
            </div>`;
        }

        // Adresse
        if (d.kunde) {
            const k = d.kunde;
            const tel = k.phone || k.telefon || k.mobile || '';
            const ort = [k.street, [k.zip_code, k.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
            html += `<div class="todo-block"><div class="todo-block-titel">Adresse</div>
                <div class="todo-name" style="font-size:0.95rem;">${esc(k.name || '')}</div>
                ${ort ? `<div class="todo-sub">${esc(ort)}</div>` : ''}
                <div class="todo-kontakt">
                    ${tel ? `<a href="tel:${esc(String(tel).replace(/[^\d+]/g, ''))}" class="todo-kk">📞 ${esc(tel)}</a>` : ''}
                    ${k.email ? `<a href="#" class="todo-kk" data-todo="mail" data-mail="${esc(k.email)}">✉ ${esc(k.email)}</a>` : ''}
                    ${ort ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ort)}" target="_blank" rel="noopener" class="todo-kk">📍 Route</a>` : ''}
                </div>
                ${(d.kontakte || []).length ? '<div class="todo-block-titel" style="margin-top:10px;">Ansprechpartner</div>' + d.kontakte.map(c => `
                    <div class="todo-person">
                        <div><b>${esc(c.name || '')}</b>${c.position ? ` <span class="todo-sub">· ${esc(c.position)}</span>` : ''}</div>
                        <div class="todo-kontakt">
                            ${c.phone ? `<a href="tel:${esc(String(c.phone).replace(/[^\d+]/g, ''))}" class="todo-kk">📞 ${esc(c.phone)}</a>` : ''}
                            ${c.mobile ? `<a href="tel:${esc(String(c.mobile).replace(/[^\d+]/g, ''))}" class="todo-kk">📱 ${esc(c.mobile)}</a>` : ''}
                            ${c.email ? `<a href="#" class="todo-kk" data-todo="mail" data-mail="${esc(c.email)}">✉ ${esc(c.email)}</a>` : ''}
                        </div>
                    </div>`).join('') : ''}
            </div>`;
        }

        // Eigene Notiz + Knöpfe
        html += `<div class="todo-notiz-zeile"><textarea class="glass-form-input todo-notiz" id="todo-notiz-${esc(e.id)}" data-notiz="${esc(e.id)}" rows="2" placeholder="Notiz zu diesem Punkt — tippen oder diktieren …">${esc(e.notiz || '')}</textarea>
            ${window.micButtonHtml ? window.micButtonHtml('todo-notiz-' + e.id, { label: '' }) : ''}</div>
            ${window.micStatusHtml ? window.micStatusHtml('todo-notiz-' + e.id) + window.micStatusHtml('todo-stand-' + e.id) : ''}`;
        const oeffnen = {
            process: 'Vorgang öffnen', event: 'Termin öffnen', angebot: 'Angebot öffnen', machine: 'Maschine öffnen', service: 'Bericht öffnen'
        }[e.targetType];
        const hatMail = !!((d.kunde && d.kunde.email) || (d.kontakte || []).some(c => c.email));
        const mitAngebot = (d.angebote || []).some(x => dokumente(x.proc || d.proc).length);
        html += `<div class="todo-knoepfe">
            ${hatMail ? `<button type="button" class="todo-kk todo-kk-primaer" data-todo="mailwahl">✉ Mail${mitAngebot ? ' mit Angebot' : ''}</button>` : ''}
            ${oeffnen && e.targetId ? `<button type="button" class="todo-kk" data-todo="oeffnen">${oeffnen}</button>` : ''}
            ${e.customerId ? '<button type="button" class="todo-kk" data-todo="adresse">Adresse öffnen</button><button type="button" class="todo-kk" data-todo="historie">🕘 Historie öffnen</button>' : ''}
            <button type="button" class="todo-kk todo-kk-weg" data-todo="entfernen">Entfernen</button>
        </div>`;
        return html;
    }

    // ---------------------------------------------------------- Details laden
    async function detailsLaden(e) {
        if (details[e.id] && !details[e.id].fehler) return;
        const d = details[e.id] = { laedt: true };
        zeichnen();
        try {
            await kontextLaden(e, d);
        } catch (err) {
            d.fehler = 'Konnte nicht geladen werden: ' + (err.message || err);
        }
        d.laedt = false;
        zeichnen();
    }

    // Alles, was zu einem Eintrag gehört: Vorgang, Angebot(e) samt Dokumenten,
    // Termin, Adresse, Ansprechpartner. Auch vom Briefing genutzt (todoAktion).
    async function kontextLaden(e, d) {
            const c = sb();
            if (e.targetType === 'angebot' && e.targetId) {
                const { data: a, error } = await c.from('angebote').select('*, customers(name)').eq('id', e.targetId).maybeSingle();
                if (error) throw error;
                if (a) {
                    let proc = null;
                    if (a.process_id) proc = (await c.from('internal_processes').select('*').eq('id', a.process_id).maybeSingle()).data || null;
                    d.angebote = [{ a, proc }];
                    d.proc = proc;
                    if (proc && e.id) zustMerken(e, proc.assigned_users);
                    const kid = a.customer_id || (proc && proc.customer_id);
                    if (kid && !e.customerId) { e.customerId = kid; if (e.id) speichern(); }
                }
            }
            if (e.targetType === 'process' && e.targetId) {
                const { data, error } = await c.from('internal_processes').select('*').eq('id', e.targetId).maybeSingle();
                if (error) throw error;
                d.proc = data;
                if (data && data.customer_id && !e.customerId) { e.customerId = data.customer_id; if (e.id) speichern(); }
                if (data && e.id) zustMerken(e, data.assigned_users);
                // Hängt am Vorgang ein Angebot? (ohne Spalte process_id still leer)
                const r = await c.from('angebote').select('*, customers(name)').eq('process_id', e.targetId);
                if (!r.error && r.data && r.data.length) d.angebote = r.data.map(a => ({ a, proc: data }));
            }
            if (e.targetType === 'event' && e.targetId) {
                const { data, error } = await c.from('maintenance_events').select('*').eq('id', e.targetId).maybeSingle();
                if (error) throw error;
                d.ev = data;
                if (data && data.customer_id && !e.customerId) { e.customerId = data.customer_id; if (e.id) speichern(); }
            }
            if (e.customerId) {
                const [k, kp] = await Promise.all([
                    c.from('customers').select('*').eq('id', e.customerId).maybeSingle(),
                    c.from('customer_contacts').select('*').eq('customer_id', e.customerId)
                ]);
                d.kunde = k.data || null;
                d.kontakte = kp.error ? [] : (kp.data || []);
            }
            return d;
    }

    // ---------------------------------------------------------- Angebot: Block, PDF, Mail
    function dokumente(proc) { return proc && Array.isArray(proc.attachments) ? proc.attachments.filter(f => f && f.url && !f.step_id) : []; }
    const istPdf = f => /\.pdf$/i.test(f.name || '') || /pdf/i.test(f.type || '');
    const eur = v => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/\.(?=\d{3})/g, '').replace(',', '.')); return isNaN(n) ? '' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); };
    const tageSeit = iso => iso ? Math.round((new Date().setHours(0, 0, 0, 0) - new Date(String(iso).slice(0, 10) + 'T00:00:00')) / 86400000) : null;
    const tagDe = iso => iso ? new Date(String(iso).slice(0, 10) + 'T00:00:00').toLocaleDateString('de-DE') : '';
    function angebotFirma(a) { return ((a.customers && a.customers.name) || a.kundenmatchcode || '').split(',')[0].trim(); }
    function angebotNr(a) {
        const roh = String(a.belegnummer || '').trim();
        const jahr = /^\d{4}/.test(String(a.belegdatum || '')) ? String(a.belegdatum).slice(0, 4) : String(new Date().getFullYear());
        return roh && !/^\d{4}-/.test(roh) ? jahr + '-' + roh : roh;
    }
    function dateiName(a, f, i) {
        const endung = (String(f.name || '').match(/\.[a-z0-9]{2,5}$/i) || ['.pdf'])[0];
        return 'Angebot ' + angebotNr(a) + (i ? ' (' + (i + 1) + ')' : '') + endung;
    }

    function angebotBlockHtml(a, proc) {
        const alter = tageSeit(a.belegdatum);
        const docs = dokumente(proc);
        return `<div class="todo-block todo-angebot">
            <div class="todo-block-titel">Angebot ${esc(a.belegnummer || '')}</div>
            <div class="todo-angebot-kopf">
                <span class="todo-status">${esc(a.status || 'offen')}</span>
                ${a.nettobetrag != null && a.nettobetrag !== '' ? `<span class="todo-betrag">${esc(eur(a.nettobetrag))} netto</span>` : ''}
            </div>
            <div class="todo-sub">${esc(angebotFirma(a))}${a.belegdatum ? ' · vom ' + tagDe(a.belegdatum) : ''}${alter != null ? ` · <span class="${alter > 30 ? 'todo-alt' : ''}">seit ${alter} Tagen</span>` : ''}${a.erinnerung ? ' · Erinnerung ' + tagDe(a.erinnerung) : ''}</div>
            <div class="todo-doks">
                ${docs.length ? docs.map((f, i) => `<a href="${esc(f.url)}" target="_blank" rel="noopener" class="todo-kk todo-dok" title="${esc(f.name || '')} öffnen">📄 ${esc(dateiName(a, f, i))}</a>`).join('') : '<span class="text-muted-sm">Kein PDF am Angebot hinterlegt.</span>'}
            </div>
        </div>`;
    }

    // Empfänger wählen (Adresse + Ansprechpartner), Angebots-PDFs als Anhang an/aus.
    function mailWahl(d, titel, vorgewaehlt) {
        const klein = v => String(v || '').toLowerCase();
        const leute = [];
        if (d.kunde && d.kunde.email) leute.push({ name: d.kunde.name || 'Firma', mail: d.kunde.email, anrede: '' });
        (d.kontakte || []).forEach(c => {
            if (c.email && !leute.some(x => klein(x.mail) === klein(c.email))) leute.push({ name: c.name || c.email, mail: c.email, anrede: c.name || '', position: c.position || '' });
        });
        if (vorgewaehlt && !leute.some(x => klein(x.mail) === klein(vorgewaehlt))) leute.unshift({ name: vorgewaehlt, mail: vorgewaehlt, anrede: '' });
        // Vorschlag: angeklickte Adresse → Ansprechpartner des Vorgangs → erster Ansprechpartner → Firma
        let wahl = vorgewaehlt ? leute.findIndex(x => klein(x.mail) === klein(vorgewaehlt)) : -1;
        const cn = d.proc && d.proc.contact_name ? klein(d.proc.contact_name).split(/\s+/).pop() : '';
        if (wahl < 0 && cn) wahl = leute.findIndex(x => x.anrede && klein(x.anrede).includes(cn));
        if (wahl < 0) wahl = Math.max(0, leute.findIndex(x => x.anrede));
        const anh = [];
        (d.angebote || []).forEach(x => dokumente(x.proc || d.proc).forEach((f, i) => anh.push({ f, name: dateiName(x.a, f, i), an: istPdf(f) })));

        const alt = document.getElementById('todo-mail-wahl');
        if (alt) alt.remove();
        const ov = document.createElement('div');
        ov.id = 'todo-mail-wahl';
        ov.innerHTML = `
            <div class="todo-mw-box" role="dialog" aria-label="Mail schreiben">
                <div class="todo-mw-titel">✉ Mail schreiben</div>
                ${leute.length ? '<div class="todo-block-titel">An</div>' + leute.map((x, i) => `
                    <label class="todo-mw-wahl"><input type="radio" name="todo-mw-an" value="${i}" ${i === wahl ? 'checked' : ''}>
                        <span><b>${esc(x.name)}</b>${x.position ? ' · ' + esc(x.position) : ''}<br><span class="todo-sub">${esc(x.mail)}</span></span></label>`).join('')
                    : '<div class="todo-fehler">An der Adresse ist keine Mail-Adresse hinterlegt — Empfänger im Mailfenster eintragen.</div>'}
                ${anh.length ? '<div class="todo-block-titel" style="margin-top:12px;">Anhang</div>' + anh.map((x, i) => `
                    <label class="todo-mw-wahl"><input type="checkbox" data-anh="${i}" ${x.an ? 'checked' : ''}><span>📄 ${esc(x.name)}</span></label>`).join('') : ''}
                <div class="todo-mw-knoepfe">
                    <button type="button" class="todo-kk" data-mw="abbrechen">Abbrechen</button>
                    <button type="button" class="todo-kk todo-kk-primaer" data-mw="los">Mail öffnen</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', ev => {
            const b = ev.target.closest('[data-mw]');
            if (ev.target === ov || (b && b.dataset.mw === 'abbrechen')) { ov.remove(); return; }
            if (!b) return;
            const r = ov.querySelector('input[name="todo-mw-an"]:checked');
            const person = r ? leute[Number(r.value)] : null;
            const dateien = [...ov.querySelectorAll('input[data-anh]:checked')].map(c => anh[Number(c.dataset.anh)]);
            ov.remove();
            mailOeffnen(d, titel, person, dateien);
        });
    }

    function mailOeffnen(d, titel, person, dateien) {
        const ich = (window.activeUser && window.activeUser.name) || '';
        const anrede = person && person.anrede ? 'Guten Tag ' + person.anrede + ',' : 'Sehr geehrte Damen und Herren,';
        const x = (d.angebote || [])[0];
        let betreff = titel || '', rumpf = '<p><br></p>';
        if (x) {
            const a = x.a;
            betreff = 'Unser Angebot ' + angebotNr(a) + (angebotFirma(a) ? ' – ' + angebotFirma(a) : '');
            rumpf = `<p>wir hatten Ihnen ${a.belegdatum ? 'am ' + tagDe(a.belegdatum) + ' ' : ''}unser Angebot ${esc(angebotNr(a))} zugeschickt und möchten kurz nachfragen, ob Sie schon dazu gekommen sind, es sich anzusehen.</p>
                <p>Haben Sie noch Fragen oder Wünsche? Wir passen das Angebot gern an oder besprechen es telefonisch mit Ihnen.${dateien.length ? ' Zur Erinnerung finden Sie es noch einmal im Anhang.' : ''}</p>`;
        }
        const html = `<p>${esc(anrede)}</p>${rumpf}<p>Mit freundlichen Grüßen<br>${esc(ich)}</p>`;
        const an = person ? person.mail : '';
        const anh = dateien.map(y => ({ name: y.name, url: y.f.url, type: y.f.type || (istPdf(y.f) ? 'application/pdf' : '') }));
        schliessen();
        if (typeof window.mailSchreiben === 'function') { window.mailSchreiben(an, betreff, html, anh); return; }
        const text = html.replace(/<br>/g, '\n').replace(/<\/p>/g, '\n\n').replace(/<[^>]+>/g, '').trim();
        location.href = 'mailto:' + encodeURIComponent(an) + '?subject=' + encodeURIComponent(betreff) + '&body=' + encodeURIComponent(text);
    }

    // ---------------------------------------------------------- Historie der Adresse
    // Eigenes Fenster neben der Liste: Notizen der Adresse, Historie + Serviceberichte
    // ihrer Maschinen, Vorgänge und Angebote — neueste zuerst, zum Durchscrollen.
    // (Schmale eigene Abfragen statt des Adressbuch-Zustands — ohne Unterschriften-Bilder.)
    let historieFuer = null;
    function historieSchliessen() {
        const h = document.getElementById('todo-historie');
        if (h) h.hidden = true;
        document.body.classList.remove('todo-historie-offen');
        historieFuer = null;
    }
    async function historieOeffnen(e) {
        if (!e.customerId) return;
        let h = document.getElementById('todo-historie');
        if (!h) {
            h = document.createElement('div');
            h.id = 'todo-historie';
            h.innerHTML = `<div class="todo-kopf">
                    <div class="todo-titel"><span>🕘 Historie</span><span class="todo-stand" id="todo-historie-name"></span></div>
                    <button type="button" class="todo-kk todo-hist-ki" data-hist="ki" title="KI-Zusammenfassung dieser Adresse">✨ Zusammenfassung</button>
                    <button type="button" class="todo-x" data-hist="zu" title="Schließen" aria-label="Historie schließen">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div class="todo-hist-filter" id="todo-hist-filter"></div>
                <div class="todo-liste" id="todo-historie-liste"></div>`;
            document.body.appendChild(h);
            h.addEventListener('click', ev => {
                if (ev.target.closest('[data-hist="zu"]')) return historieSchliessen();
                const bi = ev.target.closest('[data-hist-bilder]');
                if (bi) {
                    const [k, ph, i] = bi.dataset.histBilder.split('|');
                    const x = (h._eintraege || [])[+k];
                    const fs = x && x.mietFotos ? x.mietFotos[ph] : [];
                    if (fs.length && window.openPhotosLightbox) window.openPhotosLightbox(fs.map(f => f.url), +i, { titel: ph === 'uebergabe' ? 'Übergabe' : 'Rückgabe', namen: fs.map(f => f.name || '') });
                    else if (fs[+i]) window.open(fs[+i].url, '_blank', 'noopener');
                    return;
                }
                if (ev.target.closest('[data-hist="ki"]')) { if (historieFuer && window.openAddressSummary) window.openAddressSummary(historieFuer, { ueber: h }); return; }
                const fb = ev.target.closest('[data-hist-filter]');
                if (fb) { h.dataset.filter = fb.dataset.histFilter; historieZeichnen(); return; }
                if (ev.target.closest('[data-hist-kopf]')) { h.dataset.kopfZu = h.dataset.kopfZu === '1' ? '' : '1'; historieZeichnen(); return; }
                const ma = ev.target.closest('[data-hist-masch]');
                if (ma && window.openMachineDetails) { window.openMachineDetails(ma.dataset.histMasch); return; }
                const ad = ev.target.closest('[data-hist-adr]');
                if (ad) {
                    schliessen();
                    if (window.switchView) window.switchView('addressbook');
                    setTimeout(() => window.openAddressDetail && window.openAddressDetail(String(ad.dataset.histAdr), 'overview'), 250);
                }
            });
        }
        if (historieFuer === e.customerId && !h.hidden) { historieSchliessen(); return; }
        historieFuer = e.customerId;
        historieKopf = null;
        h.hidden = false;
        h.dataset.filter = 'alle';
        document.body.classList.add('todo-historie-offen');
        const liste = document.getElementById('todo-historie-liste');
        liste.innerHTML = '<div class="todo-laedt"><span class="ab-ai-spinner"></span> Lade Historie …</div>';
        const d = details[e.id] || {};
        document.getElementById('todo-historie-name').textContent = (d.kunde && d.kunde.name) || '';
        try {
            h._eintraege = await historieLaden(e.customerId);
            if (historieFuer !== e.customerId) return;
            historieZeichnen();
        } catch (err) {
            liste.innerHTML = '<div class="todo-fehler">Historie konnte nicht geladen werden: ' + esc(err.message || err) + '</div>';
        }
    }

    // Adressbuch-Zustand nutzen (Maschinen-Zuordnung über Betreiber/Standort/Kundennr.
    // und Verknüpfungen) — einmal laden, falls die Adressbuch-Ansicht noch nie offen war.
    async function adressbuchBereit() {
        const st = window.addressbookState;
        if (!st || typeof window.loadAddressbook !== 'function') return null;
        if (!st.loaded) {
            if (!st.loading) await window.loadAddressbook();
            for (let i = 0; i < 60 && !st.loaded; i++) await new Promise(r => setTimeout(r, 250));
        }
        return st.loaded ? st : null;
    }
    function verknuepfte(st, kid) {
        const nachbarn = new Map();
        const add = (a, b, l) => { if (!nachbarn.has(a)) nachbarn.set(a, []); nachbarn.get(a).push({ b, l }); };
        (st.allLinks || []).forEach(l => { add(String(l.customer_id), String(l.linked_customer_id), l); add(String(l.linked_customer_id), String(l.customer_id), l); });
        const out = [], gesehen = new Set([String(kid)]);
        let welle = [String(kid)];
        while (welle.length) {
            const naechste = [];
            welle.forEach(id => (nachbarn.get(id) || []).forEach(({ b, l }) => {
                if (gesehen.has(b)) return;
                gesehen.add(b);
                out.push({ id: b, art: l.link_type || '', direkt: id === String(kid), ueber: id === String(kid) ? null : id });
                naechste.push(b);
            }));
            welle = naechste;
        }
        return out;
    }

    async function historieLaden(kid) {
        const c = sb();
        const q = p => p.then(r => r.data || []).catch(() => []);
        const st = await adressbuchBereit();
        const cluster = st ? verknuepfte(st, kid) : [];
        const ids = [String(kid)].concat(cluster.map(x => x.id));
        const adrName = id => { const a = st && st.byId && st.byId.get(String(id)); return a ? a.name : ''; };
        let maschinen = [];
        if (st && st.machinesByCustomer) {
            const m = new Map();
            ids.forEach(id => (st.machinesByCustomer.get(String(id)) || []).forEach(x => { if (!m.has(String(x.id))) m.set(String(x.id), Object.assign({ __adr: id }, x)); }));
            maschinen = [...m.values()];
        } else {
            maschinen = await q(c.from('machines').select('*').eq('customer_id', kid).limit(200));
        }
        const mIds = maschinen.map(m => m.id);
        const mLabel = m => window.machineLabel ? window.machineLabel(m) : [m.manufacturer, m.name, m.serial].filter(Boolean).join(' ');
        const mName = id => { const m = maschinen.find(x => String(x.id) === String(id)); return m ? mLabel(m) : ''; };
        const [notizen, hist1, hist2, berichte, vorgaenge, angebote] = await Promise.all([
            q(c.from('customer_notes').select('*').in('customer_id', ids).limit(400)),
            q(c.from('manual_history_entries').select('*').in('customer_id', ids).limit(400)),
            mIds.length ? q(c.from('manual_history_entries').select('*').in('machine_id', mIds).limit(500)) : [],
            mIds.length ? q(c.from('service_entries').select('id, machine_id, title, date, created_at, description, pdf_url, files').in('machine_id', mIds).limit(400)) : [],
            q(c.from('internal_processes').select('id, title, status, created_at, status_updates, steps, customer_id').in('customer_id', ids).limit(300)),
            q(c.from('angebote').select('*').in('customer_id', ids).limit(300))
        ]);
        // Kopf: verknüpfte Adressen + Maschinen (für die Übersicht)
        const linkArt = v => { const t = (window.categoryList || []).find(c => c.type === 'link' && (c.name.toLowerCase().replace(/\s+/g, '_') === v || c.name === v)); return t ? t.name : (v ? String(v).replace(/_/g, ' ') : 'verknüpft'); };
        historieKopf = {
            hauptId: String(kid),
            adressen: cluster.map(x => ({ id: x.id, name: adrName(x.id) || 'Adresse', art: linkArt(x.art), ueber: x.ueber ? adrName(x.ueber) : '' })),
            maschinen: maschinen.map(m => ({
                id: m.id, name: mLabel(m), sn: m.serial || m.serial_number || '', baujahr: m.year || '',
                naechste: m.next_maintenance || '', ort: m.location || '', adresse: String(m.__adr || kid) !== String(kid) ? adrName(m.__adr) : ''
            })).sort((a, b) => a.name.localeCompare(b.name, 'de'))
        };
        const fremd = id => id && String(id) !== String(kid) ? adrName(id) : '';
        const out = [];
        const wann = v => { const t = new Date(v || 0).getTime(); return isNaN(t) ? 0 : t; };
        const dateien = fl => (Array.isArray(fl) ? fl : []).map(x => typeof x === 'string' ? { url: x, name: decodeURIComponent(x.split('/').pop().split('?')[0]) } : x).filter(x => x && x.url);
        notizen.forEach(n => out.push({ art: 'notiz', t: wann(n.entry_date || n.created_at), titel: n.title || 'Notiz', text: n.body || n.content || n.text || '', von: n.author || n.created_by_name || '', adresse: fremd(n.customer_id) }));
        // Mietvereinbarungen: Fotos je Phase (Übergabe/Rücknahme) + PDF
        const mietIds = [...new Set(hist1.concat(hist2).filter(x => x.type === 'miete' && x.rental_agreement_id).map(x => String(x.rental_agreement_id)))];
        const mieten = mietIds.length ? await q(c.from('rental_agreements').select('*').in('id', mietIds)) : [];
        const mietById = new Map(mieten.map(r => [String(r.id), r]));
        const mietFotos = r => {
            const zus = (r.data && r.data.zusatz) || {};
            const info = (ph, pos) => (zus[ph] || []).find(z => z && z.pos === pos);
            const je = ph => (Array.isArray(r.photos) ? r.photos : []).filter(f => f && f.url && f.phase === ph).map(f => {
                const z = info(ph, f.position);
                return { url: f.url, name: z ? [z.datum ? tagDe(z.datum) : '', z.text || 'Zusatzbild'].filter(Boolean).join(' · ') : f.position };
            });
            return { uebergabe: je('uebergabe'), ruecknahme: je('ruecknahme') };
        };
        const gesehen = new Set();
        hist1.concat(hist2).forEach(x => {
            if (gesehen.has(x.id)) return; gesehen.add(x.id);
            const r = x.type === 'miete' && x.rental_agreement_id ? mietById.get(String(x.rental_agreement_id)) : null;
            const fl = dateien(x.files);
            if (r && r.pdf_url && !fl.some(f => f.url === r.pdf_url)) fl.unshift({ url: r.pdf_url, name: 'Mietvereinbarung (PDF)' });
            out.push({ art: x.type === 'photo' ? 'foto' : (x.type === 'miete' ? 'miete' : 'historie'), t: wann(x.entry_date || x.created_at), titel: x.title || 'Eintrag', text: x.content || '', maschine: mName(x.machine_id), dateien: fl, adresse: fremd(x.customer_id),
                mietFotos: r ? mietFotos(r) : null, unterschriften: r && r.data && r.data.unterschriften });
        });
        berichte.forEach(b => out.push({ art: 'service', t: wann(b.date || b.created_at), titel: b.title || 'Servicebericht', text: b.description || '', maschine: mName(b.machine_id), dateien: b.pdf_url ? [{ url: b.pdf_url, name: 'Bericht (PDF)' }] : dateien(b.files) }));
        vorgaenge.forEach(p => {
            const letzter = Array.isArray(p.status_updates) && p.status_updates[0];
            out.push({ art: 'vorgang', t: wann(p.created_at), titel: p.title || 'Vorgang', text: letzter ? 'Stand: ' + (letzter.text || '') : '', status: p.status || '', adresse: fremd(p.customer_id) });
        });
        // Angebots-PDFs hängen am Angebots-Vorgang (attachments ohne step_id)
        const pIds = [...new Set(angebote.map(a => a.process_id).filter(Boolean).map(String))];
        const angProcs = pIds.length ? await q(c.from('internal_processes').select('id, attachments').in('id', pIds)) : [];
        const procById = new Map(angProcs.map(p => [String(p.id), p]));
        angebote.forEach(a => {
            const docs = dokumente(procById.get(String(a.process_id || '')));
            out.push({ art: 'angebot', t: wann(a.belegdatum || a.created_at), titel: 'Angebot ' + (a.belegnummer || ''), text: '', status: a.status || '', betrag: a.nettobetrag, adresse: fremd(a.customer_id),
                dateien: docs.filter(istPdf).concat(docs.filter(f => !istPdf(f))).map(f => ({ url: f.url, name: f.name || 'Angebot (PDF)' })) });
        });
        return out.sort((x, y) => y.t - x.t).map((x, i) => Object.assign(x, { _key: i }));
    }

    const HIST_ART = {
        notiz: ['📍', 'Notiz', '#38bdf8'], historie: ['🔧', 'Historie', '#34d399'], foto: ['📷', 'Foto', '#34d399'], miete: ['🔑', 'Miete', '#f59e0b'],
        service: ['📋', 'Service', '#10b981'], vorgang: ['📁', 'Vorgang', '#a78bfa'], angebot: ['📄', 'Angebot', '#f87171']
    };
    let historieKopf = null;
    function kopfHtml() {
        const k = historieKopf;
        if (!k) return '';
        const zu = !!(document.getElementById('todo-historie') || {}).dataset && document.getElementById('todo-historie').dataset.kopfZu === '1';
        let html = '';
        if (k.adressen.length) {
            html += `<div class="todo-abschnitt">🔗 Verknüpfte Adressen <span>${k.adressen.length}</span></div><div class="todo-hist-adr">` + k.adressen.map(a => `
                <button type="button" class="todo-chip" data-hist-adr="${esc(a.id)}" title="Adresse öffnen${a.ueber ? ' (über ' + esc(a.ueber) + ')' : ''}">${esc(a.name)} <span class="todo-sub">· ${esc(a.art)}</span></button>`).join('') + '</div>';
        }
        if (k.maschinen.length) {
            const zeig = zu ? [] : k.maschinen;
            html += `<div class="todo-abschnitt">⚙️ Maschinen <span>${k.maschinen.length}</span> <button type="button" class="todo-chip" data-hist-kopf="1">${zu ? 'anzeigen' : 'einklappen'}</button></div>`
                + zeig.map(m => {
                    const t = m.naechste ? Math.round((new Date(String(m.naechste).slice(0, 10) + 'T00:00:00') - new Date().setHours(0, 0, 0, 0)) / 86400000) : null;
                    const wart = m.naechste ? `<span class="todo-chip${t < 0 ? ' rot' : (t <= 30 ? ' gelb' : '')}">🔧 ${tagDe(m.naechste)}</span>` : '';
                    return `<div class="todo-hist todo-hist-masch" style="--todo-farbe:#34d399" data-hist-masch="${esc(m.id)}" title="Maschine öffnen">
                        <div class="todo-name">${esc(m.name)}</div>
                        <div class="todo-sub">${[m.sn ? 'SN ' + m.sn : '', m.baujahr ? 'Bj. ' + m.baujahr : '', m.ort, m.adresse ? '📍 ' + m.adresse : ''].filter(Boolean).map(esc).join(' · ')}</div>
                        ${wart ? '<div class="todo-schritt-meta" style="margin-left:0">' + wart + '</div>' : ''}
                    </div>`;
                }).join('');
        }
        return html ? '<div class="todo-hist-kopf">' + html + '</div>' : '';
    }

    function historieZeichnen() {
        const h = document.getElementById('todo-historie');
        const alle = (h && h._eintraege) || [];
        const filter = h.dataset.filter || 'alle';
        const arten = ['alle'].concat(Object.keys(HIST_ART).filter(k => alle.some(x => x.art === k)));
        document.getElementById('todo-hist-filter').innerHTML = arten.map(k => `<button type="button" class="todo-kk${k === filter ? ' aktiv' : ''}" data-hist-filter="${k}">${k === 'alle' ? 'Alle ' + alle.length : HIST_ART[k][0] + ' ' + HIST_ART[k][1] + ' ' + alle.filter(x => x.art === k).length}</button>`).join('');
        const liste = filter === 'alle' ? alle : alle.filter(x => x.art === filter);
        let monat = '';
        document.getElementById('todo-historie-liste').innerHTML = kopfHtml() + '<div class="todo-abschnitt">🕘 Verlauf</div>' + (liste.length ? liste.map(x => {
            const d = x.t ? new Date(x.t) : null;
            const m = d ? d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }) : 'Ohne Datum';
            const kopf = m !== monat ? (monat = m, `<div class="todo-gruppe">${esc(m)}</div>`) : '';
            const a = HIST_ART[x.art] || ['•', '', '#94a3b8'];
            return kopf + `<div class="todo-hist" style="--todo-farbe:${a[2]}">
                <div class="todo-oben"><span class="todo-typ">${a[0]} ${esc(a[1])}</span><span class="todo-wann">${d ? d.toLocaleDateString('de-DE') : ''}</span>${x.status ? `<span class="todo-wann">· ${esc(x.status)}</span>` : ''}</div>
                <div class="todo-name">${esc(x.titel)}${x.betrag ? ` <span class="todo-sub">· ${esc(eur(x.betrag))}</span>` : ''}</div>
                ${x.maschine || x.adresse ? `<div class="todo-sub">${[x.maschine, x.adresse ? '📍 ' + x.adresse : ''].filter(Boolean).map(esc).join(' · ')}</div>` : ''}
                ${x.text ? `<div class="todo-beschr">${esc(String(x.text).slice(0, 500))}</div>` : ''}
                ${x.mietFotos ? ['uebergabe', 'ruecknahme'].map(ph => {
                    const fs = x.mietFotos[ph];
                    if (!fs.length) return '';
                    const u = x.unterschriften || {};
                    const datum = ph === 'uebergabe' ? u.u_datum : u.r_datum;
                    return `<div class="todo-miet-fotos"><div class="todo-block-titel">📷 ${ph === 'uebergabe' ? 'Übergabe' : 'Rücknahme'}${datum ? ' · ' + esc(tagDe(datum)) : ''} <span>${fs.length} Bilder</span></div>
                        <div class="todo-miet-grid">${fs.map((f, i) => `<button type="button" class="todo-miet-bild" data-hist-bilder="${esc(x._key)}|${ph}|${i}" title="${esc(f.name)}"><img src="${esc(f.url)}" alt="" loading="lazy"></button>`).join('')}</div></div>`;
                }).join('') : ''}
                ${(x.dateien || []).length ? '<div class="todo-doks">' + x.dateien.slice(0, 6).map(f => `<a class="todo-kk todo-dok" href="${esc(f.url)}" target="_blank" rel="noopener">📎 ${esc(f.name || 'Datei')}</a>`).join('') + '</div>' : ''}
            </div>`;
        }).join('') : '<div class="todo-leer">Keine Einträge.</div>');
    }

    // Für das Briefing (js/ai-briefing.js): PDF öffnen / Mail mit Angebot, ohne To-do-Eintrag.
    window.todoAktion = {
        pdf: async function (angebotId) {
            const w = window.open('', '_blank');
            try {
                const d = await kontextLaden({ targetType: 'angebot', targetId: angebotId }, {});
                const x = (d.angebote || [])[0];
                const docs = x ? dokumente(x.proc) : [];
                const datei = docs.find(istPdf) || docs[0];
                if (!datei) { if (w) w.close(); toast('An diesem Angebot hängt noch kein PDF.'); return; }
                if (w) w.location.href = datei.url; else window.open(datei.url, '_blank', 'noopener');
            } catch (err) { if (w) w.close(); toast('PDF konnte nicht geöffnet werden: ' + (err.message || err), 'error'); }
        },
        mail: async function (angebotId) {
            try {
                const d = await kontextLaden({ targetType: 'angebot', targetId: angebotId }, {});
                const x = (d.angebote || [])[0];
                mailWahl(d, x ? 'Angebot ' + (x.a.belegnummer || '') : '');
            } catch (err) { toast('Mail konnte nicht vorbereitet werden: ' + (err.message || err), 'error'); }
        }
    };

    // ---------------------------------------------------------- Aktionen
    const eintragZu = el => { const w = el.closest('.todo-eintrag'); return w ? eintraege.find(x => x.id === w.dataset.id) : null; };

    function klick(ev) {
        const t = ev.target;
        const a = t.closest('[data-todo]');
        const e = eintragZu(t);
        if (!a) return;
        const was = a.dataset.todo;
        if (was === 'zu') return schliessen();
        if (was === 'vollbild') return vollbild(!document.body.classList.contains('todo-vollbild'));
        if (was === 'briefing') { schliessen(); if (window.openKiBriefing) window.openKiBriefing('heute'); return; }
        if (was === 'auto') {
            autoAn(!autoIstAn());
            toast(autoIstAn() ? 'Automatik an — neue fällige Punkte kommen von selbst in die Liste.' : 'Automatik aus — nur noch über das Briefing.');
            if (autoIstAn()) autoPruefen(true);
            return;
        }
        if (was === 'drucken') {
            // Offene Punkte (mit Suche), nach Stufe sortiert; Notiz des Eintrags kommt mit aufs Blatt.
            const reihe = g => { const i = GRUPPEN.indexOf(g || 'Wichtig'); return i < 0 ? 99 : i; };
            const liste = gefiltert().filter(x => !x.erledigt).sort((a, b) => reihe(a.gruppe) - reihe(b.gruppe)).map(x => ({
                title: x.titel || '(ohne Titel)', typLabel: x.typ, datumText: x.datumText, gruppe: x.gruppe || 'Wichtig',
                subject: x.subject, ki: x.ki, note: x.notiz, targetType: x.targetType, targetId: x.targetId,
                customerId: x.customerId, day: x.day, done: false
            }));
            if (!liste.length) { toast('Keine offenen Punkte zum Drucken.'); return; }
            if (!window.kalenderTodoDrucken) { toast('Druck-Modul nicht geladen.'); return; }
            window.kalenderTodoDrucken(liste, 'Meine To-dos' + (suche.trim() ? ' — Suche „' + suche.trim() + '“' : ''));
            return;
        }
        if (was === 'aufraeumen') {
            const weg = sichtbar().filter(x => x.erledigt);
            if (!weg.length) { toast('Nichts erledigt zum Entfernen.'); return; }
            archivieren(weg);
            return;
        }
        if (!e) return;
        if (was === 'klappen') {
            if (t.closest('.todo-haken')) return;
            if (e.neu) { e.neu = false; speichern(); }
            if (offen.has(e.id)) offen.delete(e.id); else { offen.add(e.id); delete details[e.id]; detailsLaden(e); }   // beim Aufklappen immer frisch (z. B. neue Dokumente)
            zeichnen();
            return;
        }
        if (was === 'entfernen') { archivieren([e]); return; }
        if (was === 'stand') return standSpeichern(e.id);
        if (was === 'schritt') return schrittNeu(e.id);
        if (was === 'staende') { e._alleStaende = !e._alleStaende; zeichnen(); return; }
        if (was === 'zust') return zustMenu(e, a);
        if (was === 's-zust') return schrittZustMenu(e, Number(a.dataset.i), a);
        if (was === 's-erinn') return schrittErinnMenu(e, Number(a.dataset.i), a);
        if (was === 's-dok') {
            const proc = details[e.id] && details[e.id].proc;
            if (proc && window.eventsState) {
                if (!Array.isArray(window.eventsState.processes)) window.eventsState.processes = [];
                const k = window.eventsState.processes.findIndex(x => String(x.id) === String(proc.id));
                if (k === -1) window.eventsState.processes.push(proc); else window.eventsState.processes[k] = proc;
            }
            if (proc && window.openProcessAttachments) window.openProcessAttachments(proc.id, a.dataset.step, ev);
            return;
        }
        if (was === 'historie') return historieOeffnen(e);
        if (was === 'mail') { ev.preventDefault(); mailWahl(details[e.id] || {}, e.titel, a.dataset.mail); return; }
        if (was === 'mailwahl') return mailWahl(details[e.id] || {}, e.titel);
        if (was === 'adresse') {
            schliessen();
            if (window.switchView) window.switchView('addressbook');
            let n = 0;
            const versuch = () => { if (window.openAddressDetail) window.openAddressDetail(String(e.customerId), 'overview'); if (++n < 8 && !document.querySelector('#addressbook [data-detail-id], #addressbook .ab-detail')) setTimeout(versuch, 300); };
            setTimeout(versuch, 200);
            return;
        }
        if (was === 'oeffnen') return zielOeffnen(e);
    }

    function zielOeffnen(e) {
        const id = e.targetId;
        if (e.targetType === 'process') {
            const proc = details[e.id] && details[e.id].proc;
            if (proc && window.eventsState) {
                if (!Array.isArray(window.eventsState.processes)) window.eventsState.processes = [];
                const i = window.eventsState.processes.findIndex(p => String(p.id) === String(proc.id));
                if (i === -1) window.eventsState.processes.push(proc); else window.eventsState.processes[i] = proc;
            }
            if (window.openEditProcessModal) return window.openEditProcessModal(id);
        }
        if (e.targetType === 'event' && window.editManualEvent) return window.editManualEvent(id);
        if (e.targetType === 'angebot' && window.navigateToAngebot) { schliessen(); return window.navigateToAngebot(id); }
        if (e.targetType === 'machine' && window.openMachineDetails) return window.openMachineDetails(id);
        if (e.targetType === 'service' && window.openServiceReport) return window.openServiceReport(id);
        toast('Kann diesen Eintrag hier nicht öffnen.');
    }

    function aenderung(ev) {
        const t = ev.target;
        const e = eintragZu(t);
        if (!e) return;
        if (t.matches('[data-todo-erledigt]') && t.checked && e.targetId && (e.targetType === 'process' || e.targetType === 'angebot')) {
            t.checked = false;   // erst nach der Antwort
            return abschlussFragen(e);
        }
        if (t.matches('[data-todo-erledigt]')) {
            e.erledigt = t.checked;
            e.erledigtAm = t.checked ? new Date().toISOString() : null;
            if (t.checked) offen.delete(e.id);
            speichern(); zeichnen();
            return;
        }
        if (t.matches('[data-schritt]')) schrittSetzen(e, parseInt(t.dataset.schritt.split(':')[1], 10), t.checked);
    }

    let notizUhr = null;
    function eingabe(ev) {
        const t = ev.target;
        if (!t.matches('[data-notiz]')) return;
        const e = eintraege.find(x => x.id === t.dataset.notiz);
        if (!e) return;
        e.notiz = t.value;
        clearTimeout(notizUhr);
        notizUhr = setTimeout(speichern, 600);
    }

    async function schrittSetzen(e, i, fertig) {
        const proc = details[e.id] && details[e.id].proc;
        if (!proc || !Array.isArray(proc.steps) || !proc.steps[i]) return;
        const vorher = proc.steps;
        const steps = proc.steps.map((s, j) => j === i ? Object.assign({}, s, { done: fertig, done_at: fertig ? new Date().toISOString() : null, done_by: fertig ? ((window.activeUser && window.activeUser.name) || null) : null }) : s);
        proc.steps = steps;
        zeichnen();
        const { error } = await sb().from('internal_processes').update({ steps }).eq('id', proc.id);
        if (error) { proc.steps = vorher; zeichnen(); toast('Schritt nicht gespeichert: ' + error.message, 'error'); }
    }

    // ---------------------------------------------------------- Benutzer, Zuständige, Schritt-Details
    const nutzer = () => (window.userList || []).filter(u => u && u.name);
    function nutzerZu(v) { return nutzer().find(u => String(u.id) === String(v) || String(u.name).toLowerCase() === String(v).toLowerCase()) || null; }
    function avatarHtml(v, extra) {
        const u = nutzerZu(v);
        const name = u ? u.name : String(v || '');
        const ini = u && u.initials ? u.initials : name.split(/\s+/).map(x => x[0] || '').join('').slice(0, 2).toUpperCase();
        return `<span class="todo-av${extra || ''}" style="background:${esc((u && u.color) || '#64748b')}" title="${esc(name)}">${esc(ini)}</span>`;
    }
    function avatareHtml(arr, max) {
        const a = Array.isArray(arr) ? arr.filter(Boolean) : [];
        if (!a.length) return '<span class="todo-sub">niemand</span>';
        const n = max || a.length;
        return a.slice(0, n).map(v => avatarHtml(v)).join('') + (a.length > n ? `<span class="todo-av todo-av-mehr">+${a.length - n}</span>` : '');
    }
    function zustMerken(e, arr) {
        const neu = Array.isArray(arr) ? arr.map(String) : [];
        if (JSON.stringify(neu) !== JSON.stringify(e.zustaendig || [])) { e.zustaendig = neu; speichern(); }
    }
    const fmtDT = v => { if (!v) return ''; const d = new Date(v); return isNaN(d) ? '' : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) + (/T\d\d:\d\d/.test(String(v)) ? ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''); };

    function schrittHtml(e, p, st, i) {
        const doks = (Array.isArray(p.attachments) ? p.attachments : []).filter(x => x && x.step_id && String(x.step_id) === String(st.id));
        let erinnKlasse = '';
        if (st.remind_at && !st.done) {
            const t = Math.round((new Date(st.remind_at).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
            erinnKlasse = t < 0 ? ' rot' : (t <= 3 ? ' gelb' : '');
        }
        const meta = [
            (st.created_by || st.created_at) ? 'erstellt' + (st.created_by ? ' von ' + esc(st.created_by) : '') + (st.created_at ? ' am ' + fmtDT(st.created_at) : '') : '',
            st.done ? '<span class="todo-ok">✓ erledigt' + (st.done_by ? ' von ' + esc(st.done_by) : '') + (st.done_at ? ' am ' + fmtDT(st.done_at) : '') + '</span>' : ''
        ].filter(Boolean).join(' · ');
        return `<div class="todo-schritt-zeile${st.done ? ' fertig' : ''}">
            <div class="todo-schritt"><input type="checkbox" data-schritt="${esc(e.id)}:${i}" ${st.done ? 'checked' : ''} title="${st.done ? 'Wieder offen' : 'Erledigt'}">
                <span class="todo-edit" contenteditable="true" spellcheck="true" data-s-text="${i}" title="Klicken zum Bearbeiten">${esc(st.text || '')}</span></div>
            <div class="todo-schritt-meta">
                <button type="button" class="todo-chip" data-todo="s-zust" data-i="${i}" title="Zuständig für diesen Schritt">${st.assigned_to ? avatarHtml(st.assigned_id || st.assigned_to, ' klein') + esc(st.assigned_to) : '👤 zuweisen'}</button>
                <button type="button" class="todo-chip${erinnKlasse}" data-todo="s-erinn" data-i="${i}" title="Erinnerung">⏰ ${st.remind_at ? esc(fmtDT(st.remind_at)) : 'Erinnerung'}</button>
                ${doks.map(x => `<a class="todo-chip todo-chip-dok" href="${esc(x.url)}" target="_blank" rel="noopener" title="${esc(x.name || '')}">📎 ${esc(x.name || 'Dokument')}</a>`).join('')}
                <button type="button" class="todo-chip" data-todo="s-dok" data-step="${esc(st.id)}" title="Dokument an diesen Schritt hängen">📎 ${doks.length ? '+' : 'Dokument'}</button>
            </div>
            ${meta ? `<div class="todo-schritt-info">${meta}</div>` : ''}
        </div>`;
    }

    // Kleines Menü an einem Knopf (Benutzerwahl, Erinnerung)
    function menuZu() { const m = document.getElementById('todo-menu'); if (m) m.remove(); document.removeEventListener('mousedown', menuAussen, true); }
    function menuAussen(ev) { const m = document.getElementById('todo-menu'); if (m && !m.contains(ev.target)) menuZu(); }
    function menuAuf(anker, html, bind) {
        menuZu();
        const m = document.createElement('div');
        m.id = 'todo-menu';
        m.innerHTML = html;
        document.body.appendChild(m);
        const r = anker.getBoundingClientRect();
        const w = m.offsetWidth, h = m.offsetHeight;
        m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + 'px';
        m.style.top = (r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
        bind(m);
        setTimeout(() => document.addEventListener('mousedown', menuAussen, true), 0);
    }

    async function procSpeichern(e, felder) {
        const proc = details[e.id] && details[e.id].proc;
        if (!proc) return false;
        const vorher = {};
        Object.keys(felder).forEach(k => { vorher[k] = proc[k]; });
        Object.assign(proc, felder);
        zeichnen();
        const { error } = await sb().from('internal_processes').update(felder).eq('id', proc.id);
        if (error) { Object.assign(proc, vorher); zeichnen(); toast('Nicht gespeichert: ' + error.message, 'error'); return false; }
        if (felder.assigned_users) zustMerken(e, felder.assigned_users);
        return true;
    }

    function zustMenu(e, anker) {
        const proc = details[e.id] && details[e.id].proc;
        if (!proc) return;
        const ist = v => (proc.assigned_users || []).some(x => nutzerZu(x) ? String(nutzerZu(x).id) === String(v.id) : String(x) === String(v.id));
        menuAuf(anker, '<div class="todo-menu-titel">Zuständig</div>' + nutzer().map(u => `
            <label class="todo-menu-zeile"><input type="checkbox" data-uid="${esc(u.id)}" ${ist(u) ? 'checked' : ''}>${avatarHtml(u.id, ' klein')}<span>${esc(u.name)}</span></label>`).join(''), m => {
            m.addEventListener('change', async ev => {
                const uid = ev.target.dataset.uid;
                if (!uid) return;
                let liste = (proc.assigned_users || []).filter(x => { const u = nutzerZu(x); return u ? String(u.id) !== String(uid) : String(x) !== String(uid); });
                if (ev.target.checked) liste = liste.concat([nutzerZu(uid) ? nutzerZu(uid).id : uid]);
                await procSpeichern(e, { assigned_users: liste });
            });
        });
    }

    function schrittAendern(e, i, felder) {
        const proc = details[e.id] && details[e.id].proc;
        if (!proc || !Array.isArray(proc.steps) || !proc.steps[i]) return;
        const steps = proc.steps.map((x, j) => j === i ? Object.assign({}, x, felder) : x);
        return procSpeichern(e, { steps });
    }

    function schrittZustMenu(e, i, anker) {
        menuAuf(anker, '<div class="todo-menu-titel">Schritt zuweisen</div>'
            + '<button type="button" class="todo-menu-zeile" data-uid="">— niemand —</button>'
            + nutzer().map(u => `<button type="button" class="todo-menu-zeile" data-uid="${esc(u.id)}">${avatarHtml(u.id, ' klein')}<span>${esc(u.name)}</span></button>`).join(''), m => {
            m.addEventListener('click', ev => {
                const b = ev.target.closest('[data-uid]');
                if (!b) return;
                const u = b.dataset.uid ? nutzerZu(b.dataset.uid) : null;
                menuZu();
                schrittAendern(e, i, { assigned_to: u ? u.name : null, assigned_id: u ? u.id : null });
            });
        });
    }

    function schrittErinnMenu(e, i, anker) {
        const proc = details[e.id] && details[e.id].proc;
        const st = proc && proc.steps && proc.steps[i];
        if (!st) return;
        const wert = st.remind_at && window.isoToLocalInput ? window.isoToLocalInput(st.remind_at) : (st.remind_at ? String(st.remind_at).slice(0, 16) : '');
        const morgen = new Date(); morgen.setDate(morgen.getDate() + 1); morgen.setHours(8, 0, 0, 0);
        const inTagen = n => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(8, 0, 0, 0); return d.toISOString(); };
        menuAuf(anker, `<div class="todo-menu-titel">Erinnerung</div>
            <div class="todo-menu-schnell">
                <button type="button" class="todo-kk" data-in="1">Morgen 8:00</button>
                <button type="button" class="todo-kk" data-in="3">In 3 Tagen</button>
                <button type="button" class="todo-kk" data-in="7">In 1 Woche</button>
            </div>
            <input type="datetime-local" class="glass-form-input" id="todo-menu-dt" value="${esc(wert)}" style="color-scheme:dark; width:100%;">
            <div class="todo-menu-schnell" style="justify-content:space-between;">
                ${st.remind_at ? '<button type="button" class="todo-kk todo-kk-weg" data-weg="1">Entfernen</button>' : '<span></span>'}
                <button type="button" class="todo-kk todo-kk-primaer" data-ok="1">Speichern</button>
            </div>`, m => {
            m.addEventListener('click', ev => {
                const b = ev.target.closest('button');
                if (!b) return;
                let neu;
                if (b.dataset.in) neu = inTagen(Number(b.dataset.in));
                else if (b.dataset.weg) neu = null;
                else if (b.dataset.ok) { const v = m.querySelector('#todo-menu-dt').value; neu = v ? new Date(v).toISOString() : null; }
                else return;
                menuZu();
                schrittAendern(e, i, { remind_at: neu });
            });
        });
    }

    // Text eines Schritts / Stands nach dem Bearbeiten speichern
    function textFertig(ev) {
        const t = ev.target;
        if (!t.matches || !t.matches('[data-s-text], [data-stand-i]')) return;
        const e = eintragZu(t);
        const proc = e && details[e.id] && details[e.id].proc;
        if (!proc) return;
        if (t.dataset.verwerfen) { delete t.dataset.verwerfen; zeichnen(); return; }
        const text = t.innerText.replace(/\u00a0/g, ' ').trim();
        if (t.dataset.sText != null) {
            const i = Number(t.dataset.sText);
            const alt = proc.steps && proc.steps[i];
            if (!alt || text === (alt.text || '')) return;
            if (!text) { zeichnen(); toast('Ein Schritt braucht einen Text.'); return; }
            schrittAendern(e, i, { text });
            return;
        }
        const i = Number(t.dataset.standI);
        const liste = Array.isArray(proc.status_updates) ? proc.status_updates.slice() : [];
        if (!liste[i] || text === (liste[i].text || '')) return;
        if (!text) { zeichnen(); toast('Der Stand ist leer — zum Löschen bitte den Vorgang öffnen.'); return; }
        liste[i] = Object.assign({}, liste[i], { text, edited_at: new Date().toISOString(), edited_by: (window.activeUser && window.activeUser.name) || null });
        procSpeichern(e, { status_updates: liste });
    }

    // Abhaken eines Vorgangs/Angebots: nur von der Liste — oder auch dort abschließen?
    function abschlussFragen(e) {
        const angebot = e.targetType === 'angebot';
        const alt = document.getElementById('todo-mail-wahl');
        if (alt) alt.remove();
        const ov = document.createElement('div');
        ov.id = 'todo-mail-wahl';
        ov.innerHTML = `
            <div class="todo-mw-box" role="dialog" aria-label="Abhaken">
                <div class="todo-mw-titel">✓ ${esc(e.titel || (angebot ? 'Angebot' : 'Vorgang'))}</div>
                <p class="todo-sub" style="margin:0 0 12px;">${angebot ? 'Wie ist das Angebot ausgegangen?' : 'Ist der Vorgang damit insgesamt fertig?'}</p>
                <button type="button" class="todo-mw-wahl todo-mw-knopf" data-ab="liste"><span><b>Nur von meiner Liste</b><br><span class="todo-sub">${angebot ? 'Angebot' : 'Vorgang'} bleibt offen, nur dieser Punkt ist für heute erledigt</span></span></button>
                ${angebot ? `
                <button type="button" class="todo-mw-wahl todo-mw-knopf gruen" data-ab="erhalten"><span><b>🎉 Auftrag erhalten</b><br><span class="todo-sub">Status „Auftrag erhalten", der Vorgang wird erledigt</span></span></button>
                <button type="button" class="todo-mw-wahl todo-mw-knopf rot" data-ab="verloren"><span><b>Auftrag verloren</b><br><span class="todo-sub">Status „Auftrag verloren", der Vorgang wird erledigt</span></span></button>`
                : `<button type="button" class="todo-mw-wahl todo-mw-knopf gruen" data-ab="erledigt"><span><b>Vorgang auf „Erledigt" setzen</b><br><span class="todo-sub">Wandert zu den erledigten Vorgängen</span></span></button>`}
                <div class="todo-mw-knoepfe"><button type="button" class="todo-kk" data-ab="abbrechen">Abbrechen</button></div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', async ev => {
            const b = ev.target.closest('[data-ab]');
            if (ev.target !== ov && !b) return;
            const wahl = b ? b.dataset.ab : 'abbrechen';
            ov.remove();
            if (wahl === 'abbrechen') return;
            if (wahl !== 'liste') {
                const ok = await abschliessen(e, wahl);
                if (!ok) return;
            }
            e.erledigt = true;
            e.erledigtAm = new Date().toISOString();
            offen.delete(e.id);
            speichern(); zeichnen();
        });
    }

    async function abschliessen(e, wahl) {
        try {
            if (e.targetType === 'process') {
                const { error } = await sb().from('internal_processes').update({ status: 'erledigt' }).eq('id', e.targetId);
                if (error) throw error;
                if (details[e.id] && details[e.id].proc) details[e.id].proc.status = 'erledigt';
                if (typeof window.fetchProcesses === 'function') window.fetchProcesses();
                toast('Vorgang ist erledigt.', 'success');
                return true;
            }
            const status = wahl === 'erhalten' ? 'Auftrag erhalten' : 'Auftrag verloren';
            if (typeof window.updateAngebotStatus === 'function') {
                // setzt auch Realisierbar und den Vorgang (vorgangStatusNachAngebot)
                await window.updateAngebotStatus(e.targetId, status, null);
            } else {
                const { error } = await sb().from('angebote').update({ status, realisierbar: wahl === 'erhalten' ? 100 : 0 }).eq('id', e.targetId);
                if (error) throw error;
            }
            toast('Angebot: ' + status + '.', 'success');
            return true;
        } catch (err) {
            toast('Konnte nicht abgeschlossen werden: ' + (err.message || err), 'error');
            return false;
        }
    }

    async function schrittNeu(id) {
        const e = eintraege.find(x => x.id === id);
        const proc = e && details[e.id] && details[e.id].proc;
        const feld = document.getElementById('todo-schritt-' + id);
        const text = feld ? feld.value.trim() : '';
        if (!proc || !text) return;
        const vorher = Array.isArray(proc.steps) ? proc.steps : [];
        const steps = vorher.concat([{ id: 'st_' + Math.random().toString(36).slice(2, 9), text, done: false,
            created_at: new Date().toISOString(), created_by: (window.activeUser && window.activeUser.name) || null, done_at: null, done_by: null }]);
        proc.steps = steps;
        zeichnen();
        const { error } = await sb().from('internal_processes').update({ steps }).eq('id', proc.id);
        if (error) { proc.steps = vorher; zeichnen(); toast('Schritt nicht gespeichert: ' + error.message, 'error'); return; }
        const neu = document.getElementById('todo-schritt-' + id);
        if (neu) neu.focus();
    }

    async function standSpeichern(id) {
        const e = eintraege.find(x => x.id === id);
        const proc = e && details[e.id] && details[e.id].proc;
        const feld = document.querySelector(`[data-stand-text="${CSS.escape(id)}"]`);
        const text = feld ? feld.value.trim() : '';
        if (!proc || !text) return;
        const list = [{
            text,
            by: (window.activeUser && window.activeUser.name) || 'Unbekannt',
            by_id: (window.activeUser && window.activeUser.id) || null,
            at: new Date().toISOString()
        }].concat(Array.isArray(proc.status_updates) ? proc.status_updates : []);
        const { error } = await sb().from('internal_processes').update({ status_updates: list }).eq('id', proc.id);
        if (error) { toast('Stand nicht gespeichert: ' + error.message, 'error'); return; }
        proc.status_updates = list;
        zeichnen();
        toast('Stand eingetragen.', 'success');
    }

    // ---------------------------------------------------------- Automatik
    // Ohne KI, nach festen Regeln: was MIR heute (oder überfällig) ansteht, kommt
    // von selbst in die Liste. Abgehaktes/Entferntes kommt nur bei einem NEUEN
    // Termin wieder (gleiche Logik wie beim Briefing: Schlüssel + day).
    // Abfrage alle 10 min, nur im Haupt-Tab und sichtbarem Fenster (Log-/Egress-Regel).
    const AUTO_KEY = 'meetra_todo_auto';
    const AUTO_TAKT = 10 * 60 * 1000;
    let autoLetzte = 0;
    function autoIstAn() { try { return localStorage.getItem(AUTO_KEY) !== '0'; } catch (e) { return true; } }
    function autoAn(an) {
        try { localStorage.setItem(AUTO_KEY, an ? '1' : '0'); } catch (e) { /* gesperrt */ }
        const k = document.getElementById('todo-auto-knopf');
        if (k) k.classList.toggle('aktiv', an);
    }
    function ich() { const u = window.activeUser || {}; return { id: String(u.id || ''), name: String(u.name || '').toLowerCase() }; }
    function istMeins(v) { const me = ich(); return v != null && (String(v) === me.id || String(v).toLowerCase() === me.name); }
    const isoTag = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const wtDatum = v => { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }) + (/T\d\d:\d\d/.test(String(v)) && !/T00:00/.test(String(v)) ? ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''); };

    async function autoPruefen(sofort) {
        if (!autoIstAn() || !window.activeUser || !sb()) return;
        if (!sofort && (document.hidden || (window.istHauptTab && !window.istHauptTab()))) return;
        if (!sofort && Date.now() - autoLetzte < AUTO_TAKT - 5000) return;
        autoLetzte = Date.now();
        const heute = isoTag(new Date());
        const bis = heute + 'T23:59:59';
        const c = sb();
        const q = p => p.then(r => (r.error ? [] : r.data || [])).catch(() => []);
        const [faelligeV, mitSchritten, termine, teilnahmen, angebote] = await Promise.all([
            q(c.from('internal_processes').select('id, title, remind_at, assigned_users, customer_id, status').neq('status', 'erledigt').not('remind_at', 'is', null).lte('remind_at', bis).limit(300)),
            q(c.from('internal_processes').select('id, title, assigned_users, customer_id, status, steps').neq('status', 'erledigt').contains('steps', JSON.stringify([{ done: false }])).limit(300)),
            q(c.from('maintenance_events').select('id, title, event_date, start_date, customer_id, created_by_user, machine_id, manual_machine, maintenance_types').or(`event_date.gte.${heute},start_date.gte.${heute}`).or(`event_date.lte.${bis},start_date.lte.${bis}`).limit(100)),
            q(c.from('event_participants').select('event_id, user_id, status').eq('user_id', window.activeUser.id).limit(300)),
            q(c.from('angebote').select('*').not('erinnerung', 'is', null).lte('erinnerung', heute).limit(200))
        ]);
        const neu = [];
        const prio = () => 'Heute unbedingt';
        faelligeV.forEach(p => {
            if (!(p.assigned_users || []).some(istMeins)) return;
            neu.push({ typLabel: 'Vorgang', title: p.title || 'Vorgang', targetType: 'process', targetId: p.id, customerId: p.customer_id || null,
                day: String(p.remind_at).slice(0, 10), datumText: wtDatum(p.remind_at), gruppe: prio(p.remind_at), auto: true,
                ki: String(p.remind_at).slice(0, 10) < heute ? 'Wiedervorlage überfällig' : 'Wiedervorlage heute' });
        });
        mitSchritten.forEach(p => (p.steps || []).forEach(st => {
            if (st.done || !st.remind_at || String(st.remind_at).slice(0, 10) > heute) return;
            const fuerMich = st.assigned_id != null || st.assigned_to ? (istMeins(st.assigned_id) || istMeins(st.assigned_to)) : (p.assigned_users || []).some(istMeins);
            if (!fuerMich) return;
            // Schritt hängt am Vorgang: ein Eintrag je Vorgang (gleicher Schlüssel), Text nennt den Schritt
            neu.push({ typLabel: 'Vorgang', title: p.title || 'Vorgang', subject: 'Schritt: ' + (st.text || ''), targetType: 'process', targetId: p.id, customerId: p.customer_id || null,
                day: String(st.remind_at).slice(0, 10), datumText: wtDatum(st.remind_at), gruppe: 'Heute unbedingt', auto: true,
                ki: String(st.remind_at).slice(0, 10) < heute ? 'Schritt-Erinnerung überfällig' : 'Schritt-Erinnerung heute' });
        }));
        const meineTermine = new Set(teilnahmen.filter(t => t.status !== 'declined').map(t => String(t.event_id)));
        termine.forEach(e => {
            const wann = e.event_date || e.start_date;
            if (!wann || String(wann).slice(0, 10) !== heute) return;
            if (!meineTermine.has(String(e.id)) && !istMeins(e.created_by_user)) return;
            const wartung = !!(e.machine_id || e.manual_machine || e.maintenance_types);
            neu.push({ typLabel: wartung ? 'Wartung' : 'Termin', title: e.title || 'Termin', targetType: 'event', targetId: e.id, customerId: e.customer_id || null,
                day: heute, datumText: wtDatum(wann), gruppe: 'Heute unbedingt', auto: true, ki: 'Termin heute' });
        });
        angebote.forEach(a => {
            if (a.erinnerung_by != null ? !istMeins(a.erinnerung_by) : true) return;   // nur eigene Erinnerungen
            if (/verloren|abgelehnt|absage|abgesagt|storniert|kein interesse|gewonnen|auftrag|bestellt|verkauft|angenommen|zusage/i.test(a.status || '')) return;
            neu.push({ typLabel: 'Angebot', title: 'Angebot ' + (a.belegnummer || '') + ' nachfassen', subject: ((a.customers && a.customers.name) || a.kundenmatchcode || '') + (a.status ? ' · ' + a.status : ''),
                targetType: 'angebot', targetId: a.id, customerId: a.customer_id || null, day: String(a.erinnerung).slice(0, 10), datumText: wtDatum(a.erinnerung),
                gruppe: 'Wichtig', auto: true, ki: 'Angebots-Erinnerung' });
        });
        if (!neu.length) return;
        const n = await window.todoUebernehmen(neu, { still: true });
        if (n && !document.body.classList.contains('todo-offen')) {
            const fab = document.getElementById('todo-fab');
            if (fab) { fab.classList.remove('todo-puls'); void fab.offsetWidth; fab.classList.add('todo-puls'); }
        }
    }
    window.todoAutoPruefen = () => autoPruefen(true);

    // ---------------------------------------------------------- Start
    function start() {
        if (!window.activeUser) return;
        aufbauen();
        autoAn(autoIstAn());
        laden().then(() => { zaehlerSetzen(); setTimeout(() => autoPruefen(false), 4000); });
        setInterval(() => autoPruefen(false), 60 * 1000);   // prüft nur alle 10 min wirklich (AUTO_TAKT)
        document.addEventListener('visibilitychange', () => { if (!document.hidden) autoPruefen(false); });
        document.addEventListener('haupttab:uebernommen', () => autoPruefen(false));
    }
    let versuche = 0;
    (function warten() {
        if (window.activeUser && window.supabaseClient) return start();
        if (++versuche < 120) setTimeout(warten, 1000);
    })();
})();
