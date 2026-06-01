// ==========================================
// CUSTOMERS & FIRMENEINSTELLUNGEN MODULE
// ==========================================
// Handles Company settings (HQ location), CSV/Excel client-side import for Sage 100 
// addresses, and autocomplete customer searches for machine association.

(function () {
    'use strict';

    console.log('Loading customers module...');

    // Global state for importing
    let parsedHeaders = [];
    let parsedRows = [];

    // Initialize module on load
    document.addEventListener('DOMContentLoaded', () => {
        setupImportListeners();
        // Load settings if database client is initialized
        if (window.supabaseClient) {
            window.loadFirmendaten();
        }
    });

    // ==========================================
    // TAB NAVIGATION
    // ==========================================
    window.switchFirmeneinstellungenTab = function (tabName) {
        // Toggle tabs
        document.querySelectorAll('#settings-firmeneinstellungen .settings-tab').forEach(tab => {
            if (tab.getAttribute('data-tab') === tabName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Toggle contents
        document.querySelectorAll('#settings-firmeneinstellungen .tab-content').forEach(content => {
            if (content.id === `${tabName}-tab-content`) {
                content.classList.remove('hidden');
                content.classList.add('active');
            } else {
                content.classList.add('hidden');
                content.classList.remove('active');
            }
        });
    };

    // ==========================================
    // HQ FIRMENDATEN (DATABASE/LOCAL CACHE)
    // ==========================================
    window.saveFirmendaten = async function (event) {
        if (event) event.preventDefault();
        
        const name = document.getElementById('company-hq-name').value.trim();
        const street = document.getElementById('company-hq-street').value.trim();
        const zip = document.getElementById('company-hq-zip').value.trim();
        const city = document.getElementById('company-hq-city').value.trim();
        const country = document.getElementById('company-hq-country').value.trim();

        const companyData = { name, street, zip, city, country };

        try {
            if (!window.supabaseClient) throw new Error('Supabase Client nicht initialisiert');

            const { error } = await window.supabaseClient
                .from('app_settings')
                .upsert({ key: 'company_hq', value: companyData });

            if (error) throw error;

            alert('Firmendaten erfolgreich gespeichert!');
            localStorage.setItem('meetra_company_hq', JSON.stringify(companyData));
        } catch (err) {
            console.error('Failed to save firmendaten to Supabase:', err);
            // Fallback to local storage
            localStorage.setItem('meetra_company_hq', JSON.stringify(companyData));
            alert('Firmendaten lokal gespeichert (Fehler bei Cloud-Synchronisierung): ' + err.message);
        }
    };

    window.loadFirmendaten = async function () {
        // Instant load from localStorage
        const cached = localStorage.getItem('meetra_company_hq');
        if (cached) {
            try {
                populateFirmUI(JSON.parse(cached));
            } catch (e) { }
        }

        // Fetch from Supabase for sync
        if (window.supabaseClient) {
            try {
                const { data, error } = await window.supabaseClient
                    .from('app_settings')
                    .select('value')
                    .eq('key', 'company_hq')
                    .single();

                if (!error && data && data.value) {
                    populateFirmUI(data.value);
                    localStorage.setItem('meetra_company_hq', JSON.stringify(data.value));
                }
            } catch (err) {
                console.error('Failed to load firmendaten from database:', err);
            }
        }
    };

    function populateFirmUI(data) {
        if (!data) return;
        const nameEl = document.getElementById('company-hq-name');
        const streetEl = document.getElementById('company-hq-street');
        const zipEl = document.getElementById('company-hq-zip');
        const cityEl = document.getElementById('company-hq-city');
        const countryEl = document.getElementById('company-hq-country');

        if (nameEl) nameEl.value = data.name || '';
        if (streetEl) streetEl.value = data.street || '';
        if (zipEl) zipEl.value = data.zip || '';
        if (cityEl) cityEl.value = data.city || '';
        if (countryEl) countryEl.value = data.country || 'Deutschland';
    }

    // ==========================================
    // DYNAMIC EXCEL/CSV PARSER & SAGE IMPORT
    // ==========================================
    function setupImportListeners() {
        const dropzone = document.getElementById('customer-import-dropzone');
        const fileInput = document.getElementById('customer-import-input');

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
                handleImportFile(e.dataTransfer.files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleImportFile(e.target.files[0]);
            }
        });
    }

    async function handleImportFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'xlsx' || ext === 'xls') {
            await parseExcelFile(file);
        } else if (ext === 'csv') {
            await parseCSVFile(file);
        } else {
            alert('Bitte wählen Sie eine gültige Excel- (.xlsx, .xls) oder CSV-Datei (.csv) aus.');
        }
    }

    // Dynamically load SheetJS (xlsx) from CDN
    async function loadXLSXLibrary() {
        if (window.XLSX) return true;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
            script.onload = () => resolve(true);
            script.onerror = (err) => reject(new Error('Excel-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen.'));
            document.head.appendChild(script);
        });
    }

    async function parseExcelFile(file) {
        try {
            // Show status
            const dropzone = document.getElementById('customer-import-dropzone');
            const originalHtml = dropzone.innerHTML;
            dropzone.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; gap:12px;">
                    <div class="loading-spinner" style="border:4px solid rgba(255,255,255,0.1); border-top:4px solid var(--color-primary-green); border-radius:50%; width:32px; height:32px; animation:spin 1s linear infinite;"></div>
                    <span>Lade Excel-Bibliothek und verarbeite Datei...</span>
                </div>
            `;

            await loadXLSXLibrary();

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

                    parsedHeaders = jsonData[0].map(h => h ? h.toString().trim() : '');
                    parsedRows = jsonData.slice(1).filter(r => r.length > 0 && r.some(cell => cell !== null && cell !== undefined && cell !== ''));

                    showMappingConfig(originalHtml);
                } catch (err) {
                    alert('Fehler beim Lesen der Excel-Datei: ' + err.message);
                    dropzone.innerHTML = originalHtml;
                }
            };
            reader.readAsArrayBuffer(file);
        } catch (err) {
            alert(err.message);
            resetImportUI();
        }
    }

    async function parseCSVFile(file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const buffer = e.target.result;
                
                // Try decoding as UTF-8 first (with fatal error on invalid sequences)
                let text;
                try {
                    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
                    text = utf8Decoder.decode(buffer);
                } catch (utf8Err) {
                    // Fallback to Windows-1252 / ISO-8859-1 for German ANSI/Sage exports
                    console.log('UTF-8 decoding failed. Falling back to windows-1252 encoding.');
                    const ansiDecoder = new TextDecoder('windows-1252');
                    text = ansiDecoder.decode(buffer);
                }

                const lines = text.split(/\r?\n/);
                if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
                    throw new Error('Die CSV-Datei scheint leer zu sein.');
                }

                // Autodetect delimiter (semicolon or comma)
                const firstLine = lines[0];
                const semicolonCount = (firstLine.match(/;/g) || []).length;
                const commaCount = (firstLine.match(/,/g) || []).length;
                const delimiter = semicolonCount >= commaCount ? ';' : ',';

                // Basic CSV row splitter that handles quoted strings
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

                parsedHeaders = parsedData[0];
                parsedRows = parsedData.slice(1);

                showMappingConfig();
            } catch (err) {
                alert('Fehler beim Parsen der CSV-Datei: ' + err.message);
                resetImportUI();
            }
        };
        // Read as ArrayBuffer so TextDecoder can decode it with custom encoding.
        reader.readAsArrayBuffer(file);
    }

    function showMappingConfig(originalDropzoneHtml) {
        const dropzone = document.getElementById('customer-import-dropzone');
        const configSection = document.getElementById('import-config-section');
        const statsEl = document.getElementById('import-stats');

        if (dropzone) dropzone.classList.add('hidden');
        if (configSection) configSection.classList.remove('hidden');

        if (statsEl) {
            statsEl.textContent = `${parsedRows.length} Kundenadressen zum Import bereit.`;
        }

        // Populate column dropdowns
        const dropdownIds = [
            'map-address-num', 'map-cust-num', 'map-matchcode', 'map-name', 'map-street',
            'map-zip', 'map-city', 'map-country', 'map-phone', 'map-email'
        ];

        dropdownIds.forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;

            select.innerHTML = '<option value="">-- Nicht zugeordnet --</option>';
            parsedHeaders.forEach((header, index) => {
                const opt = document.createElement('option');
                opt.value = index;
                opt.textContent = `${header} (Spalte ${index + 1})`;
                select.appendChild(opt);
            });

            // Perform intelligent auto-mapping
            const defaultIndex = findMatchingHeaderIndex(id, parsedHeaders);
            if (defaultIndex !== -1) {
                select.value = defaultIndex;
            }
        });
    }

    function findMatchingHeaderIndex(fieldId, headers) {
        const mappingKeywords = {
            'map-address-num': ['adressnummer', 'adresse', 'adrnr', 'adress-nr', 'adressnr', 'address number', 'addressnum'],
            'map-cust-num': ['konto', 'kdnr', 'kundennummer', 'kunden-nr', 'kundennr', 'client number', 'customer number', 'id'],
            'map-matchcode': ['match', 'matchcode', 'suchbegriff', 'kurzname', 'kürzel'],
            'map-name': ['name1', 'name', 'firma', 'kundenname', 'bezeichnung', 'company', 'name 1'],
            'map-street': ['strasse', 'straße', 'str', 'address', 'street'],
            'map-zip': ['plz', 'postleitzahl', 'zip', 'zipcode', 'postal', 'plz/ort'],
            'map-city': ['ort', 'stadt', 'city', 'plz/ort'],
            'map-country': ['land', 'staat', 'country', 'lnd'],
            'map-phone': ['telefon', 'tel', 'phone', 'mobil', 'tel.', 'tel1'],
            'map-email': ['email', 'e-mail', 'mail', 'emailadresse', 'e-mail-adresse']
        };

        const keywords = mappingKeywords[fieldId] || [];
        
        for (let i = 0; i < headers.length; i++) {
            const h = headers[i].toLowerCase();
            // Exact match first
            if (keywords.includes(h)) return i;
            // Fuzzy match
            if (keywords.some(kw => h.includes(kw))) return i;
        }

        // Specific fallbacks (e.g. Sage 100 specific labels)
        if (fieldId === 'map-name') {
            const matchIndex = headers.findIndex(h => h.toLowerCase().startsWith('name'));
            if (matchIndex !== -1) return matchIndex;
        }

        return -1;
    }

    window.cancelImport = function () {
        resetImportUI();
    };

    window.resetImportUI = function () {
        parsedHeaders = [];
        parsedRows = [];

        const dropzone = document.getElementById('customer-import-dropzone');
        const configSection = document.getElementById('import-config-section');
        const progressSection = document.getElementById('import-progress-section');
        const resultSection = document.getElementById('import-result-section');
        const fileInput = document.getElementById('customer-import-input');

        if (dropzone) {
            dropzone.classList.remove('hidden');
            // Restore dropzone content
            dropzone.innerHTML = `
                <input type="file" id="customer-import-input" accept=".csv, .xls, .xlsx" class="hidden-file-input" style="display: none;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 12px;">
                    <span style="font-size: 3rem;">📥</span>
                    <span style="font-weight: 700; color: #fff; font-size: 1.1rem;">Datei auswählen oder hierher ziehen</span>
                    <span style="font-size: 0.85rem; color: rgba(255,255,255,0.4);">Unterstützte Formate: Excel (.xlsx, .xls) oder CSV (.csv)</span>
                </div>
            `;
            setupImportListeners();
        }
        if (fileInput) fileInput.value = '';
        if (configSection) configSection.classList.add('hidden');
        if (progressSection) progressSection.classList.add('hidden');
        if (resultSection) resultSection.classList.add('hidden');
    };

    window.executeImport = async function () {
        const configSection = document.getElementById('import-config-section');
        const progressSection = document.getElementById('import-progress-section');
        const progressBar = document.getElementById('import-progress-bar');
        const progressDetails = document.getElementById('import-progress-details');
        const resultSection = document.getElementById('import-result-section');
        const resultMessage = document.getElementById('import-result-message');

        const mapAddressNum = document.getElementById('map-address-num').value;
        const mapCustNum = document.getElementById('map-cust-num').value;
        const mapMatchcode = document.getElementById('map-matchcode').value;
        const mapName = document.getElementById('map-name').value;
        const mapStreet = document.getElementById('map-street').value;
        const mapZip = document.getElementById('map-zip').value;
        const mapCity = document.getElementById('map-city').value;
        const mapCountry = document.getElementById('map-country').value;
        const mapPhone = document.getElementById('map-phone').value;
        const mapEmail = document.getElementById('map-email').value;

        // Validation
        if (mapAddressNum === '' || mapName === '') {
            alert('Die Felder "Adressnummer" und "Firmenname / Kundenname" sind Pflichtfelder und müssen zugeordnet werden.');
            return;
        }

        if (configSection) configSection.classList.add('hidden');
        if (progressSection) progressSection.classList.remove('hidden');

        function formatCountryName(countryStr) {
            if (!countryStr) return 'Deutschland';
            const c = countryStr.toString().trim().toLowerCase();
            if (c === 'de' || c === 'deu' || c === 'd' || c === 'germany' || c === 'deutschland') {
                return 'Deutschland';
            }
            if (c === 'at' || c === 'aut' || c === 'österreich' || c === 'oesterreich' || c === 'austria') {
                return 'Österreich';
            }
            if (c === 'ch' || c === 'che' || c === 'schweiz' || c === 'switzerland') {
                return 'Schweiz';
            }
            if (c === 'fr' || c === 'fra' || c === 'frankreich' || c === 'france') {
                return 'Frankreich';
            }
            if (c === 'nl' || c === 'nld' || c === 'niederlande' || c === 'netherlands') {
                return 'Niederlande';
            }
            if (c === 'be' || c === 'bel' || c === 'belgien' || c === 'belgium') {
                return 'Belgien';
            }
            if (c === 'it' || c === 'ita' || c === 'italien' || c === 'italy') {
                return 'Italien';
            }
            if (c === 'pl' || c === 'pol' || c === 'polen' || c === 'poland') {
                return 'Polen';
            }
            if (c === 'cz' || c === 'cze' || c === 'tschechien' || c === 'czechia' || c === 'czech republic') {
                return 'Tschechien';
            }
            return countryStr.toString().trim().charAt(0).toUpperCase() + countryStr.toString().trim().slice(1);
        }

        const customersToUpsert = [];
        
        parsedRows.forEach(row => {
            const addressNum = row[mapAddressNum]?.toString().trim();
            const custNum = mapCustNum !== '' ? row[mapCustNum]?.toString().trim() : null;
            const name = row[mapName]?.toString().trim();

            if (!addressNum || !name) return; // Skip invalid rows

            // Construct values with clean fallbacks
            let street = mapStreet !== '' ? row[mapStreet]?.toString().trim() : null;
            let zip = mapZip !== '' ? row[mapZip]?.toString().trim() : null;
            let city = mapCity !== '' ? row[mapCity]?.toString().trim() : null;

            // In some exports, ZIP and City are combined in one field (e.g. "12345 Musterstadt")
            // Let's attempt to separate them if only ZIP is mapped but contains spaces, etc.
            if (mapZip !== '' && mapCity === '' && zip && zip.includes(' ')) {
                const parts = zip.split(' ');
                if (parts[0].match(/^\d{4,5}$/)) {
                    zip = parts[0];
                    city = parts.slice(1).join(' ');
                }
            }

            customersToUpsert.push({
                address_number: addressNum,
                customer_number: custNum || null,
                name: name,
                matchcode: mapMatchcode !== '' ? (row[mapMatchcode]?.toString().trim() || name) : name,
                street: street || null,
                zip_code: zip || null,
                city: city || null,
                country: mapCountry !== '' ? formatCountryName(row[mapCountry]) : 'Deutschland',
                phone: mapPhone !== '' ? (row[mapPhone]?.toString().trim() || null) : null,
                email: mapEmail !== '' ? (row[mapEmail]?.toString().trim() || null) : null
            });
        });

        if (customersToUpsert.length === 0) {
            alert('Keine gültigen Zeilen mit Adressnummer und Name zum Importieren gefunden.');
            resetImportUI();
            return;
        }

        try {
            if (!window.supabaseClient) throw new Error('Supabase Client nicht initialisiert');

            const chunkSize = 100;
            const total = customersToUpsert.length;

            for (let i = 0; i < total; i += chunkSize) {
                const chunk = customersToUpsert.slice(i, i + chunkSize);
                
                const { error } = await window.supabaseClient
                    .from('customers')
                    .upsert(chunk, { onConflict: 'address_number' });

                if (error) throw error;

                const progress = Math.min(100, Math.round(((i + chunk.length) / total) * 100));
                if (progressBar) progressBar.style.width = `${progress}%`;
                if (progressDetails) progressDetails.textContent = `${Math.min(total, i + chunk.length)} von ${total} verarbeitet...`;
            }

            // Success
            if (progressSection) progressSection.classList.add('hidden');
            if (resultSection) resultSection.classList.remove('hidden');
            if (resultMessage) {
                resultMessage.textContent = `Erfolgreich ${total} Kundenadressen aus Sage 100 importiert und aktualisiert.`;
            }
        } catch (err) {
            alert('Fehler beim Datenbankimport: ' + err.message);
            resetImportUI();
        }
    };

    // ==========================================
    // CUSTOMER AUTOCOMPLETE SEARCH & FILL (MACHINE FORM)
    // ==========================================
    let machineSearchTimeout = null;
    let operatorSearchTimeout = null;
    let locationSearchTimeout = null;

    window.searchCustomersForMachine = function () {
        clearTimeout(machineSearchTimeout);
        machineSearchTimeout = setTimeout(async () => {
            const query = document.getElementById('machine-customer-search').value.trim();
            const suggestionsBox = document.getElementById('machine-customer-suggestions');

            if (!query || query.length < 2) {
                suggestionsBox.style.display = 'none';
                suggestionsBox.innerHTML = '';
                return;
            }

            suggestionsBox.style.display = 'block';
            suggestionsBox.innerHTML = '<div style="padding:10px; color:rgba(255,255,255,0.5);">Suche...</div>';

            try {
                if (!window.supabaseClient) throw new Error('Supabase Client nicht initialisiert');

                const { data, error } = await window.supabaseClient
                    .from('customers')
                    .select('id, name, matchcode, customer_number, address_number, street, zip_code, city, country')
                    .or(`name.ilike.%${query}%,matchcode.ilike.%${query}%,customer_number.ilike.%${query}%,address_number.ilike.%${query}%`)
                    .limit(10);

                if (error) throw error;

                if (data.length === 0) {
                    suggestionsBox.innerHTML = '<div style="padding:10px; color:rgba(255,255,255,0.4);">Keine Kunden gefunden</div>';
                    return;
                }

                suggestionsBox.innerHTML = '';
                data.forEach(cust => {
                    const div = document.createElement('div');
                    div.style.cssText = 'padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.05); cursor:pointer; color:#fff; transition: background 0.2s;';
                    div.onmouseover = () => div.style.background = 'rgba(255,255,255,0.08)';
                    div.onmouseout = () => div.style.background = 'transparent';
                    
                    const label = cust.matchcode ? `[${cust.matchcode}] ${cust.name}` : cust.name;
                    let details = '';
                    if (cust.address_number) details += `Adr. ${cust.address_number} `;
                    if (cust.customer_number) details += `(Kdnr. ${cust.customer_number}) `;
                    if (cust.city) details += `- ${cust.city}`;
                    
                    div.innerHTML = `
                        <div style="font-weight:700; font-size:0.95rem;">${label}</div>
                        <div style="font-size:0.8rem; color:rgba(255,255,255,0.4); margin-top:2px;">${details}</div>
                    `;

                    div.onclick = () => {
                        window.selectCustomerForMachine(cust);
                    };

                    suggestionsBox.appendChild(div);
                });
            } catch (err) {
                console.error('Autocomplete search failed:', err);
                suggestionsBox.innerHTML = '<div style="padding:10px; color:red;">Fehler bei der Suche</div>';
            }
        }, 250);
    };

    window.searchOperatorsForMachine = function () {
        clearTimeout(operatorSearchTimeout);
        operatorSearchTimeout = setTimeout(async () => {
            const query = document.getElementById('machine-operator-search').value.trim();
            const suggestionsBox = document.getElementById('machine-operator-suggestions');

            if (!query || query.length < 2) {
                suggestionsBox.style.display = 'none';
                suggestionsBox.innerHTML = '';
                return;
            }

            suggestionsBox.style.display = 'block';
            suggestionsBox.innerHTML = '<div style="padding:10px; color:rgba(255,255,255,0.5);">Suche...</div>';

            try {
                if (!window.supabaseClient) throw new Error('Supabase Client nicht initialisiert');

                const { data, error } = await window.supabaseClient
                    .from('customers')
                    .select('id, name, matchcode, customer_number, address_number, street, zip_code, city, country')
                    .or(`name.ilike.%${query}%,matchcode.ilike.%${query}%,customer_number.ilike.%${query}%,address_number.ilike.%${query}%`)
                    .limit(10);

                if (error) throw error;

                if (data.length === 0) {
                    suggestionsBox.innerHTML = '<div style="padding:10px; color:rgba(255,255,255,0.4);">Keine Betreiber gefunden</div>';
                    return;
                }

                suggestionsBox.innerHTML = '';
                data.forEach(cust => {
                    const div = document.createElement('div');
                    div.style.cssText = 'padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.05); cursor:pointer; color:#fff; transition: background 0.2s;';
                    div.onmouseover = () => div.style.background = 'rgba(255,255,255,0.08)';
                    div.onmouseout = () => div.style.background = 'transparent';
                    
                    const label = cust.matchcode ? `[${cust.matchcode}] ${cust.name}` : cust.name;
                    let details = '';
                    if (cust.address_number) details += `Adr. ${cust.address_number} `;
                    if (cust.customer_number) details += `(Kdnr. ${cust.customer_number}) `;
                    if (cust.city) details += `- ${cust.city}`;
                    
                    div.innerHTML = `
                        <div style="font-weight:700; font-size:0.95rem;">${label}</div>
                        <div style="font-size:0.8rem; color:rgba(255,255,255,0.4); margin-top:2px;">${details}</div>
                    `;

                    div.onclick = () => {
                        window.selectOperatorForMachine(cust);
                    };

                    suggestionsBox.appendChild(div);
                });
            } catch (err) {
                console.error('Autocomplete operator search failed:', err);
                suggestionsBox.innerHTML = '<div style="padding:10px; color:red;">Fehler bei der Suche</div>';
            }
        }, 250);
    };

    window.selectOperatorForMachine = function (cust) {
        document.getElementById('machine-customer-number').value = cust.customer_number || '';
        document.getElementById('machine-owner').value = cust.name || '';
        document.getElementById('machine-operator-street').value = cust.street || '';
        document.getElementById('machine-operator-zip').value = cust.zip_code || '';
        document.getElementById('machine-operator-city').value = cust.city || '';
        document.getElementById('machine-operator-country').value = cust.country || 'Deutschland';

        window.updateCombinedAddresses();

        // Populate search input
        const searchInput = document.getElementById('machine-operator-search');
        searchInput.value = cust.matchcode ? `[${cust.matchcode}] ${cust.name}` : cust.name;
        
        const suggestionsBox = document.getElementById('machine-operator-suggestions');
        suggestionsBox.style.display = 'none';
        suggestionsBox.innerHTML = '';
    };

    window.searchLocationsForMachine = function () {
        clearTimeout(locationSearchTimeout);
        locationSearchTimeout = setTimeout(async () => {
            const query = document.getElementById('machine-location-search').value.trim();
            const suggestionsBox = document.getElementById('machine-location-suggestions');

            if (!query || query.length < 2) {
                suggestionsBox.style.display = 'none';
                suggestionsBox.innerHTML = '';
                return;
            }

            suggestionsBox.style.display = 'block';
            suggestionsBox.innerHTML = '<div style="padding:10px; color:rgba(255,255,255,0.5);">Suche...</div>';

            try {
                if (!window.supabaseClient) throw new Error('Supabase Client nicht initialisiert');

                const { data, error } = await window.supabaseClient
                    .from('customers')
                    .select('id, name, matchcode, customer_number, address_number, street, zip_code, city, country')
                    .or(`name.ilike.%${query}%,matchcode.ilike.%${query}%,customer_number.ilike.%${query}%,address_number.ilike.%${query}%`)
                    .limit(10);

                if (error) throw error;

                if (data.length === 0) {
                    suggestionsBox.innerHTML = '<div style="padding:10px; color:rgba(255,255,255,0.4);">Keine Standorte gefunden</div>';
                    return;
                }

                suggestionsBox.innerHTML = '';
                data.forEach(cust => {
                    const div = document.createElement('div');
                    div.style.cssText = 'padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.05); cursor:pointer; color:#fff; transition: background 0.2s;';
                    div.onmouseover = () => div.style.background = 'rgba(255,255,255,0.08)';
                    div.onmouseout = () => div.style.background = 'transparent';
                    
                    const label = cust.matchcode ? `[${cust.matchcode}] ${cust.name}` : cust.name;
                    let details = '';
                    if (cust.address_number) details += `Adr. ${cust.address_number} `;
                    if (cust.customer_number) details += `(Kdnr. ${cust.customer_number}) `;
                    if (cust.city) details += `- ${cust.city}`;
                    
                    div.innerHTML = `
                        <div style="font-weight:700; font-size:0.95rem;">${label}</div>
                        <div style="font-size:0.8rem; color:rgba(255,255,255,0.4); margin-top:2px;">${details}</div>
                    `;

                    div.onclick = () => {
                        window.selectLocationForMachine(cust);
                    };

                    suggestionsBox.appendChild(div);
                });
            } catch (err) {
                console.error('Autocomplete location search failed:', err);
                suggestionsBox.innerHTML = '<div style="padding:10px; color:red;">Fehler bei der Suche</div>';
            }
        }, 250);
    };

    window.selectLocationForMachine = function (cust) {
        document.getElementById('machine-location-street').value = cust.street || '';
        document.getElementById('machine-location-zip').value = cust.zip_code || '';
        document.getElementById('machine-location-city').value = cust.city || '';
        document.getElementById('machine-location-country').value = cust.country || 'Deutschland';

        window.updateCombinedAddresses();

        // Populate search input
        const searchInput = document.getElementById('machine-location-search');
        searchInput.value = cust.matchcode ? `[${cust.matchcode}] ${cust.name}` : cust.name;
        
        const suggestionsBox = document.getElementById('machine-location-suggestions');
        suggestionsBox.style.display = 'none';
        suggestionsBox.innerHTML = '';
    };

    window.selectCustomerForMachine = function (cust) {
        document.getElementById('machine-customer-id').value = cust.id;
        document.getElementById('machine-customer-number').value = cust.customer_number || '';
        document.getElementById('machine-owner').value = cust.name || '';
        document.getElementById('machine-operator-street').value = cust.street || '';
        document.getElementById('machine-operator-zip').value = cust.zip_code || '';
        document.getElementById('machine-operator-city').value = cust.city || '';
        document.getElementById('machine-operator-country').value = cust.country || 'Deutschland';

        // Auto-fill Standort too by default
        document.getElementById('machine-location-street').value = cust.street || '';
        document.getElementById('machine-location-zip').value = cust.zip_code || '';
        document.getElementById('machine-location-city').value = cust.city || '';
        document.getElementById('machine-location-country').value = cust.country || 'Deutschland';

        // Update combined compatibility fields
        window.updateCombinedAddresses();

        // Lock search UI
        const searchInput = document.getElementById('machine-customer-search');
        const displayLabel = cust.matchcode ? `[${cust.matchcode}] ${cust.name}` : cust.name;
        searchInput.value = displayLabel;
        searchInput.disabled = true;

        const opSearch = document.getElementById('machine-operator-search');
        if (opSearch) opSearch.value = displayLabel;
        const locSearch = document.getElementById('machine-location-search');
        if (locSearch) locSearch.value = displayLabel;

        document.getElementById('btn-clear-customer').style.display = 'block';
        
        // Hide suggestions
        const suggestionsBox = document.getElementById('machine-customer-suggestions');
        suggestionsBox.style.display = 'none';
        suggestionsBox.innerHTML = '';
    };

    window.clearSelectedCustomerForMachine = function () {
        document.getElementById('machine-customer-id').value = '';
        document.getElementById('machine-customer-number').value = '';
        document.getElementById('machine-owner').value = '';
        document.getElementById('machine-operator-street').value = '';
        document.getElementById('machine-operator-zip').value = '';
        document.getElementById('machine-operator-city').value = '';
        document.getElementById('machine-operator-country').value = 'Deutschland';

        document.getElementById('machine-location-street').value = '';
        document.getElementById('machine-location-zip').value = '';
        document.getElementById('machine-location-city').value = '';
        document.getElementById('machine-location-country').value = 'Deutschland';

        const opSearch = document.getElementById('machine-operator-search');
        if (opSearch) opSearch.value = '';
        const locSearch = document.getElementById('machine-location-search');
        if (locSearch) locSearch.value = '';

        window.updateCombinedAddresses();

        const searchInput = document.getElementById('machine-customer-search');
        searchInput.value = '';
        searchInput.disabled = false;
        searchInput.focus();

        document.getElementById('btn-clear-customer').style.display = 'none';
    };

    window.copyOperatorAddressToLocation = function () {
        document.getElementById('machine-location-street').value = document.getElementById('machine-operator-street').value;
        document.getElementById('machine-location-zip').value = document.getElementById('machine-operator-zip').value;
        document.getElementById('machine-location-city').value = document.getElementById('machine-operator-city').value;
        document.getElementById('machine-location-country').value = document.getElementById('machine-operator-country').value;
        
        window.updateCombinedAddresses();
    };

    window.toggleMachineWorkshopUI = async function (inWorkshop) {
        const customerGroup = document.getElementById('machine-customer-search-group');
        const operatorGroup = document.getElementById('machine-operator-address-group');
        const locationGroup = document.getElementById('machine-location-address-group');
        const displayGroup = document.getElementById('machine-meetra-address-display');
        const displayText = document.getElementById('machine-meetra-address-text');

        if (inWorkshop) {
            if (customerGroup) customerGroup.style.display = 'none';
            if (operatorGroup) operatorGroup.style.display = 'none';
            if (locationGroup) locationGroup.style.display = 'none';
            if (displayGroup) {
                displayGroup.style.display = 'block';
                displayGroup.classList.remove('hidden');
            }

            if (displayText) {
                displayText.innerHTML = 'Lade Werkstatt-Adresse...';
                try {
                    // Fetch HQ from database
                    let hq = null;
                    if (window.supabaseClient) {
                        const { data: hqData } = await window.supabaseClient
                            .from('app_settings')
                            .select('value')
                            .eq('key', 'company_hq')
                            .single();
                        if (hqData && hqData.value) {
                            hq = hqData.value;
                        }
                    }

                    if (!hq) {
                        const cached = localStorage.getItem('meetra_company_hq');
                        if (cached) hq = JSON.parse(cached);
                    }

                    if (hq) {
                        const parts = [
                            hq.name || 'Meetra GmbH',
                            hq.street || '',
                            [hq.zip, hq.city].filter(Boolean).join(' '),
                            hq.country || 'Deutschland'
                        ].filter(Boolean);
                        displayText.innerHTML = parts.join('<br>');
                    } else {
                        displayText.innerHTML = 'Meetra GmbH<br>Am Alten Bahnhof 6<br>38122 Braunschweig<br>Deutschland';
                    }
                } catch (err) {
                    console.error('Fehler beim Laden der Werkstattadresse:', err);
                    displayText.innerHTML = 'Meetra GmbH<br>Am Alten Bahnhof 6<br>38122 Braunschweig<br>Deutschland';
                }
            }
        } else {
            if (customerGroup) customerGroup.style.display = 'block';
            if (operatorGroup) operatorGroup.style.display = 'block';
            if (locationGroup) locationGroup.style.display = 'block';
            if (displayGroup) {
                displayGroup.style.display = 'none';
                displayGroup.classList.add('hidden');
            }
        }
    };


    window.updateCombinedAddresses = function () {
        const opStreet = document.getElementById('machine-operator-street').value.trim();
        const opZip = document.getElementById('machine-operator-zip').value.trim();
        const opCity = document.getElementById('machine-operator-city').value.trim();
        const opCountry = document.getElementById('machine-operator-country').value.trim();

        const locStreet = document.getElementById('machine-location-street').value.trim();
        const locZip = document.getElementById('machine-location-zip').value.trim();
        const locCity = document.getElementById('machine-location-city').value.trim();
        const locCountry = document.getElementById('machine-location-country').value.trim();

        const opCombined = [opStreet, [opZip, opCity].filter(Boolean).join(' '), opCountry].filter(Boolean).join(', ');
        const locCombined = [locStreet, [locZip, locCity].filter(Boolean).join(' '), locCountry].filter(Boolean).join(', ');

        document.getElementById('machine-address-input').value = opCombined;
        document.getElementById('machine-location-input').value = locCombined;
    };

    // ==========================================
    // GOOGLE MAPS ROUTE PLANNING FOR MACHINES
    // ==========================================
    window.planRouteForMachine = async function (machineId) {
        const machine = (window.machineList || []).find(m => m.id == machineId);
        if (!machine) return;

        // Collect destination address: prioritize location, fallback to operator address
        const destination = [
            machine.location_street || machine.operator_street,
            [machine.location_zip || machine.operator_zip, machine.location_city || machine.operator_city].filter(Boolean).join(' '),
            machine.location_country || machine.operator_country
        ].filter(Boolean).join(', ');

        if (!destination) {
            alert('Für diese Maschine ist keine Adresse hinterlegt.');
            return;
        }

        // Fetch own HQ address from settings
        let origin = '';
        const cached = localStorage.getItem('meetra_company_hq');
        if (cached) {
            try {
                const hq = JSON.parse(cached);
                origin = [hq.street, [hq.zip, hq.city].filter(Boolean).join(' '), hq.country].filter(Boolean).join(', ');
            } catch(e){}
        }

        if (!origin && window.supabaseClient) {
            try {
                const { data: hqData } = await window.supabaseClient
                    .from('app_settings')
                    .select('value')
                    .eq('key', 'company_hq')
                    .single();
                if (hqData && hqData.value) {
                    const hq = hqData.value;
                    origin = [hq.street, [hq.zip, hq.city].filter(Boolean).join(' '), hq.country].filter(Boolean).join(', ');
                }
            } catch(e){}
        }

        const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
        window.open(url, '_blank');
    };

    // =========================================================
    // DYNAMIC SCRIPT LOADERS FOR PERFORMANCE OPTIMIZATION
    // =========================================================

    // Dynamically load Leaflet library (CSS & JS)
    window.loadLeaflet = async function () {
        if (window.L) return;
        
        // Add stylesheet
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
        link.crossOrigin = '';
        document.head.appendChild(link);

        // Add script
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
            script.crossOrigin = '';
            script.onload = () => resolve();
            script.onerror = (err) => reject(new Error('Leaflet konnte nicht geladen werden. Bitte Internetverbindung prüfen.'));
            document.head.appendChild(script);
        });
    };

    // Dynamically load jsPDF and jsPDF-autotable
    window.loadPDFGenerators = async function () {
        if (window.jspdf) return;

        // Load jsPDF
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload = () => resolve();
            script.onerror = (err) => reject(new Error('jsPDF-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen.'));
            document.head.appendChild(script);
        });

        // Load jsPDF-autotable
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
            script.onload = () => resolve();
            script.onerror = (err) => reject(new Error('jsPDF-AutoTable-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen.'));
            document.head.appendChild(script);
        });
    };

    // Dynamically load PDF.js (for invoice reading / rendering thumbnails)
    window.loadPDFReader = async function () {
        if (window.pdfjsLib) return;

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
            script.onload = () => {
                if (window['pdfjs-dist/build/pdf']) {
                    window.pdfjsLib = window['pdfjs-dist/build/pdf'];
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
                }
                resolve();
            };
            script.onerror = (err) => reject(new Error('PDF.js-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen.'));
            document.head.appendChild(script);
        });
    };

    // Dynamically load AWS-SDK (for Cloudflare R2 file uploads)
    window.loadAWSSDK = async function () {
        if (window.AWS) return;

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/aws-sdk/2.1390.0/aws-sdk.min.js';
            script.onload = () => resolve();
            script.onerror = (err) => reject(new Error('AWS-SDK-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen.'));
            document.head.appendChild(script);
        });
    };
})();
