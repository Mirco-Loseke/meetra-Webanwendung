// documents.js - Logic for the Documents Module

let allDocuments = [];
let allFolders = [];
let filteredDocuments = [];
let filteredFolders = [];
let activeDocCategories = ['all'];
let activeMachineCatFilters = ['all'];
let activeSeriesFilters = ['all'];
let activeUploadDocTypes = [];
let activeUploadMachineCategories = [];
let activeUploadSeries = [];
let activeEditDocTypes = [];
let activeEditMachineCategories = [];
let activeEditSeries = [];
let _filterDocsDebounceTimer = null;
let selectedDocFile = null;
let currentFolderId = null;
let currentFolderPath = []; // Array of {id, name}
let renamingItem = null; // {id, type, currentName}
let folderCoverTargetId = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log('Documents Module: DOMContentLoaded');
    if (typeof window.populateDocumentTypeDropdowns === 'function') {
        window.populateDocumentTypeDropdowns();
    }
    if (window.location.hash === '#documents') {
        fetchDocuments();
    }

    // Set up upload dropzone drag-and-drop
    const dropzone = document.getElementById('doc-dropzone');
    if (dropzone) {
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');

            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) {
                selectedDocFiles = files;
                const fileNameLabel = document.getElementById('doc-file-name');
                if (files.length === 1) {
                    fileNameLabel.textContent = files[0].name;
                    const nameInput = document.getElementById('doc-upload-name');
                    if (nameInput && !nameInput.value) {
                        nameInput.value = files[0].name.split('.').slice(0, -1).join('.');
                    }
                } else {
                    fileNameLabel.textContent = `${files.length} Dateien ausgewählt`;
                    const nameInput = document.getElementById('doc-upload-name');
                    if (nameInput) {
                        nameInput.value = "Mehrere Dokumente";
                    }
                }
            }
        });
    }
});

// For cross-module compatibility (switchView)
window.fetchDocuments = async function() {
    console.log('Documents Module: fetching contents for folder:', currentFolderId);
    
    if (typeof window.populateDocumentTypeDropdowns === 'function') {
        window.populateDocumentTypeDropdowns();
    }

    const grid = document.getElementById('documents-grid');
    if (grid) grid.innerHTML = '<div style="padding: 2rem; text-align: center; color: rgba(255,255,255,0.4); grid-column: 1/-1;">Lade Inhalt...</div>';

    try {
        // 1. Fetch Folders in current folder
        let folderQuery = window.supabaseClient
            .from('document_folders')
            .select('*');
        
        if (currentFolderId) {
            folderQuery = folderQuery.eq('parent_id', currentFolderId);
        } else {
            folderQuery = folderQuery.is('parent_id', null);
        }
        
        const { data: folders, error: folderError } = await folderQuery.order('name');
        if (folderError) throw folderError;
        allFolders = folders || [];

        // 2. Fetch Documents in current folder
        let docQuery = window.supabaseClient
            .from('documents')
            .select('*, machines(name, serial, year, manufacturer)');

        if (currentFolderId) {
            docQuery = docQuery.eq('folder_id', currentFolderId);
        } else {
            docQuery = docQuery.is('folder_id', null);
        }

        const { data: docs, error: docError } = await docQuery.order('created_at', { ascending: false });
        if (docError) throw docError;
        allDocuments = docs || [];

        window.filterDocuments();
        window.updateBreadcrumbs();
        window.updateTotalDocSize();
        if (typeof window.populateDocumentTypeDropdowns === 'function') {
            window.populateDocumentTypeDropdowns();
        }
    } catch (err) {
        console.error('Error fetching documents/folders:', err);
        if (grid) grid.innerHTML = '<div style="padding: 2rem; text-align: center; color: #ef4444; grid-column: 1/-1;">Fehler beim Laden des Inhalts.</div>';
    }
};

// Gesamtgröße aller Dokumente (über alle Ordner hinweg) anzeigen
window.updateTotalDocSize = async function() {
    const label = document.getElementById('doc-total-size-label');
    if (!label) return;

    try {
        const { data, error } = await window.supabaseClient
            .from('documents')
            .select('size');
        if (error) throw error;

        const totalBytes = (data || []).reduce((sum, d) => sum + (d.size || 0), 0);
        label.textContent = `Gesamtgröße: ${window.formatSize(totalBytes)}`;
    } catch (err) {
        console.error('Error calculating total document size:', err);
        label.textContent = '';
    }
};

window.navigateToFolder = async function(folderId, folderName) {
    if (folderId === null) {
        currentFolderId = null;
        currentFolderPath = [];
    } else {
        // If navigating forward
        if (!currentFolderPath.find(p => p.id === folderId)) {
            currentFolderPath.push({ id: folderId, name: folderName });
        } else {
            // If navigating back via breadcrumb
            const idx = currentFolderPath.findIndex(p => p.id === folderId);
            currentFolderPath = currentFolderPath.slice(0, idx + 1);
        }
        currentFolderId = folderId;
    }
    window.fetchDocuments();
};

window.updateBreadcrumbs = function() {
    const container = document.getElementById('doc-breadcrumbs');
    if (!container) return;

    let html = `
        <span class="breadcrumb-item" 
              style="cursor: pointer; color: ${currentFolderId === null ? 'white' : 'var(--accent-color)'}; opacity: ${currentFolderId === null ? '1' : '0.7'};" 
              onclick="window.navigateToFolder(null)"
              ondragover="window.handleDragOver(event)"
              ondrop="window.handleDrop(event, null)">
            Alle Dokumente
        </span>`;

    currentFolderPath.forEach((folder, index) => {
        const isLast = index === currentFolderPath.length - 1;
        html += `
            <span style="opacity: 0.5;">/</span>
            <span class="breadcrumb-item" 
                  style="cursor: pointer; color: ${isLast ? 'white' : 'var(--accent-color)'}; opacity: ${isLast ? '1' : '0.7'};" 
                  onclick="window.navigateToFolder('${folder.id}', '${folder.name}')"
                  ondragover="window.handleDragOver(event)"
                  ondrop="window.handleDrop(event, '${folder.id}')">
                ${folder.name}
            </span>
        `;
    });

    container.innerHTML = html;
};

// Wendet Such-/Kategorie-Filter auf eine Liste von Dokumenten an.
// doc.category wird als kommagetrennte Liste behandelt (Mehrfachauswahl beim Hochladen/Bearbeiten).
function applyDocFilters(docs, searchTerm) {
    return docs.filter(doc => {
        const matchesSearch = doc.name.toLowerCase().includes(searchTerm) ||
                             (doc.machines?.name && doc.machines.name.toLowerCase().includes(searchTerm)) ||
                             (doc.category && doc.category.toLowerCase().includes(searchTerm));

        const docCategories = (doc.category || '').split(',').map(c => c.trim()).filter(Boolean);
        const matchesCategory = activeDocCategories.includes('all') || docCategories.some(c => activeDocCategories.includes(c));

        const docMachineCategories = (doc.machine_categories || '').split(',').map(c => c.trim()).filter(Boolean);
        const matchesMachineCat = activeMachineCatFilters.includes('all') || docMachineCategories.some(c => activeMachineCatFilters.includes(c));

        const docSeries = (doc.machine_series || '').split(',').map(c => c.trim()).filter(Boolean);
        const matchesSeries = activeSeriesFilters.includes('all') || docSeries.some(c => activeSeriesFilters.includes(c));

        return matchesSearch && matchesCategory && matchesMachineCat && matchesSeries;
    });
}

window.filterDocuments = function() {
    const searchTerm = document.getElementById('doc-search-input')?.value.toLowerCase() || '';
    const isFiltering = !activeDocCategories.includes('all') || !activeMachineCatFilters.includes('all') || !activeSeriesFilters.includes('all') || searchTerm.length > 0;

    clearTimeout(_filterDocsDebounceTimer);

    if (!isFiltering) {
        // Normaler Ordner-Modus: nur Inhalt des aktuellen Ordners anzeigen
        filteredDocuments = applyDocFilters(allDocuments, searchTerm);
        filteredFolders = allFolders.filter(f => f.name.toLowerCase().includes(searchTerm));
        window.renderDocuments();
        return;
    }

    // Aktiver Filter/Suche: alle Dokumente durchsuchen, auch in Unterordnern
    _filterDocsDebounceTimer = setTimeout(async () => {
        try {
            const [{ data: docs, error: docError }, { data: folders, error: folderError }] = await Promise.all([
                window.supabaseClient
                    .from('documents')
                    .select('*, machines(name, serial, year, manufacturer)')
                    .order('created_at', { ascending: false }),
                window.supabaseClient
                    .from('document_folders')
                    .select('id, name')
            ]);
            if (docError) throw docError;
            if (folderError) throw folderError;

            const folderNameMap = {};
            (folders || []).forEach(f => { folderNameMap[f.id] = f.name; });
            (docs || []).forEach(doc => {
                doc._folderName = doc.folder_id ? folderNameMap[doc.folder_id] : null;
            });

            filteredDocuments = applyDocFilters(docs || [], searchTerm);
            filteredFolders = []; // Ordnerkarten ausblenden, da global über alle Ordner gesucht wird
            window.renderDocuments();
        } catch (err) {
            console.error('Error fetching documents for global filter:', err);
            filteredDocuments = applyDocFilters(allDocuments, searchTerm);
            filteredFolders = [];
            window.renderDocuments();
        }
    }, 200);
};


// ─── Document Type Dropdowns (dynamic from settings) ─────────────────────────

window.populateDocumentTypeDropdowns = function() {
    const docCategories = (window.categoryList || []).filter(c => c.type === 'document');
    const machineCategories = (window.categoryList || []).filter(c => c.type === 'machine');
    const seriesCategories = (window.categoryList || []).filter(c => c.type === 'series');

    // 1) Filter dropdown (multi-select)
    const filterList = document.getElementById('doc-category-options');
    if (filterList) {
        filterList.innerHTML = '';
        // 'Alle' option
        const allLi = document.createElement('li');
        allLi.dataset.value = 'all';
        allLi.textContent = 'Alle';
        if (activeDocCategories.includes('all')) allLi.classList.add('active');
        allLi.addEventListener('click', e => { e.stopPropagation(); window.toggleDocCategory('all'); });
        filterList.appendChild(allLi);

        docCategories.forEach(cat => {
            const li = document.createElement('li');
            li.dataset.value = cat.name;
            li.textContent = cat.name;
            if (activeDocCategories.includes(cat.name)) li.classList.add('active');
            li.addEventListener('click', e => { e.stopPropagation(); window.toggleDocCategory(cat.name); });
            filterList.appendChild(li);
        });
        window.updateDocFilterLabel();
    }

    // 2) Upload modal dropdown - Document Types (multi-select)
    const uploadDocTypeList = document.getElementById('doc-upload-type-options');
    if (uploadDocTypeList) {
        uploadDocTypeList.innerHTML = '';
        docCategories.forEach(cat => {
            const li = document.createElement('li');
            li.dataset.value = cat.name;
            li.textContent = cat.name;
            if (activeUploadDocTypes.includes(cat.name)) li.classList.add('selected');
            li.addEventListener('click', e => {
                e.stopPropagation();
                window.toggleUploadDocType(cat.name);
            });
            uploadDocTypeList.appendChild(li);
        });
        window.updateUploadDocTypeLabel();
    }

    // 3) Upload modal dropdown - Machine Categories (multi-select)
    const uploadMachineCatList = document.getElementById('doc-upload-machine-cat-options');
    if (uploadMachineCatList) {
        uploadMachineCatList.innerHTML = '';
        machineCategories.forEach(cat => {
            const li = document.createElement('li');
            li.dataset.value = cat.name;
            li.textContent = cat.name;
            if (activeUploadMachineCategories.includes(cat.name)) li.classList.add('selected');
            li.addEventListener('click', e => {
                e.stopPropagation();
                window.toggleUploadMachineCategory(cat.name);
            });
            uploadMachineCatList.appendChild(li);
        });
        window.updateUploadMachineCatLabel();
    }

    // 4) Edit modal dropdown - Document Types (multi-select)
    const editDocTypeList = document.getElementById('doc-edit-type-options');
    if (editDocTypeList) {
        editDocTypeList.innerHTML = '';
        docCategories.forEach(cat => {
            const li = document.createElement('li');
            li.dataset.value = cat.name;
            li.textContent = cat.name;
            if (activeEditDocTypes.includes(cat.name)) li.classList.add('selected');
            li.addEventListener('click', e => {
                e.stopPropagation();
                window.toggleEditDocType(cat.name);
            });
            editDocTypeList.appendChild(li);
        });
        window.updateEditDocTypeLabel();
    }

    // 5) Edit modal dropdown - Machine Categories (multi-select)
    const editMachineCatList = document.getElementById('doc-edit-machine-cat-options');
    if (editMachineCatList) {
        editMachineCatList.innerHTML = '';
        machineCategories.forEach(cat => {
            const li = document.createElement('li');
            li.dataset.value = cat.name;
            li.textContent = cat.name;
            if (activeEditMachineCategories.includes(cat.name)) li.classList.add('selected');
            li.addEventListener('click', e => {
                e.stopPropagation();
                window.toggleEditMachineCategory(cat.name);
            });
            editMachineCatList.appendChild(li);
        });
        window.updateEditMachineCatLabel();
    }

    // 6) Upload modal dropdown - Maschinenserie (Mehrfachauswahl, abhängig von Maschinenkategorie)
    window.refreshUploadSeriesDropdown();

    // 7) Edit modal dropdown - Maschinenserie (Mehrfachauswahl, abhängig von Maschinenkategorie)
    window.refreshEditSeriesDropdown();

    // 8) Filter dropdown - Maschinenkategorie (multi-select)
    const machineCatFilterList = document.getElementById('doc-machine-cat-filter-options');
    if (machineCatFilterList) {
        machineCatFilterList.innerHTML = '';
        const allLi = document.createElement('li');
        allLi.dataset.value = 'all';
        allLi.textContent = 'Alle';
        if (activeMachineCatFilters.includes('all')) allLi.classList.add('active');
        allLi.addEventListener('click', e => { e.stopPropagation(); window.toggleDocMachineCatFilter('all'); });
        machineCatFilterList.appendChild(allLi);

        machineCategories.forEach(cat => {
            const li = document.createElement('li');
            li.dataset.value = cat.name;
            li.textContent = cat.name;
            if (activeMachineCatFilters.includes(cat.name)) li.classList.add('active');
            li.addEventListener('click', e => { e.stopPropagation(); window.toggleDocMachineCatFilter(cat.name); });
            machineCatFilterList.appendChild(li);
        });
        window.updateDocMachineCatFilterLabel();
    }

    // 9) Filter dropdown - Maschinenserie (multi-select)
    const seriesFilterList = document.getElementById('doc-series-filter-options');
    if (seriesFilterList) {
        seriesFilterList.innerHTML = '';
        const allLi = document.createElement('li');
        allLi.dataset.value = 'all';
        allLi.textContent = 'Alle';
        if (activeSeriesFilters.includes('all')) allLi.classList.add('active');
        allLi.addEventListener('click', e => { e.stopPropagation(); window.toggleDocSeriesFilter('all'); });
        seriesFilterList.appendChild(allLi);

        seriesCategories.forEach(cat => {
            const li = document.createElement('li');
            li.dataset.value = cat.name;
            li.textContent = cat.name;
            if (activeSeriesFilters.includes(cat.name)) li.classList.add('active');
            li.addEventListener('click', e => { e.stopPropagation(); window.toggleDocSeriesFilter(cat.name); });
            seriesFilterList.appendChild(li);
        });
        window.updateDocSeriesFilterLabel();
    }
};

window.toggleDocCategoryDropdown = function(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('doc-category-dropdown');
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains('active');
    document.querySelectorAll('.custom-filter-dropdown.active').forEach(d => d.classList.remove('active'));
    if (!isOpen) dropdown.classList.add('active');
};

window.toggleDocMachineCatFilterDropdown = function(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('doc-machine-cat-filter-dropdown');
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains('active');
    document.querySelectorAll('.custom-filter-dropdown.active').forEach(d => d.classList.remove('active'));
    if (!isOpen) dropdown.classList.add('active');
};

window.toggleDocSeriesFilterDropdown = function(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('doc-series-filter-dropdown');
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains('active');
    document.querySelectorAll('.custom-filter-dropdown.active').forEach(d => d.classList.remove('active'));
    if (!isOpen) dropdown.classList.add('active');
};

window.toggleDocMachineCatFilter = function(value) {
    if (value === 'all') {
        activeMachineCatFilters = ['all'];
    } else {
        activeMachineCatFilters = activeMachineCatFilters.filter(c => c !== 'all');
        if (activeMachineCatFilters.includes(value)) {
            activeMachineCatFilters = activeMachineCatFilters.filter(c => c !== value);
        } else {
            activeMachineCatFilters.push(value);
        }
        if (activeMachineCatFilters.length === 0) activeMachineCatFilters = ['all'];
    }
    window.updateDocMachineCatFilterLabel();
    document.querySelectorAll('#doc-machine-cat-filter-options li').forEach(li => {
        li.classList.toggle('active', activeMachineCatFilters.includes(li.dataset.value));
    });
    window.filterDocuments();
};

window.updateDocMachineCatFilterLabel = function() {
    const label = document.getElementById('selected-machine-cat-filter-label');
    if (!label) return;
    label.textContent = activeMachineCatFilters.includes('all') ? 'Alle Maschinenkategorien' : activeMachineCatFilters.join(', ');

    const dropdown = document.getElementById('doc-machine-cat-filter-dropdown');
    if (dropdown) {
        const hasSelection = !activeMachineCatFilters.includes('all') && activeMachineCatFilters.length > 0;
        dropdown.classList.toggle('has-selection', hasSelection);
    }
};

window.toggleDocSeriesFilter = function(value) {
    if (value === 'all') {
        activeSeriesFilters = ['all'];
    } else {
        activeSeriesFilters = activeSeriesFilters.filter(c => c !== 'all');
        if (activeSeriesFilters.includes(value)) {
            activeSeriesFilters = activeSeriesFilters.filter(c => c !== value);
        } else {
            activeSeriesFilters.push(value);
        }
        if (activeSeriesFilters.length === 0) activeSeriesFilters = ['all'];
    }
    window.updateDocSeriesFilterLabel();
    document.querySelectorAll('#doc-series-filter-options li').forEach(li => {
        li.classList.toggle('active', activeSeriesFilters.includes(li.dataset.value));
    });
    window.filterDocuments();
};

window.updateDocSeriesFilterLabel = function() {
    const label = document.getElementById('selected-series-filter-label');
    if (!label) return;
    label.textContent = activeSeriesFilters.includes('all') ? 'Alle Maschinenserien' : activeSeriesFilters.join(', ');

    const dropdown = document.getElementById('doc-series-filter-dropdown');
    if (dropdown) {
        const hasSelection = !activeSeriesFilters.includes('all') && activeSeriesFilters.length > 0;
        dropdown.classList.toggle('has-selection', hasSelection);
    }
};

window.toggleDocUploadTypeDropdown = function(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('doc-upload-type-dropdown');
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains('active');
    
    // Close others
    document.querySelectorAll('.custom-filter-dropdown.active').forEach(d => {
        d.classList.remove('active');
        d.closest('.form-group')?.classList.remove('has-active-dropdown');
    });
    
    if (!isOpen) {
        dropdown.classList.add('active');
        dropdown.closest('.form-group')?.classList.add('has-active-dropdown');
    }
};

window.toggleDocUploadMachineCatDropdown = function(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('doc-upload-machine-cat-dropdown');
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains('active');
    
    // Close others
    document.querySelectorAll('.custom-filter-dropdown.active').forEach(d => {
        d.classList.remove('active');
        d.closest('.form-group')?.classList.remove('has-active-dropdown');
    });
    
    if (!isOpen) {
        dropdown.classList.add('active');
        dropdown.closest('.form-group')?.classList.add('has-active-dropdown');
    }
};

window.toggleUploadDocType = function(typeName) {
    if (activeUploadDocTypes.includes(typeName)) {
        activeUploadDocTypes = activeUploadDocTypes.filter(t => t !== typeName);
    } else {
        activeUploadDocTypes.push(typeName);
    }
    window.updateUploadDocTypeLabel();
    document.querySelectorAll('#doc-upload-type-options li').forEach(li => {
        li.classList.toggle('selected', activeUploadDocTypes.includes(li.dataset.value));
    });
};

window.updateUploadDocTypeLabel = function() {
    const label = document.getElementById('doc-upload-type-label');
    if (label) {
        label.textContent = activeUploadDocTypes.length > 0 ? activeUploadDocTypes.join(', ') : 'Dokumententyp wählen...';
    }
};

window.toggleUploadMachineCategory = function(catName) {
    if (activeUploadMachineCategories.includes(catName)) {
        activeUploadMachineCategories = activeUploadMachineCategories.filter(c => c !== catName);
    } else {
        activeUploadMachineCategories.push(catName);
    }
    window.updateUploadMachineCatLabel();
    document.querySelectorAll('#doc-upload-machine-cat-options li').forEach(li => {
        li.classList.toggle('selected', activeUploadMachineCategories.includes(li.dataset.value));
    });
    window.refreshUploadSeriesDropdown();
};

window.updateUploadMachineCatLabel = function() {
    const label = document.getElementById('doc-upload-machine-cat-label');
    if (label) {
        label.textContent = activeUploadMachineCategories.length > 0 ? activeUploadMachineCategories.join(', ') : 'Maschinenkategorie wählen...';
    }
};

// ─── Edit modal dropdowns (Dokumententyp / Maschinenkategorie beim Bearbeiten) ───

window.toggleDocEditTypeDropdown = function(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('doc-edit-type-dropdown');
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains('active');

    document.querySelectorAll('.custom-filter-dropdown.active').forEach(d => {
        d.classList.remove('active');
        d.closest('.form-group')?.classList.remove('has-active-dropdown');
    });

    if (!isOpen) {
        dropdown.classList.add('active');
        dropdown.closest('.form-group')?.classList.add('has-active-dropdown');
    }
};

window.toggleDocEditMachineCatDropdown = function(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('doc-edit-machine-cat-dropdown');
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains('active');

    document.querySelectorAll('.custom-filter-dropdown.active').forEach(d => {
        d.classList.remove('active');
        d.closest('.form-group')?.classList.remove('has-active-dropdown');
    });

    if (!isOpen) {
        dropdown.classList.add('active');
        dropdown.closest('.form-group')?.classList.add('has-active-dropdown');
    }
};

window.toggleEditDocType = function(typeName) {
    if (activeEditDocTypes.includes(typeName)) {
        activeEditDocTypes = activeEditDocTypes.filter(t => t !== typeName);
    } else {
        activeEditDocTypes.push(typeName);
    }
    window.updateEditDocTypeLabel();
    document.querySelectorAll('#doc-edit-type-options li').forEach(li => {
        li.classList.toggle('selected', activeEditDocTypes.includes(li.dataset.value));
    });
};

window.updateEditDocTypeLabel = function() {
    const label = document.getElementById('doc-edit-type-label');
    if (label) {
        label.textContent = activeEditDocTypes.length > 0 ? activeEditDocTypes.join(', ') : 'Dokumententyp wählen...';
    }
};

window.toggleEditMachineCategory = function(catName) {
    if (activeEditMachineCategories.includes(catName)) {
        activeEditMachineCategories = activeEditMachineCategories.filter(c => c !== catName);
    } else {
        activeEditMachineCategories.push(catName);
    }
    window.updateEditMachineCatLabel();
    document.querySelectorAll('#doc-edit-machine-cat-options li').forEach(li => {
        li.classList.toggle('selected', activeEditMachineCategories.includes(li.dataset.value));
    });
    window.refreshEditSeriesDropdown();
};

window.updateEditMachineCatLabel = function() {
    const label = document.getElementById('doc-edit-machine-cat-label');
    if (label) {
        label.textContent = activeEditMachineCategories.length > 0 ? activeEditMachineCategories.join(', ') : 'Maschinenkategorie wählen...';
    }
};

// ─── Maschinenserie-Dropdowns (abhängig von ausgewählter Maschinenkategorie) ───

window.getMatchingSeriesCategories = function(activeMachineCategories) {
    if (!activeMachineCategories || activeMachineCategories.length === 0) return [];
    return (window.categoryList || []).filter(cat => {
        if (cat.type !== 'series') return false;
        const seriesCats = (cat.machine_categories || '').split(',').map(s => s.trim()).filter(Boolean);
        return seriesCats.some(sc => activeMachineCategories.includes(sc));
    });
};

window.refreshUploadSeriesDropdown = function() {
    const group = document.getElementById('doc-upload-series-group');
    const list = document.getElementById('doc-upload-series-options');
    if (!group || !list) return;

    const matching = window.getMatchingSeriesCategories(activeUploadMachineCategories);
    activeUploadSeries = activeUploadSeries.filter(s => matching.some(cat => cat.name === s));

    list.innerHTML = '';
    matching.forEach(cat => {
        const li = document.createElement('li');
        li.dataset.value = cat.name;
        li.textContent = cat.name;
        if (activeUploadSeries.includes(cat.name)) li.classList.add('selected');
        li.addEventListener('click', e => {
            e.stopPropagation();
            window.toggleUploadSeries(cat.name);
        });
        list.appendChild(li);
    });

    group.style.display = matching.length > 0 ? 'block' : 'none';
    window.updateUploadSeriesLabel();
};

window.toggleDocUploadSeriesDropdown = function(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('doc-upload-series-dropdown');
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains('active');

    document.querySelectorAll('.custom-filter-dropdown.active').forEach(d => {
        d.classList.remove('active');
        d.closest('.form-group')?.classList.remove('has-active-dropdown');
    });

    if (!isOpen) {
        dropdown.classList.add('active');
        dropdown.closest('.form-group')?.classList.add('has-active-dropdown');
    }
};

window.toggleUploadSeries = function(seriesName) {
    if (activeUploadSeries.includes(seriesName)) {
        activeUploadSeries = activeUploadSeries.filter(s => s !== seriesName);
    } else {
        activeUploadSeries.push(seriesName);
    }
    window.updateUploadSeriesLabel();
    document.querySelectorAll('#doc-upload-series-options li').forEach(li => {
        li.classList.toggle('selected', activeUploadSeries.includes(li.dataset.value));
    });
};

window.updateUploadSeriesLabel = function() {
    const label = document.getElementById('doc-upload-series-label');
    if (label) {
        label.textContent = activeUploadSeries.length > 0 ? activeUploadSeries.join(', ') : 'Maschinenserie wählen...';
    }
};

window.refreshEditSeriesDropdown = function() {
    const group = document.getElementById('doc-edit-series-group');
    const list = document.getElementById('doc-edit-series-options');
    if (!group || !list) return;

    const matching = window.getMatchingSeriesCategories(activeEditMachineCategories);
    activeEditSeries = activeEditSeries.filter(s => matching.some(cat => cat.name === s));

    list.innerHTML = '';
    matching.forEach(cat => {
        const li = document.createElement('li');
        li.dataset.value = cat.name;
        li.textContent = cat.name;
        if (activeEditSeries.includes(cat.name)) li.classList.add('selected');
        li.addEventListener('click', e => {
            e.stopPropagation();
            window.toggleEditSeries(cat.name);
        });
        list.appendChild(li);
    });

    group.style.display = matching.length > 0 ? 'block' : 'none';
    window.updateEditSeriesLabel();
};

window.toggleDocEditSeriesDropdown = function(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('doc-edit-series-dropdown');
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains('active');

    document.querySelectorAll('.custom-filter-dropdown.active').forEach(d => {
        d.classList.remove('active');
        d.closest('.form-group')?.classList.remove('has-active-dropdown');
    });

    if (!isOpen) {
        dropdown.classList.add('active');
        dropdown.closest('.form-group')?.classList.add('has-active-dropdown');
    }
};

window.toggleEditSeries = function(seriesName) {
    if (activeEditSeries.includes(seriesName)) {
        activeEditSeries = activeEditSeries.filter(s => s !== seriesName);
    } else {
        activeEditSeries.push(seriesName);
    }
    window.updateEditSeriesLabel();
    document.querySelectorAll('#doc-edit-series-options li').forEach(li => {
        li.classList.toggle('selected', activeEditSeries.includes(li.dataset.value));
    });
};

window.updateEditSeriesLabel = function() {
    const label = document.getElementById('doc-edit-series-label');
    if (label) {
        label.textContent = activeEditSeries.length > 0 ? activeEditSeries.join(', ') : 'Maschinenserie wählen...';
    }
};

window.toggleDocCategory = function(category) {
    if (category === 'all') {
        activeDocCategories = ['all'];
    } else {
        activeDocCategories = activeDocCategories.filter(c => c !== 'all');
        if (activeDocCategories.includes(category)) {
            activeDocCategories = activeDocCategories.filter(c => c !== category);
        } else {
            activeDocCategories.push(category);
        }
        if (activeDocCategories.length === 0) activeDocCategories = ['all'];
    }
    window.updateDocFilterLabel();
    // update active states in list
    document.querySelectorAll('#doc-category-options li').forEach(li => {
        li.classList.toggle('active', activeDocCategories.includes(li.dataset.value));
    });
    window.filterDocuments();
};

window.updateDocFilterLabel = function() {
    const label = document.getElementById('selected-categories-label');
    if (!label) return;
    if (activeDocCategories.includes('all')) {
        label.textContent = 'Alle Typen';
    } else {
        label.textContent = activeDocCategories.join(', ');
    }

    const dropdown = document.getElementById('doc-category-dropdown');
    if (dropdown) {
        const hasSelection = !activeDocCategories.includes('all') && activeDocCategories.length > 0;
        dropdown.classList.toggle('has-selection', hasSelection);
    }
};

window.updateDocCategoryUI = function() {
    window.updateDocFilterLabel();
};

// Close dropdowns when clicking outside
document.addEventListener('click', function() {
    document.querySelectorAll('.custom-filter-dropdown.active').forEach(d => {
        d.classList.remove('active');
        d.closest('.form-group')?.classList.remove('has-active-dropdown');
    });
});

window.formatSize = function(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

function checkCanDelete() {
    let canDelete = true;
    
    // Fallback: If body has class disable-delete, delete is disabled
    if (document.body.classList.contains('disable-delete')) {
        canDelete = false;
    }
    
    if (window.activeUser) {
        // Admin (Mirco Loseke) always has delete permission
        const nameLower = (window.activeUser.name || '').toLowerCase().trim();
        if (nameLower.includes('mirco') && nameLower.includes('loseke')) {
            return true;
        }
        
        let perms = window.activeUser.permissions;
        if (typeof perms === 'string') {
            try {
                perms = JSON.parse(perms);
            } catch(e){}
        }
        if (perms && perms.can_delete === false) {
            canDelete = false;
        }
    }
    
    return canDelete;
}

window.renderDocuments = function() {
    const grid = document.getElementById('documents-grid');
    const emptyState = document.getElementById('documents-empty-state');
    
    if (!grid) return;

    if (filteredDocuments.length === 0 && filteredFolders.length === 0) {
        grid.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    
    let canDelete = checkCanDelete();
    let html = '';

    // Wenn aktiv gefiltert/gesucht wird, kommen Treffer aus allen Ordnern - dann den Ordnernamen anzeigen
    const docSearchTerm = document.getElementById('doc-search-input')?.value.toLowerCase() || '';
    const isGlobalSearch = !activeDocCategories.includes('all') || !activeMachineCatFilters.includes('all') || !activeSeriesFilters.includes('all') || docSearchTerm.length > 0;

    // Render Folders
    filteredFolders.forEach(folder => {
        const iconSvg = window.getFolderIcon(folder.name);
        const coverContent = folder.cover_url 
            ? `<img src="${folder.cover_url}" alt="${folder.name}" loading="lazy">` 
            : iconSvg;
            
        html += `
            <div class="doc-card folder-card" 
                 onclick="window.navigateToFolder('${folder.id}', '${folder.name}')"
                 draggable="true" 
                 ondragstart="window.handleDragStart(event, 'folder', '${folder.id}')"
                 ondragover="window.handleDragOver(event)"
                 ondragleave="window.handleDragLeave(event)"
                 ondrop="window.handleDrop(event, '${folder.id}')">
                 
                <div class="doc-info" style="margin-bottom: auto;">
                     <div class="folder-title-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                    </div>
                     <div class="doc-title" style="text-align: center;">
                        ${folder.name}
                    </div>
                </div>
                
                <div class="doc-thumb folder-thumb">
                    ${coverContent}
                    <div class="upload-overlay" onclick="event.stopPropagation(); window.triggerCoverUpload('${folder.id}')" title="Cover ändern">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                        <span style="margin-left: 6px;">Cover</span>
                    </div>
                </div>
                
                <div class="doc-actions">
                    <button class="btn-doc-action" onclick="event.stopPropagation(); window.openRenameModal('${folder.id}', 'folder', '${folder.name.replace(/'/g, "\\'")}')" title="Umbenennen">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                    </button>
                    ${canDelete ? `
                    <button class="btn-doc-action btn-doc-delete delete-permission-required" style="background: rgba(239, 68, 68, 0.2); border-color: rgba(239, 68, 68, 0.3); color: #ef4444;" onclick="event.stopPropagation(); window.deleteFolder('${folder.id}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
    });

    // Render Documents
    filteredDocuments.forEach(doc => {
        const isPdf = doc.mime_type === 'application/pdf' || doc.url.toLowerCase().endsWith('.pdf');
        const machineName = doc.machines
            ? [doc.machines.manufacturer, doc.machines.name, (doc.machines.serial || doc.machines.serial_number) ? `#${doc.machines.serial || doc.machines.serial_number}` : null, doc.machines.year ? `(${doc.machines.year})` : null].filter(Boolean).join(' ')
            : null;
        const isServicebericht = (doc.category || '').split(',').map(c => c.trim()).includes('Servicebericht');
        const dateStr = new Date(doc.created_at).toLocaleDateString('de-DE');
        const escapedName = doc.name.replace(/'/g, "\\'");
        const escapedCategory = (doc.category || '').replace(/'/g, "\\'");
        const escapedMachineCategories = (doc.machine_categories || '').replace(/'/g, "\\'");
        const escapedMachineSeries = (doc.machine_series || '').replace(/'/g, "\\'");
        const previewId = `pdf-preview-${doc.id}`;
        const folderName = doc._folderName;

        html += `
            <div class="doc-card"
                 onclick="window.previewDocument('${doc.url}', '${escapedName}', '${doc.mime_type}')"
                 draggable="true"
                 ondragstart="window.handleDragStart(event, 'document', '${doc.id}')">
                <div class="doc-date-label">${dateStr}</div>
                <div class="doc-thumb" id="thumb-container-${doc.id}">
                    ${isPdf ?
                        `<canvas id="${previewId}" class="pdf-thumbnail-canvas"></canvas>
                         <div class="pdf-placeholder" id="placeholder-${doc.id}">
                            <span class="doc-type-icon" style="color: #ef4444;">PDF</span>
                         </div>` :
                        `<img src="${doc.url}" alt="${doc.name}" loading="lazy">`
                    }
                </div>
                <div class="doc-info">
                    <div class="doc-title">${doc.name}</div>
                    <div class="doc-meta">
                        ${doc.category ? `<div class="doc-meta-categories">${doc.category}</div>` : ''}
                        ${isServicebericht && machineName ? `<div class="doc-meta-machine">Maschine: ${machineName}</div>` : ''}
                    </div>
                    ${isGlobalSearch && folderName ? `<div class="doc-meta" style="margin-top: 2px;"><span style="opacity: 0.7;">📁 ${folderName}</span></div>` : ''}
                </div>

                <div style="text-align: center; color: rgba(255,255,255,0.4); font-size: 0.75rem; margin-top: auto; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05);">
                    ${window.formatSize(doc.size)}
                </div>

                <div class="doc-actions">
                    <button class="btn-doc-action" onclick="event.stopPropagation(); window.openRenameModal('${doc.id}', 'document', '${escapedName}', '${escapedCategory}', '${escapedMachineCategories}', '${escapedMachineSeries}')" title="Bearbeiten">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                    </button>
                    <button class="btn-doc-action" onclick="event.stopPropagation(); window.downloadDoc('${doc.url}', '${escapedName}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </button>
                    ${canDelete ? `
                    <button class="btn-doc-action btn-doc-delete delete-permission-required" style="background: rgba(239, 68, 68, 0.2); border-color: rgba(239, 68, 68, 0.3); color: #ef4444;" onclick="event.stopPropagation(); window.deleteDocument('${doc.id}', '${doc.file_path}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
    });

    grid.innerHTML = html;

    // Trigger PDF thumbnail rendering
    filteredDocuments.forEach(doc => {
        const isPdf = doc.mime_type === 'application/pdf' || doc.url.toLowerCase().endsWith('.pdf');
        if (isPdf) {
            window.renderPdfThumbnail(doc.url, `pdf-preview-${doc.id}`, doc.id);
        }
    });
};

window.renderPdfThumbnail = async function(url, canvasId, docId) {
    try {
        await window.loadPDFReader();
    } catch (err) {
        console.error('Failed to load PDF reader:', err);
        return;
    }

    let pdf = null;
    try {
        const loadingTask = window.pdfjsLib.getDocument(url);
        pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        const context = canvas.getContext('2d');
        const viewport = page.getViewport({ scale: 0.5 });
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };
        
        await page.render(renderContext).promise;
        
        // Hide placeholder once rendered
        const placeholder = document.getElementById(`placeholder-${docId}`);
        if (placeholder) placeholder.style.display = 'none';
        canvas.style.display = 'block';
        
    } catch (err) {
        console.error('Error rendering PDF thumbnail:', err);
    } finally {
        if (pdf) {
            try {
                await pdf.destroy();
            } catch (destroyErr) {
                console.error('Error destroying PDF object:', destroyErr);
            }
        }
    }
};

window.openDocumentUploadModal = async function() {
    const modal = document.getElementById('document-upload-modal');
    if (!modal) return;
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    
    // Small delay to ensure display: flex is applied before adding 'show' for transition
    requestAnimationFrame(() => {
        modal.classList.add('show');
    });
    
    // Reset form
    document.getElementById('document-upload-form').reset();
    document.getElementById('doc-file-name').textContent = 'Klicken oder Datei hierher ziehen';
    selectedDocFiles = []; // Reset file array
    
    // Reset category selections
    activeUploadDocTypes = [];
    activeUploadMachineCategories = [];
    activeUploadSeries = [];
    window.populateDocumentTypeDropdowns(); // Redraw UI with empty selections

    // Populate machines dropdown
    try {
        const { data: machines, error } = await window.supabaseClient
            .from('machines')
            .select('id, name')
            .order('name');
        
        if (error) throw error;
        
        const machineSelect = document.getElementById('doc-upload-machine');
        if (machineSelect) {
            machineSelect.innerHTML = '<option value="">Keine Zuordnung</option>' + 
                machines.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
        }
    } catch (err) {
        console.error('Error fetching machines for upload:', err);
    }
};

window.closeDocumentUploadModal = function() {
    const modal = document.getElementById('document-upload-modal');
    if (!modal) return;
    
    modal.classList.remove('show');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }, 300);
};

let selectedDocFiles = []; // Changed from single selectedDocFile

window.handleDocFileSelection = function(event) {
    const files = Array.from(event.target.files);
    if (files.length > 0) {
        selectedDocFiles = files;
        const fileNameLabel = document.getElementById('doc-file-name');
        if (files.length === 1) {
            fileNameLabel.textContent = files[0].name;
            const nameInput = document.getElementById('doc-upload-name');
            if (!nameInput.value) {
                nameInput.value = files[0].name.split('.').slice(0, -1).join('.');
            }
        } else {
            fileNameLabel.textContent = `${files.length} Dateien ausgewählt`;
            document.getElementById('doc-upload-name').value = "Mehrere Dokumente";
        }
    }
};

window.saveDocument = async function(event) {
    event.preventDefault();
    if (selectedDocFiles.length === 0) {
        alert('Bitte wähle mindestens eine Datei aus.');
        return;
    }

    const btn = document.getElementById('btn-save-doc');
    btn.disabled = true;
    btn.textContent = 'Lädt hoch...';

    try {
        const baseName = document.getElementById('doc-upload-name').value;
        const category = activeUploadDocTypes.join(', ');
        const machineCategories = activeUploadMachineCategories.join(', ');
        const machineSeries = activeUploadSeries.join(', ');
        const machineId = document.getElementById('doc-upload-machine')?.value || null;
        
        const pathGenerator = (file, i) => {
            const fileExt = file.name.split('.').pop();
            const safeBaseName = file.name.split('.').slice(0, -1).join('.').replace(/[^a-zA-Z0-9_\- ]/g, '_');
            const fileName = `${safeBaseName}_${Date.now()}.${fileExt}`;
            
            let folderPrefix = 'Documents'; // Root folder in R2
            if (window.currentFolderPath && window.currentFolderPath.length > 0) {
                const folderNames = window.currentFolderPath.map(f => f.name);
                folderPrefix += '/' + folderNames.join('/');
            }
            
            return `${folderPrefix}/${fileName}`;
        };

        console.log(`Starting parallel upload of ${selectedDocFiles.length} files...`);
        const uploadResults = await window.FileUploadService.uploadFiles(
            selectedDocFiles,
            pathGenerator,
            { bucket: 'accounting-documents', compress: true, concurrency: 5, provider: 'cloudflare-r2' }
        );

        // 3. Save all to Database
        const dbEntries = uploadResults.map((res, i) => ({
            name: selectedDocFiles.length === 1 ? baseName : (selectedDocFiles[i].name.split('.').slice(0, -1).join('.') || baseName),
            category: category,
            machine_categories: machineCategories,
            machine_series: machineSeries,
            machine_id: machineId,
            url: res.url,
            file_path: res.path,
            size: res.size,
            mime_type: res.type,
            folder_id: currentFolderId
        }));

        const { error: dbError } = await window.supabaseClient
            .from('documents')
            .insert(dbEntries);

        if (dbError) throw dbError;

        window.closeDocumentUploadModal();
        window.fetchDocuments();
    } catch (err) {
        console.error('Upload process error:', err);
        alert(`Fehler beim Hochladen: ${err.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Speichern';
    }
};

let _previewZoom = 1.0;
let _previewRotation = 0;
let _previewType = null; // 'pdf' | 'image' | 'other'
let _pdfDocRef = null;
let _pdfCacheBustedUrl = null;
let _pinchRenderTimer = null;
let _pdfRenderGen = 0; // guards against overlapping renders (e.g. rapid zoom) drawing over each other

function _updateZoomLabel() {
    const label = document.getElementById('doc-preview-zoom-label');
    if (label) label.textContent = Math.round(_previewZoom * 100) + '%';
}

async function _renderPdfPages() {
    if (!_pdfDocRef) return;
    // If another render starts before this one finishes (e.g. two zoom steps in quick
    // succession), an older call's pages could still be appended after the newer call
    // already cleared/rebuilt the container — producing overlapping/duplicated pages.
    // Every await below re-checks this token and bails out the moment it goes stale.
    const myGen = ++_pdfRenderGen;
    const container = document.getElementById('doc-preview-container');
    const target = document.getElementById('doc-preview-inner') || container;
    if (!target) return;

    const firstPage = await _pdfDocRef.getPage(1);
    if (myGen !== _pdfRenderGen) return;

    // Fit the whole page (width AND height) inside the viewport at 100%, not just its width.
    // Fitting width alone stretches a narrow A4-portrait page across a much wider desktop
    // window, making "100%" look huge and forcing the user to zoom out to see it fully.
    const naturalVp = firstPage.getViewport({ scale: 1, rotation: _previewRotation });
    const containerWidth = Math.max(300, (container ? container.clientWidth : 0) || (window.innerWidth - 40));
    const containerHeight = Math.max(300, (container ? container.clientHeight : 0) || (window.innerHeight - 160));
    const fitScale = Math.min(containerWidth / naturalVp.width, containerHeight / naturalVp.height);
    const renderScale = fitScale * _previewZoom;

    target.innerHTML = '';
    for (let pageNum = 1; pageNum <= _pdfDocRef.numPages; pageNum++) {
        const page = pageNum === 1 ? firstPage : await _pdfDocRef.getPage(pageNum);
        if (myGen !== _pdfRenderGen) return;
        const viewport = page.getViewport({ scale: renderScale, rotation: _previewRotation });
        const pageWrapper = document.createElement('div');
        // Display width in px so zoom actually changes visible size. The wrapper is
        // box-sizing:border-box with 15px padding on each side, so it needs to be 30px
        // WIDER than the canvas — otherwise the (square-cornered) canvas is exactly as
        // wide as the wrapper's own outer edge and pokes out past its rounded corners,
        // looking like a second overlapping frame/sheet behind the card.
        pageWrapper.style.cssText = `margin: 20px auto; padding: 15px; background: white; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border-radius: 8px; width: ${Math.round(viewport.width) + 30}px; box-sizing: border-box; overflow: hidden;`;
        const canvas = document.createElement('canvas');
        canvas.style.display = 'block';
        // Render at the screen's actual pixel density so thin lines/edges stay crisp —
        // otherwise a blurry/soft-scaled canvas can look like a faint double edge next
        // to the wrapper's own (pixel-perfect) rounded border.
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(viewport.width * dpr);
        canvas.height = Math.round(viewport.height * dpr);
        canvas.style.width = Math.round(viewport.width) + 'px';
        canvas.style.height = Math.round(viewport.height) + 'px';
        pageWrapper.appendChild(canvas);
        target.appendChild(pageWrapper);
        const context = canvas.getContext('2d');
        if (dpr !== 1) context.scale(dpr, dpr);
        await page.render({ canvasContext: context, viewport }).promise;
        if (myGen !== _pdfRenderGen) return;
    }
}

function _applyImageTransform() {
    const inner = document.getElementById('doc-preview-inner');
    if (!inner) return;
    const img = inner.querySelector('img');
    if (!img) return;
    img.style.width = `${Math.round(_previewZoom * 100)}%`;
    img.style.maxWidth = 'none';
    img.style.transform = `rotate(${_previewRotation}deg)`;
    img.style.transformOrigin = 'center center';
}

function _clearPendingWheelPreview() {
    // Cancel any in-flight debounced wheel-zoom render and its temporary CSS preview
    // transform, so button/rotate actions don't render on top of a stale CSS scale.
    clearTimeout(_pinchRenderTimer);
    const target = document.getElementById('doc-preview-inner');
    if (target) { target.style.transform = ''; target.style.transformOrigin = ''; }
}

window.docPreviewZoom = async function(delta) {
    _clearPendingWheelPreview();
    _previewZoom = Math.min(5, Math.max(0.25, parseFloat((_previewZoom + delta).toFixed(2))));
    _updateZoomLabel();
    if (_previewType === 'pdf') await _renderPdfPages();
    else _applyImageTransform();
};

window.docPreviewRotate = async function() {
    _clearPendingWheelPreview();
    _previewRotation = (_previewRotation + 90) % 360;
    if (_previewType === 'pdf') await _renderPdfPages();
    else _applyImageTransform();
};

// Set up pinch-to-zoom and ctrl+wheel on the container (once, lazily)
let _previewEventsAttached = false;
function _attachPreviewEvents() {
    if (_previewEventsAttached) return;
    _previewEventsAttached = true;
    const container = document.getElementById('doc-preview-container');
    if (!container) return;

    // Ctrl+wheel (desktop zoom, also used by Chrome/Android for pinch).
    // Zooms toward the cursor position (like Adobe/Chrome PDF viewer) instead of the
    // page center, by keeping the same content point under the mouse before/after.
    //
    // Note: we deliberately do NOT apply a temporary CSS transform: scale() to the
    // scrollable content here for "instant" feedback. Chrome recomputes the container's
    // scrollable area from the transformed (post-scale) geometry, so it auto-clamps
    // scrollLeft/scrollTop the moment the transform changes — that's what caused the
    // left/right jump while zooming out. Going straight to a (short) debounced real
    // re-render avoids that entirely.
    container.addEventListener('wheel', function(e) {
        if (e.ctrlKey) {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.15 : -0.15;
            const newZoom = Math.min(5, Math.max(0.25, parseFloat((_previewZoom + delta).toFixed(2))));
            if (newZoom === _previewZoom) return;

            const target = document.getElementById('doc-preview-inner') || container;
            const contRect = container.getBoundingClientRect();
            const cursorX = e.clientX - contRect.left;
            const cursorY = e.clientY - contRect.top;
            // Cursor position within the scrollable content, as a ratio (0..1), captured
            // BEFORE the zoom changes so it can be restored once the content has resized.
            const ratioX = target.scrollWidth > 0 ? (container.scrollLeft + cursorX) / target.scrollWidth : 0.5;
            const ratioY = target.scrollHeight > 0 ? (container.scrollTop + cursorY) / target.scrollHeight : 0.5;

            _previewZoom = newZoom;
            _updateZoomLabel();
            clearTimeout(_pinchRenderTimer);
            _pinchRenderTimer = setTimeout(async () => {
                if (_previewType === 'pdf') await _renderPdfPages();
                else _applyImageTransform();
                container.scrollLeft = ratioX * target.scrollWidth - cursorX;
                container.scrollTop = ratioY * target.scrollHeight - cursorY;
            }, 90);
        }
    }, { passive: false });

    // Native touch pinch — CSS scale during gesture, single re-render on release
    let _pinchDist = null;
    let _pinchZoomStart = 1;
    let _pinchActive = false;

    container.addEventListener('touchstart', function(e) {
        if (e.touches.length === 2) {
            e.preventDefault();
            clearTimeout(_pinchRenderTimer);
            _pinchActive = true;
            _pinchDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            _pinchZoomStart = _previewZoom;
            const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            const rect = container.getBoundingClientRect();
            const inner = document.getElementById('doc-preview-inner');
            if (inner) {
                inner.style.transformOrigin = `${cx - rect.left + container.scrollLeft}px ${cy - rect.top + container.scrollTop}px`;
                inner.style.transform = '';
            }
        }
    }, { passive: false });

    container.addEventListener('touchmove', function(e) {
        if (e.touches.length === 2 && _pinchDist !== null) {
            e.preventDefault();
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const ratio = dist / _pinchDist;
            _previewZoom = Math.min(5, Math.max(0.25, parseFloat((_pinchZoomStart * ratio).toFixed(2))));
            _updateZoomLabel();
            // Only CSS scale — no re-render during gesture
            const inner = document.getElementById('doc-preview-inner');
            if (inner) inner.style.transform = `scale(${ratio})`;
        }
    }, { passive: false });

    container.addEventListener('touchend', function(e) {
        if (!_pinchActive) return;
        if (e.touches.length < 2) {
            _pinchActive = false;
            _pinchDist = null;
            clearTimeout(_pinchRenderTimer);
            _pinchRenderTimer = setTimeout(async () => {
                const inner = document.getElementById('doc-preview-inner');
                if (inner) { inner.style.transform = ''; inner.style.transformOrigin = ''; }
                if (_previewType === 'pdf') await _renderPdfPages();
                else _applyImageTransform();
            }, 120);
        }
    }, { passive: true });
}

window.previewDocument = async function(url, title, mimeType) {
    const modal = document.getElementById('document-preview-modal');
    const container = document.getElementById('doc-preview-container');
    const inner = document.getElementById('doc-preview-inner');
    const titleEl = document.getElementById('doc-preview-title');
    if (!modal) return;

    // Invalidate any render still in flight from a previous previewDocument()/zoom call
    // (e.g. a second click while a heavy Servicebericht-PDF was still being generated)
    // BEFORE touching _pdfDocRef/target — otherwise that stale render can still append
    // its own pages in between this function's own await points, producing the
    // overlapping "double frame" look.
    _pdfRenderGen++;

    // Etwas näher als exaktes "ganze Seite passt rein" starten, damit die Vorschau nicht
    // zu klein/kariert wirkt (eine Zoomstufe naeher als 100%-Fit).
    _previewZoom = 1.15;
    _previewRotation = 0;
    _pdfDocRef = null;
    _previewType = null;
    if (inner) { inner.innerHTML = ''; inner.style.transform = ''; }
    _updateZoomLabel();

    titleEl.textContent = title;
    const openNewTabBtn = document.getElementById('btn-open-preview-newtab');
    if (openNewTabBtn) openNewTabBtn.href = url;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('show'));

    window.currentPreviewUrl = url;
    window.currentPreviewName = title;

    _attachPreviewEvents();

    const isImage = mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
    const isPdf = mimeType === 'application/pdf' || url.toLowerCase().endsWith('.pdf') || url.startsWith('blob:');
    const cacheBustedUrl = url.startsWith('blob:') ? url : `${url}${url.includes('?') ? '&' : '?'}_cb=${Date.now()}`;
    _pdfCacheBustedUrl = cacheBustedUrl;

    const target = inner || container;
    target.innerHTML = '';

    if (isImage) {
        _previewType = 'image';
        target.innerHTML = `<img src="${cacheBustedUrl}" style="width: 100%; display: block; margin: auto; padding: 1rem;">`;
    } else if (isPdf) {
        _previewType = 'pdf';
        target.innerHTML = '<div style="padding: 2rem; text-align: center; color: rgba(255,255,255,0.4);">Dokument wird gerendert...</div>';
        try {
            await window.loadPDFReader();
            _pdfDocRef = await window.pdfjsLib.getDocument(cacheBustedUrl).promise;
            await _renderPdfPages();
        } catch (err) {
            console.error('PDF.js rendering failed, falling back to iframe:', err);
            target.innerHTML = `<iframe src="${cacheBustedUrl}" style="width: 100%; height: 100%; border: none; background: white;"></iframe>`;
        }
    } else {
        _previewType = 'other';
        target.innerHTML = `<iframe src="${url}" style="width: 100%; height: 100%; min-height: 80vh; border: none; background: white;"></iframe>`;
    }
};

window.closeDocumentPreviewModal = function() {
    const modal = document.getElementById('document-preview-modal');
    if (!modal) return;
    
    modal.classList.remove('show');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        const inner = document.getElementById('doc-preview-inner');
        if (inner) inner.innerHTML = '';
        else document.getElementById('doc-preview-container').innerHTML = '';
    }, 300);
};

window.downloadCurrentDoc = function() {
    if (window.currentPreviewUrl) {
        window.downloadDoc(window.currentPreviewUrl, window.currentPreviewName);
    }
};

window.downloadDoc = function(url, name) {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.deleteDocument = async function(id, filePath) {
    if (!checkCanDelete()) {
        alert('Keine Berechtigung zum Löschen von Dokumenten.');
        return;
    }
    if (!confirm('Möchtest du dieses Dokument wirklich löschen?')) return;

    try {
        // 1. Delete from Storage
        if (filePath) {
            await window.FileUploadService.deleteFile(filePath, {
                bucket: 'accounting-documents',
                provider: 'cloudflare-r2'
            });
        }

        // 2. Delete from DB
        const { error } = await window.supabaseClient
            .from('documents')
            .delete()
            .eq('id', id);

        if (error) throw error;
        
        window.fetchDocuments();
    } catch (err) {
        console.error('Error deleting document:', err);
        alert('Fehler beim Löschen des Dokuments.');
    }
};

async function getFolderDocumentsRecursive(folderId) {
    let docsToDelete = [];

    // 1. Fetch documents in the current folder
    const { data: docs, error: docError } = await window.supabaseClient
        .from('documents')
        .select('id, file_path')
        .eq('folder_id', folderId);

    if (!docError && docs) {
        docsToDelete.push(...docs);
    }

    // 2. Fetch nested subfolders
    const { data: subfolders, error: subError } = await window.supabaseClient
        .from('document_folders')
        .select('id')
        .eq('parent_id', folderId);

    if (!subError && subfolders) {
        for (const sub of subfolders) {
            const nestedDocs = await getFolderDocumentsRecursive(sub.id);
            docsToDelete.push(...nestedDocs);
        }
    }

    return docsToDelete;
}

window.deleteFolder = async function(id) {
    if (!checkCanDelete()) {
        alert('Keine Berechtigung zum Löschen von Ordnern.');
        return;
    }
    if (!confirm('Möchtest du diesen Ordner und alle darin enthaltenen Dokumente wirklich löschen?')) return;

    try {
        // 1. Fetch all documents in this folder and its subfolders recursively
        const docsToDelete = await getFolderDocumentsRecursive(id);

        // 2. Delete each document's file from Cloudflare R2
        console.log(`Deleting ${docsToDelete.length} documents from Cloudflare R2 for folder ID:`, id);
        for (const doc of docsToDelete) {
            if (doc.file_path) {
                try {
                    await window.FileUploadService.deleteFile(doc.file_path, {
                        bucket: 'accounting-documents',
                        provider: 'cloudflare-r2'
                    });
                } catch (r2Err) {
                    console.error('Failed to delete document from Cloudflare R2:', doc.file_path, r2Err);
                }
            }
        }

        // 3. Delete document rows from database first to prevent foreign key errors
        if (docsToDelete.length > 0) {
            const docIds = docsToDelete.map(d => d.id);
            const { error: docDbError } = await window.supabaseClient
                .from('documents')
                .delete()
                .in('id', docIds);
            if (docDbError) {
                console.error('Failed to delete documents from DB:', docDbError);
                throw docDbError;
            }
        }

        // 4. Fetch all subfolder IDs recursively
        async function getSubfolderIdsRecursive(folderId) {
            let ids = [folderId];
            const { data: subs } = await window.supabaseClient
                .from('document_folders')
                .select('id')
                .eq('parent_id', folderId);
            if (subs) {
                for (const sub of subs) {
                    const childIds = await getSubfolderIdsRecursive(sub.id);
                    ids.push(...childIds);
                }
            }
            return ids;
        }

        const folderIdsToDelete = await getSubfolderIdsRecursive(id);
        console.log('Deleting folder rows from DB:', folderIdsToDelete);

        // 5. Delete folders from DB (reverse order of nesting or in bulk)
        const { error } = await window.supabaseClient
            .from('document_folders')
            .delete()
            .in('id', folderIdsToDelete);

        if (error) throw error;
        window.fetchDocuments();
    } catch (err) {
        console.error('Error deleting folder:', err);
        alert('Fehler beim Löschen des Ordners: ' + err.message);
    }
};

// --- Folder Management ---
window.openFolderModal = function() {
    const modal = document.getElementById('document-folder-modal');
    if (!modal) return;
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    
    // Smooth transition
    requestAnimationFrame(() => {
        modal.classList.add('show');
    });
    
    // Populate machines select if needed
    const select = document.getElementById('folder-machine-select');
    if (select && window.machineList) {
        const currentVal = select.value;
        select.innerHTML = '<option value="">Keine Zuordnung</option>' + 
            window.machineList.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
        select.value = currentVal;
    }
    
    document.getElementById('folder-name-input').value = '';
};

window.closeFolderModal = function() {
    const modal = document.getElementById('document-folder-modal');
    if (!modal) return;
    
    modal.classList.remove('show');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }, 300);
};

window.saveFolder = async function(event) {
    if (event) event.preventDefault();
    
    const name = document.getElementById('folder-name-input').value;
    const selectEl = document.getElementById('folder-machine-select');
    const machineId = selectEl ? (selectEl.value || null) : null;
    
    if (!name) return;
    
    try {
        const { error } = await window.supabaseClient
            .from('document_folders')
            .insert([{
                name: name,
                parent_id: currentFolderId,
                machine_id: machineId
            }]);
            
        if (error) throw error;
        
        window.closeFolderModal();
        window.fetchDocuments();
    } catch (err) {
        console.error('Error creating folder:', err);
        alert('Fehler beim Erstellen des Ordners.');
    }
};

// --- Drag & Drop ---
window.handleDragStart = function(event, type, id) {
    event.dataTransfer.setData('type', type);
    event.dataTransfer.setData('id', id);
    event.target.classList.add('dragging');
};

window.handleDragOver = function(event) {
    event.preventDefault();
    const card = event.target.closest('.folder-card');
    if (card) {
        card.classList.add('drag-over');
    }
};

window.handleDragLeave = function(event) {
    const card = event.target.closest('.folder-card');
    if (card) {
        card.classList.remove('drag-over');
    }
};

window.handleDrop = async function(event, targetFolderId) {
    event.preventDefault();
    const type = event.dataTransfer.getData('type');
    const id = event.dataTransfer.getData('id');
    
    // Clear drag over styles
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    
    if (id === targetFolderId) return;

    try {
        let error;
        if (type === 'document') {
            const { error: err } = await window.supabaseClient
                .from('documents')
                .update({ folder_id: targetFolderId })
                .eq('id', id);
            error = err;
        } else if (type === 'folder') {
            const { error: err } = await window.supabaseClient
                .from('document_folders')
                .update({ parent_id: targetFolderId })
                .eq('id', id);
            error = err;
        }
        
        if (error) throw error;
        window.fetchDocuments();
    } catch (err) {
        console.error('Error moving item:', err);
        alert('Fehler beim Verschieben.');
    }
};

// --- Folder Icons ---
window.getFolderIcon = function(name) {
    const n = name.toLowerCase();
    let icon = '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>'; // Default folder
    
    if (n.includes('elektro') || n.includes('strom')) {
        icon = '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>'; // Bolt
    } else if (n.includes('plan') || n.includes('zeichnung')) {
        icon = '<path d="M3 7V5a2 2 0 0 1 2-2h2m10 0h2a2 2 0 0 1 2 2v2m0 10v2a2 2 0 0 1-2 2h-2m-10 0H5a2 2 0 0 1-2-2v-2"></path><path d="M4 12h16"></path><path d="M12 4v16"></path>'; // Crosshair/Blueprint
    } else if (n.includes('wartung') || n.includes('service') || n.includes('reparatur')) {
        icon = '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>'; // Wrench
    } else if (n.includes('rechnung') || n.includes('finanz') || n.includes('angebot')) {
        icon = '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line>'; // Credit card/Invoice
    } else if (n.includes('foto') || n.includes('bild')) {
        icon = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>'; // Image
    } else if (n.includes('handbuch') || n.includes('anleitung')) {
        icon = '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>'; // Book
    }

    return `<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.8">${icon}</svg>`;
};

// --- Renaming / Bearbeiten ---
window.openRenameModal = function(id, type, currentName, category, machineCategories, machineSeries) {
    renamingItem = { id, type, currentName };
    const modal = document.getElementById('document-rename-modal');
    const input = document.getElementById('rename-input');
    const titleEl = document.getElementById('rename-modal-title');
    const categoryFields = document.getElementById('doc-edit-category-fields');

    if (!modal || !input) return;

    input.value = currentName;

    if (type === 'document') {
        if (titleEl) titleEl.textContent = 'Dokument bearbeiten';
        if (categoryFields) categoryFields.style.display = 'block';
        activeEditDocTypes = (category || '').split(',').map(c => c.trim()).filter(Boolean);
        activeEditMachineCategories = (machineCategories || '').split(',').map(c => c.trim()).filter(Boolean);
        activeEditSeries = (machineSeries || '').split(',').map(c => c.trim()).filter(Boolean);
        window.populateDocumentTypeDropdowns();
    } else {
        if (titleEl) titleEl.textContent = 'Ordner umbenennen';
        if (categoryFields) categoryFields.style.display = 'none';
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('show'));
};

window.closeRenameModal = function() {
    const modal = document.getElementById('document-rename-modal');
    if (!modal) return;
    
    modal.classList.remove('show');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        renamingItem = null;
    }, 300);
};

window.saveRename = async function(event) {
    if (event) event.preventDefault();
    if (!renamingItem) return;

    const newName = document.getElementById('rename-input').value;
    const isDocument = renamingItem.type === 'document';

    if (!newName) {
        window.closeRenameModal();
        return;
    }

    const nameChanged = newName !== renamingItem.currentName;

    if (!nameChanged && !isDocument) {
        window.closeRenameModal();
        return;
    }

    const btn = document.getElementById('btn-save-rename');
    btn.disabled = true;
    btn.textContent = 'Speichere...';

    try {
        if (isDocument) {
            let updatePayload = {
                category: activeEditDocTypes.join(', '),
                machine_categories: activeEditMachineCategories.join(', '),
                machine_series: activeEditSeries.join(', ')
            };

            if (nameChanged) {
                updatePayload.name = newName;

                // 1. Fetch current document details to get the old path
                const { data: doc, error: fetchError } = await window.supabaseClient
                    .from('documents')
                    .select('file_path, url, mime_type')
                    .eq('id', renamingItem.id)
                    .single();

                if (fetchError) throw fetchError;

                if (doc && doc.file_path) {
                    const oldPath = doc.file_path;
                    const fileExt = oldPath.split('.').pop();
                    const cleanNewName = newName.replace(/[^a-zA-Z0-9_\- ]/g, '_');

                    // Get the folder path
                    const pathParts = oldPath.split('/');
                    pathParts.pop(); // remove old filename
                    pathParts.push(`${cleanNewName}_${Date.now()}.${fileExt}`);
                    const newPath = pathParts.join('/');

                    // 2. Perform physical rename on Cloudflare R2
                    const renameResult = await window.FileUploadService.renameFile(oldPath, newPath, {
                        bucket: 'accounting-documents',
                        provider: 'cloudflare-r2'
                    });

                    if (renameResult && renameResult.success) {
                        updatePayload.file_path = newPath;
                        updatePayload.url = renameResult.url;
                    }
                }
            }

            // 3. Update Database record (Name, Dokumententyp, Maschinenkategorie)
            const { error: dbError } = await window.supabaseClient
                .from('documents')
                .update(updatePayload)
                .eq('id', renamingItem.id);

            if (dbError) throw dbError;
        } else {
            // Renaming folder (just database update)
            const { error } = await window.supabaseClient
                .from('document_folders')
                .update({ name: newName })
                .eq('id', renamingItem.id);

            if (error) throw error;
        }

        window.closeRenameModal();
        window.fetchDocuments();
    } catch (err) {
        console.error('Error renaming item:', err);
        alert('Fehler beim Bearbeiten: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Speichern';
    }
};

// --- Animated Button Logic ---
window.handleNewFolderClick = function() {
    const btn = document.getElementById('btn-new-folder');
    if (!btn) return;
    
    // Switch to green success animation
    btn.classList.add('btn-success-animation');
    const textEl = btn.querySelector('.btn-text');
    const originalText = textEl.textContent;
    textEl.textContent = 'Bereit!';
    
    // Open modal after a tiny delay
    setTimeout(() => {
        window.openFolderModal();
        
        // Reset button after some time or when modal closes
        setTimeout(() => {
            btn.classList.remove('btn-success-animation');
            textEl.textContent = originalText;
        }, 1500);
    }, 400);
};

// --- Folder Covers ---
window.triggerCoverUpload = function(folderId) {
    folderCoverTargetId = folderId;
    document.getElementById('folder-cover-input').click();
};

window.handleFolderCoverUpload = async function(event) {
    const file = event.target.files[0];
    if (!file || !folderCoverTargetId) return;
    
    try {
        const fileExt = file.name.split('.').pop();
        
        // Find folder name to include in the file name
        const targetFolder = window.allFolders ? window.allFolders.find(f => f.id === folderCoverTargetId) : null;
        const folderName = targetFolder ? targetFolder.name.replace(/[^a-zA-Z0-9_\- ]/g, '_') : 'Ordner';
        
        // Create descriptive filename: "Vorschaubild_Ordnername_12345.jpg"
        const fileName = `Vorschaubild_${folderName}_${Date.now()}.${fileExt}`;
        const filePath = `Ordner-Vorschaubilder/${fileName}`;
        
        // Upload via Cloudflare R2
        console.log('Uploading folder cover to Cloudflare R2...');
        const uploadResult = await window.FileUploadService.uploadFile(file, {
            bucket: 'accounting-documents',
            path: filePath,
            compress: true,
            provider: 'cloudflare-r2'
        });
        
        const publicUrl = uploadResult.url;
        
        // 3. Update folder database entry
        const { error: dbError } = await window.supabaseClient
            .from('document_folders')
            .update({ cover_url: publicUrl })
            .eq('id', folderCoverTargetId);
            
        if (dbError) throw dbError;
        
        window.fetchDocuments();
    } catch (err) {
        console.error('Error uploading folder cover:', err);
        alert('Fehler beim Hochladen des Titelbilds.');
    } finally {
        event.target.value = ''; // Reset input
        folderCoverTargetId = null;
    }
};

// --- Dropdown Management ---
window.addEventListener('click', (e) => {
    const dropdown = document.getElementById('doc-category-menu');
    const trigger = document.getElementById('doc-category-dropdown');
    
    if (dropdown && !dropdown.classList.contains('hidden') && trigger && !trigger.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
});
