// ==========================================================
// AUSDRUCK IN ANDERER SPRACHE — feste Beschriftungen
// ==========================================================
// Für die Vorschau in Englisch, Französisch oder Spanisch: ein zweiter
// Ausdruck zum Mitgeben oder zum Zeigen beim Kunden vor Ort.
//
// Zwei Quellen:
//   1. Feste Beschriftungen des Formulars (Überschriften, Tabellenköpfe,
//      Unterschriftenzeilen) stehen unten fest im Wörterbuch.
//   2. Titel, Kategorien und Prüfpunkte der Wartungs-, UVV- und
//      Einweisungspläne kommen aus den Einstellungen und ändern sich. Die
//      übersetzt die KI EINMAL; danach liegen sie im Gedächtnis
//      (localStorage) und werden nie wieder angefragt.
//
// Was jemand selbst eingetippt hat (Fehlerbeschreibung, Arbeitsschritte,
// Bemerkungen) bleibt bewusst deutsch: eine maschinelle Übersetzung wäre
// nicht verlässlich genug für ein Papier, das der Kunde unterschreibt.
//
// Verwendung im PDF: window.pdfT('Seriennummer: ') liefert die Übersetzung
// zur eingestellten Sprache; ist keine gesetzt (oder fehlt ein Eintrag),
// kommt der deutsche Text unverändert zurück. Neue Beschriftung im PDF?
// Hier eintragen, sonst bleibt sie im fremdsprachigen Ausdruck deutsch.
(function () {
    'use strict';

    const WOERTER = {
        en: {
            'Maschine: ': 'Machine: ',
            'Seriennummer: ': 'Serial number: ',
            'Baujahr: ': 'Year: ',
            'Betriebsstunden: ': 'Operating hours: ',
            'Motor: ': 'Engine: ',
            'Datum: ': 'Date: ',
            'Bis: ': 'To: ',
            'Techniker: ': 'Technician: ',
            'Betreiber / Rechnungsadresse:': 'Operator / invoice address:',
            'Maschinenstandort:': 'Machine location:',
            'Hotel / Unterkunft:': 'Hotel / accommodation:',
            'Ansprechpartner:': 'Contact person:',
            'Fehlerbeschreibung / Kurzbeschreibung Einsatz': 'Fault description / summary of work',
            'Ausgeführte Arbeiten': 'Work carried out',
            'Eingesetztes Material': 'Materials used',
            'Bemerkungen': 'Remarks',
            'Bemerkungen:': 'Remarks:',
            'Bemerkung': 'Remark',
            'Bemerkung / Beanstandung': 'Remark / defect',
            'Pos': 'No.',
            'Prüfpunkt': 'Check point',
            'Einweisungspunkt': 'Instruction point',
            'Wartungsarbeit / Prüfpunkt': 'Maintenance task / check point',
            'Intervall / Frist': 'Interval / due',
            'Erledigt': 'Done',
            'Erledigt / Bemerkung': 'Done / remark',
            'i.O.': 'OK',
            '= O.k.': '= OK',
            '= nicht gegeben': '= not given',
            '= noch offen': '= still open',
            'Unterschrift Techniker, ': 'Technician signature, ',
            'Unterschrift Kunde, ': 'Customer signature, ',
            'Unterschrift Fahrer/Mechaniker, ': 'Driver/mechanic signature, ',
            'Unterschriften eingewiesende Personen': 'Signatures of instructed persons',
            'O. g. gemeldete Störung ist behoben und die Reparatur in vollem Umfang ausgeführt.':
                'The reported malfunction has been repaired and the repair fully completed.'
        },
        fr: {
            'Maschine: ': 'Machine : ',
            'Seriennummer: ': 'Numéro de série : ',
            'Baujahr: ': 'Année : ',
            'Betriebsstunden: ': 'Heures de service : ',
            'Motor: ': 'Moteur : ',
            'Datum: ': 'Date : ',
            'Bis: ': 'Au : ',
            'Techniker: ': 'Technicien : ',
            'Betreiber / Rechnungsadresse:': 'Exploitant / adresse de facturation :',
            'Maschinenstandort:': 'Emplacement de la machine :',
            'Hotel / Unterkunft:': 'Hôtel / hébergement :',
            'Ansprechpartner:': 'Interlocuteur :',
            'Fehlerbeschreibung / Kurzbeschreibung Einsatz': 'Description du défaut / résumé de l’intervention',
            'Ausgeführte Arbeiten': 'Travaux effectués',
            'Eingesetztes Material': 'Matériel utilisé',
            'Bemerkungen': 'Remarques',
            'Bemerkungen:': 'Remarques :',
            'Bemerkung': 'Remarque',
            'Bemerkung / Beanstandung': 'Remarque / réclamation',
            'Pos': 'N°',
            'Prüfpunkt': 'Point de contrôle',
            'Einweisungspunkt': 'Point d’instruction',
            'Wartungsarbeit / Prüfpunkt': 'Travail d’entretien / point de contrôle',
            'Intervall / Frist': 'Intervalle / échéance',
            'Erledigt': 'Effectué',
            'Erledigt / Bemerkung': 'Effectué / remarque',
            'i.O.': 'Conforme',
            '= O.k.': '= conforme',
            '= nicht gegeben': '= non fourni',
            '= noch offen': '= à faire',
            'Unterschrift Techniker, ': 'Signature du technicien, ',
            'Unterschrift Kunde, ': 'Signature du client, ',
            'Unterschrift Fahrer/Mechaniker, ': 'Signature conducteur/mécanicien, ',
            'Unterschriften eingewiesende Personen': 'Signatures des personnes formées',
            'O. g. gemeldete Störung ist behoben und die Reparatur in vollem Umfang ausgeführt.':
                'Le défaut signalé ci-dessus a été corrigé et la réparation entièrement effectuée.'
        },
        es: {
            'Maschine: ': 'Máquina: ',
            'Seriennummer: ': 'Número de serie: ',
            'Baujahr: ': 'Año: ',
            'Betriebsstunden: ': 'Horas de servicio: ',
            'Motor: ': 'Motor: ',
            'Datum: ': 'Fecha: ',
            'Bis: ': 'Hasta: ',
            'Techniker: ': 'Técnico: ',
            'Betreiber / Rechnungsadresse:': 'Explotador / dirección de facturación:',
            'Maschinenstandort:': 'Ubicación de la máquina:',
            'Hotel / Unterkunft:': 'Hotel / alojamiento:',
            'Ansprechpartner:': 'Persona de contacto:',
            'Fehlerbeschreibung / Kurzbeschreibung Einsatz': 'Descripción de la avería / resumen de la intervención',
            'Ausgeführte Arbeiten': 'Trabajos realizados',
            'Eingesetztes Material': 'Material empleado',
            'Bemerkungen': 'Observaciones',
            'Bemerkungen:': 'Observaciones:',
            'Bemerkung': 'Observación',
            'Bemerkung / Beanstandung': 'Observación / reclamación',
            'Pos': 'N.º',
            'Prüfpunkt': 'Punto de control',
            'Einweisungspunkt': 'Punto de instrucción',
            'Wartungsarbeit / Prüfpunkt': 'Trabajo de mantenimiento / punto de control',
            'Intervall / Frist': 'Intervalo / plazo',
            'Erledigt': 'Realizado',
            'Erledigt / Bemerkung': 'Realizado / observación',
            'i.O.': 'Correcto',
            '= O.k.': '= correcto',
            '= nicht gegeben': '= no dado',
            '= noch offen': '= pendiente',
            'Unterschrift Techniker, ': 'Firma del técnico, ',
            'Unterschrift Kunde, ': 'Firma del cliente, ',
            'Unterschrift Fahrer/Mechaniker, ': 'Firma del conductor/mecánico, ',
            'Unterschriften eingewiesende Personen': 'Firmas de las personas instruidas',
            'O. g. gemeldete Störung ist behoben und die Reparatur in vollem Umfang ausgeführt.':
                'La avería indicada arriba ha sido subsanada y la reparación se ha ejecutado por completo.'
        }
    };

    window.PDF_SPRACHEN = [
        { code: 'de', label: 'Deutsch' },
        { code: 'en', label: 'Englisch' },
        { code: 'fr', label: 'Französisch' },
        { code: 'es', label: 'Spanisch' }
    ];

    // Gilt nur für den einen Ausdruck, der gerade erzeugt wird —
    // js/servicebericht-pdf.js setzt und löscht sie um den Aufruf herum.
    window.pdfSprache = 'de';

    // ------------------------------------------------------
    // Gedächtnis für Prüfpunkte und Plantitel
    // ------------------------------------------------------
    // Die Texte der Wartungs-, UVV- und Einweisungspläne stehen nicht im
    // Wörterbuch oben — sie kommen aus den Einstellungen und ändern sich.
    // Sie werden deshalb einmal von der KI übersetzt und danach dauerhaft
    // gemerkt (localStorage). Beim zweiten Ausdruck derselben Punkte gibt es
    // keine Anfrage mehr: sofort, offline, und immer dieselbe Formulierung.
    const MERK_KEY = 'meetra_pdf_uebersetzungen';
    let merk = null;

    function ladeMerk() {
        if (merk) return merk;
        try { merk = JSON.parse(localStorage.getItem(MERK_KEY) || '{}'); }
        catch (e) { merk = {}; }
        if (!merk || typeof merk !== 'object') merk = {};
        return merk;
    }

    function schreibeMerk() {
        try { localStorage.setItem(MERK_KEY, JSON.stringify(merk || {})); } catch (e) { /* voll */ }
    }

    function merkLies(sprache, text) {
        const m = ladeMerk();
        return (m[sprache] && m[sprache][text]) || null;
    }

    const SPRACHNAME = { en: 'Englisch', fr: 'Französisch', es: 'Spanisch' };

    // Übersetzt eine Liste von Texten und legt sie ins Gedächtnis.
    // Rückgabe: wie viele neu übersetzt wurden. Schlägt die KI fehl, bleibt
    // der deutsche Text stehen — der Ausdruck entsteht trotzdem.
    window.pdfUebersetzeTexte = async function (texte, sprache) {
        if (!sprache || sprache === 'de') return 0;
        const m = ladeMerk();
        m[sprache] = m[sprache] || {};

        const offen = [...new Set((texte || [])
            .map(t => String(t == null ? '' : t).trim())
            .filter(t => t && t.length > 1 && !m[sprache][t]))];
        if (!offen.length) return 0;
        if (typeof window.groqFetch !== 'function') return 0;

        // In Häppchen, damit eine Anfrage klein bleibt (Freies Kontingent:
        // 12.000 Token je Minute, siehe CLAUDE.md).
        const HAPPEN = 40;
        let neu = 0;
        let letzterFehler = null;
        for (let i = 0; i < offen.length; i += HAPPEN) {
            const teil = offen.slice(i, i + HAPPEN);
            try {
                const antwort = await window.groqFetch({
                    model: 'llama-3.3-70b-versatile',
                    temperature: 0,
                    messages: [
                        {
                            role: 'system',
                            content: 'Du übersetzt kurze Fachbegriffe aus Wartungs- und Prüfplänen für '
                                + 'Recyclingmaschinen. Antworte AUSSCHLIESSLICH mit einem JSON-Array von '
                                + 'Zeichenketten, gleiche Anzahl und Reihenfolge wie die Eingabe. '
                                + 'Keine Erklärungen, keine Nummerierung.'
                        },
                        {
                            role: 'user',
                            content: `Übersetze nach ${SPRACHNAME[sprache] || sprache}:\n`
                                + JSON.stringify(teil)
                        }
                    ]
                });
                const roh = await antwort.json().catch(() => null);
                // Fehler NICHT verschlucken: vorher blieb alles still deutsch
                // und niemand erfuhr, woran es lag (abgelaufene Anmeldung,
                // Tageslimit, kein Netz).
                if (!antwort.ok) {
                    throw new Error((roh && roh.error && roh.error.message)
                        || ('Der KI-Dienst antwortete mit Status ' + antwort.status));
                }
                const inhalt = roh?.choices?.[0]?.message?.content || '';
                const start = inhalt.indexOf('[');
                const ende = inhalt.lastIndexOf(']');
                if (start === -1 || ende === -1) {
                    throw new Error('Die Antwort der KI war nicht lesbar.');
                }
                const liste = JSON.parse(inhalt.slice(start, ende + 1));
                if (!Array.isArray(liste)) {
                    throw new Error('Die Antwort der KI hatte das falsche Format.');
                }
                teil.forEach((deutsch, idx) => {
                    const uebersetzt = liste[idx];
                    if (typeof uebersetzt === 'string' && uebersetzt.trim()) {
                        m[sprache][deutsch] = uebersetzt.trim();
                        neu++;
                    }
                });
            } catch (err) {
                letzterFehler = err;
                console.warn('Übersetzung fehlgeschlagen, Text bleibt deutsch:', err.message || err);
                break;
            }
        }
        schreibeMerk();
        // Wurde gar nichts übersetzt und es gab einen Fehler, muss der Aufrufer
        // das sagen können — sonst steht der Ausdruck kommentarlos auf Deutsch.
        if (!neu && letzterFehler) throw letzterFehler;
        return neu;
    };

    window.pdfT = function (text) {
        const spr = window.pdfSprache;
        if (!spr || spr === 'de') return text;
        const tabelle = WOERTER[spr];
        if (tabelle) {
            const treffer = tabelle[text];
            if (treffer !== undefined) return treffer;
        }
        // Nicht im festen Wörterbuch? Dann im Gedächtnis nachsehen
        // (Prüfpunkte, Plantitel, Kategorien).
        const gemerkt = merkLies(spr, String(text == null ? '' : text).trim());
        return gemerkt || text;
    };

    window.pdfSprachLabel = function (code) {
        const s = (window.PDF_SPRACHEN || []).find(x => x.code === code);
        return s ? s.label : code;
    };
})();
