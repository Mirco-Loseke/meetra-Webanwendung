// =============================================================================
//  KI-Index technischer Dokumente (2026-10-28)
// =============================================================================
//  Betriebsanleitung, Elektro-/Hydraulikplan, Ersatzteilkatalog … (auch Scans)
//  werden Seite für Seite von Gemini gelesen (über window.groqFetch → ki-proxy):
//    - Text je Seite  → dokument_seiten   (Grundlage für Fragen im KI-Chat)
//    - Fakten         → dokument_fakten   (Füllmenge, Gewicht, Intervall … mit Variante + Quellseite)
//    - Status         → dokument_index    (fertig / pausiert / abgelehnt …; Fortsetzen nach Abbruch)
//  DATENSCHUTZ: nur Dokumente aus der Positivliste (erlaubt()) werden angefasst — nie Serviceberichte,
//  Mietvereinbarungen, Protokolle, Rechnungen, Mails. Zusätzlich muss die KI das Dokument beim ersten
//  Lesen als technisch einstufen und „keine Kundendaten“ bestätigen, sonst wird nichts gespeichert.
//  Gefragt wird nicht hier, sondern im KI-Chat: ki-auswertung.js → Abfrage „technische_daten“.
//  window.dokIndex = { erlaubt, knopfHtml, blockHtml, einlesen, technischeDaten }
//  Migration: supabase/migrationen/supabase_add_dokument_index.sql
// =============================================================================
(function () {
    'use strict';

    const sb = () => window.supabaseClient;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ── Positivliste: nur technische Dokumente ─────────────────────────────
    const ERLAUBT_RE = /anleitung|handbuch|manual|bedien|betriebs|katalog|ersatzteil|schaltplan|elektro|hydraulik|pneumatik|st[üu]ckliste|wartungsplan|schmier|datenblatt|technisch/i;
    const GESPERRT_RE = /service|bericht|miet|protokoll|rechnung|angebot|vertrag|mail|kunde|lieferschein|[üu]bergabe|einweisung|auftrag|zahlung|beleg|abnahme|eingang/i;
    const TYPEN_OK = ['betriebsanleitung', 'elektroplan', 'hydraulikplan', 'ersatzteilkatalog', 'wartungsplan', 'datenblatt', 'prospekt'];
    // Fakten-Arten, die aus dem Seitentext gezielt gelesen werden (eigene Karten im Reiter „Daten“, nicht in der Prüf-Liste)
    const STAMM = ['Wartung', 'Betriebsstoff-Menge', 'Betriebsstoff-Sorte', 'Abmessung', 'Gesamtgewicht'];
    const BLOCK = 4;         // Seiten je KI-Aufruf (gemessen: ~4.600 Eingangs-Token, 1.300–3.100 Ausgang)
    const STOP = new Set('wie viel viele ist sind der die das den dem des und oder mit von für bei auf aus ein eine hat hast haben braucht brauche maschine welche welcher welches wann was'.split(' '));

    function erlaubt(d) {
        if (!d || !d.url) return false;
        const mime = String(d.mime_type || ''), name = String(d.name || '');
        if (!/pdf|image\//i.test(mime) && !/\.(pdf|jpe?g|png|webp)$/i.test(name)) return false;
        const kat = String(d.category || '');
        if (GESPERRT_RE.test(kat) || GESPERRT_RE.test(name)) return false;
        // Kategorie zuerst; fehlt sie, entscheidet der Dateiname
        return ERLAUBT_RE.test(kat || name);
    }

    // ── Status je Dokument (Cache) ─────────────────────────────────────────
    const status = new Map();      // document_id → Zeile aus dokument_index
    const laufend = new Map();     // document_id → { text } während des Einlesens
    let redraw = null;

    async function statusLaden(ids) {
        const neu = ids.filter(i => !status.has(i));
        if (!neu.length) return;
        const { data, error } = await sb().from('dokument_index').select('*').in('document_id', neu);
        if (error) { neu.forEach(i => status.set(i, null)); return; }   // Tabelle fehlt → still ohne Knopf-Status
        neu.forEach(i => status.set(i, null));
        (data || []).forEach(z => status.set(String(z.document_id), z));
    }

    // ── Anzeige in der Maschinen-Zentrale ──────────────────────────────────
    function knopfHtml(d) {
        if (!erlaubt(d)) return '';
        const id = String(d.id), s = status.get(id), l = laufend.get(id);
        if (l) return `<span class="di-status di-laeuft">${esc(l.text)}</span>`;
        if (s && s.status === 'fertig') return `<span class="di-status di-fertig" title="Für die KI eingelesen: ${s.seiten} Seiten">✓ KI kennt ${s.seiten} S.</span>`;
        const text = s && (s.status === 'pausiert' || s.status === 'fehler') ? 'Fortsetzen (ab S. ' + s.naechste_seite + ')' : s && s.status === 'abgelehnt' ? 'Abgelehnt' : 'Für KI einlesen';
        if (s && s.status === 'abgelehnt') return `<span class="di-status di-abgelehnt" title="${esc(s.grund || '')}">Nicht eingelesen</span>`;
        return `<button type="button" class="knopf knopf--ki knopf--klein" data-dokidx="einlesen" data-id="${esc(id)}" data-doc="${esc(JSON.stringify({ id, name: d.name, url: d.url, category: d.category, mime_type: d.mime_type }))}">${esc(text)}</button>`;
    }

    // Fakten-Karte unter „Technische Dokumente“ (lädt selbst nach, zeichnet über redrawFn neu)
    const fakten = { key: '', liste: [], laedt: false, alle: false, offen: false };
    function blockHtml(m, docs, redrawFn) {
        redraw = redrawFn || redraw;
        const ok = (docs || []).filter(erlaubt);
        if (!ok.length) return '';
        const ids = ok.map(d => String(d.id));
        const key = ids.join(',');
        if (!ids.every(i => status.has(i))) { statusLaden(ids).then(() => redraw && redraw()); return ''; }
        if (fakten.key !== key && !fakten.laedt) {
            fakten.laedt = true; fakten.key = key;
            sb().from('dokument_fakten').select('*').in('document_id', ids).neq('status', 'verworfen').not('schluessel', 'in', '(' + STAMM.map(s => '"' + s + '"').join(',') + ')').order('seite', { ascending: true }).limit(2000)
                .then(r => { fakten.liste = r.error ? [] : r.data || []; fakten.laedt = false; redraw && redraw(); }, () => { fakten.laedt = false; });
        }
        if (fakten.key !== key || !fakten.liste.length) return '';
        const name = id => (ok.find(d => String(d.id) === String(id)) || {}).name || 'Dokument';
        const zeigen = fakten.alle ? fakten.liste : fakten.liste.slice(0, 12);
        // Eingeklappt und ganz unten — die Daten selbst stehen im Reiter „Daten“; hier nur zum Nachsehen/Aussortieren
        return `<details class="di-karte"${fakten.offen ? ' open' : ''} ontoggle="window.dokIndex.offen(this.open)">
            <summary>Aus Dokumenten gelesene Angaben <small>${fakten.liste.length}</small></summary>
            ${zeigen.map(f => `<div class="di-fakt${f.status === 'bestaetigt' ? ' di-ok' : ''}">
                <div><b>${esc(f.schluessel)}</b>: ${esc(f.wert)}${f.einheit ? ' ' + esc(f.einheit) : ''}${f.variante ? ` <em>${esc(f.variante)}</em>` : ''}
                    <small>${esc(name(f.document_id))}${f.seite ? ', S. ' + f.seite : ''}</small></div>
                <span>${f.status === 'bestaetigt' ? '<i title="bestätigt">✓</i>' : `<button type="button" class="knopf knopf--text knopf--klein" data-dokidx="bestaetigen" data-id="${esc(f.id)}" title="Stimmt">✓</button>`}
                    <button type="button" class="knopf knopf--text knopf--klein" data-dokidx="verwerfen" data-id="${esc(f.id)}" title="Falsch — entfernen">✕</button></span></div>`).join('')}
            ${fakten.liste.length > 12 ? `<button type="button" class="knopf knopf--text knopf--klein" data-dokidx="alle">${fakten.alle ? 'Weniger anzeigen' : 'Alle ' + fakten.liste.length + ' anzeigen'}</button>` : ''}
        </details>`;
    }

    // ── Reiter „Daten“: die wichtigsten technischen Angaben aus den Dokumenten ─────────────
    // Gruppiert nach Stichwörtern im Fakt-Namen; nur Anzeige, keine Prüfpflicht (Hinweis „von der KI gelesen“ klein darunter).
    const datenCache = new Map();   // Maschinen-ID → { zeit, html, laedt }
    const BETRIEBSSTOFF = /[öo]e?l\b|[öo]l|kraftstoff|diesel|k[üu]hl|k[äa]lte|adblue|harnstoff|wasser|fett|hydraul|getriebe|motor|tank/i;
    const MENGE_L = f => /(^|\s)(l|liter)(\s|$|\b)/i.test((f.einheit || '') + ' ' + f.wert);
    const GRUPPEN = [
        ['Abmessungen & Gewicht', f => /l[äa]nge|breite|h[öo]he|abmessung|transport|arbeits|gewicht|masse|durchmesser|abwurfh/i.test(f.schluessel) && !/kassette|welle|band|trichter|sieb/i.test(f.schluessel) && /\b(mm|cm|m|kg|t)\b/i.test((f.einheit || '') + ' ' + f.wert)],
        ['Füllmengen', f => /fassung|f[üu]llmenge|f[üu]llvolumen|tankinhalt|tankvolumen|inhalt|volumen/i.test(f.schluessel) && !/f[üu]llgrad|trichter/i.test(f.schluessel) && BETRIEBSSTOFF.test(f.schluessel) && MENGE_L(f)],
        ['Öle & Betriebsstoffe', f => /sorte|werkseitig|viskosit|spezifikation|leistungsklasse/i.test(f.schluessel) && BETRIEBSSTOFF.test(f.schluessel)],
        ['Leistung & Antrieb', f => /^(motor)?leistung|nennleistung|drehzahl|durchsatz|drehmoment/i.test(f.schluessel) && !/klasse|[öo]lb|[öo]l[a-z]*sorte/i.test(f.schluessel)]
    ];
    const dedup = liste => { const g = new Set(); return liste.filter(f => { const k = [f.schluessel, f.variante, f.wert].map(norm).join('|'); if (g.has(k)) return false; g.add(k); return true; }); };
    function wertText(f) { const e = f.einheit && !String(f.wert).toLowerCase().includes(String(f.einheit).toLowerCase()) ? ' ' + f.einheit : ''; return f.wert + e; }

    // Wartungsplan laut Anleitung: Fakten mit schluessel 'Wartung' — variante = Intervall (z. B. „Alle 500 Stunden“),
    // wert = „Baugruppe — Tätigkeit“, einheit = Stunden als Zahl (nur zum Sortieren), seite = Quelle.
    function wartungsplanHtml(liste) {
        if (!liste.length) return '';
        const je = new Map();
        liste.forEach(f => { const k = f.variante || 'Sonstige'; if (!je.has(k)) je.set(k, { h: parseFloat(f.einheit), eintraege: [] }); je.get(k).eintraege.push(f); });
        // Reihenfolge aus dem Intervall-Text (die KI-Zahl ist bei „Jahre“ oft 0): täglich/bei Bedarf zuerst, dann Stunden, dann Jahre/Monate
        const ZAHLWORT = { ein: 1, eins: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, 'fünf': 5, sechs: 6 };
        const stunden = (titel, h) => {
            const l = titel.toLowerCase(), z = (l.match(/\d+/g) || []).map(Number);
            if (/täglich|arbeitsbeginn|bei bedarf|schmierplan/.test(l)) return 0;
            if (/stunden/.test(l) && z.length) return Math.min(...z);
            const w = Object.keys(ZAHLWORT).find(k => new RegExp('\\b' + k + '\\b').test(l));
            const n = z[0] || (w ? ZAHLWORT[w] : 1);
            if (/jahr/.test(l)) return n * 8760;
            if (/monat/.test(l)) return n * 720;
            return isNaN(h) ? 1e9 : h;
        };
        const reihe = [...je.entries()].sort((a, b) => stunden(a[0], a[1].h) - stunden(b[0], b[1].h));
        return `<section class="mz-karte di-plan"><h3>Wartungsplan laut Anleitung</h3>${reihe.map(([titel, g]) => `<h4>${esc(titel)}</h4><ul>${dedup(g.eintraege).map(f => {
            const i = String(f.wert).indexOf(' — ');
            return `<li title="Seite ${esc(f.seite || '')}">${i > 0 ? `<b>${esc(f.wert.slice(0, i))}</b> — ${esc(f.wert.slice(i + 3))}` : esc(f.wert)}</li>`;
        }).join('')}</ul>`).join('')}<p class="di-hinweis">Von der KI aus der Betriebsanleitung gelesen (Seitenangabe beim Darüberfahren).</p></section>`;
    }
    const wartungsplanKarte = m => { const c = datenCache.get(m.id); return c && c.plan ? c.plan : ''; };

    // Wartungsseiten (Abschnitte „Wartung nach/alle … Stunden“, Wartungsplan der Betriebsstoffe) aus dem schon gespeicherten
    // Seitentext lesen — nur Text, kein Bild, 1–2 kurze KI-Aufrufe. Läuft nach dem Einlesen; einzeln nachholbar.
    async function wartungsplanLesen(docId, melde) {
        const { data, error } = await sb().from('dokument_seiten').select('seite, text').eq('document_id', docId).order('seite').limit(1000);
        if (error || !data || !data.length) return 0;
        const kopf = s => String(s.text || '').split('\n').slice(0, 3).join(' ');
        const treffer = data.filter(s => /^\s*(ARJES IMPAKTOR\s+)?Wartung\b/i.test(String(s.text || '')) && /Wartungsplan der Betriebsstoffe|Einmalige Wartung|Wartung (nach|alle)|T[äa]gliche Wartung|Baugruppe\s*\|\s*T[äa]tigkeit/i.test(s.text || '')).map(s => s.seite);
        if (!treffer.length) return 0;
        const sortiert = [...new Set(treffer)].sort((x, y) => x - y);
        // Inhaltsverzeichnis (Seite 5) und Nachweisformulare am Ende liegen weit weg: nur den zusammenhängenden Block nehmen, der mit „Wartung“ beginnt
        let blocks = [], akt = [sortiert[0]];
        sortiert.slice(1).forEach(x => { if (x - akt[akt.length - 1] <= 2) akt.push(x); else { blocks.push(akt); akt = [x]; } });
        blocks.push(akt);
        const block = blocks.filter(bl => bl.length >= 2).sort((x, y) => y.length - x.length)[0] || blocks[0];
        const von = Math.min(...block), bis = Math.min(Math.max(...block), von + 29);
        const seiten = data.filter(s => s.seite >= von && s.seite <= bis);
        const PROMPT_W = `Das ist der Wartungsteil einer Betriebsanleitung (Text je Seite). Liste ALLE planmäßigen Wartungsarbeiten nach Intervall auf. Antworte NUR mit JSON:
{"plan":[{"intervall":"z. B. Täglich vor Arbeitsbeginn | Einmalig nach 16 Stunden | Nach 100 Stunden oder einem Monat | Alle 500 Stunden oder halbjährlich","stunden":Zahl der kleinsten Stundenangabe (täglich/vor jedem Start = 0, sonst die Stunden),"baugruppe":"z. B. Motor, Getriebe, Hydraulik","taetigkeit":"kurz, in einem Satz, wie in der Anleitung","seite":N}]}
Nur Planwerte aus Tabellen mit Intervallen (Betriebsstoff-Wechselfristen mit aufnehmen). Keine Beispiele aus Nachweisformularen, keine Anleitungen zur Durchführung. Nichts erfinden.`;
        const alle = [];
        for (let i = 0; i < seiten.length; i += 3) {
            const teil = seiten.slice(i, i + 3);
            if (melde) melde('Wartungsplan lesen …');
            const r = await window.groqFetch({ messages: [{ role: 'user', content: PROMPT_W + '\n\n' + teil.map(s => '--- Seite ' + s.seite + ' ---\n' + s.text).join('\n') }], temperature: 0, max_tokens: 8192, response_format: { type: 'json_object' } });
            if (!r.ok) throw new Error('Wartungsplan: KI-Fehler ' + r.status);
            const j = await r.json();
            let out; try { out = jsonAus(j.choices[0].message.content); } catch (e) { continue; }
            (Array.isArray(out) ? out : out.plan || out.wartung || []).forEach(p => { if (p && p.taetigkeit) alle.push(p); });
        }
        if (!alle.length) return 0;
        await sb().from('dokument_fakten').delete().eq('document_id', docId).eq('schluessel', 'Wartung');
        const rows = alle.map(p => ({ document_id: docId, schluessel: 'Wartung', variante: String(p.intervall || 'Sonstige'), wert: (p.baugruppe ? p.baugruppe + ' — ' : '') + p.taetigkeit, einheit: p.stunden != null && !isNaN(Number(p.stunden)) ? String(Number(p.stunden)) : null, seite: Number(p.seite) || von }));
        const e2 = await sb().from('dokument_fakten').insert(rows);
        if (e2.error) throw new Error(e2.error.message);
        datenCache.clear();
        return rows.length;
    }

    // ── Gezielt gelesene Stammdaten: Betriebsstoffe, Gewicht, Abmessungen (Transport/Arbeit getrennt) ───────
    // Fakten-Arten (siehe STAMM): 'Betriebsstoff-Menge'/'-Sorte' (variante = Stoff, wert = Menge oder Verweis auf ein anderes Dokument),
    // 'Gesamtgewicht' (variante = Ausführung), 'Abmessung' (variante = Stellung [| Ausführung], einheit = Länge/Breite/Höhe).
    const STOFF_REIHE = ['kraftstoff', 'diesel', 'motor', 'hydraul', 'getriebe', 'k[üu]hl', 'adblue|harnstoff', 'k[äa]lte', 'fett'];
    const stoffRang = a => { const i = STOFF_REIHE.findIndex(k => new RegExp(k, 'i').test(a)); return i < 0 ? 99 : i; };
    const DIM_REIHE = ['länge', 'breite', 'höhe'];
    function stammKarten(liste, name) {
        const tip = f => esc(name(f.document_id) + (f.seite ? ', S. ' + f.seite : ''));
        const zeile = (dt, dd, f, klein) => `<dt title="${tip(f)}">${esc(dt)}${klein ? `<small class="di-var">${esc(klein)}</small>` : ''}</dt><dd>${esc(dd)}</dd>`;
        const uniq = l => { const g = new Set(); return l.filter(f => { const k = [f.variante, f.einheit, f.wert].map(norm).join('|'); if (g.has(k)) return false; g.add(k); return true; }); };
        const von = s => liste.filter(f => f.schluessel === s);
        const stoffe = (s, titel) => {
            const l = uniq(von(s)).sort((a, b) => stoffRang(a.variante || '') - stoffRang(b.variante || ''));
            return l.length ? `<section class="mz-karte"><h3>${titel}</h3><dl class="mz-daten">${l.map(f => zeile(f.variante || 'Betriebsstoff', f.wert, f)).join('')}</dl></section>` : '';
        };
        const gew = uniq(von('Gesamtgewicht'));
        const masse = uniq(von('Abmessung'));
        const stellung = (f, k) => String(f.variante || '').toLowerCase().startsWith(k);
        const block = (titel, k) => {
            const l = masse.filter(f => stellung(f, k)).sort((a, b) => DIM_REIHE.indexOf(String(a.einheit).toLowerCase()) - DIM_REIHE.indexOf(String(b.einheit).toLowerCase()));
            return l.length ? `<h4 class="di-stellung">${titel}</h4><dl class="mz-daten">${l.map(f => zeile(f.einheit || 'Maß', f.wert, f, (String(f.variante).split(' | ')[1] || ''))).join('')}</dl>` : '';
        };
        const sonst = masse.filter(f => !stellung(f, 'transport') && !stellung(f, 'arbeit'));
        let m = '';
        if (gew.length || masse.length) {
            m = `<section class="mz-karte"><h3>Abmessungen &amp; Gewicht</h3>
                ${gew.length ? `<dl class="mz-daten">${gew.map(f => zeile('Gesamtgewicht', f.wert, f, f.variante || '')).join('')}</dl>` : ''}
                ${block('Transportstellung', 'transport')}${block('Arbeitsstellung', 'arbeit')}
                ${sonst.length ? `<h4 class="di-stellung">Weitere Maße</h4><dl class="mz-daten">${sonst.map(f => zeile((f.einheit || 'Maß'), f.wert, f, f.variante || '')).join('')}</dl>` : ''}</section>`;
        }
        return { masse: m, fuell: stoffe('Betriebsstoff-Menge', 'Füllmengen'), oele: stoffe('Betriebsstoff-Sorte', 'Öle &amp; Betriebsstoffe') };
    }

    const PROMPT_B = `Das sind Seiten einer Betriebsanleitung mit Betriebsstoff-Tabellen. Liste je Betriebsstoff (Kraftstoff, Motoröl, Hydrauliköl, Getriebeöl, Kühlmittel, AdBlue, Kältemittel, Fett …) die Füllmenge und die Sorte/Spezifikation. Antworte NUR mit JSON:
{"stoffe":[{"art":"z. B. Motoröl","menge":"Wert mit Einheit wörtlich (z. B. ca. 100 l). Verweist die Anleitung auf ein anderes Dokument (z. B. Original-Betriebsanleitung des Motorherstellers, Referenzhandbuch im Anhang), dann diesen Verweis wörtlich und kurz, z. B. Siehe Referenzhandbuch des Motorherstellers","sorte":"Sorte/Spezifikation wörtlich oder leer","seite":N}]}
Nichts erfinden. Beispielwerte aus Nachweis- oder Ausfüllformularen nicht aufnehmen. Gilt ein Wert nur für eine Ausführung, schreibe sie in "art" dazu, z. B. Hydrauliköl (Hakenlift).`;
    const PROMPT_M = `Das sind Seiten einer Betriebsanleitung mit technischen Daten. Erfasse Gewicht und Abmessungen des GANZEN Zerkleinerers/der Maschine, getrennt nach Transportstellung und Arbeitsstellung. Antworte NUR mit JSON:
{"gewicht":[{"wert":"13.400 kg","ausfuehrung":"z. B. Kettenlaufwerk, sonst leer","seite":N}],"masse":[{"stellung":"Transportstellung oder Arbeitsstellung","dimension":"Länge oder Breite oder Höhe","wert":"7.700 mm","ausfuehrung":"sonst leer","seite":N}]}
Regeln: Gesamtlänge/-breite/-höhe ohne Zusatz oder „in Arbeitsstellung/Betrieb“ = Arbeitsstellung; „in Transportstellung/Transport“ = Transportstellung. Je Stellung, Dimension und Ausführung nur EIN Wert, keine Doppelten. Keine Maße von Bauteilen (Band, Welle, Trichter, Siebkorb, Kassette, Abwurfhöhe). Wert immer mit Einheit. Nichts erfinden.`;

    async function stammdatenLesen(docId, melde) {
        const { data, error } = await sb().from('dokument_seiten').select('seite, text').eq('document_id', docId).order('seite').limit(1000);
        if (error || !data || !data.length) return 0;
        const wahl = (test, max) => data.filter(s => test(String(s.text || ''))).slice(0, max);
        const betr = wahl(t => /Betriebsstoffe/i.test(t) && /Fassungsverm[öo]gen|F[üu]llmenge|F[üu]llvolumen/i.test(t), 8);
        const masse = wahl(t => /Transportstellung|Arbeitsstellung|Gesamtgewicht|Gesamtl[äa]nge|Abmessungen/i.test(t) && /L[äa]nge|Breite|H[öo]he/i.test(t) && /\bmm\b/.test(t), 8);
        const frage = async (prompt, seiten) => {
            if (!seiten.length) return null;
            if (melde) melde('Stammdaten lesen …');
            const r = await window.groqFetch({ messages: [{ role: 'user', content: prompt + '\n\n' + seiten.map(s => '--- Seite ' + s.seite + ' ---\n' + s.text).join('\n') }], temperature: 0, max_tokens: 8192, response_format: { type: 'json_object' } });
            if (!r.ok) throw new Error('Stammdaten: KI-Fehler ' + r.status);
            const j = await r.json();
            try { return jsonAus(j.choices[0].message.content); } catch (e) { return null; }
        };
        const ob = await frage(PROMPT_B, betr), om = await frage(PROMPT_M, masse);
        const rows = [];
        const t = v => (v == null ? '' : String(v)).trim();
        ((ob && (ob.stoffe || ob.betriebsstoffe)) || []).forEach(s => {
            if (!t(s.art)) return;
            if (t(s.menge)) rows.push({ document_id: docId, schluessel: 'Betriebsstoff-Menge', variante: t(s.art), wert: t(s.menge), seite: Number(s.seite) || null });
            if (t(s.sorte)) rows.push({ document_id: docId, schluessel: 'Betriebsstoff-Sorte', variante: t(s.art), wert: t(s.sorte), seite: Number(s.seite) || null });
        });
        ((om && om.gewicht) || []).forEach(g => { if (t(g.wert)) rows.push({ document_id: docId, schluessel: 'Gesamtgewicht', variante: t(g.ausfuehrung) || null, wert: t(g.wert), seite: Number(g.seite) || null }); });
        ((om && om.masse) || []).forEach(x => { if (t(x.wert) && t(x.dimension)) rows.push({ document_id: docId, schluessel: 'Abmessung', variante: t(x.stellung) + (t(x.ausfuehrung) ? ' | ' + t(x.ausfuehrung) : ''), einheit: t(x.dimension), wert: t(x.wert), seite: Number(x.seite) || null }); });
        if (!rows.length) return 0;
        await sb().from('dokument_fakten').delete().eq('document_id', docId).in('schluessel', ['Betriebsstoff-Menge', 'Betriebsstoff-Sorte', 'Abmessung', 'Gesamtgewicht']);
        const e2 = await sb().from('dokument_fakten').insert(rows);
        if (e2.error) throw new Error(e2.error.message);
        datenCache.clear();
        return rows.length;
    }

    function datenKarten(m, redrawFn) {
        const c = datenCache.get(m.id);
        if (c && c.html != null && Date.now() - c.zeit < 5 * 60 * 1000) return c.html;
        if (c && c.laedt) return c.html || '';
        datenCache.set(m.id, { zeit: Date.now(), html: c ? c.html : '', plan: c ? c.plan : '', laedt: true });
        (async () => {
            let html = '', plan = '';
            try {
                const docs = await dokumenteFuer(m);
                if (docs.length) {
                    const { data } = await sb().from('dokument_fakten').select('*').in('document_id', docs.map(d => String(d.id))).neq('status', 'verworfen').order('seite', { ascending: true }).limit(2000);
                    const alle = (data || []).filter(f => !STAMM.includes(f.schluessel));
                    plan = wartungsplanHtml((data || []).filter(f => f.schluessel === 'Wartung'));
                    const name = id => (docs.find(d => String(d.id) === String(id)) || {}).name || 'Dokument';
                    const stamm = stammKarten((data || []).filter(f => f.schluessel !== 'Wartung' && STAMM.includes(f.schluessel)), name);
                    const karten = GRUPPEN.map(([titel, test]) => {
                        // gezielt gelesene Karten (Transport/Arbeit getrennt, Verweise auf Original-Anleitungen) haben Vorrang
                        if (titel === 'Abmessungen & Gewicht' && stamm.masse) return stamm.masse;
                        if (titel === 'Füllmengen' && stamm.fuell) return stamm.fuell;
                        if (titel === 'Öle & Betriebsstoffe' && stamm.oele) return stamm.oele;
                        const l = dedup(alle.filter(test)).slice(0, 14);
                        if (!l.length) return '';
                        return `<section class="mz-karte"><h3>${esc(titel)}</h3><dl class="mz-daten">${l.map(f => `<dt title="${esc(name(f.document_id) + (f.seite ? ', S. ' + f.seite : ''))}">${esc(f.schluessel)}${f.variante ? `<small class="di-var">${esc(f.variante)}</small>` : ''}</dt><dd>${esc(wertText(f))}</dd>`).join('')}</dl></section>`;
                    }).join('');
                    if (karten) html = karten + '<p class="di-hinweis di-hinweis-breit">Technische Angaben aus den Dokumenten zur Maschine, von der KI gelesen.</p>';
                }
            } catch (e) { html = ''; }
            datenCache.set(m.id, { zeit: Date.now(), html, plan, laedt: false });
            if (redrawFn) redrawFn();
        })();
        return c ? c.html || '' : '';
    }

    // ── Seiten als Bilder holen (PDF oder Scan-Foto) ───────────────────────
    async function quelleOeffnen(doc) {
        if (/pdf/i.test(doc.mime_type || '') || /\.pdf($|\?)/i.test(doc.url)) {
            if (!window.pdfjsLib && window.loadPDFReader) await window.loadPDFReader();
            if (!window.pdfjsLib) throw new Error('PDF-Leser nicht geladen.');
            const pdf = await window.pdfjsLib.getDocument(doc.url).promise;
            return {
                anzahl: pdf.numPages,
                async bild(n) {
                    const pg = await pdf.getPage(n);
                    const v = pg.getViewport({ scale: 1.6 });
                    const c = document.createElement('canvas'); c.width = v.width; c.height = v.height;
                    await pg.render({ canvasContext: c.getContext('2d'), viewport: v }).promise;
                    return c.toDataURL('image/jpeg', 0.75);
                }
            };
        }
        const img = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('Bild nicht ladbar.')); i.src = doc.url; });
        return {
            anzahl: 1,
            async bild() {
                const f = Math.min(1, 1800 / Math.max(img.width, img.height));
                const c = document.createElement('canvas'); c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                return c.toDataURL('image/jpeg', 0.8);
            }
        };
    }

    const PROMPT = `Du liest Seiten (Nr. SEITEN) aus technischer Maschinen-Dokumentation. Antworte NUR mit JSON:
{"dokumenttyp":"betriebsanleitung|elektroplan|hydraulikplan|ersatzteilkatalog|wartungsplan|datenblatt|prospekt|preisliste|kundendokument|sonstiges",
 "enthaelt_kundendaten":true oder false (Namen/Anschriften von Kunden, Rechnungs-, Vertrags-, Berichtsdaten),
 "seiten":[{"seite":N,"text":"vollständige wörtliche Abschrift der Seite, Tabellen als Text, Bildbeschriftungen und Positionsnummern mit"}],
 "fakten":[{"schluessel":"z. B. Motoröl Füllmenge, Hydrauliköl Füllmenge, Ölsorte, Kraftstofftank, Motorleistung, Gewicht, Durchsatz, Filter-Nr., Wartungsintervall, Drehmoment, Druck, Spannung, Sicherung","wert":"...","einheit":"...","variante":"Ausführung/Modell/Motor, falls die Angabe nur dafür gilt, sonst leer","seite":N}]}
Nur Fakten, die wörtlich auf der Seite stehen. Nichts erfinden, nichts umrechnen.
KEINE Fakten aus Beispielen: Ausfüllbeispiele von Nachweis-, Wartungs- oder Prüfformularen, Beispielzeilen, Mustereinträge und Platzhalter sind keine Herstellerangaben — dort nichts als Fakt eintragen (der Seitentext wird trotzdem abgeschrieben).
Gelten Werte nur für eine Ausführung (Kettenlaufwerk, Hakenlift, stationär, Motortyp, Modell, Tank), gehört sie ins Feld "variante" — nie weglassen, wenn die Seite mehrere Ausführungen nennt.`;

    function jsonAus(text) {
        let t = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
        return JSON.parse(t);
    }

    async function einlesen(doc, melde) {
        const id = String(doc.id);
        if (!erlaubt(doc)) throw new Error('Dieser Dokumenttyp ist nicht freigegeben (nur technische Dokumente).');
        if (laufend.has(id)) return;
        const zeige = t => { laufend.set(id, { text: t }); if (melde) melde(t); redraw && redraw(); };
        const alt = status.get(id);
        let start = alt && (alt.status === 'pausiert' || alt.status === 'fehler') ? alt.naechste_seite || 1 : 1;
        let z = alt && start > 1 ? Object.assign({}, alt) : { document_id: id, aufrufe: 0, tokens_ein: 0, tokens_aus: 0 };
        const speichern = async patch => {
            z = Object.assign(z, patch, { document_id: id, von: (window.activeUser && window.activeUser.name) || null, aktualisiert: new Date().toISOString() });
            const { error } = await sb().from('dokument_index').upsert(z, { onConflict: 'document_id' });
            if (error) throw new Error(/relation|does not exist/i.test(error.message) ? 'Migration supabase_add_dokument_index.sql fehlt.' : error.message);
            status.set(id, Object.assign({}, z));
        };
        zeige('Öffne …');
        try {
            const q = await quelleOeffnen(doc);
            if (start === 1) {
                await sb().from('dokument_seiten').delete().eq('document_id', id);
                await sb().from('dokument_fakten').delete().eq('document_id', id);
            }
            await speichern({ status: 'laeuft', seiten: q.anzahl, grund: null, naechste_seite: start });
            for (let a = start; a <= q.anzahl; a += BLOCK) {
                const nums = []; for (let i = a; i < Math.min(a + BLOCK, q.anzahl + 1); i++) nums.push(i);
                zeige('Seite ' + nums[nums.length - 1] + ' / ' + q.anzahl);
                const content = [{ type: 'text', text: PROMPT.replace('SEITEN', nums.join(', ')) }];
                for (const n of nums) { content.push({ type: 'text', text: 'Seite ' + n + ':' }); content.push({ type: 'image_url', image_url: { url: await q.bild(n) } }); }
                let out = null, antwort = null;
                for (let versuch = 0; versuch < 2 && !out; versuch++) {
                    const r = await window.groqFetch({ messages: [{ role: 'user', content }], temperature: 0, max_tokens: 8192, response_format: { type: 'json_object' } });
                    const roh = await r.text();
                    if (r.status === 429) throw Object.assign(new Error('KI-Tageslimit erreicht — später „Fortsetzen“.'), { pause: true });
                    let j = null; try { j = JSON.parse(roh); } catch (e) { /* unten */ }
                    if (!r.ok) { if (versuch) throw new Error((j && j.error && j.error.message) || 'KI-Fehler ' + r.status); continue; }
                    antwort = j;
                    try { out = jsonAus(j.choices[0].message.content); } catch (e) { out = null; }
                }
                if (!out) throw new Error('Die KI-Antwort war nicht lesbar (Seiten ' + nums[0] + '–' + nums[nums.length - 1] + ').');
                // Absicherung: technisches Dokument ohne Kundendaten, sonst nichts speichern
                const typ = String(out.dokumenttyp || '').toLowerCase();
                if (!TYPEN_OK.includes(typ) || out.enthaelt_kundendaten === true) {
                    await sb().from('dokument_seiten').delete().eq('document_id', id);
                    await sb().from('dokument_fakten').delete().eq('document_id', id);
                    await speichern({ status: 'abgelehnt', dokumenttyp: typ, grund: out.enthaelt_kundendaten === true ? 'enthält Kundendaten' : 'kein technisches Dokument (' + typ + ')', naechste_seite: 1 });
                    throw Object.assign(new Error('Nicht eingelesen: ' + z.grund + '. Es wurde nichts gespeichert.'), { abgelehnt: true });
                }
                const seiten = (out.seiten || []).filter(s => nums.includes(Number(s.seite))).map(s => ({ document_id: id, seite: Number(s.seite), text: String(s.text || '') }));
                if (seiten.length) { const e1 = await sb().from('dokument_seiten').upsert(seiten, { onConflict: 'document_id,seite' }); if (e1.error) throw new Error(e1.error.message); }
                await sb().from('dokument_fakten').delete().eq('document_id', id).in('seite', nums);
                const fk = (out.fakten || []).filter(f => f && f.schluessel && f.wert != null && String(f.wert).trim() !== '')
                    .map(f => ({ document_id: id, schluessel: String(f.schluessel), wert: String(f.wert), einheit: f.einheit ? String(f.einheit) : null, variante: f.variante ? String(f.variante) : null, seite: Number(f.seite) || nums[0] }));
                if (fk.length) { const e2 = await sb().from('dokument_fakten').insert(fk); if (e2.error) throw new Error(e2.error.message); }
                const u = (antwort && antwort.usage) || {};
                await speichern({ dokumenttyp: typ, naechste_seite: nums[nums.length - 1] + 1, aufrufe: (z.aufrufe || 0) + 1, tokens_ein: (z.tokens_ein || 0) + (u.prompt_tokens || 0), tokens_aus: (z.tokens_aus || 0) + (u.completion_tokens || 0), modell: (antwort && antwort.model) || z.modell || null });
                seitenCache.clear(); fakten.key = ''; datenCache.clear();
            }
            await speichern({ status: 'fertig', grund: null });
            try { await wartungsplanLesen(id, zeige); } catch (e) { console.warn('Wartungsplan nicht gelesen:', e.message); }
            try { await stammdatenLesen(id, zeige); } catch (e) { console.warn('Stammdaten nicht gelesen:', e.message); }
            if (window.showToast) window.showToast('Für die KI eingelesen: ' + (doc.name || 'Dokument') + ' (' + z.seiten + ' Seiten).');
        } catch (e) {
            if (!e.abgelehnt) { try { await speichern({ status: e.pause ? 'pausiert' : 'fehler', grund: e.message }); } catch (e2) { /* Tabelle fehlt */ } }
            if (window.showToast) window.showToast(e.message || 'Einlesen fehlgeschlagen.');
        } finally { laufend.delete(id); redraw && redraw(); }
    }

    // ── Fragen: Auszug für den KI-Chat ─────────────────────────────────────
    const seitenCache = new Map();
    const norm = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
    const woerter = s => norm(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length > 2 && !STOP.has(w));
    const passt = (satz, w) => satz.has(w) || [...satz].some(x => x.length >= 5 && w.length >= 5 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))));

    // Technische Dokumente zu einer Maschine: genau diese, ihre Serie, ihre Kategorie (wie die Zentrale)
    async function dokumenteFuer(m) {
        const serie = String(m.machine_series || '').trim();
        const kat = ((window.categoryList || []).find(k => String(k.id) === String(m.category_id)) || {}).name || '';
        const q = t => '"' + String(t).replace(/[\\"]/g, '') + '"';
        const teile = ['machine_id.eq.' + m.id];
        if (serie) teile.push('machine_series.ilike.' + q('%' + serie + '%'));
        if (kat) teile.push('machine_categories.ilike.' + q('%' + kat + '%'));
        const { data, error } = await sb().from('documents').select('id, name, url, category, mime_type, machine_id, machine_series, machine_categories').or(teile.join(',')).limit(200);
        if (error) throw new Error(error.message);
        const gleich = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
        return (data || []).filter(erlaubt).filter(d => {
            if (String(d.machine_id) === String(m.id)) return true;
            const serien = String(d.machine_series || '').split(',').map(s => s.trim()).filter(Boolean);
            if (serie && serien.some(s => gleich(s, serie))) return true;
            const kats = String(d.machine_categories || '').split(',').map(s => s.trim()).filter(Boolean);
            return !serien.length && !d.machine_id && kat && kats.some(s => gleich(s, kat));
        });
    }

    // Text für die KI: passende Fakten + die besten Seiten, mit Quelle. Leer = nichts eingelesen.
    async function technischeDaten(m, frage) {
        const docs = await dokumenteFuer(m);
        if (!docs.length) return 'Zu dieser Maschine sind keine technischen Dokumente (Betriebsanleitung, Pläne, Ersatzteilkatalog) abgelegt.';
        const ids = docs.map(d => String(d.id));
        const { data: idx } = await sb().from('dokument_index').select('document_id, status, seiten').in('document_id', ids);
        const fertig = new Set((idx || []).filter(z => z.status === 'fertig').map(z => String(z.document_id)));
        if (!fertig.size) return `Zu dieser Maschine gibt es ${docs.length} technische Dokumente (${docs.map(d => d.name).slice(0, 5).join(', ')}), aber noch keines ist für die KI eingelesen (Maschinen-Zentrale → Dokumente → „Für KI einlesen“).`;
        const nutz = ids.filter(i => fertig.has(i));
        const name = id => (docs.find(d => String(d.id) === String(id)) || {}).name || 'Dokument';
        const key = nutz.join(',');
        let seiten = seitenCache.get(key);
        if (!seiten || Date.now() - seiten.zeit > 5 * 60 * 1000) {
            const { data, error } = await sb().from('dokument_seiten').select('document_id, seite, text').in('document_id', nutz).limit(3000);
            if (error) throw new Error(error.message);
            seiten = { zeit: Date.now(), liste: (data || []).map(s => ({ s, w: new Set(woerter(s.text)) })) };
            seitenCache.set(key, seiten);
        }
        const q = woerter(frage);
        const punkte = seiten.liste.map(x => ({ s: x.s, n: q.filter(w => passt(x.w, w)).length })).filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3);
        const { data: fk } = await sb().from('dokument_fakten').select('*').in('document_id', nutz).neq('status', 'verworfen').limit(2000);
        const treffer = (fk || []).filter(f => { const s = new Set(woerter(f.schluessel + ' ' + (f.variante || ''))); return q.some(w => passt(s, w)); }).slice(0, 15);
        const teile = [];
        if (treffer.length) teile.push('Gelesene Fakten (✓ = bestätigt):\n' + treffer.map(f => `- ${f.schluessel}: ${f.wert}${f.einheit ? ' ' + f.einheit : ''}${f.variante ? ' [' + f.variante + ']' : ''} — ${name(f.document_id)}, S. ${f.seite}${f.status === 'bestaetigt' ? ' ✓' : ''}`).join('\n'));
        if (punkte.length) teile.push('Passende Seiten:\n' + punkte.map(x => `--- ${name(x.s.document_id)}, Seite ${x.s.seite} ---\n${x.s.text}`).join('\n'));
        return (teile.join('\n\n') || 'In den eingelesenen Dokumenten steht dazu nichts (Dokumente: ' + nutz.map(name).join(', ') + ').')
            + '\nHinweis: Das sind Herstellerangaben aus der Dokumentation (z. B. Füllmengen), nicht der aktuelle Stand der Maschine.';
    }

    // ── Bedienung ──────────────────────────────────────────────────────────
    document.addEventListener('click', async ev => {
        const b = ev.target.closest('[data-dokidx]'); if (!b) return;
        const art = b.getAttribute('data-dokidx'), id = b.getAttribute('data-id');
        if (art === 'alle') { fakten.alle = !fakten.alle; redraw && redraw(); return; }
        if (art === 'einlesen') {
            let doc; try { doc = JSON.parse(b.getAttribute('data-doc')); } catch (e) { return; }
            const ja = await window.appFrage('„' + (doc.name || 'Dokument') + '“ Seite für Seite von der KI lesen lassen?\n\nEs werden nur technische Dokumente eingelesen — keine Serviceberichte, Mietvereinbarungen oder Kundendaten. Das kann bei langen Anleitungen einige Minuten dauern; das Fenster dabei offen lassen.', { ja: 'Einlesen', nein: 'Abbrechen' });
            if (ja) einlesen(doc);
            return;
        }
        if (art === 'bestaetigen' || art === 'verwerfen') {
            const { error } = await sb().from('dokument_fakten').update({ status: art === 'bestaetigen' ? 'bestaetigt' : 'verworfen' }).eq('id', id);
            if (error) { if (window.showToast) window.showToast(error.message); return; }
            const f = fakten.liste.find(x => String(x.id) === String(id));
            if (f) { if (art === 'verwerfen') fakten.liste = fakten.liste.filter(x => x !== f); else f.status = 'bestaetigt'; }
            datenCache.clear();
            redraw && redraw();
        }
    });

    window.dokIndex = { erlaubt, knopfHtml, blockHtml, datenKarten, wartungsplanKarte, wartungsplanLesen, stammdatenLesen, einlesen, technischeDaten, offen: v => { fakten.offen = !!v; } };
})();
