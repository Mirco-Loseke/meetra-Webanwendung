// ==========================================================
// MIETVEREINBARUNG — VORLAGEN
// ----------------------------------------------------------
// Legt fest, WIE der Mietvereinbarungs-Bogen aussieht: Titel,
// Beschriftungen, Baugruppen, Pruefspalten, Fotopositionen und
// Vertragstext. Je Maschinentyp (Kategorie) kann eine eigene
// Vorlage hinterlegt werden — genau wie bei den Protokollvorlagen.
//
// Gespeichert wird in der Supabase-Tabelle "rental_templates"
// (Migration: supabase/supabase_add_rental_templates.sql).
// Fehlt die Tabelle, arbeitet die App mit dem Standard weiter und
// die Einstellungsseite sagt, was zu tun ist.
//
// Ersetzt die frueheren js/mietvereinbarung-texte.js.
// ==========================================================

(function () {
    'use strict';

    // ------------------------------------------------------
    // Standardvorlage — Wortlaut aus der Word-Vorlage
    // "meetra VORLAGE Mietvertrag Trommelsiebmaschine HIPPO".
    // Sie greift immer dann, wenn fuer den Maschinentyp nichts
    // hinterlegt ist, und dient neuen Vorlagen als Ausgangspunkt.
    // ------------------------------------------------------
    window.MIET_VORLAGE_STANDARD = {
        titel: 'Mietvereinbarung',
        zusatzinfo: 'Der Tagessatz enthält 6 Betriebsstunden, jede Betriebsstunde darüber hinaus, wird zusätzlich berechnet.',
        schlusssatz: 'Es gelten unsere umseitigen Mietbedingungen.',

        // Ueberschriften der Abschnitte
        bloecke: {
            mieter: 'Mieter',
            geraet: 'Mietgerät',
            abnahme: 'Zustand der Baugruppen',
            schaeden: 'Schadenstabelle bekannter Vorschäden',
            fotos_uebergabe: 'Fotos bei Übergabe',
            fotos_ruecknahme: 'Fotos bei Rücknahme',
            bestaetigung_uebergabe: 'o. g. Angaben bei Übergabe bestätigt',
            bestaetigung_ruecknahme: 'o. g. Angaben bei Rücknahme bestätigt'
        },

        // Beschriftungen der einzelnen Zeilen
        felder: {
            name: 'Name:',
            street: 'Straße:',
            zip_city: 'PLZ/Ort:',
            ausweis: 'Ausweisnummer:',
            einsatzort: 'Einsatzort:',
            geraet: 'Mietgerät:',
            abholdatum: 'Abhol-/Lieferdatum:',
            uhrzeit: 'Uhrzeit:',
            beginn: 'Mietbeginn:',
            ende: 'Mietende:',
            betriebsstunden: 'Betriebsstunden:',
            tagessatz: 'Tagessatz pro Werktag',
            zusatzinfo: 'Zusatzinfo:',
            baugruppe: 'Baugruppe',
            sauberkeit: 'Sauberkeit, Füllstand',
            gereinigt: 'Gereinigt',
            diesel: 'Diesel Füllstand',
            sonstiges: 'Sonstiges:',
            einweisung: 'Einweisung stattgefunden',
            unterschrift_vermieter: 'Unterschrift Vermieter',
            unterschrift_mieter: 'Unterschrift Mieter'
        },

        // Pruefspalten der Abnahmetabelle. Die erste gilt als Übergabe,
        // die zweite als Rücknahme; weitere sind zusaetzliche Spalten.
        spalten: [
            { id: 'uebergabe', label: 'Zustand bei Übernahme' },
            { id: 'ruecknahme', label: 'Zustand bei Rückgabe' }
        ],

        baugruppen: [
            { gruppe: 'Rahmen, Räder', punkte: ['Felgen/Reifen', 'Unterfahrschutz', 'Kotflügel/Schmutzfänger', 'Hauben/Klappen/Deckel'] },
            { gruppe: 'Bänder, Zylinder', punkte: ['Bunkerband', 'Heckband', 'Seitenband', 'Zylinder'] },
            { gruppe: 'Siebtrommel', trommeltyp: true, punkte: ['Beschädigung/Beulen'] },
            { gruppe: 'E-Anlage', punkte: ['Scheinwerfer/Rundumleuchte', 'Rücklichter/Rückstrahler', 'Zündschloss', 'Schlüssel'] }
        ],

        fotos: [
            'Vorne rechts', 'Vorne', 'Vorne links', 'Links',
            'Hinten links', 'Hinten', 'Hinten rechts', 'Rechts',
            'Betriebsstunden'
        ],

        texte: {
            titel: 'Mietbedingungen und Vereinbarungen',
            abschnitte: [
                {
                    titel: 'Geltungsbereich und ergänzende Vereinbarungen',
                    absaetze: [
                        'Die auf den vorhergehenden Seiten aufgeführten Hinweise, Bedingungen und Sicherheitshinweise sind Bestandteil dieser Vereinbarung und gelten zusätzlich und ergänzend zu den nachfolgenden Regelungen.',
                        'Sämtliche auf dieser und den vorhergehenden Seiten aufgeführten Bestimmungen sind vom Mieter zu beachten und gelten für die gesamte Dauer des Mietverhältnisses. Die Regelungen dieser Seite ergänzen die zuvor genannten Bestimmungen und ersetzen diese nicht.',
                        'Bei Widersprüchen zwischen einzelnen Regelungen gelten die vertraglich vereinbarten Regelungen des Mietvertrages. Zwingende gesetzliche Vorschriften bleiben unberührt.',
                        'Mit seiner Unterschrift bestätigt der Mieter, dass ihm alle Seiten vollständig vorgelegt wurden, er deren Inhalt zur Kenntnis genommen hat und die darin enthaltenen Regelungen anerkennt.'
                    ]
                },
                {
                    titel: 'Übergabe, Einweisung und Pflichten des Mieters',
                    absaetze: [
                        'Der Mieter bestätigt mit seiner Unterschrift, dass ihm die Maschine in einem ordnungsgemäßen und betriebsbereiten Zustand übergeben wurde. Der Mieter hatte Gelegenheit, die Maschine vor der Übernahme zu besichtigen und auf erkennbare Mängel zu überprüfen.',
                        'Bereits bei Übergabe vorhandene Beschädigungen, Mängel oder sonstige Abweichungen vom ordnungsgemäßen Zustand werden in einem Übergabeprotokoll dokumentiert und gegebenenfalls durch Fotos festgehalten. Diese bei Übergabe festgestellten und dokumentierten Beschädigungen gelten als bereits vor Beginn der Mietzeit vorhanden und werden dem Mieter nicht als während der Mietzeit verursachte Schäden zugerechnet.',
                        'Der Mieter wurde in die Bedienung, den bestimmungsgemäßen Gebrauch sowie den sicheren Umgang mit der Maschine eingewiesen. Die wesentlichen Bedienungs- und Sicherheitshinweise wurden erläutert. Die Original-Betriebsanleitung sowie gegebenenfalls weitere zur Maschine gehörende Unterlagen sind vom Mieter zu beachten.',
                        'Der Mieter verpflichtet sich, die Maschine während der gesamten Mietdauer ausschließlich bestimmungsgemäß, sachgerecht und entsprechend der Betriebsanleitung zu verwenden. Die Maschine darf nur von Personen bedient werden, die hierfür geeignet, entsprechend eingewiesen und – soweit gesetzlich vorgeschrieben – entsprechend qualifiziert oder berechtigt sind.',
                        'Sämtliche während der Mietdauer vom Mieter zu beachtenden gesetzlichen, behördlichen und betrieblichen Anforderungen, die sich aus dem Einsatz der Maschine ergeben, sind vom Mieter eigenverantwortlich einzuhalten. Hierzu gehören insbesondere die Einhaltung der geltenden Sicherheits-, Arbeitsschutz- und Unfallverhütungsvorschriften sowie gegebenenfalls erforderliche Genehmigungen, Einweisungen und Absicherungen am Einsatzort.',
                        'Der Mieter hat die Maschine vor jeder Inbetriebnahme auf erkennbare Beschädigungen, Mängel und einen sicheren Betriebszustand zu überprüfen. Festgestellte Mängel oder sicherheitsrelevante Auffälligkeiten sind dem Vermieter unverzüglich mitzuteilen. Bei sicherheitsrelevanten Mängeln darf die Maschine bis zur Klärung bzw. Behebung des Mangels nicht weiter betrieben werden.',
                        'Der Mieter ist verpflichtet, die Maschine während der Mietdauer pfleglich und sachgemäß zu behandeln und vor vermeidbaren Beschädigungen, unsachgemäßer Nutzung sowie unbefugtem Zugriff zu schützen.',
                        'Der Mieter trägt die Verantwortung für Schäden an der Maschine, die während der Mietdauer durch unsachgemäße Bedienung, bestimmungswidrige Verwendung, grob fahrlässiges oder vorsätzliches Verhalten, Missachtung der Betriebsanleitung oder sonstige vom Mieter zu vertretende Umstände entstehen, soweit der Mieter hierfür nach den gesetzlichen Vorschriften haftet.',
                        'Die vom Vermieter vorgegebenen Wartungs-, Pflege- und Kontrollintervalle sind einzuhalten, soweit diese dem Mieter übertragen wurden. Reparaturen, technische Veränderungen, Umbauten oder sonstige Eingriffe in die Maschine dürfen nur nach vorheriger Zustimmung des Vermieters vorgenommen werden. Eigenmächtige Veränderungen an sicherheitsrelevanten Einrichtungen sind untersagt.',
                        'Der Mieter hat für einen ordnungsgemäßen Einsatzort und sichere Betriebsbedingungen zu sorgen. Insbesondere ist sicherzustellen, dass die Maschine entsprechend ihrer vorgesehenen Verwendung eingesetzt wird und keine Gefährdungen für Personen, Sachen oder die Maschine entstehen.',
                        'Die Verwendung der Maschine außerhalb des vereinbarten Einsatzbereichs sowie die Überlassung an Dritte ist nur mit vorheriger Zustimmung des Vermieters zulässig, soweit im Mietvertrag nichts Abweichendes vereinbart wurde.',
                        'Bei Verlust, Diebstahl, Unfall, Beschädigung oder sonstigen außergewöhnlichen Ereignissen ist der Vermieter unverzüglich zu informieren. Der Mieter hat alle zumutbaren Maßnahmen zu treffen, um weitere Schäden zu verhindern oder zu begrenzen.',
                        'Bei Rückgabe wird der Zustand der Maschine erneut überprüft und mit dem bei Übergabe dokumentierten Zustand abgeglichen. Neu hinzugekommene Beschädigungen oder Abweichungen, die nicht auf der normalen vertragsgemäßen Abnutzung beruhen, werden im Rückgabeprotokoll festgehalten und gegebenenfalls fotografisch dokumentiert.',
                        'Bei Rückgabe ist die Maschine grundsätzlich in dem Zustand zurückzugeben, in dem sie übernommen wurde, unter Berücksichtigung der vertragsgemäßen Abnutzung. Vom Mieter verursachte Verschmutzungen, Beschädigungen oder fehlende Ausrüstungsteile können dem Mieter nach Maßgabe der gesetzlichen und vertraglichen Bestimmungen in Rechnung gestellt werden.',
                        'Zwingende gesetzliche Pflichten und Haftungsregelungen bleiben von den vorstehenden Vereinbarungen unberührt.'
                    ]
                },
                {
                    titel: 'Dokumentation des Zustands bei Übergabe',
                    absaetze: [
                        'Die bei Übergabe festgestellten Beschädigungen und Mängel sind im Übergabeprotokoll vollständig zu dokumentieren. Soweit sinnvoll, sind die entsprechenden Stellen zusätzlich durch Fotografien zu dokumentieren. Das Übergabeprotokoll wird von Vermieter und Mieter bestätigt und ist Bestandteil der Mietunterlagen.',
                        'Der Mieter bestätigt mit seiner Unterschrift, dass die im Übergabeprotokoll aufgeführten Beschädigungen und Mängel bei Übernahme der Maschine bereits vorhanden waren.'
                    ]
                }
            ]
        }
    };

    // ------------------------------------------------------
    // Geladene Vorlagen
    // ------------------------------------------------------
    let vorlagen = [];          // Zeilen aus rental_templates
    let tabelleFehlt = false;   // Migration noch nicht gelaufen?
    let bearbeitet = null;      // Vorlage im Editor
    let katMenuOffen = false;   // Kategorie-Menü im Editor aufgeklappt?

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    function tiefeKopie(o) {
        return JSON.parse(JSON.stringify(o));
    }

    // Ein Prüfpunkt war früher nur ein Text und darf das bleiben. Seit
    // 2026-08-25 kann er zusätzlich Ausführungen zur Auswahl haben
    // (z. B. Siebkorb 12 mm / 25 mm) und als "optional" gelten.
    // Diese Funktion macht aus beidem dieselbe Form — sie wird auch von
    // js/mietvereinbarung.js benutzt, damit alte Vorlagen weiterlaufen.
    window.mietPunktLesen = function (p) {
        if (p && typeof p === 'object') {
            return {
                text: p.text || '',
                optional: !!p.optional,
                mehrfach: !!p.mehrfach,
                optionen: Array.isArray(p.optionen) ? p.optionen.filter(Boolean) : []
            };
        }
        return { text: String(p == null ? '' : p), optional: false, mehrfach: false, optionen: [] };
    };

    // Fehlt in einer gespeicherten Vorlage ein Feld, wird es aus dem
    // Standard ergaenzt. So bleiben aeltere Vorlagen benutzbar, wenn
    // spaeter neue Felder dazukommen.
    function mitStandard(config) {
        const s = window.MIET_VORLAGE_STANDARD;
        const c = config && typeof config === 'object' ? config : {};
        return {
            titel: c.titel || s.titel,
            zusatzinfo: c.zusatzinfo != null ? c.zusatzinfo : s.zusatzinfo,
            schlusssatz: c.schlusssatz != null ? c.schlusssatz : s.schlusssatz,
            bloecke: Object.assign({}, s.bloecke, c.bloecke || {}),
            felder: Object.assign({}, s.felder, c.felder || {}),
            spalten: (Array.isArray(c.spalten) && c.spalten.length) ? c.spalten : tiefeKopie(s.spalten),
            baugruppen: Array.isArray(c.baugruppen) ? c.baugruppen : tiefeKopie(s.baugruppen),
            fotos: (Array.isArray(c.fotos) && c.fotos.length) ? c.fotos : s.fotos.slice(),
            texte: c.texte && Array.isArray(c.texte.abschnitte) ? c.texte : tiefeKopie(s.texte)
        };
    }

    // Kategorien einer Vorlage als Liste von IDs (Strings).
    // Neu ist category_ids (Mehrfachauswahl); category_id bleibt als
    // Altbestand bestehen, solange die Migration noch nicht lief.
    function katIds(v) {
        const ids = Array.isArray(v && v.category_ids) ? v.category_ids : [];
        const alle = ids.map(String).filter(Boolean);
        if (!alle.length && v && v.category_id) alle.push(String(v.category_id));
        return alle;
    }

    // Vom Bogen aufgerufen: passende Vorlage zum Maschinentyp.
    window.getMietVorlage = function (categoryId) {
        const treffer = categoryId
            ? vorlagen.find(v => katIds(v).includes(String(categoryId)))
            : null;
        return mitStandard(treffer ? treffer.config : null);
    };

    let geladen = false;
    window.mietVorlagenGeladen = () => geladen;

    window.fetchMietVorlagen = async function () {
        if (!window.supabaseClient) return;
        geladen = true;
        try {
            const { data, error } = await window.supabaseClient
                .from('rental_templates')
                .select('*')
                .order('name', { ascending: true });
            if (error) throw error;
            vorlagen = data || [];
            tabelleFehlt = false;
        } catch (e) {
            console.warn('Mietvorlagen konnten nicht geladen werden:', e && e.message);
            vorlagen = [];
            tabelleFehlt = true;
        }
        renderVorlagenListe();
    };

    // ------------------------------------------------------
    // Übersicht (Einstellungen → Mietvereinbarungen)
    // ------------------------------------------------------
    // Kartenname der eingebauten Vorlage, solange nichts gespeichert ist.
    const STANDARD_NAME = 'Mietvereinbarung Siebtrommel';

    function karte(titel, unterzeile, gespeichert, oeffnen, loeschen, kopieren) {
        return `
        <div class="settings-card" onclick="${oeffnen}">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:1rem;">
                <div class="settings-icon-container" style="background:${gespeichert ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)'}; color:${gespeichert ? '#10b981' : 'rgba(255,255,255,0.45)'}; width:48px; height:48px; border-radius:14px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                </div>
                <h2 style="margin:0; font-size:1.2rem; color:#fff; font-family:'Outfit',sans-serif; word-break:break-word; flex:1;">${esc(titel)}</h2>
                ${kopieren ? `<button type="button" onclick="event.stopPropagation(); ${kopieren}" title="Vorlage kopieren"
                        style="background:rgba(59,130,246,0.12); border:1px solid rgba(59,130,246,0.35); color:#60a5fa; border-radius:9px; width:32px; height:32px; cursor:pointer; flex-shrink:0;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>` : ''}
                ${loeschen ? `<button type="button" class="delete-permission-required" onclick="event.stopPropagation(); ${loeschen}" title="Vorlage löschen"
                        style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:#ef4444; border-radius:9px; width:32px; height:32px; cursor:pointer; flex-shrink:0;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path></svg>
                    </button>` : ''}
            </div>
            <div class="settings-content">
                <p class="settings-card-desc">${esc(unterzeile)}</p>
            </div>
        </div>`;
    }

    function renderVorlagenListe() {
        const liste = document.getElementById('miet-vorlagen-liste');
        if (!liste) return;

        const hinweis = tabelleFehlt ? `
            <div style="grid-column:1/-1; background:rgba(251,191,36,0.1); border:1px solid rgba(251,191,36,0.4); border-radius:14px; padding:16px 18px; color:#fbbf24; font-size:0.9rem;">
                <strong>Tabelle „rental_templates" fehlt.</strong><br>
                Bis die Migration <code>supabase/supabase_add_rental_templates.sql</code> in Supabase
                ausgeführt wurde, benutzt jede Mietvereinbarung die eingebaute Standardvorlage.
                Bearbeiten und Anlegen ist erst danach möglich.
            </div>` : '';

        const kategorieName = (v) => {
            const namen = katIds(v).map(id => {
                const k = (window.categoryList || []).find(x => String(x.id) === String(id));
                return k ? k.name : null;
            }).filter(Boolean);
            return namen.length ? namen.join(', ') : 'kein Maschinentyp zugeordnet';
        };
        const punkte = (config) => (mitStandard(config).baugruppen || [])
            .reduce((a, g) => a + (g.punkte || []).length, 0);

        // Gespeicherte Vorlagen; ist noch keine da, steht die eingebaute
        // Siebtrommel-Vorlage als Ausgangspunkt in der Liste.
        const karten = vorlagen.length
            ? vorlagen.map(v => karte(
                v.name,
                `${kategorieName(v)} · ${punkte(v.config)} Prüfpunkte`,
                true,
                `window.openMietVorlage('${esc(v.id)}')`,
                `window.mietVorlageLoeschen('${esc(v.id)}')`,
                `window.mietVorlageKopieren('${esc(v.id)}')`)).join('')
            : karte(
                STANDARD_NAME,
                `Standardvorlage · ${punkte(null)} Prüfpunkte`,
                false,
                `window.openMietVorlage('standard')`,
                null,
                `window.mietVorlageKopieren('standard')`);

        liste.innerHTML = hinweis + karten;
    }

    window.openMietVorlagen = function () {
        window.switchView('miet-vorlagen');
        window.fetchMietVorlagen();
    };

    // ------------------------------------------------------
    // Editor
    // ------------------------------------------------------
    // id = Kennung einer gespeicherten Vorlage, oder 'standard' fuer die
    // eingebaute Siebtrommel-Vorlage, oder 'neu' fuer eine leere.
    window.openMietVorlage = function (id) {
        katMenuOffen = false;
        const vorhanden = vorlagen.find(v => String(v.id) === String(id));

        if (vorhanden) {
            bearbeitet = {
                id: vorhanden.id,
                category_ids: katIds(vorhanden),
                name: vorhanden.name,
                config: mitStandard(vorhanden.config)
            };
        } else {
            bearbeitet = {
                id: null,
                category_ids: [],
                name: id === 'neu' ? 'Neue Mietvereinbarung' : STANDARD_NAME,
                config: mitStandard(null)
            };
        }

        const titel = document.getElementById('miet-vorlage-titel');
        if (titel) titel.textContent = bearbeitet.name || 'Vorlage bearbeiten';
        window.switchView('miet-vorlage-editor');
        renderEditor();
    };

    // Knopf „Anlegen" oben rechts.
    window.mietVorlageNeu = function () {
        window.openMietVorlage('neu');
    };

    // Kopie einer bestehenden Vorlage: derselbe Aufbau, aber als neue
    // Vorlage. Die Kategorien bleiben bewusst leer — sonst gäbe es für
    // eine Kategorie zwei Vorlagen und es wäre Zufall, welche greift.
    // Gespeichert wird erst beim Klick auf „Speichern".
    window.mietVorlageKopieren = function (id) {
        const v = vorlagen.find(x => String(x.id) === String(id));
        katMenuOffen = false;
        bearbeitet = {
            id: null,
            category_ids: [],
            name: `${v ? v.name : STANDARD_NAME} (Kopie)`,
            config: mitStandard(v ? tiefeKopie(v.config) : null)
        };

        const titel = document.getElementById('miet-vorlage-titel');
        if (titel) titel.textContent = bearbeitet.name;
        window.switchView('miet-vorlage-editor');
        renderEditor();
        window.showToast('Kopie angelegt — Kategorien wählen und speichern.');
    };

    window.mietVorlageLoeschen = async function (id) {
        const v = vorlagen.find(x => String(x.id) === String(id));
        if (!v) return;
        if (!confirm(`Vorlage „${v.name}" wirklich löschen?`)) return;
        try {
            const { error } = await window.supabaseClient.from('rental_templates').delete().eq('id', id);
            if (error) throw error;
            await window.fetchMietVorlagen();
            window.showToast('Vorlage gelöscht.');
        } catch (e) {
            console.error('Vorlage löschen fehlgeschlagen:', e);
            window.showToast('Löschen fehlgeschlagen: ' + (e.message || 'unbekannter Fehler'));
        }
    };

    function zeileText(pfad, wert, platzhalter) {
        return `<input class="glass-form-input" value="${esc(wert)}" placeholder="${esc(platzhalter || '')}"
                       oninput="window.mietVorlageFeld('${pfad}', this.value)">`;
    }

    function renderEditor() {
        const box = document.getElementById('miet-vorlage-editor-inhalt');
        if (!box || !bearbeitet) return;
        const c = bearbeitet.config;

        // breit=true: Abschnitt nimmt beide Spalten ein (siehe
        // .miet-editor-grid in css/views/mietvereinbarung.css).
        const abschnitt = (titel, inhalt, breit) => `
            <div class="miet-editor-card${breit ? ' wide' : ''}">
                <h3>${esc(titel)}</h3>
                <div class="miet-editor-body">${inhalt}</div>
            </div>`;

        const feldZeile = (label, pfad, wert) => `
            <div class="miet-editor-row">
                <span>${esc(label)}</span>
                ${zeileText(pfad, wert)}
            </div>`;

        // --- Kopf
        // Nur die Maschinenkategorien (Einstellungen → Kategorien →
        // "Maschinenkategorien", type 'machine'): selbstfahrender Umsetzer,
        // Rotorschaufel, Schlauchtrommelwagen, Siebtrommelmaschine …
        const kategorien = (window.categoryList || []).filter(k => k.type === 'machine');
        const gewaehlt = new Set((bearbeitet.category_ids || []).map(String));
        const gewaehlteNamen = kategorien.filter(k => gewaehlt.has(String(k.id))).map(k => k.name);
        const kopf = `
            <div class="miet-editor-row">
                <span>Name der Vorlage</span>
                <input class="glass-form-input" value="${esc(bearbeitet.name)}"
                       oninput="window.mietVorlageName(this.value)">
            </div>
            <div class="miet-editor-row top">
                <span>Gilt für Maschinenkategorien</span>
                <div>
                    ${kategorien.length ? `
                    <div style="position:relative;">
                        <button type="button" onclick="event.stopPropagation(); window.mietVorlageKatMenu()"
                            style="width:100%; padding:10px 13px; border-radius:10px; border:1px solid rgba(255,255,255,0.12);
                                   background:rgba(255,255,255,0.04); color:${gewaehlteNamen.length ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)'};
                                   font-family:'Inter',sans-serif; font-size:0.88rem; cursor:pointer; text-align:left;
                                   display:flex; justify-content:space-between; align-items:center; gap:10px;">
                            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${gewaehlteNamen.length ? esc(gewaehlteNamen.join(', ')) : 'Maschinenkategorie wählen …'}</span>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity:0.5; flex-shrink:0;"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </button>
                        <div id="miet-kat-menu" onclick="event.stopPropagation()"
                            style="display:${katMenuOffen ? 'block' : 'none'}; position:absolute; top:100%; left:0; right:0; z-index:500;
                                   background:#0b1220; border:1px solid rgba(255,255,255,0.15); border-radius:10px; margin-top:4px;
                                   max-height:260px; overflow-y:auto; box-shadow:0 12px 40px rgba(0,0,0,0.7);">
                            ${kategorien.map(k => {
                                const sel = gewaehlt.has(String(k.id));
                                return `<div onclick="window.mietVorlageKategorie('${esc(k.id)}')"
                                    style="padding:10px 14px; cursor:pointer; font-size:0.88rem; border-bottom:1px solid rgba(255,255,255,0.06);
                                           color:${sel ? '#10b981' : '#fff'}; background:${sel ? 'rgba(16,185,129,0.15)' : 'transparent'};">
                                    ${sel ? '✓ ' : ''}${esc(k.name)}
                                </div>`;
                            }).join('')}
                        </div>
                    </div>` : `<span style="font-size:0.84rem; color:rgba(255,255,255,0.4);">Keine Maschinenkategorien angelegt.</span>`}
                </div>
            </div>
            <p class="miet-editor-hint">
                Wird eine Mietvereinbarung an einer Maschine aus einer dieser Kategorien angelegt,
                gilt automatisch diese Vorlage. Mehrfachauswahl möglich — ohne Zuordnung bleibt sie ungenutzt.
            </p>`
            + feldZeile('Titel des Bogens', 'titel', c.titel)
            + feldZeile('Zusatzinfo (Tagessatz)', 'zusatzinfo', c.zusatzinfo)
            + feldZeile('Schlusssatz', 'schlusssatz', c.schlusssatz);

        // --- Überschriften
        const bloecke = Object.keys(c.bloecke).map(k =>
            feldZeile(k.replace(/_/g, ' '), 'bloecke.' + k, c.bloecke[k])).join('');

        // --- Beschriftungen
        const felder = Object.keys(c.felder).map(k =>
            feldZeile(k.replace(/_/g, ' '), 'felder.' + k, c.felder[k])).join('');

        // --- Spalten
        const spalten = `
            <p style="font-size:0.8rem; color:rgba(255,255,255,0.45); margin:0 0 12px;">
                Die erste Spalte gilt als Übergabe, die zweite als Rücknahme. Weitere Spalten
                erscheinen zusätzlich auf dem Bogen.
            </p>
            ${c.spalten.map((s, i) => `
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
                <span style="width:24px; color:rgba(255,255,255,0.35); font-weight:800;">${i + 1}</span>
                <input class="glass-form-input" value="${esc(s.label)}" style="flex:1;"
                       oninput="window.mietVorlageSpalte(${i}, this.value)">
                <button class="btn-secondary" style="padding:6px 12px;" onclick="window.mietVorlageSpalteWeg(${i})" ${c.spalten.length <= 1 ? 'disabled' : ''}>Entfernen</button>
            </div>`).join('')}
            <button class="btn-secondary" onclick="window.mietVorlageSpalteNeu()">+ Spalte</button>`;

        // --- Baugruppen
        const baugruppen = c.baugruppen.map((g, gi) => `
            <div style="border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:14px; margin-bottom:12px;">
                <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px;">
                    <input class="glass-form-input" value="${esc(g.gruppe)}" style="flex:1; font-weight:700;"
                           oninput="window.mietVorlageGruppe(${gi}, this.value)">
                    <label style="display:flex; align-items:center; gap:6px; font-size:0.78rem; color:rgba(255,255,255,0.5); white-space:nowrap;">
                        <input type="checkbox" ${g.trommeltyp ? 'checked' : ''} onchange="window.mietVorlageTrommeltyp(${gi}, this.checked)"> Feld „Trommeltyp"
                    </label>
                    <button class="btn-secondary" style="padding:6px 12px;" onclick="window.mietVorlageGruppeWeg(${gi})">Gruppe löschen</button>
                </div>
                ${(g.punkte || []).map((roh, pi) => {
                    const p = window.mietPunktLesen(roh);
                    return `
                <div style="padding-left:16px; margin-bottom:10px;">
                    <div style="display:flex; gap:8px; align-items:center;">
                        <input class="glass-form-input" value="${esc(p.text)}" style="flex:1;"
                               oninput="window.mietVorlagePunkt(${gi}, ${pi}, this.value)">
                        <label style="display:flex; align-items:center; gap:6px; font-size:0.78rem; color:rgba(255,255,255,0.5); white-space:nowrap;"
                               title="Optional: steht grau auf dem Bogen und wird nur gedruckt, wenn etwas angekreuzt ist.">
                            <input type="checkbox" ${p.optional ? 'checked' : ''} style="accent-color:#10b981;"
                                   onchange="window.mietVorlagePunktOptional(${gi}, ${pi}, this.checked)"> Optional
                        </label>
                        <button class="btn-secondary" style="padding:6px 12px;" onclick="window.mietVorlagePunktWeg(${gi}, ${pi})">&times;</button>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center; margin-top:5px;">
                        <input class="glass-form-input" value="${esc(p.optionen.join('; '))}" style="flex:1; font-size:0.84rem;"
                               placeholder="Ausführungen zur Auswahl, mit Semikolon getrennt — z. B. 12 mm; 25 mm; 40 mm"
                               oninput="window.mietVorlagePunktOptionen(${gi}, ${pi}, this.value)">
                        <label style="display:flex; align-items:center; gap:6px; font-size:0.78rem; color:rgba(255,255,255,0.5); white-space:nowrap;"
                               title="Mehrere Ausführungen gleichzeitig auswählbar.">
                            <input type="checkbox" ${p.mehrfach ? 'checked' : ''} style="accent-color:#10b981;"
                                   onchange="window.mietVorlagePunktMehrfach(${gi}, ${pi}, this.checked)"> Mehrfach
                        </label>
                    </div>
                </div>`;
                }).join('')}
                <button class="btn-secondary" style="margin-left:16px;" onclick="window.mietVorlagePunktNeu(${gi})">+ Prüfpunkt</button>
            </div>`).join('')
            + `<button class="btn-secondary" onclick="window.mietVorlageGruppeNeu()">+ Baugruppe</button>`;

        // --- Fotos
        const fotos = c.fotos.map((f, i) => `
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
                <span style="width:52px; color:rgba(255,255,255,0.35); font-weight:800; font-size:0.8rem;">Bild ${i + 1}</span>
                <input class="glass-form-input" value="${esc(f)}" style="flex:1;"
                       oninput="window.mietVorlageFoto(${i}, this.value)">
                <button class="btn-secondary" style="padding:6px 12px;" onclick="window.mietVorlageFotoWeg(${i})">&times;</button>
            </div>`).join('')
            + `<button class="btn-secondary" onclick="window.mietVorlageFotoNeu()">+ Position</button>`;

        // --- Vertragstext
        const texte = feldZeile('Überschrift', 'texte.titel', c.texte.titel)
            + c.texte.abschnitte.map((a, ai) => `
            <div style="border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:14px; margin:12px 0;">
                <div style="display:flex; gap:8px; margin-bottom:10px;">
                    <input class="glass-form-input" value="${esc(a.titel || '')}" style="flex:1; font-weight:700;"
                           oninput="window.mietVorlageAbschnitt(${ai}, this.value)">
                    <button class="btn-secondary" style="padding:6px 12px;" onclick="window.mietVorlageAbschnittWeg(${ai})">Abschnitt löschen</button>
                </div>
                ${(a.absaetze || []).map((p, pi) => `
                <div style="display:flex; gap:8px; margin-bottom:8px;">
                    <textarea class="glass-form-input" rows="3" style="flex:1; resize:vertical;"
                              oninput="window.mietVorlageAbsatz(${ai}, ${pi}, this.value)">${esc(p)}</textarea>
                    <button class="btn-secondary" style="padding:6px 12px; align-self:flex-start;" onclick="window.mietVorlageAbsatzWeg(${ai}, ${pi})">&times;</button>
                </div>`).join('')}
                <button class="btn-secondary" onclick="window.mietVorlageAbsatzNeu(${ai})">+ Absatz</button>
            </div>`).join('')
            + `<button class="btn-secondary" onclick="window.mietVorlageAbschnittNeu()">+ Abschnitt</button>`;

        box.innerHTML = `<div class="miet-editor-grid">`
            + abschnitt('Grunddaten', kopf, true)
            + abschnitt('Überschriften der Abschnitte', bloecke)
            + abschnitt('Prüfspalten', spalten)
            + abschnitt('Baugruppen und Prüfpunkte', baugruppen)
            + abschnitt('Fotopositionen', fotos)
            + abschnitt('Beschriftungen der Zeilen', felder)
            + abschnitt('Vertragstext', texte, true)
            + `</div>`;
    }

    // ------------------------------------------------------
    // Änderungen am Editor
    // ------------------------------------------------------
    window.mietVorlageName = function (wert) {
        bearbeitet.name = wert;
        const titel = document.getElementById('miet-vorlage-titel');
        if (titel) titel.textContent = wert || 'Vorlage bearbeiten';
    };

    // Ein Klick im Menü schaltet die Kategorie an bzw. aus; das Menü
    // bleibt dabei offen, damit mehrere hintereinander gewählt werden
    // können. Ein Klick daneben schließt es.
    window.mietVorlageKategorie = function (id) {
        if (!Array.isArray(bearbeitet.category_ids)) bearbeitet.category_ids = [];
        const liste = bearbeitet.category_ids;
        const pos = liste.indexOf(String(id));
        if (pos === -1) liste.push(String(id)); else liste.splice(pos, 1);
        katMenuOffen = true;
        renderEditor();
    };

    window.mietVorlageKatMenu = function () {
        katMenuOffen = !katMenuOffen;
        const menu = document.getElementById('miet-kat-menu');
        if (menu) menu.style.display = katMenuOffen ? 'block' : 'none';
    };

    document.addEventListener('click', function () {
        if (!katMenuOffen) return;
        katMenuOffen = false;
        const menu = document.getElementById('miet-kat-menu');
        if (menu) menu.style.display = 'none';
    });

    window.mietVorlageFeld = function (pfad, wert) {
        const teile = pfad.split('.');
        let ziel = bearbeitet.config;
        for (let i = 0; i < teile.length - 1; i++) ziel = ziel[teile[i]];
        ziel[teile[teile.length - 1]] = wert;
    };

    // Aus der Beschriftung wird eine technische Kennung abgeleitet; sie
    // haelt die angekreuzten Werte zusammen und darf sich nicht mehr
    // aendern, sobald die Spalte einmal existiert.
    function kennung(label) {
        return 'sp_' + String(label).toLowerCase()
            .replace(/[äöüß]/g, m => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }[m]))
            .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + Date.now().toString(36).slice(-4);
    }

    window.mietVorlageSpalte = function (i, wert) { bearbeitet.config.spalten[i].label = wert; };
    window.mietVorlageSpalteNeu = function () {
        bearbeitet.config.spalten.push({ id: kennung('Spalte'), label: 'Weitere Prüfung' });
        renderEditor();
    };
    window.mietVorlageSpalteWeg = function (i) {
        if (bearbeitet.config.spalten.length <= 1) return;
        bearbeitet.config.spalten.splice(i, 1);
        renderEditor();
    };

    window.mietVorlageGruppe = function (gi, wert) { bearbeitet.config.baugruppen[gi].gruppe = wert; };
    window.mietVorlageTrommeltyp = function (gi, an) { bearbeitet.config.baugruppen[gi].trommeltyp = !!an; };
    window.mietVorlageGruppeNeu = function () {
        bearbeitet.config.baugruppen.push({ gruppe: 'Neue Baugruppe', punkte: ['Neuer Prüfpunkt'] });
        renderEditor();
    };
    window.mietVorlageGruppeWeg = function (gi) {
        bearbeitet.config.baugruppen.splice(gi, 1);
        renderEditor();
    };
    // Prüfpunkte werden beim ersten Anfassen von Text auf Objekt gehoben —
    // alte Vorlagen bleiben dadurch lesbar, bis jemand sie bearbeitet.
    function punktObjekt(gi, pi) {
        const gruppe = bearbeitet.config.baugruppen[gi];
        const aktuell = window.mietPunktLesen(gruppe.punkte[pi]);
        gruppe.punkte[pi] = aktuell;
        return aktuell;
    }

    window.mietVorlagePunkt = function (gi, pi, wert) { punktObjekt(gi, pi).text = wert; };

    window.mietVorlagePunktOptional = function (gi, pi, an) {
        punktObjekt(gi, pi).optional = !!an;
    };

    window.mietVorlagePunktMehrfach = function (gi, pi, an) {
        punktObjekt(gi, pi).mehrfach = !!an;
    };

    window.mietVorlagePunktOptionen = function (gi, pi, wert) {
        punktObjekt(gi, pi).optionen = String(wert || '')
            .split(';').map(s => s.trim()).filter(Boolean);
    };
    window.mietVorlagePunktNeu = function (gi) {
        bearbeitet.config.baugruppen[gi].punkte.push('Neuer Prüfpunkt');
        renderEditor();
    };
    window.mietVorlagePunktWeg = function (gi, pi) {
        bearbeitet.config.baugruppen[gi].punkte.splice(pi, 1);
        renderEditor();
    };

    window.mietVorlageFoto = function (i, wert) { bearbeitet.config.fotos[i] = wert; };
    window.mietVorlageFotoNeu = function () {
        bearbeitet.config.fotos.push('Neue Ansicht');
        renderEditor();
    };
    window.mietVorlageFotoWeg = function (i) {
        if (bearbeitet.config.fotos.length <= 1) return;
        bearbeitet.config.fotos.splice(i, 1);
        renderEditor();
    };

    window.mietVorlageAbschnitt = function (ai, wert) { bearbeitet.config.texte.abschnitte[ai].titel = wert; };
    window.mietVorlageAbschnittNeu = function () {
        bearbeitet.config.texte.abschnitte.push({ titel: 'Neuer Abschnitt', absaetze: [''] });
        renderEditor();
    };
    window.mietVorlageAbschnittWeg = function (ai) {
        bearbeitet.config.texte.abschnitte.splice(ai, 1);
        renderEditor();
    };
    window.mietVorlageAbsatz = function (ai, pi, wert) { bearbeitet.config.texte.abschnitte[ai].absaetze[pi] = wert; };
    window.mietVorlageAbsatzNeu = function (ai) {
        bearbeitet.config.texte.abschnitte[ai].absaetze.push('');
        renderEditor();
    };
    window.mietVorlageAbsatzWeg = function (ai, pi) {
        bearbeitet.config.texte.abschnitte[ai].absaetze.splice(pi, 1);
        renderEditor();
    };

    // ------------------------------------------------------
    // Speichern / Zurücksetzen / Vorschau
    // ------------------------------------------------------
    window.mietVorlageSpeichern = async function () {
        if (!bearbeitet) return;
        if (!window.supabaseClient) { window.showToast('Keine Verbindung zur Datenbank.'); return; }

        if (!String(bearbeitet.name || '').trim()) {
            window.showToast('Bitte einen Namen für die Vorlage eintragen.');
            return;
        }

        // Kategorie-IDs sind je nach Datenbank uuid ODER bigint. Im Editor
        // wird mit Text gearbeitet; rein numerische Werte gehen als Zahl
        // zurück, sonst lehnt eine bigint-Spalte den Text ab.
        const ids = (bearbeitet.category_ids || [])
            .map(String).filter(Boolean)
            .map(v => /^\d+$/.test(v) ? Number(v) : v);
        const zeile = {
            name: bearbeitet.name.trim(),
            category_ids: ids,
            // Altbestand: die erste Kategorie bleibt zusätzlich in category_id,
            // damit ältere Abfragen weiter etwas finden.
            category_id: ids[0] || null,
            config: bearbeitet.config
        };

        try {
            if (bearbeitet.id) {
                const { error } = await window.supabaseClient
                    .from('rental_templates').update(zeile).eq('id', bearbeitet.id);
                if (error) throw error;
            } else {
                const { data, error } = await window.supabaseClient
                    .from('rental_templates').insert([zeile]).select().single();
                if (error) throw error;
                bearbeitet.id = data.id;
            }
            await window.fetchMietVorlagen();
            window.showToast('Vorlage gespeichert.');
        } catch (e) {
            console.error('Vorlage speichern fehlgeschlagen:', e);
            if (/category_ids/.test((e && e.message) || '')) {
                window.showToast('Spalte „category_ids" fehlt — Migration supabase/supabase_add_rental_template_categories.sql in Supabase ausführen.');
                return;
            }
            window.showToast('Speichern fehlgeschlagen: ' + (e.message || 'unbekannter Fehler'));
        }
    };

    window.mietVorlageZuruecksetzen = function () {
        if (!bearbeitet) return;
        if (!confirm('Alle Anpassungen dieser Vorlage verwerfen und den Standard laden?')) return;
        bearbeitet.config = mitStandard(null);
        renderEditor();
        window.showToast('Standard geladen — noch nicht gespeichert.');
    };

    // Zeigt den Bogen so, wie er mit dieser Vorlage aussieht.
    window.mietVorlageVorschau = function () {
        if (!bearbeitet) return;
        // Der Bogen holt sich die Vorlage ueber getMietVorlage. Damit die
        // ungespeicherten Aenderungen sichtbar werden, wird die Funktion
        // fuer diesen einen Aufruf ueberlagert.
        const echt = window.getMietVorlage;
        window.getMietVorlage = () => tiefeKopie(bearbeitet.config);
        try {
            window.openMietvereinbarung(null);
        } finally {
            window.getMietVorlage = echt;
        }
    };

    // Beim Öffnen der Einstellungskarte neu laden; einmal beim Start
    // vorladen, damit eine Mietvereinbarung sofort die richtige Vorlage
    // bekommt.
    // Beim allerersten Öffnen ist die Tabelle leer. Damit die Liste nicht
    // leer bleibt, wird die eingebaute Siebtrommel-Vorlage einmalig als
    // echte Vorlage angelegt — ab da ist sie ganz normal bearbeitbar und
    // bleibt bestehen, auch wenn weitere dazukommen.
    async function anlegenFallsLeer() {
        if (tabelleFehlt || vorlagen.length || !window.supabaseClient) return;
        const kat = (window.categoryList || []).find(k => /sieb|trommel/i.test(k.name || ''));
        try {
            const { error } = await window.supabaseClient.from('rental_templates').insert([{
                name: STANDARD_NAME,
                category_ids: kat ? [kat.id] : [],
                category_id: kat ? kat.id : null,
                config: mitStandard(null)
            }]);
            if (error) throw error;
            await window.fetchMietVorlagen();
        } catch (e) {
            console.warn('Standardvorlage konnte nicht angelegt werden:', e && e.message);
        }
    }

    // Wird beim Öffnen der Einstellungsseite aufgerufen.
    window.mietVorlagenOeffnen = async function () {
        await window.fetchMietVorlagen();
        await anlegenFallsLeer();
    };

    document.addEventListener('DOMContentLoaded', () => {
        const karte = document.querySelector('.settings-card[data-target="miet-vorlagen"]');
        if (karte) karte.addEventListener('click', () => window.mietVorlagenOeffnen());
        setTimeout(() => { if (!geladen) window.fetchMietVorlagen(); }, 2500);
    });

    console.log('Mietvereinbarungs-Vorlagen geladen.');
})();
