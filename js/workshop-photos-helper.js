/* ==========================================================================
   Workshop Photos & Mobile Navigation Helper Functions
   ========================================================================== */

window.handleWorkshopPhotoSelect = function (event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
        window.workshopPhotosToUpload.push(files[i]);
    }

    event.target.value = ''; // Reset input
    window.renderWorkshopPhotoPreview();
};

window.removeWorkshopPhotoSelect = function (index) {
    window.workshopPhotosToUpload.splice(index, 1);
    window.renderWorkshopPhotoPreview();
};

window.renderWorkshopPhotoPreview = function () {
    const container = document.getElementById('workshop-new-photo-preview');
    const submitBtn = document.getElementById('btn-save-workshop-photo');

    const titleInput = document.getElementById('workshop-new-photo-title');
    const hasPhotos = window.workshopPhotosToUpload.length > 0;
    const hasTitle = titleInput && titleInput.value.trim().length > 0;

    if (!hasPhotos || !hasTitle) {
        container.innerHTML = hasPhotos ? container.innerHTML : ''; // Keep existing preview if just Title is missing
        submitBtn.disabled = true;
        return;
    }

    submitBtn.disabled = false;
    let html = '';

    window.workshopPhotosToUpload.forEach((file, index) => {
        const url = URL.createObjectURL(file);
        html += `
            <div style="position: relative; width: 60px; height: 60px; border-radius: 8px; overflow: hidden; border: 1px solid rgba(139, 92, 246, 0.4);">
                <img src="${url}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover;">
                <div onclick="window.removeWorkshopPhotoSelect(${index})" style="position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.6); color: white; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 10px; font-weight: bold;">✕</div>
            </div>
        `;
    });

    container.innerHTML = html;
};

window.saveNewWorkshopPhoto = async function () {
    if (window.workshopPhotosToUpload.length === 0) return;

    const submitBtn = document.getElementById('btn-save-workshop-photo');
    const machineId = window.currentWorkshopPhotoMachineId;
    const titleText = document.getElementById('workshop-new-photo-title').value.trim();
    const noteText = document.getElementById('workshop-new-photo-note').value.trim();

    if (!titleText) {
        window.showToast("Bitte geben Sie einen Titel ein.");
        return;
    }

    // Set loading state
    const originalBtnHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<svg class="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg> Speichert...`;

    try {
        let uploadedUrls = [];

        // Upload photos via Cloudflare R2 (parallelisiert statt nacheinander)
        const wsMachine = (window.machineList || []).find(m => m.id == machineId);
        const wsFolderName = wsMachine ? window.getMachineFolderName(wsMachine.id, wsMachine.manufacturer, wsMachine.name, wsMachine.serial || wsMachine.serial_number, wsMachine.year) : `Maschinen/${machineId}`;
        const wsPathGenerator = (file, i) => {
            const ext = file.name.split('.').pop();
            return `${wsFolderName}/Werkstatt/${Date.now()}-${i}.${ext}`;
        };
        const wsUploadResults = await window.FileUploadService.uploadFiles(
            window.workshopPhotosToUpload,
            wsPathGenerator,
            { bucket: 'dateien', compress: true, concurrency: 5, provider: 'cloudflare-r2' }
        );
        uploadedUrls = wsUploadResults.map(r => r.url);

        // Create manual entry
        const { error: insertError } = await window.supabaseClient
            .from('manual_history_entries')
            .insert([{
                machine_id: machineId,
                type: 'photo',
                title: titleText,
                content: noteText,
                files: uploadedUrls,
                created_by: window.activeUser?.id || null
            }]);

        if (insertError) throw insertError;

        // Reset form
        window.workshopPhotosToUpload = [];
        document.getElementById('workshop-new-photo-note').value = '';
        window.renderWorkshopPhotoPreview();

        // Refresh list
        await window.reloadWorkshopPhotosList();

        // Trigger an event passing up the chain so main UI history view updates if needed
        if (window.updateHistoryViewExternally) window.updateHistoryViewExternally(machineId);

    } catch (err) {
        console.error("Error saving workshop photo:", err);
        window.showToast("Fehler beim Speichern der Fotos.");
    } finally {
        submitBtn.innerHTML = originalBtnHtml;
        submitBtn.disabled = window.workshopPhotosToUpload.length === 0;
    }
};

window.triggerAppendToEntry = function (entryId) {
    window.workshopPhotoAppendEntryId = entryId;
    let hiddenInput = document.getElementById('workshop-append-photo-input');
    if (!hiddenInput) {
        hiddenInput = document.createElement('input');
        hiddenInput.type = 'file';
        hiddenInput.id = 'workshop-append-photo-input';
        hiddenInput.multiple = true;
        hiddenInput.accept = 'image/*';
        hiddenInput.style.display = 'none';
        hiddenInput.onchange = window.handleAppendPhotoSelect;
        document.body.appendChild(hiddenInput);
    }
    hiddenInput.click();
};

window.handleAppendPhotoSelect = async function (event) {
    const files = event.target.files;
    const entryId = window.workshopPhotoAppendEntryId;
    const machineId = window.currentWorkshopPhotoMachineId;

    if (!files || files.length === 0 || !entryId || !machineId) return;

    try {
        // Fetch the existing entry
        const { data: entry, error: fetchError } = await window.supabaseClient
            .from('manual_history_entries')
            .select('files')
            .eq('id', entryId)
            .single();

        if (fetchError) throw fetchError;

        let existingFiles = entry.files || [];
        if (!Array.isArray(existingFiles)) existingFiles = [];

        let newUploadedUrls = [];

        const listContainer = document.getElementById('workshop-photos-list');
        listContainer.style.opacity = '0.5';
        listContainer.style.pointerEvents = 'none';

        // Upload new photos via Cloudflare R2
        const appMachine = (window.machineList || []).find(m => m.id == machineId);
        const appFolderName = appMachine ? window.getMachineFolderName(appMachine.id, appMachine.manufacturer, appMachine.name, appMachine.serial || appMachine.serial_number, appMachine.year) : `Maschinen/${machineId}`;
        const appPathGenerator = (file, i) => {
            const ext = file.name.split('.').pop();
            return `${appFolderName}/Werkstatt/${Date.now()}-append-${i}.${ext}`;
        };
        const appUploadResults = await window.FileUploadService.uploadFiles(
            Array.from(files),
            appPathGenerator,
            { bucket: 'dateien', compress: true, concurrency: 5, provider: 'cloudflare-r2' }
        );
        newUploadedUrls = appUploadResults.map(r => r.url);

        const updatedFilesList = [...existingFiles, ...newUploadedUrls];

        // Update the entry
        const { error: updateError } = await window.supabaseClient
            .from('manual_history_entries')
            .update({
                files: updatedFilesList,
                updated_at: new Date()
            })
            .eq('id', entryId);

        if (updateError) throw updateError;

        event.target.value = ''; // Reset input
        window.workshopPhotoAppendEntryId = null;

        // Reload list
        listContainer.style.opacity = '1';
        listContainer.style.pointerEvents = 'auto';
        await window.reloadWorkshopPhotosList();

    } catch (err) {
        console.error("Fehler beim Ergänzen der Fotos:", err);
        window.showToast("Fehler beim Hochladen der neuen Fotos.");
        const listContainer = document.getElementById('workshop-photos-list');
        listContainer.style.opacity = '1';
        listContainer.style.pointerEvents = 'auto';
    }
};

window.updateWorkshopPhotoTitle = async function (entryId, currentTitle) {
    const newTitle = prompt("Neuen Titel eingeben:", currentTitle);
    if (newTitle === null || newTitle.trim() === "" || newTitle === currentTitle) return;

    try {
        const { error } = await window.supabaseClient
            .from('manual_history_entries')
            .update({ title: newTitle.trim() })
            .eq('id', entryId);

        if (error) throw error;

        // Reload list
        await window.reloadWorkshopPhotosList();

        // Refresh main history view if open
        if (window.currentHistoryMachineId) {
            if (window.updateHistoryViewExternally) window.updateHistoryViewExternally(window.currentHistoryMachineId);
        }
    } catch (err) {
        console.error("Fehler beim Aktualisieren des Titels:", err);
        window.showToast("Fehler beim Speichern des neuen Titels.");
    }
};

// Ensure history view is appropriately updated globally
window.updateHistoryViewExternally = function (machineId) {
    if (window.currentHistoryMachineId === machineId) {
        window.openHistoryModal(machineId);
    }
};

/* ---- Settings & Mobile Sidebar Helpers ---- */
window.openSettingsModal = function () {
    window.switchView('settings-ai');
};

window.closeSettingsModal = function () {
    window.switchView('settings');
};

// Der Groq-Schlüssel wird nicht mehr im Browser gespeichert — es gibt kein
// Eingabefeld mehr (siehe partials/settings/ai.html). Statt „speichern" prüft
// die Seite jetzt nur noch, ob der Dienst antwortet.
window.pruefeKiVerbindung = async function () {
    const box = document.getElementById('ai-connection-status');
    if (box) { box.style.color = 'rgba(255,255,255,0.6)'; box.textContent = 'Prüfe …'; }
    if (typeof window.groqSelbsttest !== 'function') {
        if (box) { box.style.color = '#fca5a5'; box.textContent = 'KI-Baustein nicht geladen.'; }
        return;
    }
    const res = await window.groqSelbsttest();
    if (!box) return;
    if (res.ok) {
        box.style.color = '#4ade80';
        box.textContent = '✓ Verbindung steht — die KI ist einsatzbereit.';
    } else {
        box.style.color = '#fca5a5';
        box.textContent = '✗ ' + res.message;
    }
};

// Alte Namen bleiben belegt, damit ein übersehener Aufruf keinen Fehler wirft.
window.saveSettingsNew = function () {
    window.showToast('Der KI-Zugang liegt jetzt zentral auf dem Server — hier ist nichts mehr einzutragen.');
};
window.toggleApiKeyVisibilityNew = function () { };
window.saveSettings = window.saveSettingsNew;
window.toggleApiKeyVisibility = window.toggleApiKeyVisibilityNew;

/* ---- Mobile Sidebar Toggle ---- */
window.toggleMobileSidebar = function () {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar) return;
    const isOpen = sidebar.classList.contains('mobile-open');
    if (isOpen) {
        sidebar.classList.remove('mobile-open');
        if (overlay) overlay.classList.remove('active');
    } else {
        sidebar.classList.add('mobile-open');
        if (overlay) overlay.classList.add('active');
    }
};

window.closeMobileSidebar = function () {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('active');
};

/* Close sidebar when a nav link is tapped on mobile */
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('#sidebar .nav-link').forEach(function (link) {
        link.addEventListener('click', function () {
            if (window.innerWidth <= 768) window.closeMobileSidebar();
        });
    });
});

/* Mobiler Menü-Button: beim Scrollen ausblenden, nach dem Scrollen wieder einblenden. */
(function () {
    let scrollHideTimer = null;
    function onAnyScroll() {
        if (window.innerWidth > 768) {
            // Desktop / iPad: Topbar-Elemente beim Scrollen abdunkeln,
            // nach dem Scrollen wieder voll einblenden.
            document.body.classList.add('topbar-scrolling');
        } else {
            document.body.classList.add('is-scrolling');
        }
        if (scrollHideTimer) clearTimeout(scrollHideTimer);
        scrollHideTimer = setTimeout(function () {
            document.body.classList.remove('is-scrolling');
            document.body.classList.remove('topbar-scrolling');
        }, 250);
    }
    window.addEventListener('scroll', onAnyScroll, { passive: true, capture: true });
})();
