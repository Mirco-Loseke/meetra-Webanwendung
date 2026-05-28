// documents.js - Logic for the Documents Module

let allDocuments = [];
let allFolders = [];
let filteredDocuments = [];
let filteredFolders = [];
let activeDocCategories = ['all'];
let activeUploadDocTypes = [];
let activeUploadMachineCategories = [];
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
            .select('*, machines(name)');
        
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
        if (typeof window.populateDocumentTypeDropdowns === 'function') {
            window.populateDocumentTypeDropdowns();
        }
    } catch (err) {
        console.error('Error fetching documents/folders:', err);
        if (grid) grid.innerHTML = '<div style="padding: 2rem; text-align: center; color: #ef4444; grid-column: 1/-1;">Fehler beim Laden des Inhalts.</div>';
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

window.filterDocuments = function() {
    const searchTerm = document.getElementById('doc-search-input')?.value.toLowerCase() || '';
    
    filteredDocuments = allDocuments.filter(doc => {
        const matchesSearch = doc.name.toLowerCase().includes(searchTerm) || 
                             (doc.machines?.name && doc.machines.name.toLowerCase().includes(searchTerm)) ||
                             (doc.category && doc.category.toLowerCase().includes(searchTerm));
        
        const matchesCategory = activeDocCategories.includes('all') || activeDocCategories.includes(doc.category);
        
        return matchesSearch && matchesCategory;
    });

    filteredFolders = allFolders.filter(f => f.name.toLowerCase().includes(searchTerm));

    window.renderDocuments();
};


// ─── Document Type Dropdowns (dynamic from settings) ─────────────────────────

window.populateDocumentTypeDropdowns = function() {
    const docCategories = (window.categoryList || []).filter(c => c.type === 'document');
    const machineCategories = (window.categoryList || []).filter(c => c.type === 'machine');
    
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
};

window.toggleDocCategoryDropdown = function(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('doc-category-dropdown');
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains('active');
    document.querySelectorAll('.custom-filter-dropdown.active').forEach(d => d.classList.remove('active'));
    if (!isOpen) dropdown.classList.add('active');
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
};

window.updateUploadMachineCatLabel = function() {
    const label = document.getElementById('doc-upload-machine-cat-label');
    if (label) {
        label.textContent = activeUploadMachineCategories.length > 0 ? activeUploadMachineCategories.join(', ') : 'Maschinenkategorie wählen...';
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
    
    let html = '';

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
                     <div class="doc-title" style="display: flex; align-items: center; gap: 8px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.8;">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
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
                    <button class="btn-doc-action btn-doc-delete" onclick="event.stopPropagation(); window.deleteFolder('${folder.id}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
        `;
    });

    // Render Documents
    filteredDocuments.forEach(doc => {
        const isPdf = doc.mime_type === 'application/pdf' || doc.url.toLowerCase().endsWith('.pdf');
        const machineName = doc.machines?.name || 'Keine Zuordnung';
        const dateStr = new Date(doc.created_at).toLocaleDateString('de-DE');
        const escapedName = doc.name.replace(/'/g, "\\'");
        const previewId = `pdf-preview-${doc.id}`;
        
        html += `
            <div class="doc-card" 
                 onclick="window.previewDocument('${doc.url}', '${escapedName}', '${doc.mime_type}')"
                 draggable="true" 
                 ondragstart="window.handleDragStart(event, 'document', '${doc.id}')">
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
                        <span>${machineName}</span>
                        <span>${dateStr}</span>
                    </div>
                </div>
                
                <div style="text-align: center; color: rgba(255,255,255,0.4); font-size: 0.75rem; margin-top: auto; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05);">
                    ${window.formatSize(doc.size)}
                </div>
                
                <div class="doc-actions">
                    <button class="btn-doc-action" onclick="event.stopPropagation(); window.openRenameModal('${doc.id}', 'document', '${escapedName}')" title="Umbenennen">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                    </button>
                    <button class="btn-doc-action" onclick="event.stopPropagation(); window.downloadDoc('${doc.url}', '${escapedName}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </button>
                    <button class="btn-doc-action btn-doc-delete" onclick="event.stopPropagation(); window.deleteDocument('${doc.id}', '${doc.file_path}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
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

window.previewDocument = function(url, title, mimeType) {
    const modal = document.getElementById('document-preview-modal');
    const container = document.getElementById('doc-preview-container');
    const titleEl = document.getElementById('doc-preview-title');
    
    if (!modal) return;
    
    titleEl.textContent = title;
    
    const isImage = mimeType.startsWith('image/') || url.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    
    if (isImage) {
        container.innerHTML = `<img src="${url}" style="max-width: 100%; max-height: 100%; display: block; margin: auto; object-fit: contain;">`;
    } else {
        container.innerHTML = `<iframe src="${url}" style="width: 100%; height: 100%; border: none; background: white;"></iframe>`;
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    
    requestAnimationFrame(() => {
        modal.classList.add('show');
    });
    
    window.currentPreviewUrl = url;
    window.currentPreviewName = title;
};

window.closeDocumentPreviewModal = function() {
    const modal = document.getElementById('document-preview-modal');
    if (!modal) return;
    
    modal.classList.remove('show');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        document.getElementById('doc-preview-container').innerHTML = '';
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

window.deleteFolder = async function(id) {
    if (!confirm('Möchtest du diesen Ordner und alle darin enthaltenen Dokumente wirklich löschen?')) return;

    try {
        const { error } = await window.supabaseClient
            .from('document_folders')
            .delete()
            .eq('id', id);

        if (error) throw error;
        window.fetchDocuments();
    } catch (err) {
        console.error('Error deleting folder:', err);
        alert('Fehler beim Löschen des Ordners.');
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
    const machineId = document.getElementById('folder-machine-select').value || null;
    
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

// --- Renaming ---
window.openRenameModal = function(id, type, currentName) {
    renamingItem = { id, type, currentName };
    const modal = document.getElementById('document-rename-modal');
    const input = document.getElementById('rename-input');
    
    if (!modal || !input) return;
    
    input.value = currentName;
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
    if (!newName || newName === renamingItem.currentName) {
        window.closeRenameModal();
        return;
    }
    
    const btn = document.getElementById('btn-save-rename');
    btn.disabled = true;
    btn.textContent = 'Speichere...';
    
    try {
        if (renamingItem.type === 'document') {
            // 1. Fetch current document details to get the old path
            const { data: doc, error: fetchError } = await window.supabaseClient
                .from('documents')
                .select('file_path, url, mime_type')
                .eq('id', renamingItem.id)
                .single();

            if (fetchError) throw fetchError;

            let updatePayload = { name: newName };

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

            // 3. Update Database record
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
        alert('Fehler beim Umbenennen: ' + err.message);
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
