// checklists.js - Client-side prototype logic for dynamic checklists (Wartungspläne & UVV-Protokolle)

window.MOCK_CHECKLIST_TEMPLATES = window.MOCK_CHECKLIST_TEMPLATES || [];
const MOCK_CHECKLIST_TEMPLATES = window.MOCK_CHECKLIST_TEMPLATES = [
    {
        id: "wartungsplan-jt-580",
        title: "Wartungsplan JT 580 / JT 630",
        type: "wartung",
        machine_model: "JT 580",
        items: [
            // Allgemein
            { pos: "1", category: "Allgemein", description: "Schmierstellen abschmieren", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "2", category: "Allgemein", description: "Elektrische Installation Zustand prüfen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "3", category: "Allgemein", description: "Maschinenrahmen prüfen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "4", category: "Allgemein", description: "Sicherheitsaufkleber kontrollieren", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "5", category: "Allgemein", description: "Funktion Anlaufwarnungen prüfen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "6", category: "Allgemein", description: "Not-Halt- und Sicherheitsschalter prüfen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "7", category: "Allgemein", description: "Batterie prüfen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "10", category: "Allgemein", description: "Befestigungselemente prüfen, ggf. nachziehen oder reparieren", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "11", category: "Allgemein", description: "Umsetzrotor auf Beschädigungen prüfen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "12", category: "Allgemein", description: "Türen und Klappen prüfen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            
            // Kraftstoffanlage
            { pos: "13", category: "Kraftstoffanlage", description: "Kraftstoff-Vorfiltereinsatz erneuern", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "14", category: "Kraftstoffanlage", description: "Kraftstofffiltereinsatz erneuern", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "15", category: "Kraftstoffanlage", description: "Kraftstoffanlage auf Dichtheit prüfen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "16", category: "Kraftstoffanlage", description: "Kraftstofftank Wasser und Bodensatz ablassen", interval: "1000Bh", models: ["JT 580", "JT 630"] },
            { pos: "17", category: "Kraftstoffanlage", description: "Kraftstofftankentlüftung erneuern", interval: "Alle 1000Bh oder alle 2 Jahre", models: ["JT 580", "JT 630"] },
            
            // Dieselmotor
            { pos: "18", category: "Dieselmotor", description: "Motor reinigen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "19", category: "Dieselmotor", description: "Motorraum reinigen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "20", category: "Dieselmotor", description: "Motor auf Dichtheit sichtprüfen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "21", category: "Dieselmotor", description: "Motorölanalyse", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "22", category: "Dieselmotor", description: "Motorölfilter wechseln", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "23", category: "Dieselmotor", description: "Motoröl wechsel", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "24", category: "Dieselmotor", description: "Kühlmittelfüllstand kontrollieren", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "24a", category: "Dieselmotor", description: "Kühler reinigen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "25", category: "Dieselmotor", description: "Hydraulikmotor am Hydraulikkühler prüfen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "26", category: "Dieselmotor", description: "Kühlmittelschläuche prüfen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "27", category: "Dieselmotor", description: "Kühlsystem prüfen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "28", category: "Dieselmotor", description: "Kühlmittel wechseln", interval: "Alle 5000Bh oder alle 3 Jahre", models: ["JT 580", "JT 630"] },
            { pos: "29", category: "Dieselmotor", description: "Poly-V Riemen prüfen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "30", category: "Dieselmotor", description: "Poly-V Riemen wechseln", interval: "Alle 5000Bh", models: ["JT 580", "JT 630"] },
            { pos: "31", category: "Dieselmotor", description: "Luftfiltereinsatz erneuern", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "32", category: "Dieselmotor", description: "Sicherheitselement erneuern", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "33", category: "Dieselmotor", description: "Luftansaugschläuche kontrollieren", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "34", category: "Dieselmotor", description: "Vorfilter Turbo II reinigen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "35", category: "Dieselmotor", description: "Masseanschluss prüfen ggf. festziehen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "36", category: "Dieselmotor", description: "Fehlercodes auslesen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "37", category: "Dieselmotor", description: "Filterelement Kurbelraumentlüftung reinigen ggf. wechseln", interval: "1000Bh", models: ["JT 580", "JT 630"] },
            { pos: "38", category: "Dieselmotor", description: "Abstände Lüfterflügel prüfen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "39", category: "Dieselmotor", description: "Öldruck messen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "40", category: "Dieselmotor", description: "Ladedruck unter Volllast messen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "41", category: "Dieselmotor", description: "Kühlmittelthermostat auf Funktion prüfen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "42", category: "Dieselmotor", description: "Kühlmittelthermostat erneuern", interval: "1000Bh", models: ["JT 580", "JT 630"] },
            { pos: "43", category: "Dieselmotor", description: "Motorbefestigung prüfen", interval: "500Bh", models: ["JT 580", "JT 630"] },

            // SCR-Anlage
            { pos: "44", category: "SCR-Anlage (nur bei Motor nach EU Stufe IV / V / US Tier 4 final)", description: "Abgasanlage sichtprüfen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "45", category: "SCR-Anlage (nur bei Motor nach EU Stufe IV / V / US Tier 4 final)", description: "Füllstand AdBlue kontrollieren", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "46", category: "SCR-Anlage (nur bei Motor nach EU Stufe IV / V / US Tier 4 final)", description: "Injektor wechseln", interval: "Alle 5000Bh", models: ["JT 580", "JT 630"] },
            { pos: "47", category: "SCR-Anlage (nur bei Motor nach EU Stufe IV / V / US Tier 4 final)", description: "AdBlue / DEF-Filter erneuern", interval: "1000Bh", models: ["JT 580", "JT 630"] },

            // Hydraulikanlage
            { pos: "48", category: "Hydraulikanlage", description: "Hydraulikschläuche erneuern", interval: "Alle 6 Jahre", models: ["JT 580", "JT 630"] },
            { pos: "49", category: "Hydraulikanlage", description: "Hydraulikanlage sichtprüfen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "50", category: "Hydraulikanlage", description: "Hydraulikanlage prüfen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "51", category: "Hydraulikanlage", description: "Hydraulikölfüllstand kontrollieren", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "52", category: "Hydraulikanlage", description: "Hydraulikölwechsel", interval: "2000Bh", models: ["JT 580", "JT 630"] },
            { pos: "53", category: "Hydraulikanlage", description: "Hydraulikfilter wechseln", interval: "1000Bh", models: ["JT 580", "JT 630"] },

            // Kettenfahrwerk
            { pos: "54", category: "Kettenfahrwerk", description: "Spannung der Raupenketten prüfen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "55", category: "Kettenfahrwerk", description: "Getriebe auf Dichtheit prüfen", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "56", category: "Kettenfahrwerk", description: "Ölstand des Getriebes kontrollieren", interval: "500Bh", models: ["JT 580", "JT 630"] },
            { pos: "57", category: "Kettenfahrwerk", description: "Getriebeöl wechseln", interval: "2000Bh", models: ["JT 580", "JT 630"] },

            // Feuerlöscher
            { pos: "58", category: "Feuerlöscher", description: "Betriebsbereitschaft prüfen", interval: "Alle 2 Jahre", models: ["JT 580", "JT 630"] },
            { pos: "59", category: "Feuerlöscher", description: "Feuerlöscher ersetzen", interval: "Alle 10 Jahre", models: ["JT 580", "JT 630"] }
        ]
    },
    {
        id: "wartungsplan-e-530",
        title: "Wartungsplan E 530 / E 380",
        type: "wartung",
        machine_model: "E 530",
        items: [
            { pos: "1", category: "Allgemein", description: "Keilriemenspannung kontrollieren", interval: "500Bh", models: ["E 530", "E 380"] },
            { pos: "2", category: "Allgemein", description: "Verschleißbleche und Auskleidung prüfen", interval: "500Bh", models: ["E 530", "E 380"] },
            { pos: "3", category: "Hydraulik", description: "Hydraulikölstand & Temperaturanzeige prüfen", interval: "500Bh", models: ["E 530", "E 380"] },
            { pos: "4", category: "Motor (Elektro)", description: "Elektromotor Lüfterrad reinigen & Lager abschmieren", interval: "1000Bh", models: ["E 530"] }
        ]
    },
    {
        id: "uvv-allgemein",
        title: "UVV Prüfprotokoll",
        type: "uvv",
        machine_model: "generic",
        items: [
            { pos: "1.1", category: "Kennzeichnung", description: "Fabrik- / Typenschild Grundgerät (vorhanden u. lesbar)", interval: "Jährlich" },
            { pos: "1.2", category: "Kennzeichnung", description: "CE-Kennzeichnung, ab Bj.95 (vorhanden u. lesbar)", interval: "Jährlich" },
            { pos: "1.3", category: "Kennzeichnung", description: "UVV-Prüfzeichen (Letzte) (vorhanden u. lesbar)", interval: "Jährlich" },
            { pos: "1.4", category: "Gefahrenbereich-Kennzeichnung", description: "Warnschilder (laut BA) (allgemeine Gefahrensymbole)", interval: "Jährlich" },
            { pos: "1.5", category: "Gefahrenbereich-Kennzeichnung", description: "Sonstige Warnschilder", interval: "Jährlich" },
            { pos: "2.1", category: "Rahmen", description: "Hauptrahmen", interval: "Jährlich" },
            { pos: "2.2", category: "Rahmen", description: "Spurräumer", interval: "Jährlich" },
            { pos: "2.3", category: "Rahmen", description: "Heckklappe", interval: "Jährlich" },
            { pos: "2.4", category: "Rahmen", description: "Hauben", interval: "Jährlich" },
            { pos: "2.5", category: "Schutzeinrichtungen", description: "Trennende Schutzeinrichtungen Motorhaube usw (Betätigung öffnen/schließen)", interval: "Jährlich" },
            { pos: "2.6", category: "Schutzeinrichtungen", description: "Drehende / Bewegliche Bauteile abgedeckt", interval: "Jährlich" },
            { pos: "2.7", category: "Schutzeinrichtungen", description: "Scharfe Ecken und Kanten (Abgerundet / abgedeckt)", interval: "Jährlich" },
            { pos: "2.8", category: "Fahrwerk", description: "Räderfahrwerk (Reifen Beschädigung)", interval: "Jährlich" },
            { pos: "2.9", category: "Fahrwerk", description: "Felgen (Felgen Beschädigung)", interval: "Jährlich" },
            { pos: "3.0", category: "Fahrwerk", description: "Fahrgetriebe (Fahrgetriebe / Aufhängung)", interval: "Jährlich" },
            { pos: "3.1", category: "Fahrwerk", description: "Parkbremse (Funktion)", interval: "Jährlich" },
            { pos: "3.2", category: "Fahrwerk", description: "Kettenfahrwerk (Kettenbeschädigung)", interval: "Jährlich" },
            { pos: "3.3", category: "Antrieb / Kraftübertragung", description: "Motoraufhängung", interval: "Jährlich" },
            { pos: "3.4", category: "Antrieb / Kraftübertragung", description: "Abgasanlage einschl. Schalldämpfer", interval: "Jährlich" },
            { pos: "3.5", category: "Antrieb / Kraftübertragung", description: "Abgasnachbehandlungssystem (Ad-Blue Tank)", interval: "Jährlich" },
            { pos: "3.6", category: "Antrieb / Kraftübertragung", description: "Kraftstoffanlage (Kraftstoffbehälter / Tank)", interval: "Jährlich" },
            { pos: "3.7", category: "Antrieb / Kraftübertragung", description: "Kraftstoffanlage (Leitungen / Filter)", interval: "Jährlich" },
            { pos: "3.8", category: "Antrieb / Kraftübertragung", description: "Getriebe (Aufhängung / Befestigung)", interval: "Jährlich" },
            { pos: "3.9", category: "Antrieb / Kraftübertragung", description: "Getriebe (Gehäuse)", interval: "Jährlich" },
            { pos: "4.0", category: "Antrieb / Kraftübertragung", description: "Hydraulikpumpen (Aufhängung / Befestigung)", interval: "Jährlich" },
            { pos: "4.1", category: "Antrieb / Kraftübertragung", description: "Hydraulikpumpen (Gehäuse)", interval: "Jährlich" },
            { pos: "4.2", category: "Hydraulikanlage", description: "Schläuche / Leitungen", interval: "Jährlich" },
            { pos: "4.3", category: "Hydraulikanlage", description: "Zylinder einschl. Befestigung", interval: "Jährlich" },
            { pos: "4.4", category: "Hydraulikanlage", description: "Ölbehälter", interval: "Jährlich" },
            { pos: "4.4b", category: "Hydraulikanlage", description: "Andere Hydraulische Bauteile", interval: "Jährlich" },
            { pos: "4.5", category: "Hydraulikanlage", description: "Notablass-Funktion", interval: "Jährlich" },
            { pos: "4.6", category: "Elektrische Anlage", description: "Leitungen / Steckverbindungen", interval: "Jährlich" },
            { pos: "4.7", category: "Elektrische Anlage", description: "Batterien (Halterung / Polabdeckung)", interval: "Jährlich" },
            { pos: "4.8", category: "Elektrische Anlage", description: "Trennschalter", interval: "Jährlich" },
            { pos: "4.9", category: "Elektrische Anlage", description: "Motor-Notaus-Schalter", interval: "Jährlich" },
            { pos: "5.0", category: "Elektrische Anlage", description: "Steckdosen / Stecker", interval: "Jährlich" },
            { pos: "5.1", category: "Warneinrichtungen", description: "Warnhupe", interval: "Jährlich" },
            { pos: "5.2", category: "Warneinrichtungen", description: "Rückfahrwarneinrichtung (falls vorh.)", interval: "Jährlich" },
            { pos: "5.3", category: "Warneinrichtungen", description: "Rückfahrkamera (falls vorh.)", interval: "Jährlich" },
            { pos: "5.4", category: "Beleuchtungseinrichtung", description: "Arbeitsscheinwerfer (vorne)", interval: "Jährlich" },
            { pos: "5.5", category: "Beleuchtungseinrichtung", description: "Arbeitsscheinwerfer (hinten)", interval: "Jährlich" },
            { pos: "5.6", category: "Beleuchtungseinrichtung", description: "Rundumleuchte (falls vorh.)", interval: "Jährlich" },
            { pos: "5.7", category: "Zugangssysteme zum Fahrer- & Wartungsplatz", description: "Aufstiege / Treppen, Stufen", interval: "Jährlich" },
            { pos: "5.8", category: "Zugangssysteme zum Fahrer- & Wartungsplatz", description: "Haltegriffe / Haltestangen", interval: "Jährlich" },
            { pos: "5.9", category: "Zugangssysteme zum Fahrer- & Wartungsplatz", description: "Laufstege, Plattformen", interval: "Jährlich" },
            { pos: "6.0", category: "Zugangssysteme zum Fahrer- & Wartungsplatz", description: "Geländer (H>=2000mm) (Absturzsicherung)", interval: "Jährlich" },
            { pos: "6.1", category: "Zugangssysteme zum Fahrer- & Wartungsplatz", description: "Knieleiste (H>=2000mm) (Absturzsicherung)", interval: "Jährlich" },
            { pos: "6.2", category: "Zugangssysteme zum Fahrer- & Wartungsplatz", description: "Fußleiste (H>=2000mm) (Absturzsicherung)", interval: "Jährlich" },
            { pos: "6.3", category: "Fahrer-/ Bedienerplatz", description: "Fahrer-/ Bedienerplatz allgemein", interval: "Jährlich" },
            { pos: "6.4", category: "Fahrer-/ Bedienerplatz", description: "Sitzpolster / Rückenpolster (Deformierung)", interval: "Jährlich" },
            { pos: "6.5", category: "Fahrer-/ Bedienerplatz", description: "Kennzeichnung (Vorhanden und lesbar)", interval: "Jährlich" },
            { pos: "6.7", category: "Fahrer-/ Bedienerplatz", description: "Diebstahlsicherung (Tür verschließbar)", interval: "Jährlich" },
            { pos: "6.8", category: "Fahrer-/ Bedienerplatz", description: "Diebstahlsicherung (Zündschloss)", interval: "Jährlich" },
            { pos: "6.9", category: "Fahrer-/ Bedienerplatz", description: "Türen, Fenster (Öffnen/schließen)", interval: "Jährlich" },
            { pos: "7.0", category: "Fahrer-/ Bedienerplatz", description: "Fahrersitz, Federung, Höhen-/Längsverstellung", interval: "Jährlich" },
            { pos: "7.1", category: "Fahrer-/ Bedienerplatz", description: "Betriebsanleitung der Maschine", interval: "Jährlich" },
            { pos: "7.2", category: "Fahrer-/ Bedienerplatz", description: "Konformitätserklärung", interval: "Jährlich" },
            { pos: "7.3", category: "Fahrer-/ Bedienerplatz", description: "Scheiben", interval: "Jährlich" },
            { pos: "7.4", category: "Fahrer-/ Bedienerplatz", description: "Notausstieg / Kennzeichnung / Hammer", interval: "Jährlich" },
            { pos: "7.5", category: "Fahrer-/ Bedienerplatz", description: "Sicht nach vorn / hinten", interval: "Jährlich" },
            { pos: "7.6", category: "Fahrer-/ Bedienerplatz", description: "Spiegel (Außen)", interval: "Jährlich" },
            { pos: "7.7", category: "Fahrer-/ Bedienerplatz", description: "Scheibenwasch-/ Wischanlage", interval: "Jährlich" },
            { pos: "7.8", category: "Fahrer-/ Bedienerplatz", description: "Heizung / Lüftung / AC", interval: "Jährlich" },
            { pos: "7.9", category: "Funktionsprüfungen vom Fahrerplatz aus", description: "Motorstartfunktion (Sicherheitsf. lt. BA)", interval: "Jährlich" },
            { pos: "8.0", category: "Funktionsprüfungen vom Fahrerplatz aus", description: "Feststellbremse", interval: "Jährlich" },
            { pos: "8.1", category: "Funktionsprüfungen vom Fahrerplatz aus", description: "Kontrollanzeigen", interval: "Jährlich" },
            { pos: "8.2", category: "Funktionsprüfungen vom Fahrerplatz aus", description: "Warnanzeigen", interval: "Jährlich" },
            { pos: "8.3", category: "Funktionsprüfungen vom Fahrerplatz aus", description: "Warnhupe", interval: "Jährlich" },
            { pos: "8.4", category: "Funktionsprüfungen vom Fahrerplatz aus", description: "Rückfahrwarneinrichtung (falls vorh.)", interval: "Jährlich" },
            { pos: "8.5", category: "Funktionsprüfungen vom Fahrerplatz aus", description: "Sicherheitsgurt", interval: "Jährlich" },
            { pos: "8.6", category: "Sondereinrichtungen", description: "Sondereinrichtungen allgemein", interval: "Jährlich" },
            { pos: "8.7", category: "Sondereinrichtungen", description: "Optischer Zustand der Maschine", interval: "Jährlich" },
            { pos: "8.8", category: "Sondereinrichtungen", description: "Flüssigkeitsstände überprüfen (Flüssigkeiten)", interval: "Jährlich" }
        ]
    }
];

let activeChecklists = {}; // templateId -> { template_id, title, type, answers }

window.initChecklists = function() {
    console.log("Checklists Module Initialized");
    
    // Watch for category selection changes
    const originalUpdateUI = window.updateServiceCategoryUI;
    if (typeof originalUpdateUI === 'function') {
        window.updateServiceCategoryUI = function() {
            originalUpdateUI();
            window.evaluateChecklistVisibility();
        };
    }
    
    // Watch for machine selection changes
    const machineIdInput = document.getElementById('selected-machine-id');
    if (machineIdInput) {
        const observer = new MutationObserver(() => {
            window.handleChecklistMachineChange();
        });
        observer.observe(machineIdInput, { attributes: true });
    }
};

window.evaluateChecklistVisibility = function() {
    const textEl = document.getElementById('service-category-text');
    const container = document.getElementById('service-checklist-section');
    if (!textEl || !container) return;
    
    const categoryText = textEl.textContent.toLowerCase();
    const isWartungOrUvv = categoryText.includes('wartung') || categoryText.includes('uvv') || categoryText.includes('einweisung');

    if (isWartungOrUvv) {
        container.style.display = 'block';
        window.populateChecklistSelector();
    } else {
        container.style.display = 'none';
        activeChecklists = {};
        window.renderActiveChecklists();
    }
};

window.populateChecklistSelector = function() {
    const container = document.getElementById('service-checklist-selector-container');
    if (!container) return;

    const machineName = document.getElementById('preview-name')?.textContent || '';
    const categoryText = document.getElementById('service-category-text')?.textContent.toLowerCase() || '';

    // Aktuell ausgewählte Maschine ermitteln, um Wartungspläne nach Maschinentyp zu filtern
    const selectedMachineId = document.getElementById('selected-machine-id')?.value;
    const selectedMachine = selectedMachineId ? (window.machineList || []).find(m => String(m.id) === String(selectedMachineId)) : null;
    const machineCategoryId = selectedMachine ? String(selectedMachine.category_id) : null;
    const planAssignments = window.uvvPlanAssignments || {};

    // Maschinenserie-Zuordnung hat Vorrang (Plan-Karte in den Einstellungen) — fällt auf den
    // alten Maschinenmodell-Textvergleich zurück, solange ein Plan noch keine Serie zugewiesen hat.
    const getAssignedSeries = (t) => planAssignments[t.id]?.machine_series || t.machine_series || [];
    const matchesMachineSeries = (t) => {
        const assignedSeries = getAssignedSeries(t);
        return assignedSeries.length
            ? !!(selectedMachine && selectedMachine.machine_series && assignedSeries.includes(selectedMachine.machine_series))
            : machineName.toLowerCase().includes((t.machine_model || '').toLowerCase());
    };

    // Alle Pläne (eingebaute + in den Einstellungen angelegte), gefiltert auf:
    // 1) den Plan-Typ passend zur gerade gewählten Service-Kategorie (bei "UVV" nur UVV-Pläne,
    //    bei "Wartung" nur Wartungspläne, bei "Einweisung" nur Einweisungserklärungen — sonst
    //    stehen alle drei Plan-Arten unübersichtlich gemischt in der Liste),
    // 2) den zum Maschinentyp passenden Maschinenkategorie-Bezug (Pläne ohne hinterlegte
    //    Maschinentyp-Zuordnung gelten als universell und werden immer angezeigt),
    // 3) der zugewiesenen Maschinenserie — ist eine Serie hinterlegt (z.B. "JT 580 / JT 630"),
    //    wird der Plan für alle anderen Maschinen komplett ausgeblendet statt nur unmarkiert
    //    angezeigt zu werden (vorher tauchte er trotz Serien-Zuordnung immer in der Liste auf).
    const allTemplates = window.ACTIVE_CHECKLIST_TEMPLATES || window.MOCK_CHECKLIST_TEMPLATES || [];
    const templates = allTemplates.filter(t => {
        if (!categoryText.includes(t.type)) return false;
        const assignedCatIds = planAssignments[t.id]?.category_ids || [];
        if (assignedCatIds.length && !(machineCategoryId && assignedCatIds.map(String).includes(machineCategoryId))) return false;
        const assignedSeries = getAssignedSeries(t);
        if (assignedSeries.length && !matchesMachineSeries(t)) return false;
        return true;
    });

    // Check if there are active checklists already loaded or entered.
    // If it's a completely new servicebericht or we haven't selected anything yet, we auto-enable the recommended ones.
    const isNew = Object.keys(activeChecklists).length === 0;

    let html = '';
    templates.forEach(t => {
        const matchesMachine = matchesMachineSeries(t);
        const suffix = matchesMachine ? ' (Empfohlen)' : '';
        
        let isChecked = activeChecklists[t.id] ? 'checked' : '';
        if (isNew) {
            // Auto-Aktivierung: der Plan-Typ passt bereits (siehe Filter oben), hier reicht die
            // Maschinenserie als zusätzliche Bedingung — einheitlich für Wartung, UVV und
            // Einweisung (vorher war UVV fest auf "uvv-allgemein" verdrahtet und Einweisung
            // ignorierte den Maschinen-Abgleich komplett).
            if (matchesMachine) {
                isChecked = 'checked';
                const answers = t.items.map(item => ({
                    pos: item.pos,
                    category: item.category,
                    description: item.description,
                    interval: item.interval,
                    answerType: item.answerType,
                    checked: false,
                    comment: ""
                }));
                activeChecklists[t.id] = {
                    template_id: t.id,
                    title: t.title,
                    type: t.type,
                    answers: answers
                };
            }
        }

        const typeBadgeStyle = t.type === 'wartung'
            ? 'background: rgba(16, 185, 129, 0.2); color: #10b981;'
            : t.type === 'einweisung'
                ? 'background: rgba(139, 92, 246, 0.2); color: #a78bfa;'
                : 'background: rgba(59, 130, 246, 0.2); color: #60a5fa;';

        html += `
            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; color: white; padding: 8px 12px; border-radius: 8px; background: rgba(255,255,255,0.05); transition: background 0.2s;"
                   onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                <input type="checkbox" data-template-id="${t.id}" ${isChecked} onchange="window.onChecklistToggle('${t.id}', this.checked)" style="width: 18px; height: 18px; accent-color: var(--color-primary-green); cursor: pointer;">
                <span style="font-weight: 500; font-size: 0.9rem;">${t.title}${suffix}</span>
                <span style="font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; ${typeBadgeStyle} font-weight: 700; margin-left: auto;">
                    ${t.type.toUpperCase()}
                </span>
            </label>
        `;
    });
    
    container.innerHTML = html;
    if (isNew) {
        window.renderActiveChecklists();
    }
};

window.handleChecklistMachineChange = function() {
    const textEl = document.getElementById('service-category-text');
    if (!textEl) return;
    const categoryText = textEl.textContent.toLowerCase();
    if (categoryText.includes('wartung') || categoryText.includes('uvv') || categoryText.includes('einweisung')) {
        window.populateChecklistSelector();
    }
};

window.onChecklistToggle = function(templateId, checked) {
    if (!checked) {
        // Unchecking: ask for confirmation if data exists
        const active = activeChecklists[templateId];
        if (active) {
            const hasData = active.answers.some(ans => ans.checked || (ans.comment && ans.comment.trim() !== ''));
            if (hasData) {
                if (!confirm(`Möchten Sie das Protokoll "${active.title}" wirklich deaktivieren? Alle eingegebenen Antworten gehen verloren.`)) {
                    // Re-check the UI box
                    const checkbox = document.querySelector(`input[data-template-id="${templateId}"]`);
                    if (checkbox) checkbox.checked = true;
                    return;
                }
            }
        }
        delete activeChecklists[templateId];
        window.renderActiveChecklists();
    } else {
        // Checking on: create template layout structure
        const template = (window.ACTIVE_CHECKLIST_TEMPLATES || MOCK_CHECKLIST_TEMPLATES).find(t => t.id === templateId);
        if (!template) return;
        
        const answers = template.items.map(item => ({
            pos: item.pos,
            category: item.category,
            description: item.description,
            interval: item.interval,
            answerType: item.answerType,
            checked: false,
            comment: ""
        }));
        
        activeChecklists[templateId] = {
            template_id: templateId,
            title: template.title,
            type: template.type,
            answers: answers
        };
        window.renderActiveChecklists();
    }
};

window.renderActiveChecklists = function() {
    const container = document.getElementById('checklist-questions-container');
    if (!container) return;
    
    const activeList = Object.values(activeChecklists);
    if (activeList.length === 0) {
        container.innerHTML = '<div style="color: rgba(255,255,255,0.4); text-align: center; padding: 1.5rem; font-size: 0.9rem; font-weight: 500;">Kein Zusatzprotokoll aktiviert.</div>';
        return;
    }
    
    let html = '';
    activeList.forEach(checklist => {
        // UVV & Einweisung teilen sich dasselbe Layout (Ja/Nein statt Tri-State-Haken, keine
        // Intervall-Spalte) — nur Beschriftung/Farbe unterscheiden sich je Typ.
        const isYesNoStyle = checklist.type === 'uvv' || checklist.type === 'einweisung';
        const isEinweisung = checklist.type === 'einweisung';
        const headerBadgeBg = checklist.type === 'wartung' ? 'var(--color-primary-green)' : isEinweisung ? '#7c3aed' : '#2563eb';
        const pointLabel = isEinweisung ? 'Einweisungspunkt' : 'Wartungsarbeit / Prüfpunkt';
        const ioLabel = isYesNoStyle ? 'i.O.' : 'Erledigt';
        const commentLabel = isYesNoStyle ? 'Bemerkung / Beanstandung' : 'Bemerkung';

        html += `
            <div class="active-checklist-box" data-active-template-id="${checklist.template_id}" style="margin-top: 1.5rem; background: rgba(0,0,0,0.2); border: 1.5px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 1.25rem;">
                <h4 style="color: white; margin-top: 0; margin-bottom: 1rem; font-size: 1.1rem; display: flex; align-items: center; justify-content: space-between;">
                    <span>📋 ${checklist.title}</span>
                    <span style="font-size: 0.8rem; background: ${headerBadgeBg}; color: white; padding: 2px 10px; border-radius: 20px; font-weight: 500;">
                        ${checklist.type.toUpperCase()}
                    </span>
                </h4>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; min-width: 600px; text-align: left;">
                        <thead>
                            <tr style="border-bottom: 2px solid rgba(255,255,255,0.15);">
                                <th style="padding: 10px; font-size: 0.85rem; color: rgba(255,255,255,0.6); font-weight: 700; width: 6%;">Pos</th>
                                <th style="padding: 10px; font-size: 0.85rem; color: rgba(255,255,255,0.6); font-weight: 700; width: ${isYesNoStyle ? '52%' : '34%'};">${pointLabel}</th>
                                ${!isYesNoStyle ? `<th style="padding: 10px; font-size: 0.85rem; color: rgba(255,255,255,0.6); font-weight: 700; width: 18%; text-align: center;">Intervall / Frist</th>` : ''}
                                ${isEinweisung
                                    ? `<th style="padding: 10px; font-size: 0.85rem; color: rgba(255,255,255,0.6); font-weight: 700; width: 42%; text-align: center;">Erledigt / Bemerkung</th>`
                                    : `<th style="padding: 10px; font-size: 0.85rem; color: rgba(255,255,255,0.6); font-weight: 700; width: ${isYesNoStyle ? '18%' : '12%'}; text-align: center;">${ioLabel}</th>
                                <th style="padding: 10px; font-size: 0.85rem; color: rgba(255,255,255,0.6); font-weight: 700; width: 24%; text-align: center;">${commentLabel}</th>`
                                }
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        let currentCategory = "";
        checklist.answers.forEach((item, index) => {
            if (item.category !== currentCategory) {
                currentCategory = item.category;
                if (isEinweisung) {
                    // Bei Einweisung bekommt auch die Überschrift/Kategorie selbst ein eigenes
                    // Ankreuzfeld (z.B. "ganze Kategorie abgenommen"), unabhängig von den einzelnen
                    // Punkten darunter — gleiche frei/x(grün)/-(orange)-Logik wie bei den Punkten.
                    const catStatus = (checklist.categoryStatus && checklist.categoryStatus[currentCategory]) || '';
                    const catBoxStyle = einweisungIoBoxStyle(catStatus);
                    const catNameSafe = currentCategory.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                    html += `
                        <tr style="background: rgba(255,255,255,0.03);">
                            <td colspan="2" style="padding: 8px 10px; font-size: 0.85rem; font-weight: 800; color: var(--accent-color); text-transform: uppercase; letter-spacing: 0.5px;">
                                ${currentCategory}
                            </td>
                            <td style="padding: 5px 10px; text-align: center;">
                                <div onclick="window.cycleChecklistCategoryIO('${checklist.template_id}', '${catNameSafe}')" title="Klicken zum Umschalten: frei -> x -> -"
                                    style="width: 42px; height: 42px; margin: 0 auto; border-radius: 8px; border: 2px solid ${catBoxStyle.border}; background: ${catBoxStyle.bg}; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1.8rem; font-weight: 900; color: ${catBoxStyle.color}; user-select: none; transition: all 0.15s;">${catBoxStyle.symbol}</div>
                            </td>
                        </tr>
                    `;
                } else {
                    // Wartung: Übergruppe kann per Haken vom Ausdruck (Vorschau/Speichern) ausgeschlossen
                    // werden, ohne die Punkte hier im Formular zu löschen — geprüft wird nur beim Drucken.
                    const colspan = isYesNoStyle ? 4 : 5;
                    const catNameSafe = currentCategory.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                    const catIncluded = !checklist.categoryIncluded || checklist.categoryIncluded[currentCategory] !== false;
                    html += `
                        <tr style="background: rgba(255,255,255,0.03);">
                            <td colspan="${colspan - 1}" style="padding: 8px 10px; font-size: 0.85rem; font-weight: 800; color: var(--accent-color); text-transform: uppercase; letter-spacing: 0.5px; ${catIncluded ? '' : 'opacity: 0.4; text-decoration: line-through;'}">
                                ${currentCategory}
                            </td>
                            <td style="padding: 5px 10px; text-align: center;">
                                <label title="Diese Übergruppe im Ausdruck/Vorschau drucken" style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer; color: rgba(255,255,255,0.6); font-size: 0.75rem; font-weight: 700;">
                                    <input type="checkbox" ${catIncluded ? 'checked' : ''} onchange="window.toggleChecklistCategoryIncluded('${checklist.template_id}', '${catNameSafe}')" style="width: 16px; height: 16px; cursor: pointer; accent-color: var(--color-primary-green);">
                                    Drucken
                                </label>
                            </td>
                        </tr>
                    `;
                }
            }

            const commentVal = item.comment || '';

            if (isYesNoStyle && isEinweisung) {
                // Einweisung: pro Punkt entweder ein Ankreuzfeld ODER ein Bemerkungsfeld — welches
                // der beiden es ist, wird im Plan-Editor pro Punkt festgelegt (item.answerType).
                // Ankreuzfeld ist ein Klick-Kasten mit drei Zuständen (frei -> x (grün) -> - (orange)
                // -> frei), statt Ja/Nein-Radiobuttons.
                const ioValue = item.io || '';
                const isRemarkField = item.answerType === 'remark';
                const ioBoxStyle = einweisungIoBoxStyle(ioValue);
                html += `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);" onmouseover="this.style.background='rgba(255,255,255,0.01)'" onmouseout="this.style.background='transparent'">
                        <td style="padding: 10px 10px; color: rgba(255,255,255,0.6); font-size: 0.9rem; font-weight: 600;">${item.pos}</td>
                        <td style="padding: 10px 10px;">
                            <div style="color: white; font-size: 0.9rem; font-weight: 500; line-height: 1.4;">${item.description}</div>
                        </td>
                        <td style="padding: 10px 10px; text-align: center;">
                            ${isRemarkField ? `
                            <input type="text" value="${commentVal}" placeholder="Bemerkung" oninput="window.setChecklistItemComment('${checklist.template_id}', ${index}, this.value)"
                                   style="width: 100%; height: 34px; padding: 6px 10px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; font-size: 0.85rem; outline: none; transition: border-color 0.2s; text-align: left;"
                                   onfocus="this.style.borderColor='var(--color-primary-green)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
                            ` : `
                            <div id="io-box-${checklist.template_id}-${index}" onclick="window.cycleChecklistItemIO('${checklist.template_id}', ${index})" title="Klicken zum Umschalten: frei -> x -> -"
                                style="width: 30px; height: 30px; margin: 0 auto; border-radius: 8px; border: 2px solid ${ioBoxStyle.border}; background: ${ioBoxStyle.bg}; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1.3rem; font-weight: 900; color: ${ioBoxStyle.color}; user-select: none; transition: all 0.15s;">${ioBoxStyle.symbol}</div>
                            `}
                        </td>
                    </tr>
                `;
            } else if (isYesNoStyle) {
                // UVV: Ja/Nein radio buttons + separate Bemerkungsfeld, no interval column
                const ioValue = item.io || ''; // 'ja', 'nein', or ''
                html += `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);" onmouseover="this.style.background='rgba(255,255,255,0.01)'" onmouseout="this.style.background='transparent'">
                        <td style="padding: 10px 10px; color: rgba(255,255,255,0.6); font-size: 0.9rem; font-weight: 600;">${item.pos}</td>
                        <td style="padding: 10px 10px;">
                            <div style="color: white; font-size: 0.9rem; font-weight: 500; line-height: 1.4;">${item.description}</div>
                        </td>
                        <td style="padding: 10px 10px; text-align: center;">
                            <div style="display: flex; align-items: center; justify-content: center; gap: 16px;">
                                <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; color: #10b981; font-size: 0.85rem; font-weight: 700;">
                                    <input type="radio" name="io_${checklist.template_id}_${index}" value="ja" ${ioValue === 'ja' ? 'checked' : ''} onchange="window.toggleChecklistItemIO('${checklist.template_id}', ${index}, 'ja')" style="accent-color: #10b981; cursor: pointer;"> Ja
                                </label>
                                <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; color: #f87171; font-size: 0.85rem; font-weight: 700;">
                                    <input type="radio" name="io_${checklist.template_id}_${index}" value="nein" ${ioValue === 'nein' ? 'checked' : ''} onchange="window.toggleChecklistItemIO('${checklist.template_id}', ${index}, 'nein')" style="accent-color: #f87171; cursor: pointer;"> Nein
                                </label>
                            </div>
                        </td>
                        <td style="padding: 10px 10px; text-align: center;">
                            <input type="text" value="${commentVal}" placeholder="Beanstandung/Bemerkung" oninput="window.setChecklistItemComment('${checklist.template_id}', ${index}, this.value)"
                                   style="width: 100%; height: 34px; padding: 6px 10px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; font-size: 0.85rem; outline: none; transition: border-color 0.2s; text-align: left;"
                                   onfocus="this.style.borderColor='var(--color-primary-green)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
                        </td>
                    </tr>
                `;
            } else {
                // Wartung: original layout with interval + checkbox
                const isYearInterval = item.interval && item.interval.toLowerCase().includes('jahr');
                const intervalBadgeStyle = isYearInterval
                    ? 'background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); color: #f59e0b;'
                    : 'background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #e2e8f0;';

                // Tri-state "Erledigt" status: false (offen) -> true (erledigt) -> 'na' (nicht zutreffend) -> false
                const status = item.checked;
                const isNA = status === 'na';
                let statusBoxStyle, statusContent;
                if (isNA) {
                    statusBoxStyle = 'border: 2px solid #1e3a5f; background: transparent; color: transparent;';
                    statusContent = '';
                } else if (status === true) {
                    statusBoxStyle = 'border: 2px solid var(--color-primary-green); background: var(--color-primary-green); color: white;';
                    statusContent = '✓';
                } else {
                    statusBoxStyle = 'border: 2px solid rgba(255,255,255,0.25); background: rgba(255,255,255,0.03); color: transparent;';
                    statusContent = '';
                }

                html += `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); position: relative;" onmouseover="this.style.background='rgba(255,255,255,0.01)'" onmouseout="this.style.background='transparent'">
                        <td style="padding: 12px 10px; color: rgba(255,255,255,0.6); font-size: 0.9rem; font-weight: 600;">
                            ${isNA ? `<div style="position: absolute; left: 0; top: 50%; width: 100%; height: 2px; background: #1e3a5f; opacity: 0.9; transform: translateY(-50%); pointer-events: none; z-index: 1;"></div>` : ''}
                            ${item.pos}
                        </td>
                        <td style="padding: 12px 10px;">
                            <div style="color: white; font-size: 0.9rem; font-weight: 500; line-height: 1.4;">${item.description}</div>
                        </td>
                        <td style="padding: 12px 10px; text-align: center;">
                            <span style="font-size: 0.78rem; display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: 700; ${intervalBadgeStyle}">
                                ${item.interval}
                            </span>
                        </td>
                        <td style="padding: 12px 10px; text-align: center;">
                            <div onclick="window.toggleChecklistItem('${checklist.template_id}', ${index})" title="Klicken: offen → erledigt → nicht zutreffend"
                                 style="width: 24px; height: 24px; margin: 0 auto; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 1rem; line-height: 1; transition: all 0.15s ease; ${statusBoxStyle}">
                                ${statusContent}
                            </div>
                        </td>
                        <td style="padding: 12px 10px; text-align: center;">
                            <input type="text" value="${commentVal}" placeholder="Notiz..." oninput="window.setChecklistItemComment('${checklist.template_id}', ${index}, this.value)"
                                   style="width: 100%; height: 36px; padding: 6px 12px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; font-size: 0.85rem; outline: none; transition: border-color 0.2s; text-align: left;"
                                   onfocus="this.style.borderColor='var(--color-primary-green)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
                        </td>
                    </tr>
                `;
            }
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
        `;
        
        // For UVV & Einweisung: add general remarks field only (signatures are in the main form section 5)
        if (isYesNoStyle) {
            const generalRemark = checklist.generalRemark || '';
            html += `
                <div style="margin-top: 1.25rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1.25rem;">
                    <label style="display: block; font-size: 0.85rem; color: rgba(255,255,255,0.6); font-weight: 700; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">Bemerkungen</label>
                    <textarea rows="3" placeholder="Allgemeine Bemerkungen zur UVV-Prüfung..." oninput="window.setUVVGeneralRemark('${checklist.template_id}', this.value)"
                        style="width: 100%; padding: 10px 14px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; font-size: 0.9rem; outline: none; resize: vertical; transition: border-color 0.2s; font-family: inherit;"
                        onfocus="this.style.borderColor='var(--color-primary-green)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">${generalRemark}</textarea>
                </div>
            `;

            // Bei Einweisung: beliebig viele Unterschriften für die unterwiesenen Fahrer/Mechaniker
            // (unabhängig von Techniker/Kunde im Hauptformular) — je Eintrag Datum + Unterschriftenfeld.
            if (isEinweisung) {
                const driverSigs = checklist.driverSignatures || [];
                html += `
                    <div style="margin-top: 1.25rem;">
                        <button type="button" onclick="window.addDriverSignature('${checklist.template_id}')"
                            style="padding: 8px 16px; border-radius: 8px; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.3); color: #10b981; font-weight:700; font-size:0.82rem; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            Unterschrift hinzufügen
                        </button>
                    </div>
                    ${driverSigs.map((sig, sigIdx) => `
                        <div style="margin-top: 1rem; padding: 1rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; position: relative;">
                            <button type="button" onclick="window.removeDriverSignature('${checklist.template_id}', ${sigIdx})" title="Entfernen"
                                style="position:absolute; top:8px; right:8px; background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.4); color:#ef4444; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:1rem; line-height:1; padding:0;">&times;</button>
                            <div style="display:flex; gap: 1rem; align-items: flex-start; flex-wrap: wrap;">
                                <div style="flex: 0 0 150px;">
                                    <label style="display:block; font-size:0.75rem; color: rgba(255,255,255,0.5); margin-bottom: 4px;">Datum</label>
                                    <input type="date" value="${sig.date || ''}" onchange="window.setDriverSignatureDate('${checklist.template_id}', ${sigIdx}, this.value)"
                                        style="width:100%; height: 38px; padding: 0 10px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; font-size: 0.85rem; outline: none;">
                                </div>
                                <div style="flex: 1; min-width: 220px;">
                                    <label style="display:block; font-size:0.75rem; color: rgba(255,255,255,0.5); margin-bottom: 4px;">Unterschrift Fahrer/Mechaniker</label>
                                    <div onclick="window.openDriverSignaturePad('${checklist.template_id}', ${sigIdx})"
                                        style="border: 2px dashed rgba(255,255,255,0.15); border-radius: 10px; height: 80px; display:flex; align-items:center; justify-content:center; background: rgba(0,0,0,0.2); cursor:pointer; overflow:hidden;">
                                        ${sig.signature ? `<img src="${sig.signature}" style="max-height:100%; max-width:100%; object-fit:contain;">` : `<span style="color: rgba(255,255,255,0.4); font-size:0.82rem;">👉 Klicken zum Unterschreiben</span>`}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                `;
            }
        }
        
        html += `
            </div>
        `;
    });
    
    container.innerHTML = html;
};

window.toggleChecklistItem = function(templateId, index) {
    const item = activeChecklists[templateId] && activeChecklists[templateId].answers[index];
    if (!item) return;

    // Cycle: offen (false) -> erledigt (true) -> nicht zutreffend ('na') -> offen
    if (item.checked === true) {
        item.checked = 'na';
    } else if (item.checked === 'na') {
        item.checked = false;
    } else {
        item.checked = true;
    }
    window.renderActiveChecklists();
};

window.toggleChecklistItemIO = function(templateId, index, value) {
    if (activeChecklists[templateId] && activeChecklists[templateId].answers[index]) {
        activeChecklists[templateId].answers[index].io = value;
    }
};

// Einweisungs-Ankreuzfeld: frei -> x (grün) -> - (orange) -> frei. Liefert die Darstellung
// für einen gegebenen io-Wert, damit Render und Klick-Handler dieselbe Logik benutzen.
function einweisungIoBoxStyle(ioValue) {
    if (ioValue === 'x') {
        return { symbol: '✕', color: '#10b981', border: '#10b981', bg: 'rgba(16,185,129,0.12)' };
    }
    if (ioValue === 'dash') {
        return { symbol: '−', color: '#f59e0b', border: '#f59e0b', bg: 'rgba(245,158,11,0.12)' };
    }
    return { symbol: '', color: 'transparent', border: 'rgba(255,255,255,0.25)', bg: 'rgba(255,255,255,0.03)' };
}

window.cycleChecklistItemIO = function(templateId, index) {
    const answer = activeChecklists[templateId] && activeChecklists[templateId].answers[index];
    if (!answer) return;
    const current = answer.io || '';
    const next = current === '' ? 'x' : (current === 'x' ? 'dash' : '');
    answer.io = next;

    const box = document.getElementById(`io-box-${templateId}-${index}`);
    if (!box) return;
    const style = einweisungIoBoxStyle(next);
    box.textContent = style.symbol;
    box.style.color = style.color;
    box.style.borderColor = style.border;
    box.style.background = style.bg;
};

// Gleiches frei -> x -> - Ankreuzfeld, aber auf Kategorie-Ebene statt pro Punkt (z.B. um eine
// ganze Kategorie als komplett abgenommen zu markieren). Wird pro Checklisten-Typ in
// checklist.categoryStatus[kategorieName] gespeichert und landet automatisch im checklist_payload.
window.cycleChecklistCategoryIO = function(templateId, categoryName) {
    const checklist = activeChecklists[templateId];
    if (!checklist) return;
    if (!checklist.categoryStatus) checklist.categoryStatus = {};
    const current = checklist.categoryStatus[categoryName] || '';
    const next = current === '' ? 'x' : (current === 'x' ? 'dash' : '');
    checklist.categoryStatus[categoryName] = next;
    // Voller Re-Render, da derselbe Kategoriename theoretisch mehrfach vorkommen könnte
    // (anders als bei Einzelpunkten gibt es hier keine eindeutige Index-ID pro Box).
    window.renderActiveChecklists();
};

// Steuert, ob eine Übergruppe (Kategorie) eines Wartungsprotokolls beim Ausdruck/in der Vorschau
// bzw. beim späteren Speichern als PDF mitgedruckt wird. Standard: gedruckt (true), bis der Haken
// entfernt wird. Landet in checklist.categoryIncluded[kategorieName] und damit automatisch im
// checklist_payload (siehe getChecklistPayload), da keine Feld-Allowlist existiert.
window.toggleChecklistCategoryIncluded = function(templateId, categoryName) {
    const checklist = activeChecklists[templateId];
    if (!checklist) return;
    if (!checklist.categoryIncluded) checklist.categoryIncluded = {};
    const currentlyIncluded = checklist.categoryIncluded[categoryName] !== false;
    checklist.categoryIncluded[categoryName] = !currentlyIncluded;
    window.renderActiveChecklists();
};

window.setChecklistItemComment = function(templateId, index, comment) {
    if (activeChecklists[templateId] && activeChecklists[templateId].answers[index]) {
        activeChecklists[templateId].answers[index].comment = comment;
    }
};

window.setUVVGeneralRemark = function(templateId, value) {
    if (activeChecklists[templateId]) {
        activeChecklists[templateId].generalRemark = value;
    }
};

// Fahrer/Mechaniker-Unterschriften bei Einweisung — beliebig viele, je eine pro unterwiesener
// Person (anders als Techniker/Kunde, die fest im Hauptformular stehen). Liegt in
// checklist.driverSignatures = [{ date, signature }, ...] und landet automatisch im
// checklist_payload, da getChecklistPayload() die ganzen activeChecklists-Objekte zurückgibt.
// Das eigentliche Zeichnen (Canvas) übernimmt der generische Signatur-Pad in index.html — diese
// Funktionen halten nur die Liste/Daten aktuell, da activeChecklists nur hier direkt erreichbar ist.
window.addDriverSignature = function(templateId) {
    const checklist = activeChecklists[templateId];
    if (!checklist) return;
    if (!Array.isArray(checklist.driverSignatures)) checklist.driverSignatures = [];
    checklist.driverSignatures.push({ date: '', signature: '' });
    window.renderActiveChecklists();
};

window.removeDriverSignature = function(templateId, index) {
    const checklist = activeChecklists[templateId];
    if (!checklist || !Array.isArray(checklist.driverSignatures)) return;
    checklist.driverSignatures.splice(index, 1);
    window.renderActiveChecklists();
};

window.setDriverSignatureDate = function(templateId, index, value) {
    const checklist = activeChecklists[templateId];
    if (checklist && checklist.driverSignatures && checklist.driverSignatures[index]) {
        checklist.driverSignatures[index].date = value;
    }
};

window.getDriverSignatureImage = function(templateId, index) {
    const checklist = activeChecklists[templateId];
    return (checklist && checklist.driverSignatures && checklist.driverSignatures[index]) ? checklist.driverSignatures[index].signature : '';
};

window.setDriverSignatureImage = function(templateId, index, dataUrl) {
    const checklist = activeChecklists[templateId];
    if (checklist && checklist.driverSignatures && checklist.driverSignatures[index]) {
        checklist.driverSignatures[index].signature = dataUrl;
    }
    window.renderActiveChecklists();
};

// Fasst zusammen, was bei einem Servicebericht mit Wartungsprotokoll(en) tatsächlich gedruckt/
// gewartet wurde — für die Historie-Anzeige. Nutzt dieselbe categoryIncluded-Markierung wie der
// PDF-Export (siehe toggleChecklistCategoryIncluded): wurden alle Übergruppen (z.B. Maschine, SBA,
// Motor) mitgedruckt, gilt die Wartung als komplett; wurden nur einzelne abgehakt, werden genau
// diese als Text zurückgegeben (z.B. "SBA" oder "SBA, Motor"). Gibt null zurück, wenn der Bericht
// gar kein Wartungsprotokoll enthält.
window.getMaintenanceScopeLabel = function(checklistPayload) {
    if (!checklistPayload || !Array.isArray(checklistPayload.checklists)) return null;
    const wartungChecklists = checklistPayload.checklists.filter(cl => cl.type === 'wartung');
    if (wartungChecklists.length === 0) return null;

    // seenKeys verhindert Duplikate auch bei abweichender Groß-/Kleinschreibung oder
    // Leerzeichen (z.B. "SBA" und "sba " zählen als dieselbe Übergruppe) — sonst könnte
    // dieselbe Kategorie aus mehreren Wartungsprotokollen/-zeilen doppelt in der Liste landen.
    const seenKeys = new Set();
    const allCats = [];
    const includedCats = [];
    wartungChecklists.forEach(cl => {
        (cl.answers || []).forEach(ans => {
            const category = ans.category ? String(ans.category).trim() : '';
            const key = category.toLowerCase();
            if (!category || seenKeys.has(key)) return;
            seenKeys.add(key);
            allCats.push(category);
            const isIncluded = !cl.categoryIncluded || cl.categoryIncluded[ans.category] !== false;
            if (isIncluded) includedCats.push(category);
        });
    });

    if (allCats.length === 0 || includedCats.length === 0) return null;
    if (includedCats.length === allCats.length) return 'Komplett';
    return includedCats.join(', ');
};

window.getChecklistPayload = function() {
    const activeList = Object.values(activeChecklists);
    if (activeList.length === 0) return null;
    
    return {
        checklists: activeList
    };
};

window.loadChecklistPayload = function(payload) {
    activeChecklists = {};
    
    if (payload) {
        // Support backward compatibility (old payload format with template_id and answers array)
        if (payload.template_id && payload.answers) {
            activeChecklists[payload.template_id] = {
                template_id: payload.template_id,
                title: payload.title || "Zusatzprotokoll",
                type: payload.template_id.includes('uvv') ? 'uvv' : 'wartung',
                answers: payload.answers
            };
        }
        // Support new payload format (checklists array)
        else if (payload.checklists && Array.isArray(payload.checklists)) {
            payload.checklists.forEach(cl => {
                activeChecklists[cl.template_id] = cl;
            });
        }
    }
    
    // Re-render UI selector and tables
    const categoryText = document.getElementById('service-category-text')?.textContent.toLowerCase() || '';
    if (categoryText.includes('wartung') || categoryText.includes('uvv') || categoryText.includes('einweisung')) {
        window.populateChecklistSelector();
    }
    window.renderActiveChecklists();
};
