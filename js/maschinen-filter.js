// ==========================================================
// FILTER-KATALOG (2026-10-23)
// Einstellungen -> Filter: je Filter OEM-Nr., Alternativnummern, Intervall (Stunden/Monate)
// und wofür er passt (Motortyp, Hersteller, Maschinentyp). Tabelle machine_filters.
// Anzeige: Maschinen-Zentrale, Reiter "Filter" (window.maschinenFilter.tabHtml).
// Noch nicht gebaut: "letzter Wechsel" / Anbindung an Wartungsprotokolle.
// ==========================================================
(function () {
    'use strict';

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sb = () => window.supabaseClient;
    const toast = (m, t) => (typeof window.showToast === 'function' ? window.showToast(m, t) : console.log(m));
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');


    let liste = null;      // geladener Katalog
    let geladenAm = 0;
    let bearb = null;      // gerade bearbeitete Zeile ({} = neu)

    async function laden(erzwingen) {
        if (liste && !erzwingen && Date.now() - geladenAm < 5 * 60 * 1000) return liste;
        const c = sb();
        if (!c) return liste || [];
        const { data, error } = await c.from('machine_filters').select('*').order('bezeichnung', { ascending: true });
        if (error) { geladenAm = Date.now(); console.warn('machine_filters:', error.message); toast('Filter-Katalog konnte nicht geladen werden (Migration supabase_add_maschinen_filter.sql ausgeführt?)', 'error'); return liste || []; }
        liste = data || [];
        geladenAm = Date.now();
        return liste;
    }

    const SCHUTZ = 'Schutzbelüftung';
    // Gruppen: gespeichert in machine_filters.gruppe, sonst aus der Art abgeleitet; Reihenfolge innerhalb über sortierung
    const GRUPPEN = ['Motor', 'Luftfilter', 'Hydraulik', 'Schutzbelüftung (optional)', 'Riemen', 'Sonstige'];
    const gruppeVon = f => {
        if (f.gruppe) return f.gruppe;
        const a = String(f.art || '');
        if (a === SCHUTZ) return GRUPPEN[3];
        if (/^Riemen/.test(a)) return 'Riemen';
        if (/^Luftfilter/.test(a)) return 'Luftfilter';
        if (/Hydraulik/.test(a)) return 'Hydraulik';
        if (/^(Ölfilter|Dieselfilter|Kraftstofffilter|Wasserfilter|Wasserabscheider)/.test(a)) return 'Motor';
        return 'Sonstige';
    };
    const gruppenRang = g => { const i = GRUPPEN.indexOf(g); return i < 0 ? 50 : i; };
    const nachGruppe = (a, b) => gruppenRang(gruppeVon(a)) - gruppenRang(gruppeVon(b)) || gruppeVon(a).localeCompare(gruppeVon(b), 'de')
        || (a.sortierung == null ? 1e9 : a.sortierung) - (b.sortierung == null ? 1e9 : b.sortierung) || String(a.bezeichnung).localeCompare(String(b.bezeichnung), 'de');
    const gruppenKopf = g => `<h3 class="mf-gruppen-kopf" data-mf-gruppe="${esc(g)}">${esc(g)}</h3>`;
    const arr = v => (Array.isArray(v) ? v : []).map(x => String(x || '').trim()).filter(Boolean);
    const kategorieName = m => ((window.categoryList || []).find(k => String(k.id) === String(m.category_id)) || {}).name || '';

    // Passt der Filter zur Maschine? Motortyp ist das Hauptkriterium; Hersteller/Maschinentyp schränken zusätzlich ein.
    function passt(f, m) {
        const motoren = arr(f.motor_typen);
        const hat = motoren.length || f.hersteller || f.maschinentyp;
        if (!hat) return false;
        if (motoren.length) {
            // Motor ist das Hauptkriterium: passt er, gilt der Filter — Hersteller/Maschinentyp werden dann NICHT mehr geprüft
            // (der Hersteller der Maschine ist oft ein anderer als der des Motors).
            const mm = norm(m.motor_type);
            const mw = woerter(m.motor_type);
            return !!mm && motoren.some(x => { const n = norm(x); const xw = woerter(x); return n.length >= 3 && (mm.includes(n) || n.includes(mm) || enthalten(xw, mw) || enthalten(mw, xw)); });
        }
        if (f.hersteller) { const h = norm(m.manufacturer); const n = norm(f.hersteller); if (!h || !(h.includes(n) || n.includes(h))) return false; }
        if (f.maschinentyp && norm(kategorieName(m)) !== norm(f.maschinentyp)) return false;
        return true;
    }
    const passende = m => (liste || []).filter(f => passt(f, m));

    const intervallText = f => {
        const t = [];
        if (f.intervall_stunden) t.push('alle ' + Number(f.intervall_stunden).toLocaleString('de-DE') + ' Betriebsstunden');
        if (f.intervall_monate) t.push(f.intervall_monate % 12 === 0 ? 'alle ' + (f.intervall_monate / 12) + (f.intervall_monate === 12 ? ' Jahr' : ' Jahre') : 'alle ' + f.intervall_monate + ' Monate');
        return t.length ? t.join(' oder ') + (t.length > 1 ? ' (was zuerst eintritt)' : '') : '';
    };

    // ---------------------------------------------------- Reiter in der Maschinen-Zentrale
    function tabHtml(m, neuZeichnen) {
        // Katalog frisch halten: nach 15 s beim Öffnen/Neuzeichnen neu holen (sonst fehlen gerade angelegte Filter); danach einmal neu zeichnen
        if (!liste || Date.now() - geladenAm > 15000) {
            const erst = !liste;
            laden(true).then(() => { if (typeof neuZeichnen === 'function') neuZeichnen(); });
            if (erst) return '<div class="mz-laedt">Lade …</div>';
        }
        const treffer = passende(m);
        const kopf = `<div class="mz-tab-kopf"><button type="button" class="knopf knopf--sekundaer knopf--klein" data-mf-einstellungen>Filter-Katalog öffnen</button></div>`;
        if (!treffer.length) {
            const hinweis = !m.motor_type ? 'Bei dieser Maschine ist noch kein Motortyp eingetragen (Reiter Daten → Bearbeiten). Die Filter werden vor allem über den Motortyp zugeordnet.'
                : 'Zu „' + m.motor_type + '“ ist im Katalog noch kein Filter hinterlegt.';
            return `<div class="mz-tab">${kopf}<p class="mz-leer mz-leer-gross">${esc(hinweis)}</p></div>`;
        }
        return `<div class="mz-tab">${kopf}
            <p class="mz-leer">${m.motor_type ? 'Motor: ' + esc(m.motor_type) + ' · ' : ''}${treffer.length} passende${treffer.length === 1 ? 'r' : ''} Filter</p>
            <div class="mf-liste">${[...treffer].sort(nachGruppe).map((f, i, l) => {
                const alt = arr(f.alternativen);
                const gruppe = i === 0 || gruppeVon(l[i - 1]) !== gruppeVon(f) ? gruppenKopf(gruppeVon(f)) : '';
                const iv = intervallText(f);
                return `${gruppe}<section class="mz-karte mf-karte">
                    <b class="mf-name">${esc(f.bezeichnung)}</b>
                    <dl class="mz-daten">
                        ${f.sage_artikelnr ? `<dt>Sage-Art.-Nr.</dt><dd><b>${esc(f.sage_artikelnr)}</b> <button type="button" class="mf-kopie" data-mf-kopie="${esc(f.sage_artikelnr)}" title="Nummer kopieren" aria-label="Nummer kopieren">⧉</button></dd>` : ''}
                        ${f.oem_nr ? `<dt>OEM-Nr.</dt><dd>${esc(f.oem_nr)} <button type="button" class="mf-kopie" data-mf-kopie="${esc(f.oem_nr)}" title="Nummer kopieren" aria-label="Nummer kopieren">⧉</button></dd>` : ''}
                        ${alt.map((a, i) => `<dt>Alternativ ${i + 1}</dt><dd>${esc(a)} <button type="button" class="mf-kopie" data-mf-kopie="${esc(a)}" title="Nummer kopieren" aria-label="Nummer kopieren">⧉</button></dd>`).join('')}
                        ${f.menge ? `<dt>Menge</dt><dd>${esc(f.menge)}</dd>` : ''}
                        ${iv ? `<dt>Intervall</dt><dd>${esc(iv)}</dd>` : ''}
                    </dl>
                    ${f.notiz ? `<small class="mz-notiz">📝 ${esc(f.notiz)}</small>` : ''}
                </section>`;
            }).join('')}</div>
        </div>`;
    }

    // ---------------------------------------------------- Einstellungen
    const $ = id => document.getElementById(id);

    let ansicht = 'motor';        // 'motor' = gruppiert nach Motortyp, 'liste' = flach
    const offeneGruppen = new Set();
    try { ansicht = localStorage.getItem('meetra_filter_ansicht') || ansicht; } catch (e) { /* egal */ }

    function zeileHtml(f, ohneMotor) {
        const wofuer = [ohneMotor ? '' : arr(f.motor_typen).join(', '), f.hersteller, f.maschinentyp].filter(Boolean).join(' · ');
        return `<button type="button" class="mf-zeile" data-mf-bearbeiten="${esc(f.id)}" data-mf-zid="${esc(f.id)}" draggable="true" title="Ziehen, um die Reihenfolge zu ändern">
            <span class="mf-z-haupt"><b>${esc(f.bezeichnung)}</b><small>${[f.sage_artikelnr ? esc(f.sage_artikelnr) : '', f.oem_nr ? 'OEM ' + esc(f.oem_nr) : '', arr(f.alternativen).length ? arr(f.alternativen).length + ' Alt.' : ''].filter(Boolean).join(' · ')}</small></span>
            <span class="mf-z-wofuer">${esc(wofuer) || '<i>nicht zugeordnet</i>'}</span>
            <span class="mf-z-iv">${esc(intervallText(f).replace('(was zuerst eintritt)', '').trim())}</span></button>`;
    }

    // Gruppen: Motorhersteller (erstes Wort, z. B. Deutz) -> Motortyp -> Filter. Ein Filter erscheint unter jedem seiner Motoren.
    function gruppenHtml(zeilen, suchend) {
        const herst = new Map();   // schlüssel -> { name, motoren: Map(normMotor -> { name, filter[] }) }
        const ohne = [];
        zeilen.forEach(f => {
            const motoren = arr(f.motor_typen);
            if (!motoren.length) { ohne.push(f); return; }
            motoren.forEach(mt => {
                const k = norm(mt.split(/\s+/)[0]);
                const h = herst.get(k) || { name: mt.split(/\s+/)[0], motoren: new Map() };
                herst.set(k, h);
                const mk = norm(mt);
                const m = h.motoren.get(mk) || { name: mt, filter: [] };
                h.motoren.set(mk, m);
                m.filter.push(f);
            });
        });
        const sortiert = [...herst.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, 'de'));
        const html = sortiert.map(([k, h]) => {
            const ms = [...h.motoren.values()].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
            const anz = new Set(ms.flatMap(m => m.filter.map(f => f.id))).size;
            const offen = suchend || offeneGruppen.has('h:' + k);
            return `<details class="mf-gruppe" data-mf-g="h:${esc(k)}" ${offen ? 'open' : ''}>
                <summary><b>${esc(h.name)}</b><small>${ms.length} Motor${ms.length === 1 ? '' : 'en'} · ${anz} Filter</small></summary>
                ${ms.map(m => `<div class="mf-motor" data-mf-m="${esc(m.name)}">
                    <div class="mf-motor-kopf"><h3>${esc(m.name)} <small>${m.filter.length} Filter</small></h3>
                        <span class="mf-motor-aktion"><button type="button" class="knopf knopf--text knopf--klein" data-mf-motor-neu="${esc(m.name)}">+ Filter für diesen Motor</button><button type="button" class="knopf knopf--text knopf--klein" data-mf-motor-umbenennen="${esc(m.name)}">Umbenennen</button></span></div>
                    ${[...m.filter].sort(nachGruppe).map((f, i, l) => (i === 0 || gruppeVon(l[i - 1]) !== gruppeVon(f) ? gruppenKopf(gruppeVon(f)) : '') + zeileHtml(f, true)).join('')}
                </div>`).join('')}
            </details>`;
        }).join('');
        const ohneHtml = ohne.length ? `<details class="mf-gruppe" data-mf-g="ohne" ${suchend || offeneGruppen.has('ohne') ? 'open' : ''}>
            <summary><b>Ohne Motor</b><small>${ohne.length} Filter — nur über Hersteller/Maschinentyp zugeordnet oder noch nicht zugeordnet</small></summary>
            <div class="mf-motor">${ohne.map(f => zeileHtml(f, false)).join('')}</div></details>` : '';
        return html + ohneHtml;
    }

    function zeichneListe() {
        const box = $('mf-liste'); if (!box) return;
        document.querySelectorAll('[data-mf-ansicht]').forEach(b => b.classList.toggle('an', b.dataset.mfAnsicht === ansicht));
        const such = norm(($('mf-suche') || {}).value);
        const zeilen = (liste || []).filter(f => !such || norm([f.bezeichnung, f.oem_nr, f.sage_artikelnr, arr(f.alternativen).join(' '), arr(f.motor_typen).join(' '), f.hersteller, f.maschinentyp].join(' ')).includes(such));
        if (!zeilen.length) { box.innerHTML = `<p class="mz-leer mz-leer-gross">${(liste || []).length ? 'Kein Treffer.' : 'Noch keine Filter angelegt. Mit „Neuer Filter“ anfangen.'}</p>`; return; }
        box.innerHTML = ansicht === 'motor' ? gruppenHtml(zeilen, !!such) : zeilen.map(f => zeileHtml(f, false)).join('');
    }

    async function motorUmbenennen(alt) {
        const neu = await window.appEingabe('Motortyp „' + alt + '“ in allen Filtern umbenennen in:', alt);
        if (neu == null || !String(neu).trim() || String(neu).trim() === alt) return;
        const betroffen = (liste || []).filter(f => arr(f.motor_typen).some(x => norm(x) === norm(alt)));
        for (const f of betroffen) {
            const mt = arr(f.motor_typen).map(x => norm(x) === norm(alt) ? String(neu).trim() : x);
            const { error } = await sb().from('machine_filters').update({ motor_typen: [...new Set(mt)], updated_at: new Date().toISOString() }).eq('id', f.id);
            if (error) { toast('Umbenennen fehlgeschlagen: ' + error.message, 'error'); break; }
        }
        toast(betroffen.length + ' Filter angepasst.', 'success');
        await laden(true); zeichneListe();
    }

    document.addEventListener('toggle', e => {
        const g = e.target && e.target.dataset && e.target.dataset.mfG; if (!g) return;
        if (e.target.open) offeneGruppen.add(g); else offeneGruppen.delete(g);
    }, true);
    document.addEventListener('click', e => {
        const a = e.target.closest('[data-mf-ansicht]');
        if (a) { ansicht = a.dataset.mfAnsicht; try { localStorage.setItem('meetra_filter_ansicht', ansicht); } catch (x) { /* egal */ } zeichneListe(); return; }
        const n = e.target.closest('[data-mf-motor-neu]'); if (n) { formularOeffnen({ motor_typen: [n.dataset.mfMotorNeu] }); return; }
        const u = e.target.closest('[data-mf-motor-umbenennen]'); if (u) motorUmbenennen(u.dataset.mfMotorUmbenennen);
    });

    // Ziehen: Reihenfolge und Gruppe je Motor ändern (Zeile auf Zeile oder Gruppenüberschrift)
    let zieh = null;
    const zielVon = e => e.target.closest && e.target.closest('[data-mf-zid],[data-mf-gruppe]');
    document.addEventListener('dragstart', e => { const z = e.target.closest && e.target.closest('[data-mf-zid]'); if (!z) return; zieh = z; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', z.dataset.mfZid); } catch (x) { /* egal */ } z.classList.add('mf-zieht'); });
    document.addEventListener('dragend', () => { if (zieh) zieh.classList.remove('mf-zieht'); zieh = null; document.querySelectorAll('.mf-ziel').forEach(x => x.classList.remove('mf-ziel')); });
    document.addEventListener('dragover', e => {
        if (!zieh) return; const z = zielVon(e);
        if (!z || z === zieh || z.closest('[data-mf-m]') !== zieh.closest('[data-mf-m]')) return;
        e.preventDefault(); document.querySelectorAll('.mf-ziel').forEach(x => x.classList.remove('mf-ziel')); z.classList.add('mf-ziel');
    });
    document.addEventListener('drop', async e => {
        if (!zieh) return; const z = zielVon(e); const cont = zieh.closest('[data-mf-m]');
        if (!z || z === zieh || !cont || z.closest('[data-mf-m]') !== cont) return;
        e.preventDefault();
        const r = z.getBoundingClientRect();
        if (z.dataset.mfGruppe !== undefined) z.after(zieh); else if (e.clientY > r.top + r.height / 2) z.after(zieh); else z.before(zieh);
        await reihenfolgeSpeichern(cont);
    });
    async function reihenfolgeSpeichern(cont) {
        let g = '', i = 0; const ops = [];
        [...cont.children].forEach(k => {
            if (k.dataset.mfGruppe !== undefined) { g = k.dataset.mfGruppe; return; }
            if (!k.dataset.mfZid) return;
            const f = (liste || []).find(x => String(x.id) === k.dataset.mfZid); i += 10;
            if (f && (f.sortierung !== i || gruppeVon(f) !== g)) ops.push({ id: f.id, gruppe: g, sortierung: i });
        });
        for (const o of ops) {
            const { error } = await sb().from('machine_filters').update({ gruppe: o.gruppe, sortierung: o.sortierung }).eq('id', o.id);
            if (error) { toast(/column|spalte/i.test(error.message) ? 'Reihenfolge speichern geht erst nach der Migration supabase_add_filter_gruppen.sql.' : 'Speichern fehlgeschlagen: ' + error.message, 'error'); break; }
        }
        await laden(true); zeichneListe();
    }
    document.addEventListener('change', async e => {
        const sel = e.target.closest && e.target.closest('[data-mf-gruppenwahl]'); if (!sel || sel.value !== '__neu__') return;
        const n = await window.appEingabe('Name der neuen Gruppe:', '');
        if (!n || !String(n).trim()) { sel.selectedIndex = 0; return; }
        const o = document.createElement('option'); o.value = o.textContent = String(n).trim(); sel.insertBefore(o, sel.lastElementChild); sel.value = o.value;
    });

    // Motortypen im Formular: antippen = auswählen (leuchtet), "+" legt einen neuen Typ an, Suchfeld grenzt die Auswahl ein
    let motorAuswahl = [];
    function motorWahlZeichnen() {
        const box = $('mf-motorwahl'); if (!box) return;
        const such = norm(box.dataset.such);
        const alleM = [...new Map([...(window.motorTypen ? window.motorTypen.alle() : []), ...motorAuswahl].map(t => [norm(t), t])).values()].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
        const sicht = alleM.filter(t => !such || norm(t).includes(such) || motorAuswahl.includes(t));
        box.innerHTML = `<span class="mf-motorwahl-titel">Passt zu Motortyp(en) <small>${motorAuswahl.length ? motorAuswahl.length + ' gewählt' : 'bitte antippen'}</small></span>
            <input type="hidden" name="motor_typen" value="${esc(motorAuswahl.join(', '))}">
            <input type="search" class="glass-form-input mf-motorsuche" data-mf-motorsuche placeholder="Motortyp suchen …" value="${esc(box.dataset.such || '')}" autocomplete="off">
            <div class="mf-chips">${sicht.map(t => `<button type="button" class="mf-chip${motorAuswahl.includes(t) ? ' an' : ''}" data-mf-motor="${esc(t)}" aria-pressed="${motorAuswahl.includes(t)}">${esc(t)}</button>`).join('')}
                <button type="button" class="mf-chip mf-chip-plus" data-mf-motor-plus title="Neuen Motortyp anlegen" aria-label="Neuen Motortyp anlegen">+ neu</button></div>`;
        if (box.dataset.fokus === '1') { const inp = box.querySelector('[data-mf-motorsuche]'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } }
    }

    function formularOeffnen(f) {
        bearb = f || {};
        const box = $('mf-form'); if (!box) return;
        const alt = arr(bearb.alternativen);
        const kats = (window.categoryList || []).map(k => k.name).filter(Boolean);
        box.hidden = false;
        const bekanntM = window.motorTypen ? window.motorTypen.alle() : [];
        motorAuswahl = arr(bearb.motor_typen).map(t => bekanntM.find(b => norm(b) === norm(t)) || t);
        box.innerHTML = `
        <form class="mf-formular" data-mf-form>
            <h2>${bearb.id ? 'Filter bearbeiten' : 'Neuer Filter'}</h2>
            <div class="mf-raster">
                <label class="mf-breit"><span>Bezeichnung *</span><input class="glass-form-input" name="bezeichnung" required value="${esc(bearb.bezeichnung)}" placeholder="z. B. Motorölfilter Deutz TCD 2012"></label>
                <label><span>Gruppe</span><select class="glass-form-input" name="gruppe" data-no-enhance data-mf-gruppenwahl>${[...new Set([...GRUPPEN, ...(liste || []).map(gruppeVon), bearb.gruppe].filter(Boolean))].map(g => `<option value="${esc(g)}" ${(bearb.id || bearb.gruppe) && g === gruppeVon(bearb) ? 'selected' : ''}>${esc(g)}</option>`).join('')}<option value="__neu__">+ Neue Gruppe …</option></select></label>
                <label><span>Menge je Wechsel</span><input class="glass-form-input" name="menge" value="${esc(bearb.menge)}" placeholder="z. B. 1 Stück"></label>
                <label><span>OEM-Nummer</span><input class="glass-form-input" name="oem_nr" value="${esc(bearb.oem_nr)}"></label>
                <label><span>Sage-Artikelnummer</span><input class="glass-form-input" name="sage_artikelnr" inputmode="numeric" maxlength="8" value="${esc(bearb.sage_artikelnr)}" placeholder="z. B. 00004545"></label>
                <label><span>Alternativnummer 1</span><input class="glass-form-input" name="alt0" value="${esc(alt[0])}" placeholder="z. B. Mann W 719/30"></label>
                <label><span>Alternativnummer 2</span><input class="glass-form-input" name="alt1" value="${esc(alt[1])}"></label>
                <label><span>Alternativnummer 3</span><input class="glass-form-input" name="alt2" value="${esc(alt[2])}"></label>
                <label><span>Intervall in Betriebsstunden</span><input class="glass-form-input" name="intervall_stunden" type="number" min="1" inputmode="numeric" value="${esc(bearb.intervall_stunden)}" placeholder="z. B. 500"></label>
                <label><span>Intervall in Monaten</span><input class="glass-form-input" name="intervall_monate" type="number" min="1" inputmode="numeric" value="${esc(bearb.intervall_monate)}" placeholder="z. B. 12"></label>
                <div class="mf-breit mf-motorwahl" id="mf-motorwahl"></div>
                <label><span>Hersteller (optional)</span><input class="glass-form-input" name="hersteller" value="${esc(bearb.hersteller)}" placeholder="leer = egal"></label>
                <label><span>Maschinentyp (optional)</span><select class="glass-form-input" name="maschinentyp" data-no-enhance><option value="">alle</option>${kats.map(k => `<option value="${esc(k)}" ${norm(k) === norm(bearb.maschinentyp) ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></label>
                <label class="mf-breit"><span>Notiz</span><textarea class="glass-form-input" name="notiz" rows="2">${esc(bearb.notiz)}</textarea></label>
            </div>
            <div class="fenster-fuss">
                ${bearb.id ? '<button type="button" class="knopf knopf--gefahr" data-mf-loeschen>Löschen</button>' : '<span></span>'}
                <span class="mf-fuss-rechts"><button type="button" class="knopf knopf--sekundaer" data-mf-abbrechen>Abbrechen</button><button type="submit" class="knopf knopf--primaer">Speichern</button></span>
            </div>
        </form>`;
        motorWahlZeichnen();
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        const erst = box.querySelector('[name="bezeichnung"]'); if (erst && !bearb.id) erst.focus();
    }

    function formularSchliessen() { bearb = null; const box = $('mf-form'); if (box) { box.hidden = true; box.innerHTML = ''; } }

    async function speichern(form) {
        const fd = new FormData(form);
        const t = k => String(fd.get(k) || '').trim();
        const zahl = k => { const n = parseInt(t(k), 10); return Number.isFinite(n) && n > 0 ? n : null; };
        const zeile = {
            bezeichnung: t('bezeichnung'), oem_nr: t('oem_nr') || null, sage_artikelnr: t('sage_artikelnr') || null,
            alternativen: ['alt0', 'alt1', 'alt2'].map(t).filter(Boolean),
            intervall_stunden: zahl('intervall_stunden'), intervall_monate: zahl('intervall_monate'),
            motor_typen: t('motor_typen').split(/[,;\n]/).map(s => s.trim()).filter(Boolean),
            hersteller: t('hersteller') || null, maschinentyp: t('maschinentyp') || null, menge: t('menge') || null, notiz: t('notiz') || null,
            updated_at: new Date().toISOString()
        };
        if ((liste || []).some(x => 'gruppe' in x)) zeile.gruppe = t('gruppe') && t('gruppe') !== '__neu__' ? t('gruppe') : null;
        if (!zeile.bezeichnung) { toast('Bitte eine Bezeichnung eintragen.'); return; }
        const c = sb();
        const q = bearb && bearb.id ? c.from('machine_filters').update(zeile).eq('id', bearb.id) : c.from('machine_filters').insert(zeile);
        const { error } = await q;
        if (error) { toast('Speichern fehlgeschlagen: ' + error.message, 'error'); return; }
        toast('Filter gespeichert.', 'success');
        formularSchliessen();
        await laden(true);
        zeichneListe();
    }

    async function loeschen() {
        if (!bearb || !bearb.id) return;
        const ja = await window.appFrage('Filter „' + (bearb.bezeichnung || '') + '“ löschen?', { gefahr: true, ja: 'Löschen', nein: 'Abbrechen' });
        if (!ja) return;
        const { error } = await sb().from('machine_filters').delete().eq('id', bearb.id);
        if (error) { toast('Löschen fehlgeschlagen: ' + error.message, 'error'); return; }
        formularSchliessen();
        await laden(true);
        zeichneListe();
    }

    window.filterEinstellungenRender = async function () {
        formularSchliessen();
        if (window.motorTypen) window.motorTypen.laden();
        const zone = $('mf-foto-zone');
        if (zone && !zone.firstChild && typeof window.uploadFeld === 'function') {
            window.uploadFeld(zone, { accept: 'image/*,application/pdf', multiple: true, kamera: true, nurZone: true, maxMB: 25,
                text: 'Foto oder PDF einer Filterliste hierher ziehen oder antippen — die KI liest alle Zeilen ein',
                onFiles: files => fotoEinlesen(files) });
        }
        const box = $('mf-liste'); if (box) box.innerHTML = '<p class="mz-leer mz-leer-gross">Lade …</p>';
        await laden(true);
        zeichneListe();
    };

    document.addEventListener('click', e => {
        const t = e.target;
        const neu = t.closest('[data-mf-neu]'); if (neu) return formularOeffnen(null);
        const be = t.closest('[data-mf-bearbeiten]'); if (be) return formularOeffnen((liste || []).find(f => String(f.id) === be.dataset.mfBearbeiten));
        if (t.closest('[data-mf-abbrechen]')) return formularSchliessen();
        if (t.closest('[data-mf-loeschen]')) return loeschen();
        const mo = t.closest('[data-mf-motor]');
        if (mo) {
            const t0 = mo.dataset.mfMotor;
            motorAuswahl = motorAuswahl.includes(t0) ? motorAuswahl.filter(x => x !== t0) : motorAuswahl.concat(t0);
            motorWahlZeichnen();
            return;
        }
        if (t.closest('[data-mf-motor-plus]')) {
            window.appEingabe('Neuer Motortyp (so schreiben, wie er künftig überall heißen soll):', '').then(async name => {
                if (name == null || !String(name).trim()) return;
                const t1 = window.motorTypen ? await window.motorTypen.hinzufuegen(name) : String(name).trim();
                if (t1 && !motorAuswahl.includes(t1)) motorAuswahl.push(t1);
                const b = $('mf-motorwahl'); if (b) b.dataset.such = '';
                motorWahlZeichnen();
            });
            return;
        }
        const ko = t.closest('[data-mf-kopie]');
        if (ko) {
            const txt = ko.dataset.mfKopie;
            (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Kopiert: ' + txt, 'success')).catch(() => toast('Kopieren nicht möglich.'));
            return;
        }
        if (t.closest('[data-mf-einstellungen]')) {
            if (typeof window.maschinenZentraleSchliessen === 'function') window.maschinenZentraleSchliessen();
            if (typeof window.switchView === 'function') window.switchView('settings-filter');
        }
    });
    document.addEventListener('submit', e => { if (e.target.matches && e.target.matches('[data-mf-form]')) { e.preventDefault(); speichern(e.target); } });
    document.addEventListener('input', e => {
        if (e.target && e.target.id === 'mf-suche') zeichneListe();
        if (e.target && e.target.matches && e.target.matches('[data-mf-motorsuche]')) { const b = $('mf-motorwahl'); b.dataset.such = e.target.value; b.dataset.fokus = '1'; motorWahlZeichnen(); b.dataset.fokus = ''; }
    });

    // ---------------------------------------------------- Import aus Foto (KI)
    // Foto(s) einer Filterliste -> Gemini liest alle Zeilen -> Vorschau (alles änderbar) -> gemeinsam speichern.
    // Alternativnummern, die nicht auf dem Foto stehen, ergänzt die KI aus ihrem Wissen: als "ungeprüft" markiert.
    const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';   // Name wird vom ki-proxy ersetzt (wie in ki-chat.js)
    let importZeilen = [];

    const PROMPT = 'Du liest Fotos von Filter-/Ersatzteillisten für Baumaschinen, Brecher, Siebe und Motoren (deutsch/englisch). ' +
        'Erfasse JEDE Zeile/Position, nichts auslassen, nichts erfinden. Überschriften wie Motortyp, Maschinentyp oder Hersteller gelten für alle Zeilen darunter und gehören in jede Zeile. ' +
        'Antworte NUR als JSON: {"filter":[{"bezeichnung":"","oem_nr":"","alt_foto":[],"alt_ki":[],"intervall_stunden":null,"intervall_monate":null,"motor_typen":[],"hersteller":"","maschinentyp":"","menge":"","notiz":""}]}. ' +
        'Regeln: bezeichnung = die Bezeichnung der Zeile so, wie sie auf der Liste steht, wobei die Filterart (z. B. Ölfilter, Harnstofffilter/AdBlue, Kraftstofffilter, Luftfilter, Hydraulikfilter, Kabinenfilter) in der Bezeichnung stehen muss; Art NICHT raten oder umbenennen, wenn sie auf der Liste anders heißt. ' +
        'oem_nr = Herstellernummer des Motor-/Maschinenherstellers, exakt abgeschrieben (Ziffern/Buchstaben genau prüfen). alt_foto = weitere Nummern, die auf dem Foto stehen. ' +
        'alt_ki = bis zu 3 bekannte Querverweise (Mann, Hengst, Donaldson, Fleetguard, Baldwin u. a.), die du sicher aus deinem Wissen kennst; im Zweifel leer lassen, keine Nummern raten. ' +
        'Intervalle nur als Zahl (Betriebsstunden bzw. Monate; 1 Jahr = 12), sonst null. motor_typen als Liste (z. B. ["Deutz TCD 2012"]). Unleserliches mit [?] kennzeichnen. Leere Felder = "" bzw. [].';

    function verkleinern(file, max) {
        return new Promise((res, rej) => {
            const r = new FileReader();
            r.onerror = rej;
            r.onload = () => {
                const img = new Image();
                img.onerror = rej;
                img.onload = () => {
                    const f = Math.min(1, max / Math.max(img.width, img.height));
                    const c = document.createElement('canvas');
                    c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
                    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                    res(c.toDataURL('image/jpeg', 0.85));
                };
                img.src = r.result;
            };
            r.readAsDataURL(file);
        });
    }

    // PDF (Teilekatalog/Wartungsplan als Datei): die ersten Seiten als Bilder, damit auch Scans gelesen werden
    async function pdfSeiten(file, max) {
        if (!window.pdfjsLib && window.loadPDFReader) await window.loadPDFReader();
        if (!window.pdfjsLib) throw new Error('PDF-Leser nicht geladen.');
        const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        const out = [];
        for (let n = 1; n <= Math.min(pdf.numPages, Math.max(1, max)); n++) {
            const pg = await pdf.getPage(n), v = pg.getViewport({ scale: 1.8 });
            const c = document.createElement('canvas'); c.width = v.width; c.height = v.height;
            await pg.render({ canvasContext: c.getContext('2d'), viewport: v }).promise;
            out.push(c.toDataURL('image/jpeg', 0.8));
        }
        return out;
    }

    // JSON tolerant lesen; bei abgeschnittener Antwort die vollständigen Zeilen retten
    function jsonLesen(roh) {
        const t = String(roh || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
        try { return JSON.parse(t); } catch (e) { /* unten */ }
        const a = t.indexOf('['); const z = t.lastIndexOf('}');
        if (a < 0 || z < a) return null;
        try { return { filter: JSON.parse(t.slice(a, z + 1) + ']') }; } catch (e) { return null; }
    }

    // Bekannte Motortypen: aus den Maschinen und aus bereits angelegten Filtern (Schreibweise der Maschine hat Vorrang)
    function bekannteMotoren() {
        if (window.motorTypen) return window.motorTypen.alle();
        const m = new Map();
        (window.machineList || []).forEach(x => { const t = String(x.motor_type || '').trim(); if (t && !m.has(norm(t))) m.set(norm(t), t); });
        (liste || []).forEach(f => arr(f.motor_typen).forEach(t => { if (!m.has(norm(t))) m.set(norm(t), t); }));
        return [...m.values()].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
    }
    // Von der KI gelesenen Motortyp ZUERST mit den vorhandenen abgleichen und deren Schreibweise nehmen.
    // 1) gleich (ohne Leerzeichen/Bindestriche/Groß-Klein)  2) alle gelesenen Wörter kommen in genau einem bekannten vor ("Deutz 2.9" -> "Deutz TCD 2.9 L4")
    // 3) umgekehrt: alle Wörter eines bekannten stehen im gelesenen Text ("Deutz TCD 2.9 L4 Stufe V" -> "Deutz TCD 2.9 L4")
    const FUELLWORT = new Set(['motor', 'engine', 'typ', 'type', 'mit', 'und', 'fuer', 'für', 'for', 'bei']);
    const woerter = t => String(t || '').toLowerCase().replace(/([a-zäöüß])(\d)/g, '$1 $2').replace(/(\d)([a-zäöüß])/g, '$1 $2').split(/[\s\-_/,;()]+/).map(w => w.replace(/[^a-z0-9äöüß.]/g, '').replace(/^\.+|\.+$/g, '')).filter(w => w && !FUELLWORT.has(w));
    const wortGleich = (x, y) => x === y;
    const enthalten = (klein, gross) => klein.length > 0 && klein.every(k => gross.some(g => wortGleich(k, g)));
    function motorAnpassen(text, bekannt) {
        const n = norm(text); if (!n) return text;
        const gleich = bekannt.find(b => norm(b) === n); if (gleich) return gleich;
        const w = woerter(text);
        if (!w.some(x => /\d/.test(x))) return text;                     // ohne Zahl (nur "Deutz") nicht raten
        const beste = liste2 => {
            if (!liste2.length) return null;
            const rang = liste2.map(b => ({ b, extra: Math.abs(woerter(b).length - w.length) })).sort((p, q) => p.extra - q.extra);
            return rang.length === 1 || rang[0].extra < rang[1].extra ? rang[0].b : null;
        };
        const vor = beste(bekannt.filter(b => enthalten(w, woerter(b))));
        if (vor) return vor;
        const rueck = beste(bekannt.filter(b => { const bw = woerter(b); return bw.length >= 2 && bw.some(x => /\d/.test(x)) && enthalten(bw, w); }));
        return rueck || text;
    }

    function importStatus(text) { const b = $('mf-import'); if (b) { b.hidden = false; b.innerHTML = `<p class="mz-leer mz-leer-gross">${esc(text)}</p>`; } }

    async function fotoEinlesen(files) {
        const bilder = [...files].filter(f => /^image\//.test(f.type) || /pdf/i.test(f.type)).slice(0, 6);
        if (!bilder.length) return;
        if (typeof window.groqFetch !== 'function') { toast('KI nicht verfügbar.', 'error'); return; }
        formularSchliessen();
        importStatus('Foto wird gelesen … bei langen Listen dauert das etwa eine halbe Minute.');
        try {
            const bekannt = bekannteMotoren();
            const urls = [];
            for (const f of bilder) { if (/pdf/i.test(f.type)) urls.push(...await pdfSeiten(f, 6 - urls.length)); else urls.push(await verkleinern(f, 2200)); if (urls.length >= 6) break; }
            const content = [{ type: 'text', text: 'Lies alle Filter aus diesen ' + urls.length + ' Foto(s).' }].concat(urls.map(u => ({ type: 'image_url', image_url: { url: u } })));
            const payload = { model: VISION_MODEL, temperature: 0.1, max_tokens: 8192, response_format: { type: 'json_object' },
                messages: [{ role: 'system', content: PROMPT + (bekannt.length ? ' BEKANNTE MOTORTYPEN (aus der Maschinenliste): ' + bekannt.slice(0, 200).join(' | ') + '. Gehört eine Zeile erkennbar zu einem dieser Motoren (auch bei abweichender Schreibweise, Leerzeichen, Zusatz wie L4), schreibe in motor_typen GENAU diese bekannte Schreibweise. Nur wenn kein bekannter Motor passt, den Text vom Foto verwenden.' : '') }, { role: 'user', content }] };
            const resp = await window.groqFetch(payload);
            let j = null; try { j = await resp.json(); } catch (e) { /* unten */ }
            if (!resp.ok) throw new Error((j && j.error && (j.error.message || j.error)) || ('KI-Fehler ' + resp.status));
            const out = jsonLesen(j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content);
            const rows = out && Array.isArray(out.filter) ? out.filter : [];
            if (!rows.length) throw new Error('Keine Filter erkannt. Foto näher/schärfer aufnehmen oder in Teilen fotografieren.');
            const vorhanden = new Set((liste || []).map(f => norm(f.oem_nr)).filter(Boolean));
            importZeilen = rows.map(r => {
                const foto = arr(r.alt_foto);
                const ki = arr(r.alt_ki).filter(x => !foto.some(y => norm(y) === norm(x))).slice(0, Math.max(0, 3 - foto.length));
                const doppelt = !!norm(r.oem_nr) && vorhanden.has(norm(r.oem_nr));
                return { an: !doppelt, doppelt, bezeichnung: String(r.bezeichnung || '').trim(), oem_nr: String(r.oem_nr || '').trim(),
                    alt: foto.slice(0, 3).map(t => ({ t, ki: false })).concat(ki.map(t => ({ t, ki: true }))).slice(0, 3),
                    std: Number(r.intervall_stunden) > 0 ? Math.round(r.intervall_stunden) : '', mon: Number(r.intervall_monate) > 0 ? Math.round(r.intervall_monate) : '',
                    motor: [...new Set(arr(r.motor_typen).map(t => motorAnpassen(t, bekannt)))].join(', '), hersteller: String(r.hersteller || '').trim(), maschinentyp: String(r.maschinentyp || '').trim(),
                    menge: String(r.menge || '').trim(), notiz: String(r.notiz || '').trim() };
            }).filter(z => z.bezeichnung || z.oem_nr);
            importZeichnen();
        } catch (e) {
            const b = $('mf-import'); if (b) { b.hidden = true; b.innerHTML = ''; }
            toast('Foto einlesen fehlgeschlagen: ' + (e.message || e), 'error');
        }
    }

    function importZeichnen() {
        const b = $('mf-import'); if (!b) return;
        const n = importZeilen.filter(z => z.an).length;
        b.hidden = false;
        b.innerHTML = `<div class="mf-import">
            <h2>${importZeilen.length} Zeilen erkannt</h2>
            <p class="mf-hinweis">Bitte prüfen, besonders die Nummern. <span class="mf-ki-marke">Orange</span> = Alternativnummer als KI-Vorschlag aus dem Wissen der KI, nicht auf dem Foto und <b>ungeprüft</b>. Alles lässt sich ändern.</p>
            <div class="mf-imp-liste">${importZeilen.map((z, i) => `
                <div class="mf-imp-zeile${z.an ? '' : ' aus'}" data-i="${i}">
                    <label class="mf-imp-an"><input type="checkbox" data-mf-i="an" ${z.an ? 'checked' : ''}><span>${z.doppelt ? 'schon im Katalog (OEM-Nr.)' : 'übernehmen'}</span></label>
                    <input class="glass-form-input mf-breit" data-mf-i="bezeichnung" value="${esc(z.bezeichnung)}" placeholder="Bezeichnung">
                    <input class="glass-form-input" data-mf-i="oem_nr" value="${esc(z.oem_nr)}" placeholder="OEM-Nr.">
                    ${[0, 1, 2].map(k => `<input class="glass-form-input${z.alt[k] && z.alt[k].ki ? ' mf-ki' : ''}" data-mf-i="alt${k}" value="${esc(z.alt[k] ? z.alt[k].t : '')}" placeholder="Alternativ ${k + 1}" ${z.alt[k] && z.alt[k].ki ? 'title="KI-Vorschlag, ungeprüft"' : ''}>`).join('')}
                    <input class="glass-form-input" data-mf-i="std" type="number" min="1" value="${esc(z.std)}" placeholder="Std">
                    <input class="glass-form-input" data-mf-i="mon" type="number" min="1" value="${esc(z.mon)}" placeholder="Monate">
                    <input class="glass-form-input mf-breit" data-mf-i="motor" value="${esc(z.motor)}" placeholder="Motortyp(en), Komma getrennt">
                    <input class="glass-form-input" data-mf-i="hersteller" value="${esc(z.hersteller)}" placeholder="Hersteller">
                    <input class="glass-form-input" data-mf-i="maschinentyp" value="${esc(z.maschinentyp)}" placeholder="Maschinentyp">
                </div>`).join('')}</div>
            <div class="fenster-fuss"><span></span><span class="mf-fuss-rechts"><button type="button" class="knopf knopf--sekundaer" data-mf-imp-abbruch>Verwerfen</button><button type="button" class="knopf knopf--primaer" data-mf-imp-speichern>${n} Filter speichern</button></span></div>
        </div>`;
        b.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    async function importSpeichern() {
        const kats = (window.categoryList || []).map(k => k.name).filter(Boolean);
        const zeilen = importZeilen.filter(z => z.an && (z.bezeichnung || z.oem_nr)).map(z => {
            const kat = kats.find(k => norm(k) === norm(z.maschinentyp));
            const kiNr = z.alt.filter(a => a.ki && a.t);
            const notiz = [z.notiz, z.maschinentyp && !kat ? 'Maschinentyp laut Liste: ' + z.maschinentyp : '', kiNr.length ? 'Alternativnummern teils KI-Vorschlag, ungeprüft: ' + kiNr.map(a => a.t).join(', ') : ''].filter(Boolean).join(' · ');
            return { bezeichnung: z.bezeichnung || z.oem_nr, oem_nr: z.oem_nr || null, alternativen: z.alt.map(a => a.t.trim()).filter(Boolean),
                intervall_stunden: Number(z.std) > 0 ? Math.round(z.std) : null, intervall_monate: Number(z.mon) > 0 ? Math.round(z.mon) : null,
                motor_typen: String(z.motor || '').split(/[,;\n]/).map(s => s.trim()).filter(Boolean), hersteller: z.hersteller || null, maschinentyp: kat || null,
                menge: z.menge || null, notiz: notiz || null };
        });
        if (!zeilen.length) { toast('Nichts ausgewählt.'); return; }
        const { error } = await sb().from('machine_filters').insert(zeilen);
        if (error) { toast('Speichern fehlgeschlagen: ' + error.message, 'error'); return; }
        toast(zeilen.length + ' Filter gespeichert.', 'success');
        importZeilen = [];
        const b = $('mf-import'); if (b) { b.hidden = true; b.innerHTML = ''; }
        await laden(true);
        zeichneListe();
    }

    document.addEventListener('click', e => {
        const t = e.target;
        if (t.closest('[data-mf-imp-abbruch]')) { importZeilen = []; const b = $('mf-import'); if (b) { b.hidden = true; b.innerHTML = ''; } return; }
        if (t.closest('[data-mf-imp-speichern]')) importSpeichern();
    });
    document.addEventListener('change', e => {
        const t = e.target;
        const feld = t.dataset && t.dataset.mfI; if (!feld) return;
        const zeile = t.closest('[data-i]'); const z = zeile && importZeilen[+zeile.dataset.i]; if (!z) return;
        if (feld === 'an') { z.an = t.checked; zeile.classList.toggle('aus', !z.an); const b = document.querySelector('[data-mf-imp-speichern]'); if (b) b.textContent = importZeilen.filter(x => x.an).length + ' Filter speichern'; }
        else if (/^alt\d$/.test(feld)) { const k = +feld[3]; z.alt[k] = { t: t.value, ki: false }; t.classList.remove('mf-ki'); t.removeAttribute('title'); }   // von Hand geändert = nicht mehr KI-Vorschlag
        else z[feld] = t.value;
    });

    window.maschinenFilter = { katalog: () => liste || [], laden, passende, tabHtml, intervallText };
})();
